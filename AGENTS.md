# AGENTS.md

## 技术栈

Rust + Axum 0.8 + SQLx 0.8（运行时查询，不用 `query!` 宏）+ PostgreSQL。前端：React 19 + Vite 6 + TailwindCSS 4。开发环境：VSCode Dev Container + Podman。

## 常用命令

```bash
# 所有命令在容器内执行。从宿主机进入容器：
podman exec -it finalapidevcontainer_app_1 bash

# 在容器内：
cargo check                      # 后端类型检查
cargo run                        # 启动后端 :3000
cd frontend && npm run dev       # 启动前端 :5174（代理 /api 和 /v1 到 :3000）
cd frontend && npx tsc --noEmit  # 前端类型检查
cd frontend && npm run build     # 构建前端到 frontend/dist
bash scripts/update-presets.sh   # 从 models.dev 重新生成 provider-presets.json

# 从宿主机直接在容器内执行单条命令：
podman exec finalapidevcontainer_app_1 bash -c 'cd /workspace && cargo check'
podman exec finalapidevcontainer_app_1 bash -c 'cd /workspace/frontend && npm run dev'
```

## 架构

这是一个**透明 LLM API 网关**——直接透传请求到上游服务商，不做格式转换。请求体原样转发，只处理认证头替换、模型名映射、body 字段覆盖。

### 请求流程

`src/handler/relay.rs` 是核心。请求进来 → 从 JSON body 提取 model → 查找支持该模型的渠道 → 选一个（优先 sticky 亲和，其次确定性 hash）→ 转发到存储的 `endpoint_url` → 流式返回响应。

不重试、不超时、不转换格式。单次请求，直接返回结果。

### 渠道模型

每个渠道存储完整的 `endpoint_url`（如 `https://api.openai.com/v1/chat/completions`）和 `auth_type`（`bearer` 或 `x-api-key`）。模型可以通过 `model_overrides` JSONB 列逐个覆盖这两个字段。

### 两套认证系统

- **中继路由**（`/v1/*`）：API 密钥，`Authorization: Bearer sk-…` 或 `x-api-key`，查 `tokens` 表验证
- **管理路由**（`/api/*`）：登录签发 JWT，中间件验证

### 路由选择（亲和路由）

`src/service/routing.rs` 对 `sticky_id`（session 头 → token ID → IP）做确定性 hash，在加权渠道列表中选择。成功的请求会把 `{model}/{sticky_id} → channel_id` 持久化到 `sticky_provider` 表，保持上游 prompt cache 热。

## 关键约定

- **SQLx**：使用运行时 `query_as::<_, T>()` 查询（非编译期 `query!` 宏）。编译时不需要 `DATABASE_URL`。列名与 Rust 字段名不同时用 `#[sqlx(rename = "...")]`。
- **数据库迁移**：SQLx migrate，通过 `sqlx::migrate!("./migrations")` 嵌入，启动时自动执行。有多个删列迁移——表结构是有意精简的。
- **编译产物**：`target-dir` 设为 `/tmp/final-api-target`（tmpfs），配置在 `.cargo/config.toml`，不占磁盘，不在 git 中。
- **服务商预设**：`frontend/src/provider-presets.json` 是从 models.dev 提取的打包数据（170KB）。每个模型条目要么是字符串（继承渠道默认），要么是 `[名称, {endpoint_url, auth_type}]`（覆盖）。通过 `scripts/update-presets.sh` 重新生成。
- **前端路由**：基于 hash，无 react-router。`App.tsx` 根据 `window.location.hash` 切换。
- **前端主题**：`index.css` 中的 CSS 变量 + `<html>` 上的 `data-theme` 属性。侧栏有深色/浅色切换。
- **Podman**：devcontainer 配置为 rootless Podman。docker-compose.yml 中有 `userns_mode: "keep-id"`。VS Code 设置指向 `podman`/`podman-compose`。
- **接口格式校验**：中继会拒绝入口端点格式和存储的 `endpoint_url` 后缀不匹配的请求（`/chat/completions` = OpenAI，`/messages` = Anthropic）。

## 默认凭据

首次启动自动创建管理员账号 `root / 123456`。

## Git 约定

- **不要自动提交代码。** 除非用户明确要求提交，否则不执行 `git commit`。完成代码改动后停止即可。
