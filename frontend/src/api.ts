import type {
  Channel,
  CreateChannelRequest,
  CreateTokenRequest,
  LogEntry,
  LogQuery,
  ProviderPreset,
  Token,
  User,
} from "./types"

const BASE = ""

function getToken(): string | null {
  return localStorage.getItem("token")
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...opts, headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }

  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export function login(username: string, password: string) {
  return api<{ token: string; user: User }>("/api/user/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
}

export function register(username: string, password: string) {
  return api<{ token: string }>("/api/user/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
}

export function fetchSelf() {
  return api<User>("/api/user/self")
}

export function fetchTokens() {
  return api<Token[]>("/api/token")
}

export function createToken(data: CreateTokenRequest) {
  return api<Token>("/api/token", { method: "POST", body: JSON.stringify(data) })
}

export function deleteToken(id: number) {
  return api(`/api/token/${id}`, { method: "DELETE" })
}

export function fetchChannels() {
  return api<Channel[]>("/api/channel")
}

export function createChannel(data: CreateChannelRequest) {
  return api<Channel>("/api/channel", { method: "POST", body: JSON.stringify(data) })
}

export function updateChannel(id: number, data: CreateChannelRequest) {
  return api<Channel>(`/api/channel/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export function deleteChannel(id: number) {
  return api(`/api/channel/${id}`, { method: "DELETE" })
}

export function fetchPresets() {
  return api<ProviderPreset[]>("/api/presets")
}

export function fetchLogs(query?: LogQuery) {
  const params = new URLSearchParams()
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v != null) params.set(k, String(v))
    })
  }
  const qs = params.toString()
  return api<{ total: number; data: LogEntry[] }>(`/api/log${qs ? "?" + qs : ""}`)
}
