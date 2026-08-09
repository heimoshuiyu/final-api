import { useEffect, useState } from "react"
import { fetchSelf, fetchWorkspaces } from "./api"
import type { User } from "./types"
import { Layout } from "@/components/Layout"
import { Login } from "@/components/Login"
import { Dashboard } from "@/components/Dashboard"
import { Tokens } from "@/components/Tokens"
import { Channels } from "@/components/Channels"
import { Members } from "@/components/Members"
import { Logs } from "@/components/Logs"
import { Inspect } from "@/components/Inspect"

function parseHash(): { wsId: string; page: string } {
  const hash = window.location.hash.slice(1)
  const m = hash.match(/^\/ws\/(\d+)(\/.*)?$/)
  if (m) {
    const page = (m[2] || "/").replace(/\/+$/, "") || "/"
    return { wsId: m[1], page }
  }
  return { wsId: "", page: hash || "/" }
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(!!localStorage.getItem("token"))
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(!!localStorage.getItem("token"))
  const [, forceTick] = useState(0)
  const { wsId, page } = parseHash()

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

  useEffect(() => {
    if (!authed || !user || wsId) return
    fetchWorkspaces().then((ws) => {
      if (ws.length > 0) {
        window.location.hash = `/ws/${ws[0].id}`
      }
    })
  }, [authed, user, wsId])

  const navigate = (p: string) => {
    window.location.hash = p === "/" ? `/ws/${wsId}` : `/ws/${wsId}${p}`
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
      <div className="relative flex min-h-screen items-center justify-center bg-background">
        <div className="pointer-events-none fixed inset-0 bg-radial-glow" />
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    )
  }

  return (
    <Layout active={page} navigate={navigate} wsId={wsId}>
      <div key={wsId}>
        {(() => {
          switch (true) {
            case page === "/":
              return <Dashboard navigate={navigate} />
            case page.startsWith("/tokens"):
              return <Tokens />
            case page.startsWith("/channels"):
              return <Channels />
            case page.startsWith("/members"):
              return <Members />
            case page.startsWith("/logs"):
              return <Logs />
            case page.startsWith("/inspect"):
              return <Inspect />
            default:
              return <Dashboard navigate={navigate} />
          }
        })()}
      </div>
    </Layout>
  )
}
