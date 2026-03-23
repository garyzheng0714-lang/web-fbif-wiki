# FBIF Wiki Chat

基于火山方舟知识库服务的网页聊天 Demo，支持前端流式输出。

## 1. 环境要求

- Go 1.26+

## 2. 必填环境变量

```bash
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

## 3. 启动

```bash
./start.sh
```

打开：

- `http://127.0.0.1:5173/`（自动跳转到聊天页面）

## 4. 接口说明

- `GET /api/health`
- `POST /api/chat/stream`（SSE）

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

流式事件：

- `event: token`：增量 token
- `event: done`：最终答案
- `event: error`：错误信息
