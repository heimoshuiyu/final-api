import { type ReactNode } from "react"
import { useTheme } from "../theme"

export function Layout({
  active,
  navigate,
  children,
}: {
  active: string
  navigate: (r: string) => void
  children: ReactNode
}) {
  const { theme, toggle } = useTheme()
  const nav = [
    { path: "/", label: "概览" },
    { path: "/tokens", label: "令牌" },
    { path: "/channels", label: "渠道" },
    { path: "/logs", label: "请求" },
  ]

  return (
    <div className="flex min-h-screen bg-base text-text">
      <aside className="fixed left-0 top-0 bottom-0 w-56 border-r border-line flex flex-col">
        <div className="px-5 py-6">
          <div
            className="font-mono text-sm font-bold tracking-tight text-heading"
            style={{ letterSpacing: "-0.02em" }}
          >
            final-api
          </div>
          <div className="font-mono text-[10px] text-dim mt-0.5 uppercase tracking-widest">
            gateway
          </div>
        </div>

        <nav className="flex-1 px-2">
          {nav.map((item) => {
            const isActive = active === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`
                  w-full text-left px-3 py-2 text-sm font-medium transition-colors
                  ${isActive ? "text-heading bg-elevated" : "text-dim hover:text-text"}
                `}
                style={{ borderRadius: 0 }}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="px-5 py-4 border-t border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-1.5 h-1.5 bg-mint"
              style={{ animation: "pulse-dot 2s ease-in-out infinite", borderRadius: "50%" }}
            />
            <span className="font-mono text-[10px] text-dim uppercase tracking-wider">
              运行中
            </span>
          </div>
          <button
            onClick={toggle}
            className="font-mono text-[10px] text-dim hover:text-heading transition-colors"
            title="切换主题"
          >
            {theme === "dark" ? "浅色" : "深色"}
          </button>
        </div>

        <button
          onClick={() => {
            localStorage.removeItem("token")
            window.location.reload()
          }}
          className="px-5 py-3 border-t border-line text-left text-sm text-dim hover:text-rose transition-colors font-mono text-xs"
        >
          退出登录
        </button>
      </aside>

      <main className="flex-1 ml-56">
        <div className="max-w-5xl px-10 py-10">{children}</div>
      </main>
    </div>
  )
}
