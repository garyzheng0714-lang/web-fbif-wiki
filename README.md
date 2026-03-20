# FBIF Wiki Publisher (飞书云文档发布站)

单租户私有化 MVP：把飞书知识库（Wiki）内容发布成可公开访问的网站，提供管理台、页面发布、手动同步与定时巡检同步。

## 已实现能力（当前仓库）

- 管理台 `/admin`
  - 飞书 OAuth 登录（租户锁定）
  - 绑定知识库（Wiki Space）
  - 触发同步（队列）
  - 页面发布/取消发布、导航显隐
  - 站点基础配置（站点名、slug、主题、首页）
- 同步与渲染
  - 全量同步：拉取 Wiki 节点树并落库
  - 巡检同步：定时/手动拉取节点并对比 `obj_edit_time`
  - 发布时渲染：Docx blocks -> HTML + TOC
- 公网站点
  - 路由 `/s/[siteSlug]/[pageSlug]`
  - 左侧导航 / 中间正文 / 右侧目录
  - `sitemap.xml` 与 `robots.txt`
- 安全基础
  - 管理台会话 cookie
  - 回调 token/signature 校验（可选）
  - 安全响应头
  - 简单限流（middleware）

## 技术栈

- Next.js 14 (App Router) + TypeScript
- Prisma + PostgreSQL
- BullMQ + Redis
- MinIO（对象存储，当前作为基础设施预留）

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 复制环境变量

```bash
cp .env.example .env
```

3. 启动依赖服务（Postgres/Redis/MinIO）

```bash
docker compose up -d
```

4. 执行数据库迁移与 Prisma Client 生成

```bash
npm run db:migrate
npm run db:generate
```

5. 启动 Web 与 Worker（两个终端）

```bash
npm run dev
npm run worker
```

6. 打开

- 管理台: `http://localhost:3000/admin`
- 站点首页: `http://localhost:3000/`
- 飞书鉴权自检: `http://localhost:3000/api/auth/feishu/check`
- 飞书 OAuth 参数查看: `http://localhost:3000/api/auth/feishu/debug`

## 阿里云部署（Docker Compose）

仓库已提供：

- `Dockerfile`
- `docker-compose.deploy.yml`
- `.env.deploy.example`

部署步骤（在服务器）：

```bash
cd /opt/fbif-wiki
cp .env.deploy.example .env.deploy
# 填写 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_OAUTH_REDIRECT_URI 等
docker compose -f docker-compose.deploy.yml up -d --build
```

默认将应用监听在 `127.0.0.1:3100`，建议由 Caddy/Nginx 反代到公网域名或 IP。

## 飞书开放平台配置

在飞书开发者后台创建自建应用并配置：

- Redirect URI: `http://localhost:3000/api/auth/feishu/callback`
- 如本地访问不是 `localhost`，请设置：`FEISHU_OAUTH_REDIRECT_URI` 为你在飞书后台配置的完全一致地址（协议/域名/端口/路径都要一致）
- 需要开通 Wiki/Docx/Drive 对应权限（至少读取知识库、读取文档内容）
- 事件订阅（可选）：
  - URL: `http://<your-domain>/api/feishu/events`
  - 事件: `drive.file.edit_v1`
  - 配置 `FEISHU_VERIFICATION_TOKEN` 与 `FEISHU_ENCRYPT_KEY`（可选签名）
  - 如果改用长连接：设置 `FEISHU_EVENT_SUBSCRIBE_MODE=longconn`，并在飞书后台把订阅方式切到“长连接”；此时无需配置上述 URL。

快速排错：

```bash
set -a; source .env; set +a
python3 /Users/simba/.codex/skills/feishu-bot-quickstart/scripts/feishu_auth_check.py
```

## 项目结构

```txt
src/
  app/
    admin/                      # 管理台
    s/[siteSlug]/[pageSlug]/    # 公网站点页面
    api/                        # OAuth / site / pages / sync / events
  components/
    admin/                      # 管理台组件
    site/                       # 公网站点布局组件
  server/
    feishu/                     # 飞书 API 客户端与 token 管理
    sync/                       # 全量/巡检同步逻辑
    docx/                       # docx block 渲染器
    db.ts env.ts session.ts ...
  worker/
    index.ts                    # BullMQ worker + 定时巡检
prisma/
  schema.prisma
  migrations/
```

## 数据模型（核心）

- `Site`: 站点配置
- `SpaceBinding`: 站点绑定的 Wiki space
- `WikiNode`: 同步下来的知识库节点树
- `Page`: 页面发布状态（DRAFT/PUBLISHED）
- `PageRevision`: 每次渲染产物（html/toc/hash）
- `SyncJob`: 同步任务记录
- `AdminUser` / `FeishuOAuthToken` / `AuditLog`

## 现阶段限制

- Docx 渲染仅覆盖常见块；复杂块（图片/附件/表格等）目前为占位提示。
- 事件订阅流程已预留回调入口，但按文件订阅管理（`drive/v1/files/{token}/subscribe`）尚未自动化落地。
- 对象存储（MinIO）已接入基础客户端，但图片/附件上传映射在下一迭代完成。

## 建议下一步

1. 补齐图片/附件/表格等块类型渲染，接入 MinIO。
2. 在页面发布流程中自动订阅 `drive.file.edit_v1`，并建立失效重试。
3. 增加 RBAC 细粒度控制（API 级别），完善审计与告警。
4. 增加站内搜索与 SEO 元信息管理。
