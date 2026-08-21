# final-api

透明 LLM API 网关 —— 直接透传请求到上游服务商，配合会话亲和路由保持 prompt cache 热度。

English README is WIP.（中文文档如下）

## 技术栈

- **后端**：Rust + Axum + SQLx（运行时查询）+ PostgreSQL
- **前端**：React 19 + Vite + TypeScript + TailwindCSS + shadcn/ui
- **开发环境**：Podman（podman-compose），生产环境单二进制部署（前端嵌入）

## 核心设计

与 new-api 等做完整请求反序列化/格式转换的网关不同，final-api **透明代理**请求：

- 请求体原样转发到上游，不做格式转换
- 只处理认证头替换（`bearer` / `x-api-key`）、模型名映射、body 字段覆盖
- 不重试、不超时、不转换格式，单次请求直接返回

### 会话亲和路由（Sticky Routing）

用确定性前缀匹配（受 opencode console 启发）替代随机负载均衡：

1. 从 session header → token ID → IP 提取 `stickyId`
2. 查询 `sticky_provider` 表中 `{model}/{stickyId}` 的映射
3. 命中则复用同一渠道（保持上游 prompt cache 热）
4. 未命中则通过 hash(stickyId) % 加权渠道列表 确定性选择
5. 请求成功（HTTP 200）后持久化映射

### Token 用量提取

从流式 SSE 响应中提取 token 用量，支持多种 API 格式：

- **OpenAI Chat**（含 OpenRouter / DeepSeek / Groq 等）：`usage.prompt_tokens_details.cached_tokens` 等
- **Anthropic Messages**：`message_start` + `message_delta` 合并计算
- **OpenAI Responses**：`response.completed` 事件的 `response.usage`
- **Gemini 原生**：`usageMetadata`

用量数据异步写入 `request_logs` 表，支持统计仪表盘（图表、热力图、多指标维度）。

### 服务商预设

内置 [models.dev](https://models.dev) 数据（`/api/presets`），自动判断 API 格式并生成 endpoint URL，一键添加渠道。

## 功能

- 透明中继：`/v1/chat/completions`、`/v1/completions`、`/v1/messages`、`/v1/embeddings`、`/v1/responses`、`/v1/models`
- 渠道管理：完整 `endpoint_url` + 认证类型，支持逐模型覆盖（`model_overrides`）
- API Token 管理（中继认证）+ JWT 管理认证
- 工作区 / 成员 / 角色系统，token 邀请链接
- OAuth 登录（GitHub / Google / 企业微信）
- 请求日志、耗时分析、用量统计仪表盘
- 模型价格管理

## 快速开始

### 开发环境（Podman）

```bash
podman-compose up -d     # 启动 app + db 容器
podman exec -it final-api_app_1 bash

# 容器内：
cargo run                          # 后端 :3000
cd frontend && npm install && npm run dev   # 前端 :5174（代理 /api 和 /v1 到 :3000）
```

环境变量参考 `.env.example`。

> ⚠️ 生产环境务必设置 `JWT_SECRET`（如 `openssl rand -hex 32`），否则启动时会打印不安全默认密钥警告。

### 生产部署

```bash
# 1. 构建前端（rust-embed 编译期嵌入，必须先做）
cd frontend && npm run build

# 2. 编译 release 二进制
cargo build --release

# 3. 构建生产镜像（基于 debian:13-slim，只复制预编译二进制）
podman build -t final-api:latest .

# 4. 运行
docker run -d -p 3000:3000 \
  -e DATABASE_URL=postgres://user:pass@host:5432/db \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  final-api:latest
```

数据库迁移通过 `sqlx::migrate!` 嵌入，启动时自动执行。

## 默认凭据

首次启动自动创建管理员账号 `root / 123456`，请登录后立即修改密码。

## License

[MIT](./LICENSE)
