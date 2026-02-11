# GitHub Actions 自动部署到阿里云（fbif-wiki）

已生成并通过预检的工作流：

- `.github/workflows/deploy-aliyun.yml`

## 1. GitHub Secrets（必须）

至少配置其一：

- `ALIYUN_SSH_KEY`：推荐，内容为服务器私钥原文
- `ALIYUN_SSH_KEY_B64`：私钥 base64

建议配置：

- `ALIYUN_HOST`：默认 `112.124.103.65`
- `ALIYUN_USER`：默认 `root`
- `ALIYUN_SSH_PORT`：默认 `22`（如你改了 SSH 端口必须设置）
- `APP_DIR`：默认 `/opt/fbif-wiki`
- `APP_ENV_B64`：应用 `.env` 内容的 base64（首发推荐）

## 2. APP_ENV_B64 示例

本地执行：

```bash
./scripts/gen_app_env_b64.sh .env
```

把输出粘贴到 GitHub Secret `APP_ENV_B64`。

> 要求 `.env` 内至少包含：
> - `DATABASE_URL`
> - `REDIS_URL`
> - `SESSION_SECRET`
> - `TOKEN_ENCRYPTION_KEY`
> - `FEISHU_APP_ID`
> - `FEISHU_APP_SECRET`
> - `APP_BASE_URL`
> - `FEISHU_OAUTH_REDIRECT_URI`

## 3. 首次部署后检查

进入服务器：

```bash
pm2 ls
pm2 logs fbif-wiki-web --lines 100
pm2 logs fbif-wiki-worker --lines 100
curl -I http://127.0.0.1:3100/demo
```

## 4. 飞书后台 OAuth 回调地址

必须与 `.env` 完全一致：

- `FEISHU_OAUTH_REDIRECT_URI`

例如：

- `http://112.124.103.65/api/auth/feishu/callback`

协议 / 域名 / 端口 / 路径必须一致，否则会报 `20029 redirect_uri 请求不合法`。

## 5. 你当前报错的定位（SSH banner 超时）

若 Actions 在 `Validate SSH Key` 失败，日志含：

- `Connection timed out during banner exchange`

表示 GitHub Runner 与 ECS 的 TCP 已连上，但收不到 SSH 服务 banner。优先排查：

1. ECS 安全组是否允许 `22/TCP` 入站（建议临时放开 `0.0.0.0/0` 验证，再收敛）。
2. 服务器防火墙（`firewalld/ufw/iptables`）是否拦截。
3. `sshd` 是否卡死或连接数满：
   - `systemctl status sshd`
   - `journalctl -u sshd -n 200 --no-pager`
4. 是否有 fail2ban/安全策略封禁了 GitHub Runner 来源 IP。

当前 workflow 已加：

- Runner 公网 IP 输出（便于你加白名单）
- SSH/上传/远程执行重试
- 更长超时 + 可配置 `ALIYUN_SSH_PORT`

如果仍失败，建议先在阿里云控制台“云助手”执行：

```bash
sudo systemctl restart sshd
sudo ss -lntp | grep :22
sudo journalctl -u sshd -n 100 --no-pager
```
