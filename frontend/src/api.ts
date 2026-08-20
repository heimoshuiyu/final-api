import type {
  Channel,
  CreateChannelRequest,
  CreateTokenRequest,
  DomainVerification,
  LogEntry,
  LogQuery,
  ProviderPreset,
  StatsResponse,
  Token,
  User,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  AdminSettings,
  PublicSettings,
} from "./types"

const BASE = ""

function getToken(): string | null {
  return localStorage.getItem("token")
}

function getWorkspaceId(): string | null {
  const m = window.location.hash.match(/^#\/ws\/(\d+)/)
  if (m) {
    localStorage.setItem("workspace_id", m[1])
    return m[1]
  }
  return localStorage.getItem("workspace_id")
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken()
  const wsId = getWorkspaceId()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  }
  const isPublic = path === "/api/user/login" || path === "/api/user/register" || path.startsWith("/api/presets") || path === "/api/settings";
  if (token) headers["Authorization"] = `Bearer ${token}`
  if (wsId && !isPublic) {
    headers["X-Workspace-Id"] = wsId
  }

  const res = await fetch(`${BASE}${path}`, { ...opts, headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }

  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export function login(username: string, password: string) {
  return api<{ token: string; user: User; workspaces: Workspace[] }>("/api/user/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
}

export function register(username: string, password: string) {
  return api<{ token: string; user: User; workspaces: Workspace[] }>("/api/user/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
}

export function fetchSelf() {
  return api<User>("/api/user/self")
}

export function changePassword(oldPassword: string, newPassword: string) {
  return api("/api/user/password", {
    method: "PUT",
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  })
}

export function fetchWorkspaces() {
  return api<Workspace[]>("/api/user/workspaces")
}

export function createWorkspace(name: string) {
  return api<Workspace>("/api/workspace", { method: "POST", body: JSON.stringify({ name }) })
}

export function fetchWorkspaceInfo() {
  return api<{ id: number; name: string; slug: string | null; member_count: number; role: number }>("/api/workspace")
}

export function renameWorkspace(name: string) {
  return api("/api/workspace", { method: "PUT", body: JSON.stringify({ name }) })
}

export function fetchMembers() {
  return api<WorkspaceMember[]>("/api/workspace/members")
}

export function removeMember(userId: number) {
  return api(`/api/workspace/members/${userId}`, { method: "DELETE" })
}

export function promoteMember(userId: number) {
  return api(`/api/workspace/members/${userId}/promote`, { method: "POST" })
}

export function setIncludeStats(userId: number, includeInStats: boolean) {
  return api(`/api/workspace/members/${userId}/include-stats`, {
    method: "PUT",
    body: JSON.stringify({ include_in_stats: includeInStats }),
  })
}

export function createInvite() {
  return api<{ id: number; token: string; created_at: string }>("/api/workspace/invites", { method: "POST" })
}

export function fetchInvites() {
  return api<WorkspaceInvite[]>("/api/workspace/invites")
}

export function deleteInvite(id: number) {
  return api(`/api/workspace/invites/${id}`, { method: "DELETE" })
}

export function inviteInfo(token: string) {
  return api<{ workspace_name: string; created_at: string }>(`/api/invite/${token}/info`)
}

export function acceptInvite(token: string) {
  return api<{ workspace_id: number; already_member: boolean }>(`/api/invite/${token}/accept`, { method: "POST" })
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

export function fetchStats(params?: { scope?: string; user_id?: number; range?: number }) {
  const qs = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v != null) qs.set(k, String(v))
    })
  }
  const s = qs.toString()
  return api<StatsResponse>(`/api/stats${s ? "?" + s : ""}`)
}

export function fetchPublicSettings() {
  return api<PublicSettings>("/api/settings")
}

export function fetchAdminSettings() {
  return api<AdminSettings>("/api/settings/admin")
}

export function updateSettings(data: {
  registration_enabled: boolean
  oauth_providers: { provider: string; enabled: boolean; config: Record<string, string> }[]
}) {
  return api("/api/settings", { method: "PUT", body: JSON.stringify(data) })
}

export function fetchVerifications() {
  return api<DomainVerification[]>("/api/verification")
}

export function createVerification(filename: string, content: string) {
  return api<DomainVerification>("/api/verification", {
    method: "POST",
    body: JSON.stringify({ filename, content }),
  })
}

export function deleteVerification(filename: string) {
  return api(`/api/verification/${encodeURIComponent(filename)}`, { method: "DELETE" })
}
