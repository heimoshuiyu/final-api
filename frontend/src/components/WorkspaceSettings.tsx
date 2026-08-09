import { useEffect, useState } from "react"
import {
  fetchWorkspaceInfo,
  renameWorkspace,
  fetchMembers,
  fetchInvites,
  createInvite,
  deleteInvite,
  promoteMember,
  removeMember,
} from "../api"
import type { WorkspaceMember, WorkspaceInvite } from "../types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Link2,
  Trash2,
  Shield,
  Crown,
  Copy,
  Check,
  ArrowUpCircle,
  Settings2,
  Loader2,
} from "lucide-react"

export function WorkspaceSettings() {
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [error, setError] = useState("")
  const [copied, setCopied] = useState<number | null>(null)

  const [wsName, setWsName] = useState("")
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState("")

  const load = async () => {
    try {
      const [info, m, i] = await Promise.all([
        fetchWorkspaceInfo(),
        fetchMembers(),
        fetchInvites(),
      ])
      setWsName(info.name)
      setMembers(m)
      setInvites(i)
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败")
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleRename = async () => {
    const name = wsName.trim()
    if (!name) {
      setNameError("名称不能为空")
      return
    }
    setSavingName(true)
    setNameError("")
    try {
      await renameWorkspace(name)
      window.dispatchEvent(
        new CustomEvent("workspace-renamed", { detail: { name } }),
      )
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "保存失败")
    } finally {
      setSavingName(false)
    }
  }

  const handleCreateInvite = async () => {
    try {
      await createInvite()
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败")
    }
  }

  const handlePromote = async (userId: number) => {
    if (!confirm("确定要将该用户提升为管理员吗？")) return
    try {
      await promoteMember(userId)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败")
    }
  }

  const handleRemove = async (userId: number) => {
    if (!confirm("确定要将该用户移出工作区吗？")) return
    try {
      await removeMember(userId)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "移除失败")
    }
  }

  const handleDeleteInvite = async (id: number) => {
    try {
      await deleteInvite(id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败")
    }
  }

  const copyLink = (token: string, id: number) => {
    const url = `${window.location.origin}/#/invite/${token}`
    navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="animate-slide-up">
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <h1 className="text-2xl font-bold tracking-tight">工作区设置</h1>

      {/* Workspace info */}
      <Card className="glass-panel glow-border mt-6 border-0 animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4" />
            工作区信息
          </CardTitle>
          <CardDescription className="text-xs">
            修改工作区名称，将同步显示在侧边栏。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="ws-name">工作区名称</Label>
          <div className="mt-1.5 flex max-w-md items-center gap-2">
            <Input
              id="ws-name"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !savingName) handleRename()
              }}
              className="font-mono text-sm"
              placeholder="工作区名称"
            />
            <Button
              onClick={handleRename}
              disabled={savingName || !wsName.trim()}
              size="sm"
              className="shrink-0"
            >
              {savingName ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  保存中…
                </>
              ) : (
                "保存名称"
              )}
            </Button>
          </div>
          {nameError && (
            <p className="mt-1.5 text-xs text-destructive">{nameError}</p>
          )}
        </CardContent>
      </Card>

      {/* Invite links */}
      <Card className="glass-panel glow-border mt-4 border-0 animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="size-4" />
            邀请链接
          </CardTitle>
          <CardDescription className="text-xs">
            生成链接分享给同事。对方登录或注册后即可加入工作区。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleCreateInvite} size="sm">
            <Link2 className="size-3.5" />
            生成邀请链接
          </Button>
          {invites.length > 0 && (
            <div className="mt-4 space-y-2">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center gap-2 rounded-lg border border-border/50 p-3"
                >
                  <code className="flex-1 truncate font-mono text-xs text-muted-foreground">
                    {window.location.origin}/#/invite/{inv.token.slice(0, 8)}…
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => copyLink(inv.token, inv.id)}
                    title="复制链接"
                  >
                    {copied === inv.id ? (
                      <Check className="size-3.5 text-chart-2" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDeleteInvite(inv.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="删除"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Members list */}
      <Card className="glass-panel glow-border mt-4 border-0 animate-fade-in">
        <CardHeader>
          <CardTitle className="text-base">成员列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs uppercase tracking-wider">用户</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">身份</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">加入时间</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id} className="border-border/30 font-mono text-xs">
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {m.role >= 10 && <Crown className="size-3.5 text-chart-3" />}
                      {m.username}
                    </span>
                  </TableCell>
                  <TableCell>
                    {m.role >= 10 ? (
                      <Badge className="gap-1 bg-chart-3/10 text-chart-3 hover:bg-chart-3/20">
                        <Shield className="size-3" /> 管理员
                      </Badge>
                    ) : (
                      <Badge variant="secondary">普通用户</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(m.joined_at).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell className="text-right">
                    {m.role < 10 ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handlePromote(m.user_id)}
                          className="text-muted-foreground hover:text-primary"
                          title="提升为管理员"
                        >
                          <ArrowUpCircle className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRemove(m.user_id)}
                          className="text-muted-foreground hover:text-destructive"
                          title="移除"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
