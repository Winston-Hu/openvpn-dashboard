import { prisma } from './db'

export async function writeAuditLog(params: {
  actor: string
  action: string
  target?: string
  detail?: string
  ipAddress?: string
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actor: params.actor,
        action: params.action,
        target: params.target ?? null,
        detail: params.detail ?? null,
        ipAddress: params.ipAddress ?? null,
      },
    })
  } catch (error) {
    console.error('[AuditLog] Failed to write audit log:', error)
  }
}
