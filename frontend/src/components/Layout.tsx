import { type ReactNode, useEffect, useState } from "react"
import { useTheme } from "../theme"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  BarChart3,
  Globe,
  Sun,
  Moon,
  LogOut,
  Plus,
  ChevronsUpDown,
  Settings2,
  Settings as SettingsIcon,
  Menu,
} from "lucide-react"
import type { Workspace } from "../types"
import { fetchWorkspaces, createWorkspace } from "../api"
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog"

const NAV_ITEMS = [
  { path: "/", label: "概览", icon: LayoutDashboard },
  { path: "/stats", label: "统计", icon: BarChart3 },
  { path: "/tokens", label: "令牌", icon: KeyRound },
  { path: "/logs", label: "请求", icon: ScrollText },
  { path: "/inspect", label: "实时", icon: Activity },
] as const

const ADMIN_NAV = [
  { path: "/channels", label: "渠道", icon: Network },
  { path: "/ws-settings", label: "工作区设置", icon: Settings2 },
  { path: "/ws-stats", label: "工作区统计", icon: Globe },
  { path: "/monitor", label: "工作区监控", icon: Activity },
  { path: "/settings", label: "系统设置", icon: SettingsIcon },
] as const

export function Layout({
  active,
  navigate,
  wsId,
  userRole,
  username,
  children,
}: {
  active: string
  navigate: (r: string) => void
  wsId: string
  userRole: number
  username: string
  children: ReactNode
}) {
  const { theme, toggle } = useTheme()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [pwdOpen, setPwdOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    fetchWorkspaces().then(setWorkspaces).catch(() => {})
  }, [])

  useEffect(() => {
    const onRenamed = (e: Event) => {
      const { name } = (e as CustomEvent).detail as { name: string }
      setWorkspaces((prev) =>
        prev.map((w) => (String(w.id) === wsId ? { ...w, name } : w)),
      )
    }
    window.addEventListener("workspace-renamed", onRenamed)
    return () => window.removeEventListener("workspace-renamed", onRenamed)
  }, [wsId])

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

  const handleNavigate = (path: string) => {
    navigate(path)
    setSidebarOpen(false)
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 bg-radial-glow" />
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-30" />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "glass-panel fixed left-0 top-0 bottom-0 z-20 flex w-60 flex-col border-r transition-transform duration-300 md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
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
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.path
            const Icon = item.icon
            return (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
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
                    onClick={() => handleNavigate(item.path)}
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

        {/* Status + user */}
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-2 text-xs font-semibold text-primary-foreground">
                  {username.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-left text-xs font-medium">
                  {username}
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-2 text-[10px] font-semibold text-primary-foreground">
                  {username.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{username}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPwdOpen(true)}>
                <KeyRound />
                修改密码
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  localStorage.removeItem("token")
                  localStorage.removeItem("workspace_id")
                  window.location.hash = ""
                  window.location.reload()
                }}
              >
                <LogOut />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="fixed left-0 right-0 top-0 z-10 flex h-12 items-center gap-3 border-b border-border/40 bg-background/80 px-4 backdrop-blur-sm md:hidden">
        <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen(true)}>
          <Menu className="size-4" />
        </Button>
        <span className="text-sm font-bold tracking-tight accent-gradient-text">final-api</span>
        <div className="ml-auto">
          <Button variant="ghost" size="icon-xs" onClick={toggle}>
            {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="relative pt-12 md:ml-60 md:pt-0">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-10">{children}</div>
      </main>
    </div>
  )
}
