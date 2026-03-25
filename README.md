# FBIF Wiki Chat

FBIF 智能助手网页聊天 Demo，支持 Coze API（优先）和火山方舟知识库（备用）双后端，前端流式输出。附带 `knowledge-sync` 工具，用于从信源网页抓取内容、生成 Q&A 并同步到飞书多维表格。

## 1. 环境要求

- Go 1.26+
- Chromium（`knowledge-sync scrape` 需要，聊天服务不需要）

## 2. 环境变量

### 聊天服务

Coze 和 Volc 二选一即可，优先使用 Coze：

```bash
# Coze API（优先）
export COZE_API_KEY="pat_xxxx"
export COZE_BOT_ID="你的 Coze Bot ID"

# Volc 知识库（备用，Coze 未配置时生效）
export VOLC_API_KEY="你的火山方舟 API Key"
export VOLC_SERVICE_RESOURCE_ID="你的知识服务 ID"
```

可选：

```bash
export VOLC_KNOWLEDGE_BASE_ENDPOINT="https://api-knowledgebase.mlp.cn-beijing.volces.com"
export HOST="127.0.0.1"
export PORT="5173"
export UPSTREAM_TIMEOUT_SECONDS="600"
```

### knowledge-sync 工具

```bash
export FEISHU_APP_ID="飞书应用 App ID"
export FEISHU_APP_SECRET="飞书应用 App Secret"
export FEISHU_APP_TOKEN="多维表格 App Token"
export FEISHU_TABLE_KNOWLEDGE="知识条目表 ID（init 后获取）"
export FEISHU_TABLE_PENDING="待审核表 ID（init 后获取）"
```

也可将以上变量写入项目根目录的 `.env` 文件（参考 `.env.example`）。

## 3. 启动聊天服务

```bash
./start.sh
```

打开：

- `http://127.0.0.1:5173/`（自动跳转到聊天页面）

## 4. knowledge-sync 工具

从 `config/sources.json` 中配置的信源网页抓取内容，生成 Q&A 对，写入飞书多维表格供人工审核后同步到知识库。

```bash
# 首次运行：在飞书多维表格中创建"知识条目"和"待审核"两张表
go run ./cmd/knowledge-sync init

# 抓取信源、生成 Q&A、写入待审核表
go run ./cmd/knowledge-sync scrape

# 将审核通过的记录同步到知识条目表
go run ./cmd/knowledge-sync review
```

## 5. 接口说明

- `GET /api/health` — 健康检查，返回后端配置状态
- `POST /api/chat/stream`（SSE）— 流式聊天
- `GET /api/unfurl?url=<url>` — 链接预览（提取 OG 元数据）

`POST /api/chat/stream` 请求体：

```json
{
  "message": "用户当前问题",
  "history": [
    { "role": "user", "content": "上一轮提问" },
    { "role": "assistant", "content": "上一轮回答" }
  ]
}
```

流式事件：

- `event: token`：增量 token
- `event: done`：最终答案
- `event: error`：错误信息
