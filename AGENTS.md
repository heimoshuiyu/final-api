# AGENTS.md

## 技术栈

Rust 1.97 + Axum 0.8 + SQLx 0.9（运行时查询，不用 `query!` 宏）+ PostgreSQL。前端：React 19 + Vite 8 + TypeScript 7 + TailwindCSS 4 + shadcn/ui（new-york 风格，radix-ui 统一包）+ lucide-react 图标。开发环境：VSCode Dev Container + Podman。

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
bash scripts/update-presets.sh   # 从 models.dev 下载原始数据到 assets/models-dev.json

# 从宿主机直接在容器内执行单条命令：
podman exec finalapidevcontainer_app_1 bash -c 'cd /workspace && cargo check'
podman exec finalapidevcontainer_app_1 bash -c 'cd /workspace/frontend && npm run dev'
```

## 依赖管理

**所有依赖安装必须在容器内执行**，因为宿主机不一定有 Rust/Node 工具链，且容器内的 `.cargo/config.toml` 和 npm registry 已配置国内镜像。

### 国内镜像配置

容器内已预配置以下镜像（持久化在 devcontainer 的 dotfiles 中）：

- **Cargo（Rust）**：`.cargo/config.toml` 中配置了 USTC 镜像源（`sparse+https://mirrors.ustc.edu.cn/crates.io-index/`）。
- **npm（Node）**：`npm config set registry https://registry.npmmirror.com`。

如果镜像配置丢失，手动恢复：

```bash
# Cargo 镜像
cat > .cargo/config.toml << 'EOF'
[source.crates-io]
replace-with = "ustc"

[source.ustc]
registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"

[build]
target-dir = "/tmp/final-api-target"
EOF

# npm 镜像
npm config set registry https://registry.npmmirror.com
```

### 安装 / 升级依赖

```bash
# 后端：在容器内执行
cd /workspace && cargo add <crate>          # 添加新依赖
cd /workspace && cargo update               # 更新所有依赖到最新兼容版本
cd /workspace && cargo update -p <crate>    # 更新单个依赖

# 前端：在容器内执行
cd /workspace/frontend && npm install       # 安装 package.json 中的依赖
cd /workspace/frontend && npm install <pkg> # 添加新依赖
cd /workspace/frontend && npm update        # 更新所有依赖

# 前端批量升级（跨大版本）
cd /workspace/frontend && npx npm-check-updates -u && npm install
```

## 架构

这是一个**透明 LLM API 网关**——直接透传请求到上游服务商，不做格式转换。请求体原样转发，只处理认证头替换、模型名映射、body 字段覆盖。

### 请求流程

`src/handler/relay.rs` 是核心。请求进来 → 从 JSON body 提取 model → 查找支持该模型的渠道 → 选一个（优先 sticky 亲和，其次确定性 hash）→ 转发到存储的 `endpoint_url` → 流式返回响应。

不重试、不超时、不转换格式。单次请求，直接返回结果。

### Token 用量提取

`src/service/usage.rs` 中的 `UsageExtractor` 从流式 SSE 响应中提取 token 用量，支持多种 API 格式：

- **OpenAI Chat**（含 OpenRouter / DeepSeek / Groq 等）：最后一个 chunk 的 `usage.prompt_tokens_details.cached_tokens`（OpenAI / xAI）、顶层 `cached_tokens`（Moonshot）、`cache_creation_input_tokens`（阿里）
- **Anthropic Messages**：`message_start` 提供输入 + 缓存信息，`message_delta` 提供输出 tokens，合并计算
- **OpenAI Responses**：`response.completed` 事件的 `response.usage`
- **Gemini 原生**：`usageMetadata`（每个 chunk 都带，最后一个为权威值），`candidatesTokenCount + thoughtsTokenCount` 为总输出
- **Generic 兜底**：自动尝试以上所有字段名约定

用量数据在流结束后异步写入 `request_logs` 表（`prompt_tokens`、`completion_tokens`、`total_tokens`、`cached_tokens`、`cache_creation_tokens`）。

### 服务商预设

`scripts/update-presets.sh` 从 models.dev 下载原始 JSON 数据到 `assets/models-dev.json`（不做任何后处理）。后端通过 `include_str!` 在编译期嵌入该文件，运行时 `/api/presets` 端点动态处理：按 npm 包名判断 API 格式 → 构建 endpoint URL → 返回给前端。格式判断规则：

| npm 包名 | 格式 | endpoint 构建逻辑 |
|---------|------|------------------|
| 含 `anthropic` | Anthropic | `{base}/messages`，auth = `x-api-key` |
| 含 `google` / `gemini` | Gemini | `{base}/openai/chat/completions`（Google OpenAI 兼容层） |
| 其他 | OpenAI | `{base}/chat/completions`，auth = `bearer` |

部分服务商（OpenAI / Anthropic / Google / xAI / Mistral / Cohere / Perplexity）在 models.dev 没有提供 `api` 字段，后端通过硬编码 `FALLBACK_API` 表补全。

### 渠道模型

每个渠道存储完整的 `endpoint_url`（如 `https://api.openai.com/v1/chat/completions`）和 `auth_type`（`bearer` 或 `x-api-key`）。模型可以通过 `model_overrides` JSONB 列逐个覆盖这两个字段。

### 两套认证系统

- **中继路由**（`/v1/*`）：API 密钥，`Authorization: Bearer sk-…` 或 `x-api-key`，查 `tokens` 表验证
- **管理路由**（`/api/*`）：登录签发 JWT，中间件验证

### 路由选择（亲和路由）

`src/service/routing.rs` 对 `sticky_id`（session 头 → token ID → IP）做确定性 hash，在加权渠道列表中选择。成功的请求会把 `{model}/{sticky_id} → channel_id` 持久化到 `sticky_provider` 表，保持上游 prompt cache 热。

## 关键约定

- **SQLx 0.9**：使用运行时 `query_as::<_, T>()` 查询（非编译期 `query!` 宏）。编译时不需要 `DATABASE_URL`。列名与 Rust 字段名不同时用 `#[sqlx(rename = "...")]`。feature 名从 `runtime-tokio-rustls` 拆分为 `runtime-tokio` + `tls-rustls`。
- **数据库迁移**：SQLx migrate，通过 `sqlx::migrate!("./migrations")` 嵌入，启动时自动执行。有多个删列迁移——表结构是有意精简的。
- **编译产物**：`target-dir` 设为 `/tmp/final-api-target`（tmpfs），配置在 `.cargo/config.toml`，不占磁盘，不在 git 中。
- **前端路由**：基于 hash，无 react-router。`App.tsx` 根据 `window.location.hash` 切换。
- **前端组件**：shadcn/ui（new-york 风格），组件在 `frontend/src/components/ui/`，通过 `npx shadcn@latest add` 添加。路径别名 `@/` → `src/`。图标用 `lucide-react`。`cn()` 在 `src/lib/utils.ts`。
- **前端主题**：OKLCH 色彩系统（参考 opencode-token-dashboard 风格）。`index.css` 中定义 CSS 变量，`<html>` 上的 `.dark`/`.light` class 切换主题（非 `data-theme` 属性）。默认深色。工具类：`.glass-panel`（毛玻璃面板）、`.glow-border`（发光边框）、`.accent-gradient-text`（品牌渐变文字）、`.bg-grid`（网格背景）、`.bg-radial-glow`（深色模式径向光晕）。字体：Geist Variable（UI）+ JetBrains Mono Variable（数据）。
- **Podman**：devcontainer 配置为 rootless Podman。docker-compose.yml 中有 `userns_mode: "keep-id"`。VS Code 设置指向 `podman`/`podman-compose`。
- **接口格式校验**：中继会拒绝入口端点格式和存储的 `endpoint_url` 后缀不匹配的请求（`/chat/completions` = OpenAI，`/messages` = Anthropic）。

## 默认凭据

首次启动自动创建管理员账号 `root / 123456`。

## Git 约定

- **不要自动提交代码。** 除非用户明确要求提交，否则不执行 `git commit`。完成代码改动后停止即可。
