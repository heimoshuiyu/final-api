import { useEffect, useState } from "react"
import { fetchSelf } from "./api"
import type { User } from "./types"
import { Layout } from "@/components/Layout"
import { Login } from "@/components/Login"
import { Dashboard } from "@/components/Dashboard"
import { Tokens } from "@/components/Tokens"
import { Channels } from "@/components/Channels"
import { Logs } from "@/components/Logs"
import { Inspect } from "@/components/Inspect"

export default function App() {
  const [authed, setAuthed] = useState<boolean>(!!localStorage.getItem("token"))
  const [user, setUser] = useState<User | null>(null)
  const [route, setRoute] = useState(window.location.hash.slice(1) || "/")

  useEffect(() => {
    if (!authed) return
    fetchSelf()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("token")
        setAuthed(false)
      })
  }, [authed])

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || "/")
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const navigate = (r: string) => {
    window.location.hash = r
    setRoute(r)
  }

  if (!authed || !user) {
    return <Login onLogin={() => setAuthed(true)} />
  }

  return (
    <Layout active={route} navigate={navigate}>
      {(() => {
        switch (true) {
          case route === "/":
            return <Dashboard navigate={navigate} />
          case route.startsWith("/tokens"):
            return <Tokens />
          case route.startsWith("/channels"):
            return <Channels />
          case route.startsWith("/logs"):
            return <Logs />
          case route.startsWith("/inspect"):
            return <Inspect />
          default:
            return <Dashboard navigate={navigate} />
        }
      })()}
    </Layout>
  )
}
