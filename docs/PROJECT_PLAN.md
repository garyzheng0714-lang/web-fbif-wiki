# 飞书云文档发布站（类飞站）项目规划文档

## 1. 目标与范围

- 单租户私有化部署
- TypeScript 全栈
- MVP 聚焦：发布 + 同步 + 管理台

MVP 核心能力：

1. 从飞书 Wiki 绑定站点内容。
2. 支持手动同步与定时巡检同步。
3. 页面发布状态管理（公开/未公开）。
4. 可公开访问的网站页面与目录导航。
5. 管理台配置站点信息与外观主题。

## 2. 技术选型

- 前端/后端：Next.js 14 App Router
- 数据库：PostgreSQL + Prisma
- 队列：BullMQ + Redis
- 对象存储：MinIO（S3 兼容）
- 鉴权：飞书 OAuth + 会话 Cookie（JWT）

## 3. 系统架构

- 管理台：`/admin`
  - 登录、绑定知识库、页面发布、同步触发
- 公网站点：`/s/:siteSlug/:pageSlug`
  - 左侧导航、正文渲染、右侧 TOC
- API 层：`/api/*`
  - OAuth、Wiki 拉取、同步任务、页面更新
- Worker：`src/worker/index.ts`
  - 全量同步（FULL）
  - 巡检同步（POLL，默认 5 分钟）

## 4. 数据模型（已落库）

- `Site`
- `SpaceBinding`
- `WikiNode`
- `Page`
- `PageRevision`
- `SyncJob`
- `AdminUser`
- `FeishuOAuthToken`
- `AuditLog`

## 5. 同步机制

- 首次绑定：触发 FULL，同步 Wiki 节点树。
- 定时巡检：对比 `obj_edit_time`，仅刷新变化页面。
- 手动同步：管理台触发 POLL。
- 发布时渲染：首次发布自动生成 `PageRevision`。

## 6. 安全策略

- 会话 Cookie（HttpOnly/SameSite）
- 租户锁定（首个登录租户）
- Token 加密存储（AES-256-GCM）
- Webhook token/signature 校验（可选）
- 安全响应头 + 简单限流

## 7. 已知限制与后续路线

当前限制：

- Docx 渲染器对复杂块（图片/附件/表格）仍是占位。
- 按文件事件订阅与自动续订未完成。
- MinIO 资源回填链路未完成（仅接入客户端）。

后续建议：

1. 完整块级渲染与附件回填。
2. 事件驱动增量刷新（`drive.file.edit_v1` + 文件订阅管理）。
3. 更细粒度 RBAC 与审计告警。
4. 搜索（Postgres FTS/Meilisearch）与 SEO 增强。

## 8. 工期建议（基于当前代码）

- 当前仓库已具备 MVP 骨架与主流程。
- 完成“可上线 MVP”的预计追加工期：
  - 渲染完善：6-10 天
  - 事件订阅自动化：3-5 天
  - 安全与运维加固：3-5 天
  - 联调与回归测试：4-6 天
- 合计：16-26 个工作日
