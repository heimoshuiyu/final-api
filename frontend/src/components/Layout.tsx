import { type ReactNode } from "react"
import { useTheme } from "../theme"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  LayoutDashboard,
  KeyRound,
  Network,
  ScrollText,
  Activity,
  Sun,
  Moon,
  LogOut,
} from "lucide-react"

const NAV_ITEMS = [
  { path: "/", label: "概览", icon: LayoutDashboard },
  { path: "/tokens", label: "令牌", icon: KeyRound },
  { path: "/channels", label: "渠道", icon: Network },
  { path: "/logs", label: "请求", icon: ScrollText },
  { path: "/inspect", label: "实时", icon: Activity },
] as const

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

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 bg-radial-glow" />
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-30" />

      {/* Sidebar */}
      <aside className="glass-panel fixed left-0 top-0 bottom-0 z-20 flex w-60 flex-col border-r">
        {/* Logo */}
        <div className="px-5 py-6">
          <div className="text-lg font-bold tracking-tight accent-gradient-text" style={{ letterSpacing: "-0.03em" }}>
            final-api
          </div>
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            gateway
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.path
            const Icon = item.icon
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Status + controls */}
        <div className="px-3 pb-3">
          <Separator className="mb-3" />

          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-chart-2 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-chart-2" />
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                运行中
              </span>
            </div>

            <Button variant="ghost" size="icon-xs" onClick={toggle} title="切换主题">
              {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              localStorage.removeItem("token")
              window.location.reload()
            }}
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="size-3.5" />
            退出登录
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="relative ml-60">
        <div className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-10">{children}</div>
      </main>
    </div>
  )
}
