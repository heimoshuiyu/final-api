export type UserRole = 1 | 10

export interface User {
  id: number
  username: string
  role: UserRole
  status: number
  created_at?: string
}

export interface Token {
  id: number
  user_id: number
  key: string
  name: string
  status: number
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

export interface Channel {
  id: number
  name: string
  endpoint_url: string
  auth_type: string
  models: string[]
  status: number
  weight: number
  model_mapping: Record<string, string>
  model_overrides: Record<string, ModelOverrideEntry>
  header_override: Record<string, string>
  body_override: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface LogEntry {
  id: number
  token_id: number | null
  user_id: number | null
  channel_id: number | null
  model: string
  is_stream: boolean
  status_code: number
  duration_ms: number
  session_id: string
  error_message: string | null
  created_at: string
}

export interface LogQuery {
  user_id?: number
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
  weight?: number
  model_mapping?: Record<string, string>
  model_overrides?: Record<string, ModelOverrideEntry>
  header_override?: Record<string, string>
  body_override?: Record<string, unknown>
}

export interface InspectStartEvent {
  type: "start"
  req_id: string
  ts: number
  user_id: number
  token_id: number
  token_name: string
  channel_id: number
  channel_name: string
  model: string
  endpoint: string
  is_stream: boolean
  body: unknown
}

export interface InspectChunkEvent {
  type: "chunk"
  req_id: string
  ts: number
  data: string
}

export interface InspectEndEvent {
  type: "end"
  req_id: string
  status: number
  duration_ms: number
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
  chunks: string[]
  status?: number
  durationMs?: number
}
