import { useState } from "react"
import { login } from "../api"
import { useTheme } from "../theme"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Sun, Moon, Loader2 } from "lucide-react"
import { AlertCircle } from "lucide-react"

export function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState("root")
  const [password, setPassword] = useState("123456")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { theme, toggle } = useTheme()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const data = await login(username, password)
      localStorage.setItem("token", data.token)
      onLogin(data.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background">
      <div className="pointer-events-none fixed inset-0 bg-radial-glow" />
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-30" />

      <div className="glass-panel glow-border relative w-full max-w-sm rounded-2xl p-8 animate-scale-in">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight accent-gradient-text" style={{ letterSpacing: "-0.03em" }}>
              final-api
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              LLM 网关 · 会话亲和路由
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={toggle}>
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="font-mono"
            />
          </div>

          <Button type="submit" disabled={loading} className="mt-4 w-full">
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "连接中…" : "连接"}
          </Button>
        </form>

        <p className="mt-8 text-xs text-muted-foreground">
          默认账号 root / 123456，登录后请修改密码。
        </p>
      </div>
    </div>
  )
}
