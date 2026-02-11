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
- `APP_DIR`：默认 `/opt/fbif-wiki`
- `APP_ENV_B64`：应用 `.env` 内容的 base64（首发推荐）

## 2. APP_ENV_B64 示例

本地执行：

```bash
base64 -i .env | tr -d '\n'
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
