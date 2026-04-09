# OpenVPN Dashboard

独立于 `openvpn-install` 的 OpenVPN 管理面板，适合部署到服务器上的 `~/apps/openvpn-dashboard`。

这份文档只保留这次真实落地后证明必要的内容：
- 正式部署顺序
- 最终可用架构
- 必踩坑和对应修复

## 最终架构

- OpenVPN server: `1194/udp`
- Dashboard app: `127.0.0.1:3000`
- Reverse proxy: `Caddy` on `80/443`
- Public hostname: `vpndashboard.relicflow.com`
- VPN subnet: `10.188.0.0/24`
- VPN-internal DNS answer:
  - `vpndashboard.relicflow.com -> 10.188.0.1`
- Access policy:
  - `443/tcp` 只允许 `10.188.0.0/24`
  - `3000/tcp` 只允许 `127.0.0.1`

为什么这么做：
- 浏览器稳定性比 `http://10.188.0.1:3000` 更好
- Cookie/session 在 HTTPS 下更稳定
- 不需要给每台客户端手工改 `hosts`
- 仍然保持“只有连上 VPN 的设备才能访问”

## 本地提交

应提交：
- `app/`
- `components/`
- `deploy/`
- `lib/`
- `prisma/`
- `scripts/`
- `.env.example`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `next.config.ts`
- `tailwind.config.ts`
- `tsconfig.json`
- `README.md`

不应提交：
- `.env`
- `.env.local`
- `.next/`
- `node_modules/`
- `tsconfig.tsbuildinfo`

## 部署步骤

### 1. 克隆仓库

```bash
cd ~/apps
git clone https://github.com/<your-user>/openvpn-dashboard.git
cd ~/apps/openvpn-dashboard
```

### 2. 安装 Node

当前实际使用版本：
- `node v25.6.1`
- `npm 11.9.0`

```bash
sudo apt update
sudo apt install -y curl build-essential

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 25.6.1
nvm use 25.6.1
npm install -g npm@11.9.0
```

建议加入 `~/.bashrc`：

```bash
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> ~/.bashrc
source ~/.bashrc
```

### 3. 配置 `.env`

```bash
cp .env.example .env
```

正式 HTTPS 方案使用：

```env
DATABASE_URL="file:./prisma/dev.db"
SESSION_SECRET="replace-with-a-random-secret"
SESSION_COOKIE_SECURE=true

BOOTSTRAP_ADMIN_USERNAME="admin"
BOOTSTRAP_ADMIN_PASSWORD="<your_passwd>"

OPENVPN_STATUS_LOG="/var/log/openvpn/status.log"
OPENVPN_PKI_ISSUED_DIR="/etc/openvpn/server/easy-rsa/pki/issued"
OPENVPN_PKI_PRIVATE_DIR="/etc/openvpn/server/easy-rsa/pki/private"
OPENVPN_CCD_DIR="/etc/openvpn/server/ccd"
OPENVPN_SERVER_CONF="/etc/openvpn/server/server.conf"

OPENVPN_INSTALL_SCRIPT="/home/ubuntu/githubrepos/openvpn-install/openvpn-install.sh"
MANUAL_CLIENT_OVPN_SCRIPT="/home/ubuntu/githubrepos/openvpn-install/manual-client-ovpn.sh"
OPENVPN_OVPN_OUTPUT_DIR="/home/ubuntu/clientovpns"

OPENVPN_CA_CERT="/etc/openvpn/server/easy-rsa/pki/ca.crt"
OPENVPN_MGMT_SOCK="/var/run/openvpn-server/server.sock"

OPENVPN_SERVER_HOST="13.237.209.198"
NEXT_PUBLIC_APP_URL="https://vpndashboard.relicflow.com"
PORT=3000
```

如果只是短期用 VPN 内部 HTTP 调试，才临时改成：

```env
SESSION_COOKIE_SECURE=false
NEXT_PUBLIC_APP_URL="http://10.188.0.1:3000"
```

### 4. 初始化数据库

```bash
npm ci
npx prisma migrate deploy
npm run db:seed
```

如果成功，应看到：

```text
[seed] Admin user created: id=1, username=admin
```

### 5. 生产构建

```bash
npm run build
```

### 6. 修正 standalone 静态资源

这是当前部署里非常关键的一步。

`systemd` 运行的是：

```text
.next/standalone/server.js
```

但如果不把 `.next/static` 复制到 `standalone` 目录，浏览器会出现：
- 裸 HTML 页面
- `/_next/static/...` 全部 404
- 登录按钮看起来“没反应”

正确处理：

```bash
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/
```

验证：

```bash
curl -I http://127.0.0.1:3000/_next/static/chunks/0r3hs1m32_pbt.css
```

应返回 `200`，不是 `404`。

### 7. 配置 systemd

复制并修改 service 文件：

```bash
sudo cp deploy/openvpn-dashboard.service /etc/systemd/system/
sudo sed -i 's/<APP_USER>/ubuntu/g' /etc/systemd/system/openvpn-dashboard.service
```

如果 Node 是用 `nvm` 安装的，`ExecStart` 不能保留默认的 `/usr/bin/node`。  
实际可用示例：

```ini
[Unit]
Description=OpenVPN Dashboard
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/apps/openvpn-dashboard
ExecStart=/home/ubuntu/.nvm/versions/node/v25.6.1/bin/node /home/ubuntu/apps/openvpn-dashboard/.next/standalone/server.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/home/ubuntu/apps/openvpn-dashboard/.env

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openvpn-dashboard
sudo systemctl status openvpn-dashboard
```

### 8. 域名与 HTTPS

公网 DNS：

```text
vpndashboard.relicflow.com -> 13.237.209.198
```

安装 `Caddy`：

```bash
sudo apt update
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`：

```caddy
{
    servers {
        protocols h1 h2
    }
}

vpndashboard.relicflow.com {
    @vpn_only remote_ip 10.188.0.0/24 127.0.0.1/32
    handle @vpn_only {
        reverse_proxy 127.0.0.1:3000
    }

    handle {
        respond "Forbidden" 403
    }
}
```

说明：
- 关闭 HTTP/3，避免浏览器走 UDP 443 引发异常行为
- 只允许 VPN 网段访问站点

验证并重启：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl restart caddy
sudo journalctl -u caddy -n 100 --no-pager
```

证书成功的关键日志：

```text
certificate obtained successfully
```

### 9. AWS Security Group

至少需要：
- `TCP 22` from `0.0.0.0/0`
- `UDP 1194` from `0.0.0.0/0`
- `TCP 80` from `0.0.0.0/0`
- `TCP 443` from `0.0.0.0/0`

说明：
- `80/443` 先在 AWS 层放开
- 真正的 VPN-only 限制由主机侧 `iptables` 完成

### 10. 内部 DNS

企业级方案不要给每台客户端手改 `hosts`。  
应在 OpenVPN 服务器上提供内部 DNS 覆写：

- 公网 DNS：`vpndashboard.relicflow.com -> 13.237.209.198`
- VPN 内 DNS：`vpndashboard.relicflow.com -> 10.188.0.1`

安装 `dnsmasq`：

```bash
sudo apt install -y dnsmasq dnsutils
```

`/etc/dnsmasq.d/openvpn-dashboard.conf`：

```conf
interface=tun0
listen-address=127.0.0.1,10.188.0.1
bind-interfaces
domain-needed
bogus-priv
no-resolv
server=1.1.1.1
server=1.0.0.1
cache-size=1000
address=/vpndashboard.relicflow.com/10.188.0.1
```

启动：

```bash
sudo dnsmasq --test
sudo systemctl enable --now dnsmasq
sudo systemctl restart dnsmasq
```

验证：

```bash
dig +short @10.188.0.1 vpndashboard.relicflow.com
```

应返回：

```text
10.188.0.1
```

### 11. OpenVPN 下发内部 DNS

在 `/etc/openvpn/server/server.conf` 中确保：

```conf
push "dhcp-option DNS 10.188.0.1"
```

然后重启：

```bash
sudo systemctl restart openvpn-server@server
```

客户端需要断开再重新连接一次，才能拿到新的 DNS。

### 12. 防火墙与持久化

目标：
- `3000/tcp` 仅本机访问
- `443/tcp` 仅 `10.188.0.0/24` 访问
- `53/tcp`/`53/udp` 允许 `10.188.0.0/24`
- `80/tcp` 允许公网，供 ACME

规则改完后务必持久化：

```bash
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

否则重启后这些访问限制和 OpenVPN 相关规则可能丢失。

## 必踩坑

### 1. `npm run seed` 不存在

正确命令是：

```bash
npm run db:seed
```

### 2. `systemd` 报 `203/EXEC`

原因通常是 service 还在写 `/usr/bin/node`，但实际 Node 通过 `nvm` 安装，不在该路径。

### 3. 登录接口返回 `200`，浏览器却“登录不上”

先区分两种部署：

- HTTP 调试模式：
  - 必须 `SESSION_COOKIE_SECURE=false`
- HTTPS 正式模式：
  - 应该 `SESSION_COOKIE_SECURE=true`

不要混用。

### 4. Safari/浏览器表现异常

不要长期使用：

```text
http://10.188.0.1:3000
```

正式使用应切到：

```text
https://vpndashboard.relicflow.com
```

并关闭 Caddy 的 HTTP/3，只保留 `h1 h2`。

### 5. 页面是裸 HTML，登录按钮没反应

这是静态资源问题，不是登录逻辑问题。  
优先检查：

```bash
curl -I http://127.0.0.1:3000/_next/static/chunks/0r3hs1m32_pbt.css
```

如果是 `404`，说明 `.next/static` 没复制进 `standalone`。

### 6. `/clients/all` 里 `Cert Expiry` 显示 `Missing`

通常不是证书不存在，而是 dashboard 进程读不到：

```text
/etc/openvpn/server/easy-rsa/pki/issued/*.crt
```

修复：

```bash
sudo find /etc/openvpn/server/easy-rsa/pki/issued -maxdepth 1 -type f -name '*.crt' -exec chmod 644 {} +
```

### 7. 固定 IP 不生效，client 还是拿动态地址

先看是不是 `ccd` 权限问题，而不是先怀疑 `ifconfig-push` 写错。

如果 OpenVPN 进程读不到 `ccd/<client>`，它会回退到地址池分配。  
修复：

```bash
sudo chmod 755 /etc/openvpn/server/ccd
sudo chmod 644 /etc/openvpn/server/ccd/*
```

然后踢掉该 client，让它重连。

### 8. Dashboard 在线设备显示不对

确认代码支持你服务器上实际的 OpenVPN `status.log` 格式。  
本次实际环境使用的是新版 CSV 风格：

```text
TITLE
TIME
HEADER,CLIENT_LIST
CLIENT_LIST,...
HEADER,ROUTING_TABLE
ROUTING_TABLE,...
END
```

如果解析器只支持老格式，`/clients/online` 和 `/clients/all` 会显示错误。

## 常用命令

```bash
sudo systemctl status openvpn-dashboard
sudo systemctl restart openvpn-dashboard
sudo journalctl -u openvpn-dashboard -f

sudo systemctl status caddy
sudo systemctl restart caddy
sudo journalctl -u caddy -f

sudo systemctl status dnsmasq
sudo systemctl restart dnsmasq

sudo systemctl status openvpn-server@server
sudo journalctl -u openvpn-server@server -f

sudo netfilter-persistent save

curl -I http://127.0.0.1:3000
curl -kI --resolve vpndashboard.relicflow.com:443:10.188.0.1 https://vpndashboard.relicflow.com
dig +short @10.188.0.1 vpndashboard.relicflow.com
```
