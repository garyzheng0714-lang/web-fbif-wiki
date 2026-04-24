# FBIF Wiki Chat

FBIF 智能助手网页聊天 Demo。服务端使用 Go 提供静态页面、健康检查、链接预览和 SSE 流式聊天接口，聊天后端优先使用 Coze API，未配置 Coze 时可切换到火山方舟知识库。仓库还包含 `knowledge-sync` 工具，用于从配置的信源网页抓取内容、生成 Q&A 并同步到飞书多维表格。

## 功能特性

- 网页聊天界面，默认访问根路径时跳转到 `preview/fbif-chat-brand.html`
- `POST /api/chat/stream` SSE 流式输出
- Coze API 优先，火山方舟知识库作为备用后端
- `GET /api/unfurl` 链接预览，提取页面元数据
- `GET /api/health` 健康检查，返回 AI 后端配置状态
- `knowledge-sync` 命令行工具支持信源抓取、Q&A 生成和飞书多维表格同步

## 技术栈

- Go 1.26
- Go 标准库 `net/http` 静态文件和 API 服务
- `github.com/go-rod/rod` 用于网页抓取相关流程
- Coze API / 火山方舟知识库 API
- 飞书多维表格 API（用于 `knowledge-sync`）

## 项目结构

```text
.
├── cmd/
│   ├── server/          # 聊天服务入口
│   └── knowledge-sync/  # 知识同步工具入口
├── config/
│   └── sources.json     # 待抓取信源配置
├── internal/
│   ├── feishu/          # 飞书 API 客户端
│   ├── knowledge/       # Q&A、diff、同步逻辑
│   └── scraper/         # 网页抓取逻辑
├── preview/             # 静态聊天页面
├── scripts/             # 本地启动脚本
├── .env.example
├── start.sh
└── README.md
```

## 环境要求

- Go 1.26+
- Chromium（运行 `knowledge-sync scrape` 时需要；仅启动聊天服务不需要）

## 配置

复制示例环境变量：

```bash
cp .env.example .env
```

### 聊天服务

Coze 和火山方舟二选一即可。配置 Coze 时优先使用 Coze：

```bash
COZE_API_KEY=pat_xxxx
COZE_BOT_ID=your-coze-bot-id
```

未配置 Coze 时，可配置火山方舟知识库：

```bash
VOLC_API_KEY=your-volc-api-key
VOLC_SERVICE_RESOURCE_ID=your-service-resource-id
VOLC_KNOWLEDGE_BASE_ENDPOINT=https://api-knowledgebase.mlp.cn-beijing.volces.com
```

可选服务配置：

```bash
HOST=127.0.0.1
PORT=5173
UPSTREAM_TIMEOUT_SECONDS=600
```

### knowledge-sync

`knowledge-sync` 需要飞书应用和多维表格配置：

```bash
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_APP_TOKEN=base_app_token
FEISHU_TABLE_KNOWLEDGE=knowledge_table_id
FEISHU_TABLE_PENDING=pending_review_table_id
```

## 启动聊天服务

```bash
./start.sh
```

默认地址：

- 聊天页面：`http://127.0.0.1:5173/`
- 健康检查：`http://127.0.0.1:5173/api/health`

也可以直接运行 Go 服务：

```bash
go run ./cmd/server
```

## knowledge-sync 用法

信源配置位于 [config/sources.json](./config/sources.json)。工具会基于这些网页抓取内容，生成 Q&A，写入待审核表，再将审核通过的记录同步到知识条目表。

```bash
# 首次运行：在飞书多维表格中创建知识条目表和待审核表
go run ./cmd/knowledge-sync init

# 抓取信源、生成 Q&A、写入待审核表
go run ./cmd/knowledge-sync scrape

# 将审核通过的记录同步到知识条目表
go run ./cmd/knowledge-sync review
```

仓库中包含已构建的 `knowledge-sync` 可执行文件；开发时仍建议优先使用源码命令，确保逻辑与当前代码一致。

## API

### `GET /api/health`

返回服务状态以及聊天后端是否已配置。

### `POST /api/chat/stream`

SSE 流式聊天接口。

请求体：

```json
{
  "message": "用户当前问题",
  "history": [
    { "role": "user", "content": "上一轮提问" },
    { "role": "assistant", "content": "上一轮回答" }
  ]
}
```

事件类型：

- `event: token`：增量文本
- `event: done`：最终回答
- `event: error`：错误信息

### `GET /api/unfurl?url=<url>`

获取链接预览信息。

## 注意事项

- `COZE_API_KEY`、`VOLC_API_KEY`、飞书应用密钥等敏感配置应仅放在本地或部署环境变量中。
- `knowledge-sync scrape` 依赖浏览器自动化，服务器环境需要可用的 Chromium。
- 信源 URL 和分类维护在 `config/sources.json` 中，变更信源后建议先小范围运行并检查待审核表结果。
