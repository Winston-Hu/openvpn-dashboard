import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'

/** Run a command with optional stdin input, returns stdout/stderr strings */
function runProcess(
  cmd: string,
  args: string[],
  input?: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('error', (err) => reject(Object.assign(err, { stdout, stderr })))
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        const err = new Error(`Process exited with code ${code}`) as Error & { stdout: string; stderr: string; code: number | null }
        err.stdout = stdout
        err.stderr = stderr
        err.code = code
        reject(err)
      }
    })

    if (input) {
      proc.stdin.write(input)
    }
    proc.stdin.end()
  })
}

export interface ConnectedClient {
  commonName: string
  realAddress: string
  vpnAddress: string
  bytesReceived: number
  bytesSent: number
  connectedSince: string
}

export interface KnownClient {
  name: string
  certPath: string
  hasKey: boolean
  hasCcd: boolean
}

export interface ServerInfo {
  statusLastUpdated: string | null
  connectedCount: number
  configPath: string
  running: boolean
}

export interface ClientDetail {
  name: string
  certPath: string | null
  certExpiry: Date | null
  hasKey: boolean
  hasCcd: boolean
  ccdContent: string | null
  ifconfigPush: string | null
  iroutes: string[]
  connected: boolean
  realAddress: string | null
  vpnAddress: string | null
  bytesReceived: number | null
  bytesSent: number | null
  connectedSince: string | null
}

/** Validate client names to prevent shell injection via arguments. */
const CLIENT_NAME_RE = /^[a-zA-Z0-9_-]{1,32}$/

export function validateClientName(name: string): void {
  if (!CLIENT_NAME_RE.test(name)) {
    throw new Error(
      `Invalid client name: "${name}". Must be 1–32 characters: letters, digits, underscores, hyphens.`
    )
  }
}

const STATUS_LOG =
  process.env.OPENVPN_STATUS_LOG ?? '/var/log/openvpn/status.log'
const PKI_ISSUED_DIR =
  process.env.OPENVPN_PKI_ISSUED_DIR ??
  '/etc/openvpn/server/easy-rsa/pki/issued'
const PKI_PRIVATE_DIR =
  process.env.OPENVPN_PKI_PRIVATE_DIR ??
  '/etc/openvpn/server/easy-rsa/pki/private'
const CCD_DIR =
  process.env.OPENVPN_CCD_DIR ?? '/etc/openvpn/server/ccd'
const SERVER_CONF =
  process.env.OPENVPN_SERVER_CONF ?? '/etc/openvpn/server/server.conf'
const INSTALL_SCRIPT =
  process.env.OPENVPN_INSTALL_SCRIPT ??
  '/opt/openvpn-install/openvpn-install.sh'
const MANUAL_CLIENT_OVPN_SCRIPT =
  process.env.MANUAL_CLIENT_OVPN_SCRIPT ??
  '/opt/openvpn-install/manual-client-ovpn.sh'
const OVPN_OUTPUT_DIR =
  process.env.OPENVPN_OVPN_OUTPUT_DIR ??
  '/etc/openvpn/server/easy-rsa/pki'
const CA_CERT =
  process.env.OPENVPN_CA_CERT ??
  '/etc/openvpn/server/easy-rsa/pki/ca.crt'
const MGMT_SOCK =
  process.env.OPENVPN_MGMT_SOCK ?? '/var/run/openvpn-server/server.sock'

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Parse OpenVPN status.log (version 1 format).
 *
 * Example format:
 * OpenVPN CLIENT LIST
 * Updated,Thu Apr  3 07:00:00 2026
 * Common Name,Real Address,Bytes Received,Bytes Sent,Connected Since
 * client1,1.2.3.4:12345,123456,654321,Thu Apr  3 06:00:00 2026
 * ROUTING TABLE
 * ...
 */
export async function getConnectedClients(): Promise<ConnectedClient[]> {
  try {
    const content = await fs.readFile(STATUS_LOG, 'utf-8')
    const lines = content.split('\n')

    const clients: ConnectedClient[] = []
    let inClientList = false
    let inRoutingTable = false

    // Build a map of commonName -> vpnAddress from routing table
    const vpnAddressMap: Record<string, string> = {}

    for (const line of lines) {
      if (line.startsWith('ROUTING TABLE')) {
        inRoutingTable = true
        inClientList = false
        continue
      }
      if (line.startsWith('GLOBAL STATS') || line.startsWith('END')) {
        inRoutingTable = false
        continue
      }
      if (inRoutingTable) {
        // Virtual Address,Common Name,Real Address,Last Ref
        const parts = line.split(',')
        if (parts.length >= 2 && !line.startsWith('Virtual Address')) {
          vpnAddressMap[parts[1]] = parts[0]
        }
      }
    }

    inClientList = false
    for (const line of lines) {
      if (line.startsWith('OpenVPN CLIENT LIST')) {
        inClientList = true
        continue
      }
      if (line.startsWith('ROUTING TABLE') || line.startsWith('GLOBAL STATS')) {
        inClientList = false
        continue
      }
      if (!inClientList) continue
      if (
        line.startsWith('Updated,') ||
        line.startsWith('Common Name,') ||
        line.trim() === ''
      ) {
        continue
      }

      const parts = line.split(',')
      if (parts.length < 5) continue

      const commonName = parts[0]
      const realAddress = parts[1]
      const bytesReceived = parseInt(parts[2], 10) || 0
      const bytesSent = parseInt(parts[3], 10) || 0
      const connectedSince = parts.slice(4).join(',')

      clients.push({
        commonName,
        realAddress,
        vpnAddress: vpnAddressMap[commonName] ?? '',
        bytesReceived,
        bytesSent,
        connectedSince,
      })
    }

    return clients
  } catch {
    return []
  }
}

export async function getKnownClients(): Promise<KnownClient[]> {
  try {
    const entries = await fs.readdir(PKI_ISSUED_DIR)
    const clients: KnownClient[] = []

    for (const entry of entries) {
      if (!entry.endsWith('.crt')) continue
      const name = entry.replace(/\.crt$/, '')
      if (name === 'ca') continue

      const certPath = path.join(PKI_ISSUED_DIR, entry)
      const keyPath = path.join(PKI_PRIVATE_DIR, `${name}.key`)
      const ccdPath = path.join(CCD_DIR, name)

      const [hasKey, hasCcd] = await Promise.all([
        fileExists(keyPath),
        fileExists(ccdPath),
      ])

      clients.push({
        name,
        certPath,
        hasKey,
        hasCcd,
      })
    }

    return clients
  } catch {
    return []
  }
}

export async function getServerInfo(): Promise<ServerInfo> {
  let statusLastUpdated: string | null = null
  let connectedCount = 0
  let running = false

  try {
    const content = await fs.readFile(STATUS_LOG, 'utf-8')
    running = true
    const lines = content.split('\n')

    for (const line of lines) {
      if (line.startsWith('Updated,')) {
        statusLastUpdated = line.replace('Updated,', '').trim()
      }
    }

    const clients = await getConnectedClients()
    connectedCount = clients.length
  } catch {
    // File doesn't exist or can't be read — OpenVPN not running or not configured
  }

  return {
    statusLastUpdated,
    connectedCount,
    configPath: SERVER_CONF,
    running,
  }
}

/**
 * Parse a single .crt file to get expiry date using openssl.
 */
export async function getCertExpiry(certPath: string): Promise<Date | null> {
  try {
    const { stdout } = await runProcess('openssl', [
      'x509',
      '-noout',
      '-enddate',
      '-in',
      certPath,
    ])
    // stdout: "notAfter=Apr  3 12:00:00 2027 GMT\n"
    const match = stdout.match(/notAfter=(.+)/)
    if (!match) return null
    const dateStr = match[1].trim()
    const parsed = new Date(dateStr)
    return isNaN(parsed.getTime()) ? null : parsed
  } catch {
    return null
  }
}

/**
 * Read CCD file for a client.
 */
export async function getCcdContent(name: string): Promise<string | null> {
  validateClientName(name)
  const ccdPath = path.join(CCD_DIR, name)
  try {
    const content = await fs.readFile(ccdPath, 'utf-8')
    return content
  } catch {
    return null
  }
}

/**
 * Parse CCD content for ifconfig-push and iroute directives.
 */
function parseCcd(content: string): {
  ifconfigPush: string | null
  iroutes: string[]
} {
  const lines = content.split('\n')
  let ifconfigPush: string | null = null
  const iroutes: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('ifconfig-push ')) {
      ifconfigPush = trimmed.replace(/^ifconfig-push\s+/, '').trim()
    } else if (trimmed.startsWith('iroute ')) {
      iroutes.push(trimmed.replace(/^iroute\s+/, '').trim())
    }
  }

  return { ifconfigPush, iroutes }
}

/**
 * Get full client detail combining PKI + CCD + connected status.
 */
export async function getClientDetail(name: string): Promise<ClientDetail | null> {
  validateClientName(name)
  const certPath = path.join(PKI_ISSUED_DIR, `${name}.crt`)
  const keyPath = path.join(PKI_PRIVATE_DIR, `${name}.key`)
  const ccdPath = path.join(CCD_DIR, name)

  const [certExists, hasKey, hasCcd] = await Promise.all([
    fileExists(certPath),
    fileExists(keyPath),
    fileExists(ccdPath),
  ])

  // If no cert, this client doesn't really exist
  if (!certExists) return null

  const [certExpiry, ccdContent, connectedClients] = await Promise.all([
    getCertExpiry(certPath),
    getCcdContent(name),
    getConnectedClients(),
  ])

  const connectedClient = connectedClients.find((c) => c.commonName === name)
  const connected = connectedClient !== undefined

  let ifconfigPush: string | null = null
  let iroutes: string[] = []
  if (ccdContent) {
    const parsed = parseCcd(ccdContent)
    ifconfigPush = parsed.ifconfigPush
    iroutes = parsed.iroutes
  }

  return {
    name,
    certPath: certExists ? certPath : null,
    certExpiry,
    hasKey,
    hasCcd,
    ccdContent,
    ifconfigPush,
    iroutes,
    connected,
    realAddress: connectedClient?.realAddress ?? null,
    vpnAddress: connectedClient?.vpnAddress ?? null,
    bytesReceived: connectedClient?.bytesReceived ?? null,
    bytesSent: connectedClient?.bytesSent ?? null,
    connectedSince: connectedClient?.connectedSince ?? null,
  }
}

/**
 * Build .ovpn config content for a client.
 * Reads ca.crt, client.crt, client.key, tls-auth/tls-crypt key, server.conf.
 */
export async function buildOvpnConfig(name: string): Promise<string | null> {
  validateClientName(name)
  const certPath = path.join(PKI_ISSUED_DIR, `${name}.crt`)
  const keyPath = path.join(PKI_PRIVATE_DIR, `${name}.key`)

  const [caExists, certExists, keyExists] = await Promise.all([
    fileExists(CA_CERT),
    fileExists(certPath),
    fileExists(keyPath),
  ])

  if (!caExists || !certExists || !keyExists) return null

  let serverConf = ''
  try {
    serverConf = await fs.readFile(SERVER_CONF, 'utf-8')
  } catch {
    return null
  }

  // Parse server.conf for relevant options
  const confLines = serverConf.split('\n')
  let remote = ''
  let port = '1194'
  let proto = 'udp'
  let cipher = ''
  let auth = ''
  let tlsAuthFile = ''
  let tlsCryptFile = ''
  let keyDirection = ''
  let tlsType = '' // 'tls-auth' or 'tls-crypt'

  for (const line of confLines) {
    const t = line.trim()
    if (t.startsWith('#') || t.startsWith(';')) continue
    const parts = t.split(/\s+/)
    if (!parts[0]) continue

    switch (parts[0]) {
      case 'port':
        port = parts[1] ?? port
        break
      case 'proto':
        proto = parts[1] ?? proto
        break
      case 'cipher':
        cipher = parts[1] ?? ''
        break
      case 'auth':
        auth = parts[1] ?? ''
        break
      case 'tls-auth':
        tlsAuthFile = parts[1] ?? ''
        tlsType = 'tls-auth'
        if (parts[2]) keyDirection = parts[2]
        break
      case 'tls-crypt':
        tlsCryptFile = parts[1] ?? ''
        tlsType = 'tls-crypt'
        break
      case 'key-direction':
        keyDirection = parts[1] ?? ''
        break
    }
  }

  // Try to determine remote from server.conf or use a placeholder
  // Some setups have "server" directive; remote is for clients
  // Look for push "redirect-gateway" or just note the server address can come from env
  const serverHost = process.env.OPENVPN_SERVER_HOST ?? 'YOUR_SERVER_IP'
  remote = `${serverHost} ${port}`

  // Read file contents
  const [caContent, certContent, keyContent] = await Promise.all([
    fs.readFile(CA_CERT, 'utf-8'),
    fs.readFile(certPath, 'utf-8'),
    fs.readFile(keyPath, 'utf-8'),
  ])

  let tlsKeyContent = ''
  const tlsFile = tlsType === 'tls-auth' ? tlsAuthFile : tlsCryptFile
  if (tlsFile) {
    try {
      tlsKeyContent = await fs.readFile(tlsFile, 'utf-8')
    } catch {
      // tls key not readable — skip
    }
  }

  // Check for output ovpn file (pre-built by install script)
  const ovpnPath = path.join(OVPN_OUTPUT_DIR, `${name}.ovpn`)
  if (await fileExists(ovpnPath)) {
    try {
      return await fs.readFile(ovpnPath, 'utf-8')
    } catch {
      // fall through to build manually
    }
  }

  // Build inline ovpn config
  const lines: string[] = [
    'client',
    'dev tun',
    `proto ${proto}`,
    `remote ${remote}`,
    'resolv-retry infinite',
    'nobind',
    'persist-key',
    'persist-tun',
    'remote-cert-tls server',
  ]

  if (cipher) lines.push(`cipher ${cipher}`)
  if (auth) lines.push(`auth ${auth}`)
  if (keyDirection) lines.push(`key-direction ${keyDirection}`)

  lines.push('verb 3')
  lines.push('')

  // Inline ca
  lines.push('<ca>')
  lines.push(caContent.trim())
  lines.push('</ca>')
  lines.push('')

  // Inline cert
  lines.push('<cert>')
  lines.push(certContent.trim())
  lines.push('</cert>')
  lines.push('')

  // Inline key
  lines.push('<key>')
  lines.push(keyContent.trim())
  lines.push('</key>')

  // Inline tls key
  if (tlsKeyContent) {
    lines.push('')
    if (tlsType === 'tls-auth') {
      lines.push('<tls-auth>')
    } else {
      lines.push('<tls-crypt>')
    }
    lines.push(tlsKeyContent.trim())
    if (tlsType === 'tls-auth') {
      lines.push('</tls-auth>')
    } else {
      lines.push('</tls-crypt>')
    }
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Execute client creation via manual-client-ovpn.sh or return failure.
 */
export async function createClient(params: {
  name: string
  ifconfigPush?: string
  iroute?: string
  irouteMask?: string
}): Promise<{ success: boolean; stdout: string; stderr: string }> {
  validateClientName(params.name)
  const scriptExists = await fileExists(MANUAL_CLIENT_OVPN_SCRIPT)
  const scriptExecutable = scriptExists && (await isExecutable(MANUAL_CLIENT_OVPN_SCRIPT))

  if (!scriptExecutable) {
    return {
      success: false,
      stdout: '',
      stderr: 'No client creation script found at configured path',
    }
  }

  const args = ['--client', params.name]
  if (params.ifconfigPush) {
    args.push('--ifconfig-push', params.ifconfigPush)
  }
  if (params.iroute) {
    args.push('--iroute', params.iroute)
    if (params.irouteMask) {
      args.push('--iroute-mask', params.irouteMask)
    }
  }

  try {
    const { stdout, stderr } = await runProcess(MANUAL_CLIENT_OVPN_SCRIPT, args)
    return { success: true, stdout: stdout ?? '', stderr: stderr ?? '' }
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string }
    return {
      success: false,
      stdout: execErr.stdout ?? '',
      stderr: execErr.stderr ?? execErr.message ?? 'Unknown error',
    }
  }
}

/**
 * Revoke a client via openvpn-install.sh.
 */
export async function revokeClient(
  name: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  validateClientName(name)
  const scriptExists = await fileExists(INSTALL_SCRIPT)
  const scriptExecutable = scriptExists && (await isExecutable(INSTALL_SCRIPT))

  if (!scriptExecutable) {
    return {
      success: false,
      stdout: '',
      stderr: 'openvpn-install.sh not found or not executable at configured path',
    }
  }

  try {
    // Pass 'y\n' to stdin to auto-confirm any prompts
    const { stdout, stderr } = await runProcess(
      INSTALL_SCRIPT,
      ['client', 'revoke', name],
      'y\n'
    )
    return { success: true, stdout: stdout ?? '', stderr: stderr ?? '' }
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string }
    return {
      success: false,
      stdout: execErr.stdout ?? '',
      stderr: execErr.stderr ?? execErr.message ?? 'Unknown error',
    }
  }
}

/**
 * Disconnect a connected client via the management socket using socat.
 */
export async function disconnectClient(
  name: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  validateClientName(name)
  const sockExists = await fileExists(MGMT_SOCK)
  if (!sockExists) {
    return {
      success: false,
      stdout: '',
      stderr: `Management socket not found at ${MGMT_SOCK}`,
    }
  }

  // Check socat is available
  try {
    await runProcess('which', ['socat'])
  } catch {
    return {
      success: false,
      stdout: '',
      stderr: 'socat is not installed or not in PATH',
    }
  }

  try {
    // echo "kill <name>" | socat - UNIX-CONNECT:<sock>
    const { stdout, stderr } = await runProcess(
      'socat',
      ['-', `UNIX-CONNECT:${MGMT_SOCK}`],
      `kill ${name}\n`
    )
    return { success: true, stdout: stdout ?? '', stderr: stderr ?? '' }
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string }
    return {
      success: false,
      stdout: execErr.stdout ?? '',
      stderr: execErr.stderr ?? execErr.message ?? 'Unknown error',
    }
  }
}
