# OpenVPN Dashboard

一个独立于 `openvpn-install` 的 OpenVPN 管理面板，运行在单独仓库中，适合长期部署到服务器上的 `~/apps/openvpn-dashboard`。

当前这套项目已经验证过以下能力：
- 本地账号登录
- 在线设备查看
- 所有 client 列表
- client 详情
- 下载 `.ovpn`
- VPN 网段内访问限制
- systemd 长久化运行

本文档重点不是泛泛介绍，而是记录这次实际部署过程中踩过的坑、原因和解决方法，方便以后重复部署。

## 目录

1. 项目定位
2. 本地开发与提交
3. 服务器部署流程
4. 关键环境变量
5. 踩过的坑与解决方法
6. 常用运维命令

## 项目定位

这个仓库负责：
- OpenVPN Dashboard 前后端代码
- 本地账号认证
- 审计日志
- 读取 OpenVPN 状态、PKI、CCD
- 创建/吊销/断开 client

这个仓库不负责：
- 安装 OpenVPN 本身
- 维护 OpenVPN 脚本仓库

OpenVPN 安装和 client 证书材料来自另一套仓库：
- `/home/ubuntu/githubrepos/openvpn-install`

## 本地开发与提交

### 正确提交哪些文件

这个项目是 Node/Next.js 项目，不应把构建缓存和本地环境文件提交上去。

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

不应提交：
- `.env.local`
- `.env`
- `.next/`
- `node_modules/`
- `tsconfig.tsbuildinfo`

如果仓库还没有 `.gitignore`，先补 `.gitignore`，否则 `git add .` 会把缓存一起提交上去。

## 服务器部署流程

以下流程是在 Ubuntu EC2 上实际验证过的。

### 1. 克隆仓库

如果服务器没有配置 GitHub SSH key，优先用 HTTPS：

```bash
cd ~/apps
git clone https://github.com/<your-user>/openvpn-dashboard.git
cd ~/apps/openvpn-dashboard
```

### 2. 安装 Node.js

项目最终使用的是：
- `node v25.6.1`
- `npm 11.9.0`

实际安装命令：

```bash
sudo apt update
sudo apt install -y curl build-essential

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 25.6.1
nvm use 25.6.1
npm install -g npm@11.9.0

node -v
npm -v
```

建议追加到 `~/.bashrc`，避免重新登录后 `nvm` 不生效：

```bash
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> ~/.bashrc
source ~/.bashrc
```

### 3. 配置 `.env`

先复制模板：

```bash
cp .env.example .env
nano .env
```

当前环境实际使用的可用配置如下：

```env
DATABASE_URL="file:./prisma/dev.db"
SESSION_SECRET="replace-with-a-random-secret"
SESSION_COOKIE_SECURE=false

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

OPENVPN_SERVER_HOST="<your_server_address>"
NEXT_PUBLIC_APP_URL="http://10.188.0.1:3000"
PORT=3000
```

### 4. 初始化数据库

先执行 migration：

```bash
npx prisma migrate deploy
```

然后执行 seed：

```bash
npm run db:seed
```

成功时应看到：

```text
[seed] Admin user created: id=1, username=admin
```

### 5. 构建并本地启动

```bash
npm ci
npm run build
npm run start
```

如果只想确认服务是否响应：

```bash
curl -I http://127.0.0.1:3000
```

### 6. 配置 systemd 长久化运行

复制 service 文件：

```bash
sudo cp ~/apps/openvpn-dashboard/deploy/openvpn-dashboard.service /etc/systemd/system/
```

把 `<APP_USER>` 改成 `ubuntu`：

```bash
sudo sed -i 's/<APP_USER>/ubuntu/g' /etc/systemd/system/openvpn-dashboard.service
```

注意：默认 service 文件里写的是 `/usr/bin/node`，如果你用的是 `nvm`，必须改成实际路径。

先查实际 Node 路径：

```bash
which node
```

然后编辑：

```bash
sudo nano /etc/systemd/system/openvpn-dashboard.service
```

实际可用配置：

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

然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openvpn-dashboard
sudo systemctl status openvpn-dashboard
```

## 关键环境变量

### `SESSION_COOKIE_SECURE=false`

这个变量是必须加的，至少在当前这套“只通过 VPN 内 HTTP 访问 dashboard”的部署里必须加。

原因：
- 默认生产模式下 session cookie 会带 `Secure`
- 但当前访问地址是 `http://10.188.0.1:3000`
- 浏览器不会在纯 HTTP 下保存 `Secure` cookie
- 结果就是“登录接口返回成功，但浏览器看起来始终登录不上”

验证方法：

```bash
curl -i -X POST http://10.188.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'X-Dashboard-Request: 1' \
  -d '{"username":"admin","password":"<your_passwd>"}'
```

如果响应头里的 `Set-Cookie` **不再包含** `Secure`，说明这个坑已经修好。

## 踩过的坑与解决方法

### 1. `npm run seed` 失败

现象：

```text
npm error Missing script: "seed"
```

原因：
- 项目里定义的是 `db:seed`
- 不是 `seed`

正确命令：

```bash
npm run db:seed
```

### 2. 数据库删了却还是提示“Users already exist”

现象：

明明删了 `prisma/dev.db`，但 seed 仍然提示：

```text
[seed] Users already exist — skipping seed
```

原因：
- 实际数据库文件不在你以为的位置
- 真实路径是：
  - `./prisma/prisma/dev.db`
  - `./.next/standalone/prisma/prisma/dev.db`

正确做法：

```bash
rm -f ./prisma/prisma/dev.db
rm -f ./.next/standalone/prisma/prisma/dev.db
find . -name "*.db-journal" -delete

npx prisma migrate deploy
npm run db:seed
```

### 3. `systemd` 启动失败，状态是 `203/EXEC`

现象：

```text
status=203/EXEC
```

原因：
- `ExecStart=/usr/bin/node ...`
- 但实际 Node 是通过 `nvm` 安装的，不在 `/usr/bin/node`

解决方法：

用真实路径替换 `ExecStart`，例如：

```ini
ExecStart=/home/ubuntu/.nvm/versions/node/v25.6.1/bin/node /home/ubuntu/apps/openvpn-dashboard/.next/standalone/server.js
```

### 4. 页面打开了，但样式没加载

现象：
- HTML 正常
- 页面像裸 HTML
- Tailwind 样式没生效

原因：
- `standalone/server.js` 运行时需要静态资源
- 仅有 server.js 不够

正确处理方式：
- 确保 `.next/static` 等静态产物存在
- 正常通过 `npm run build` 生成
- 再由 systemd 启动 `standalone/server.js`

如果遇到白屏或裸页面，优先检查：

```bash
ls -ld .next/static
ls -ld .next/standalone/.next
ls -ld .next/standalone/.next/static
```

### 5. 登录接口返回 `200`，浏览器却始终登录不上

现象：

```text
HTTP/1.1 200 OK
{"ok":true}
```

但浏览器仍然回到登录页。

原因：
- 登录成功了
- 但 cookie 带了 `Secure`
- 当前访问方式是 `http://10.188.0.1:3000`
- 浏览器不保存这个 cookie

解决方法：
- 在 `.env` 里加：

```env
SESSION_COOKIE_SECURE=false
```

然后：

```bash
npm run build
sudo systemctl restart openvpn-dashboard
```

### 6. Dashboard 显示没有在线设备，但 OpenVPN 明明在线

现象：
- `/clients/online` 显示空
- `/clients/all` 把在线设备显示成 `offline`

原因：
- 最初的 `lib/openvpn.ts` 只按旧版 `status.log` 格式解析
- 服务器实际是新版 CSV 格式：
  - `TITLE`
  - `TIME`
  - `HEADER,CLIENT_LIST`
  - `CLIENT_LIST,...`
  - `HEADER,ROUTING_TABLE`
  - `ROUTING_TABLE,...`

解决方法：
- 更新 `lib/openvpn.ts`
- 让 `getConnectedClients()` 支持新版 `CLIENT_LIST` / `ROUTING_TABLE` 格式
- 让 `getServerInfo()` 支持 `TIME,...`

### 7. Dashboard 无法读取 OpenVPN 目录

现象：

```text
Permission denied
```

原因：
- dashboard 以 `ubuntu` 用户运行
- 但 OpenVPN 状态文件、PKI、CCD 路径默认是 root 拥有

例如：
- `/var/log/openvpn/status.log`
- `/etc/openvpn/server/easy-rsa/pki/issued`
- `/etc/openvpn/server/ccd`

解决方法：

先给状态文件最小权限：

```bash
sudo chgrp ubuntu /var/log/openvpn/status.log
sudo chmod 640 /var/log/openvpn/status.log
```

给证书目录和 CCD 目录添加读取权限：

```bash
sudo chgrp ubuntu /etc/openvpn
sudo chmod 755 /etc/openvpn

sudo chgrp ubuntu /etc/openvpn/server
sudo chmod 755 /etc/openvpn/server

sudo chgrp ubuntu /etc/openvpn/server/easy-rsa
sudo chmod 755 /etc/openvpn/server/easy-rsa

sudo chgrp ubuntu /etc/openvpn/server/easy-rsa/pki
sudo chmod 755 /etc/openvpn/server/easy-rsa/pki

sudo chgrp -R ubuntu /etc/openvpn/server/easy-rsa/pki/issued
sudo chmod -R 755 /etc/openvpn/server/easy-rsa/pki/issued

sudo chmod 755 /etc/openvpn/server/ccd
sudo chmod 644 /etc/openvpn/server/ccd/*
```

如果还需要 dashboard 读取私钥目录，则再额外处理：

```bash
sudo chgrp -R ubuntu /etc/openvpn/server/easy-rsa/pki/private
sudo chmod -R 750 /etc/openvpn/server/easy-rsa/pki/private
```

注意：
- 给 `private/` 读权限会扩大应用可读敏感材料的范围
- 长期更稳妥的方式是用受控脚本和 `sudoers`

实际排查结果：
- dashboard 里 `Cert Expiry` 显示 `Missing`，根因通常不是证书不存在，而是 `ubuntu` 进程读不到 `issued/*.crt`
- OpenVPN 固定 IP 不生效时，根因可能不是 `ifconfig-push` 写错，而是 OpenVPN 进程本身读不到 `ccd/<client>`

本次实际验证可用的修复方式：

```bash
sudo find /etc/openvpn/server/easy-rsa/pki/issued -maxdepth 1 -type f -name '*.crt' -exec chmod 644 {} +
sudo chmod 755 /etc/openvpn/server/ccd
sudo chmod 644 /etc/openvpn/server/ccd/*
```

效果：
- dashboard 可以读取证书有效期
- OpenVPN 可以读取 `ccd/<client>`
- `ifconfig-push` 固定 IP 可以正常生效

### 8. `ifconfig-push` 写了但 client 仍然拿到动态 IP

现象：
- `ccd/<client>` 文件里已经有：

```conf
ifconfig-push 10.188.0.14 255.255.255.0
```

但客户端还是拿到池里的动态 IP，比如：

```text
10.188.0.4
```

原因：
- `server.conf` 虽然已经启用了：

```text
client-config-dir ccd
```

- 但 OpenVPN 实际运行用户是：

```text
user nobody
group nogroup
```

- 如果 `ccd/` 目录权限不允许该进程读取，就会在日志中出现：

```text
Could not access file 'ccd/<client>': Permission denied (errno=13)
```

结果：
- 服务端忽略 `ccd`
- 回退到动态地址池分配

验证方法：

```bash
sudo journalctl -u openvpn-server@server -n 100 --no-pager
```

如果修复成功，应该能看到：

```text
OPTIONS IMPORT: reading client specific options from: ccd/<client>
...
ifconfig 10.188.0.14 255.255.255.0
```

修复后还需要：
- 把当前 client 会话踢掉
- 让客户端重新连接

例如：

```bash
echo "kill Winston_Windows" | sudo socat - UNIX-CONNECT:/var/run/openvpn-server/server.sock
```

## 只允许 VPN 网段访问 dashboard

当前已验证可行的限制策略：
- OpenVPN 服务器在 VPN 内地址：`10.188.0.1`
- dashboard 运行在 `3000` 端口
- 只允许 `10.188.0.0/24` 访问

对应规则：

```bash
sudo iptables -I INPUT 1 -s 10.188.0.0/24 -p tcp --dport 3000 -j ACCEPT
sudo iptables -I INPUT 2 -s 127.0.0.1/32 -p tcp --dport 3000 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3000 -j DROP
```

验证：

```bash
ip addr show | grep 10.188.
sudo iptables -L INPUT -n --line-numbers | grep 3000
```

期望访问方式：

```text
http://10.188.0.1:3000
```

这样：
- VPN 内 `10.188.0.x` 设备可访问
- 非 VPN 来源无法访问

## 常用运维命令

### 查看服务状态

```bash
sudo systemctl status openvpn-dashboard
```

### 重启服务

```bash
sudo systemctl restart openvpn-dashboard
```

### 查看日志

```bash
sudo journalctl -u openvpn-dashboard -f
```

### 重新构建

```bash
cd ~/apps/openvpn-dashboard
git pull
npm run build
sudo systemctl restart openvpn-dashboard
```

### 测试登录接口

```bash
curl -i -X POST http://10.188.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'X-Dashboard-Request: 1' \
  -d '{"username":"admin","password":"<your_passwd>"}'
```

## 当前建议

当前版本已经可以正常用于：
- VPN 内访问
- 管理员登录
- 查看在线设备
- 查看全部 client
- 执行基础 client 管理

后续如果继续增强，优先建议：
- 把 `iptables` 规则做持久化
- 用 HTTPS 反代替代纯 HTTP
- 把敏感目录访问收敛到受控脚本或 `sudoers`
- 补更多部署自动化
