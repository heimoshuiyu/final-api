import { useState } from "react"
import { login } from "../api"
import { useTheme } from "../theme"

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
    <div className="min-h-screen flex items-center justify-center bg-base">
      <div className="w-full max-w-sm">
        <div className="mb-12 flex items-center justify-between">
          <div>
            <h1
              className="font-mono text-2xl font-bold text-heading"
              style={{ letterSpacing: "-0.03em" }}
            >
              final-api
            </h1>
            <p className="font-mono text-xs text-dim mt-1 tracking-wide">
              LLM 网关 · 会话亲和路由
            </p>
          </div>
          <button
            onClick={toggle}
            className="font-mono text-[10px] text-dim hover:text-heading transition-colors uppercase tracking-wider"
          >
            {theme === "dark" ? "浅色" : "深色"}
          </button>
        </div>

        <form onSubmit={submit} className="space-y-1">
          {error && (
            <div className="mb-6 px-3 py-2 border border-rose/30 bg-rose/5">
              <p className="font-mono text-xs text-rose">{error}</p>
            </div>
          )}

          <label className="block">
            <span className="font-mono text-[10px] text-dim uppercase tracking-widest">
              用户名
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full mt-1.5 px-0 py-2 bg-transparent border-0 border-b border-bright-line text-heading font-mono text-sm focus:border-mint focus:outline-none transition-colors"
            />
          </label>

          <label className="block pt-4">
            <span className="font-mono text-[10px] text-dim uppercase tracking-widest">
              密码
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full mt-1.5 px-0 py-2 bg-transparent border-0 border-b border-bright-line text-heading font-mono text-sm focus:border-mint focus:outline-none transition-colors"
            />
          </label>

          <div className="pt-8">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-mint text-base font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ borderRadius: 0 }}
            >
              {loading ? "连接中…" : "连接"}
            </button>
          </div>
        </form>

        <p className="mt-12 font-mono text-[10px] text-dim">
          默认账号 root / 123456，登录后请修改密码。
        </p>
      </div>
    </div>
  )
}
