import { type ReactNode, useEffect, useState } from "react"
import { useTheme } from "../theme"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  LayoutDashboard,
  KeyRound,
  Network,
  ScrollText,
  Activity,
  Users,
  BarChart3,
  Globe,
  Sun,
  Moon,
  LogOut,
  Plus,
  Settings as SettingsIcon,
} from "lucide-react"
import type { Workspace } from "../types"
import { fetchWorkspaces, createWorkspace } from "../api"

const NAV_ITEMS = [
  { path: "/", label: "概览", icon: LayoutDashboard },
  { path: "/stats", label: "统计", icon: BarChart3 },
  { path: "/tokens", label: "令牌", icon: KeyRound },
  { path: "/logs", label: "请求", icon: ScrollText },
  { path: "/inspect", label: "实时", icon: Activity },
] as const

const ADMIN_NAV = [
  { path: "/channels", label: "渠道", icon: Network },
  { path: "/members", label: "成员", icon: Users },
  { path: "/ws-stats", label: "工作区统计", icon: Globe },
  { path: "/monitor", label: "工作区监控", icon: Activity },
  { path: "/settings", label: "系统设置", icon: SettingsIcon },
] as const

export function Layout({
  active,
  navigate,
  wsId,
  userRole,
  children,
}: {
  active: string
  navigate: (r: string) => void
  wsId: string
  userRole: number
  children: ReactNode
}) {
  const { theme, toggle } = useTheme()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")

  useEffect(() => {
    fetchWorkspaces().then(setWorkspaces).catch(() => {})
  }, [])

  const switchWorkspace = (id: string) => {
    if (id === wsId) return
    window.location.hash = `/ws/${id}`
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setCreateError("")
    try {
      const ws = await createWorkspace(name)
      setWorkspaces((prev) => [...prev, ws])
      setCreateOpen(false)
      setNewName("")
      window.location.hash = `/ws/${ws.id}`
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建失败")
    } finally {
      setCreating(false)
    }
  }

  const isAdmin = userRole >= 10

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

        {/* Workspace switcher */}
        <div className="px-3 pb-3">
          <Select value={wsId} onValueChange={switchWorkspace}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="选择工作区" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((ws) => (
                <SelectItem key={ws.id} value={String(ws.id)}>
                  {ws.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="mt-1.5 w-full justify-start gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3" />
              新建工作区
            </Button>
          )}
        </div>

        {/* Create workspace dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>新建工作区</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="ws-name">工作区名称</Label>
              <Input
                id="ws-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例如：研发部"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !creating) handleCreate()
                }}
                autoFocus
              />
              {createError && (
                <p className="text-xs text-destructive">{createError}</p>
              )}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm" disabled={creating}>
                  取消
                </Button>
              </DialogClose>
              <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? "创建中..." : "创建"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

          {isAdmin && (
            <>
              <div className="px-3 pt-4 pb-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/60">
                管理
              </div>
              {ADMIN_NAV.map((item) => {
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
            </>
          )}
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
              localStorage.removeItem("workspace_id")
              window.location.hash = ""
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
