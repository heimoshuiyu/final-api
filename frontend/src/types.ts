export interface User {
  id: number
  username: string
  status: number
  created_at?: string
}

export interface Workspace {
  id: number
  name: string
  slug: string | null
  role: number
}

export interface WorkspaceMember {
  id: number
  user_id: number
  username: string
  role: number
  joined_at: string
}

export interface WorkspaceInvite {
  id: number
  username: string
  role: number
  status: number
  created_at: string
  expires_at: string | null
}

export interface Token {
  id: number
  workspace_id: number
  user_id: number
  key: string
  name: string
  model_limits_enabled: boolean
  model_limits: string
  expired_at: string | null
  created_at: string
  updated_at: string
}

export interface FormatOverride {
  endpoint_url?: string
  auth_type?: string
}

export interface ModelOverrideEntry {
  weight?: number
  [format: string]: FormatOverride | number | undefined
}

export interface ModelPrice {
  input?: number
  output?: number
  cached?: number
  cache_creation?: number
}

export interface Channel {
  id: number
  workspace_id: number
  name: string
  endpoint_url: string
  auth_type: string
  models: string[]
  status: number
  priority: number
  weight: number
  model_mapping: Record<string, string>
  model_overrides: Record<string, ModelOverrideEntry>
  header_override: Record<string, string>
  body_override: Record<string, unknown>
  max_concurrency: number
  model_prices: Record<string, ModelPrice>
  created_at: string
  updated_at: string
}

export interface LogEntry {
  id: number
  workspace_id: number | null
  token_id: number | null
  user_id: number | null
  channel_id: number | null
  model: string
  is_stream: boolean
  status_code: number
  duration_ms: number
  session_id: string
  sticky_id: string
  error_message: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  cached_tokens: number | null
  cache_creation_tokens: number | null
  cost: number | null
  created_at: string
}

export interface LogQuery {
  workspace_id?: number
  user_id?: number
  token_id?: number
  channel_id?: number
  model?: string
  page?: number
  page_size?: number
}

export interface CreateTokenRequest {
  name: string
  model_limits_enabled?: boolean
  model_limits?: string
  expired_at?: string
}

export interface CreateChannelRequest {
  name: string
  endpoint_url: string
  auth_type?: string
  api_key: string
  models: string[]
  priority?: number
  weight?: number
  model_mapping?: Record<string, string>
  model_overrides?: Record<string, ModelOverrideEntry>
  header_override?: Record<string, string>
  body_override?: Record<string, unknown>
  max_concurrency?: number
  model_prices?: Record<string, ModelPrice>
}

export interface ProviderPresetModel {
  id: string
  override?: {
    endpoint_url: string
    auth_type: string
  }
  cost?: {
    input?: number
    output?: number
    cache_read?: number
    cache_write?: number
  }
}

export interface ProviderPreset {
  id: string
  name: string
  endpoint_url: string
  auth_type: string
  models: ProviderPresetModel[]
}

export interface InspectStartEvent {
  type: "start"
  req_id: string
  ts: number
  workspace_id: number
  user_id: number
  token_id: number
  token_name: string
  channel_id: number
  channel_name: string
  model: string
  endpoint: string
  is_stream: boolean
  body: unknown
  req_headers: Record<string, string>
  upstream_headers: Record<string, string>
}

export interface InspectChunkEvent {
  type: "chunk"
  req_id: string
  ts: number
  data: string
}

export interface TokenUsage {
  prompt_tokens?: number | null
  completion_tokens?: number | null
  total_tokens?: number | null
  cached_tokens?: number | null
  cache_creation_tokens?: number | null
}

export interface InspectEndEvent {
  type: "end"
  req_id: string
  status: number
  duration_ms: number
  resp_headers: Record<string, string>
  usage?: TokenUsage | null
  cost?: number | null
}

export type InspectEvent = InspectStartEvent | InspectChunkEvent | InspectEndEvent

export interface RequestCard {
  reqId: string
  ts: number
  tokenId: number
  tokenName: string
  channelId: number
  channelName: string
  model: string
  endpoint: string
  isStream: boolean
  body: unknown
  reqHeaders: Record<string, string>
  upstreamHeaders: Record<string, string>
  respHeaders?: Record<string, string>
  chunks: string[]
  status?: number
  durationMs?: number
  usage?: TokenUsage | null
  cost?: number | null
}

export interface StatsSummary {
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cached_tokens: number
  cache_creation_tokens: number
  total_cost: number
  avg_duration_ms: number
  total_runtime: number
  total_runtime_dedup: number
}

export interface TimeSeriesPoint {
  bucket: string
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cached_tokens: number
  cache_creation_tokens: number
  cost: number
  runtime: number
  runtime_dedup: number
}

export interface ModelBreakdown {
  model: string
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cached_tokens: number
  cache_creation_tokens: number
  cost: number
  runtime: number
}

export interface ChannelBreakdown {
  channel_id: number | null
  channel_name: string | null
  request_count: number
  total_tokens: number
  cost: number
}

export interface UserBreakdown {
  user_id: number | null
  username: string | null
  request_count: number
  total_tokens: number
  cost: number
}

export interface StatsResponse {
  summary: StatsSummary
  days: TimeSeriesPoint[]
  heatmap: TimeSeriesPoint[]
  models: ModelBreakdown[]
  channels: ChannelBreakdown[]
  users: UserBreakdown[]
}
