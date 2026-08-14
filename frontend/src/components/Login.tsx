import { useEffect, useState } from "react"
import { login, register, fetchPublicSettings } from "../api"
import type { PublicSettings } from "../types"
import { useTheme } from "../theme"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Sun, Moon, Loader2, AlertCircle, Users } from "lucide-react"

export function Login({ onLogin, inviteHint, inviteToken }: { onLogin: (token: string) => void; inviteHint?: string; inviteToken?: string | null }) {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("root")
  const [password, setPassword] = useState("123456")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const { theme, toggle } = useTheme()

  useEffect(() => {
    fetchPublicSettings().then(setSettings).catch(() => {})
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致")
      return
    }

    setLoading(true)
    try {
      const data =
        mode === "login"
          ? await login(username, password)
          : await register(username, password)
      localStorage.setItem("token", data.token)
      onLogin(data.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === "login" ? "登录失败" : "注册失败")
    } finally {
      setLoading(false)
    }
  }

  const oauthProviders = settings?.oauth_providers?.filter((p) => p.enabled) ?? []
  const canRegister = settings?.registration_enabled ?? false

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
            {inviteHint && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-primary/8 px-3 py-2">
                <Users className="size-3.5 shrink-0 text-primary" />
                <p className="text-xs text-primary">
                  收到「{inviteHint}」的邀请，登录后即可加入
                </p>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={toggle}>
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>

        {oauthProviders.length > 0 && (
          <>
            <div className="mb-4 flex flex-col gap-2">
              {oauthProviders.map((p) => (
                <a key={p.provider} href={`/api/oauth/${p.provider}/auth${inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : ""}`}>
                  <Button type="button" variant="outline" className="w-full gap-2">
                    {p.provider === "github" && <GithubIcon className="size-4" />}
                    {p.provider === "google" && <GoogleIcon className="size-4" />}
                    {p.provider === "wework" && <WecomIcon className="size-4" />}
                    使用 {p.name} 登录
                  </Button>
                </a>
              ))}
            </div>
            {canRegister && (
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">或</span>
                <div className="h-px flex-1 bg-border/50" />
              </div>
            )}
          </>
        )}

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
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="font-mono"
            />
          </div>

          {mode === "register" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">确认密码</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="font-mono"
              />
            </div>
          )}

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading
              ? mode === "login" ? "连接中…" : "注册中…"
              : mode === "login" ? "连接" : "注册"}
          </Button>
        </form>

        {canRegister && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {mode === "login" ? "没有账号？" : "已有账号？"}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login")
                setError("")
                setConfirmPassword("")
              }}
              className="ml-1 font-medium text-primary hover:underline"
            >
              {mode === "login" ? "注册" : "登录"}
            </button>
          </p>
        )}

        {mode === "login" && !canRegister && oauthProviders.length === 0 && (
          <p className="mt-8 text-xs text-muted-foreground">
            默认账号 root / 123456，登录后请修改密码。
          </p>
        )}
      </div>
    </div>
  )
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.71-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.33.85 0 1.7.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.18.58.69.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z"/>
    </svg>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function WecomIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.04 2 11.02c0 2.88 1.46 5.44 3.74 7.1-.12.96-.5 2.2-1.28 3.34-.16.24.04.56.32.5 1.74-.34 3.24-1.02 4.28-1.66 1.18.4 2.46.62 3.94.62 5.52 0 10-4.04 10-9.02S17.52 2 12 2zm-3.5 9.5a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm7 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z"/>
    </svg>
  )
}
