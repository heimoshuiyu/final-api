import { useEffect, useState } from "react"
import { fetchSelf, fetchWorkspaces, inviteInfo } from "./api"
import type { User } from "./types"
import { Layout } from "@/components/Layout"
import { Login } from "@/components/Login"
import { Dashboard } from "@/components/Dashboard"
import { Stats } from "@/components/Stats"
import { Tokens } from "@/components/Tokens"
import { Channels } from "@/components/Channels"
import { Logs } from "@/components/Logs"
import { Inspect } from "@/components/Inspect"
import { Settings } from "@/components/Settings"
import { Users, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InviteAccept } from "@/components/InviteAccept"
import { WorkspaceSettings } from "@/components/WorkspaceSettings"

function parseHash(): { wsId: string; page: string; oauthToken: string | null; inviteToken: string | null } {
  const hash = window.location.hash.slice(1)

  const oauthMatch = hash.match(/^\/oauth-callback\?(.+)$/)
  if (oauthMatch) {
    const params = new URLSearchParams(oauthMatch[1])
    return { wsId: "", page: "", oauthToken: params.get("token"), inviteToken: params.get("invite") }
  }

  const inviteMatch = hash.match(/^\/invite\/([A-Za-z0-9]+)$/)
  if (inviteMatch) {
    return { wsId: "", page: "", oauthToken: null, inviteToken: inviteMatch[1] }
  }

  const m = hash.match(/^\/ws\/(\d+)(\/.*)?$/)
  if (m) {
    const page = (m[2] || "/").replace(/\/+$/, "") || "/"
    return { wsId: m[1], page, oauthToken: null, inviteToken: null }
  }
  return { wsId: "", page: hash || "/", oauthToken: null, inviteToken: null }
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(!!localStorage.getItem("token"))
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(!!localStorage.getItem("token"))
  const [, forceTick] = useState(0)
  const [inviteWsName, setInviteWsName] = useState<string | null>(null)
  const { wsId, page, oauthToken, inviteToken } = parseHash()

  useEffect(() => {
    if (oauthToken) {
      localStorage.setItem("token", oauthToken)
      window.location.hash = inviteToken ? `/invite/${inviteToken}` : ""
      setAuthed(true)
    }
  }, [oauthToken, inviteToken])

  useEffect(() => {
    if (!authed) return
    setLoading(true)
    fetchSelf()
      .then((u) => {
        setUser(u)
        setLoading(false)
      })
      .catch(() => {
        localStorage.removeItem("token")
        setAuthed(false)
        setLoading(false)
      })
  }, [authed])

  useEffect(() => {
    const onHash = () => forceTick((n) => n + 1)
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  // Fetch invite workspace name for login page hint (public API)
  useEffect(() => {
    if (!inviteToken || authed) return
    inviteInfo(inviteToken)
      .then((info) => setInviteWsName(info.workspace_name))
      .catch(() => {})
  }, [inviteToken, authed])

  // Auto-redirect to first workspace when authed and no wsId
  useEffect(() => {
    if (!authed || !user || wsId || inviteToken) return
    fetchWorkspaces().then((ws) => {
      if (ws.length > 0) {
        window.location.hash = `/ws/${ws[0].id}`
      }
    })
  }, [authed, user, wsId, inviteToken])

  const navigate = (p: string) => {
    window.location.hash = p === "/" ? `/ws/${wsId}` : `/ws/${wsId}${p}`
  }

  // Invite flow: show confirmation page when authed
  if (inviteToken && authed && user) {
    return <InviteAccept token={inviteToken} />
  }

  // Invite flow: show login with hint when not authed
  // Invite flow: show login with hint when not authed (skip during oauth-callback handoff)
  if (inviteToken && !authed && !oauthToken) {
    return <Login onLogin={() => setAuthed(true)} inviteHint={inviteWsName ?? undefined} inviteToken={inviteToken} />
  }

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background">
        <div className="pointer-events-none fixed inset-0 bg-radial-glow" />
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    )
  }

  if (!authed || !user) {
    return <Login onLogin={() => setAuthed(true)} />
  }

  if (!wsId) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
        <div className="pointer-events-none fixed inset-0 bg-radial-glow" />
        <div className="pointer-events-none fixed inset-0 bg-grid opacity-30" />
        <div className="glass-panel glow-border w-full max-w-sm animate-scale-in rounded-2xl border-0 p-8 text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-muted">
            <Users className="size-6 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">暂无工作区</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            您尚未加入任何工作区，请联系管理员发送邀请链接。
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-6"
            onClick={() => {
              localStorage.removeItem("token")
              setAuthed(false)
              window.location.hash = ""
            }}
          >
            <LogOut className="size-3.5" />
            退出登录
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Layout active={page} navigate={navigate} wsId={wsId} userRole={user.role} username={user.username}>
      <div key={wsId}>
        {(() => {
          switch (true) {
            case page === "/":
              return <Dashboard navigate={navigate} />
            case page.startsWith("/stats"):
              return <Stats scope="user" />
            case page.startsWith("/tokens"):
              return <Tokens />
            case page.startsWith("/channels"):
              return <Channels />
            case page.startsWith("/members"):
            case page.startsWith("/ws-settings"):
              return <WorkspaceSettings />
            case page.startsWith("/logs"):
              return <Logs />
            case page.startsWith("/inspect"):
              return <Inspect scope="user" />
            case page.startsWith("/monitor"):
              return <Inspect scope="workspace" />
            case page.startsWith("/ws-stats"):
              return <Stats scope="workspace" />
            case page.startsWith("/settings"):
              return <Settings />
            default:
              return <Dashboard navigate={navigate} />
          }
        })()}
      </div>
    </Layout>
  )
}
