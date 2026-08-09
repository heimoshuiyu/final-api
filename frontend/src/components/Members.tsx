import { useEffect, useState } from "react"
import {
  fetchMembers,
  fetchInvites,
  createInvite,
  deleteInvite,
  updateMemberRole,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { UserPlus, Trash2, Shield, Crown } from "lucide-react"

export function Members() {
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [error, setError] = useState("")
  const [inviteUsername, setInviteUsername] = useState("")
  const [inviteRole, setInviteRole] = useState("1")

  const load = async () => {
    try {
      const [m, i] = await Promise.all([fetchMembers(), fetchInvites()])
      setMembers(m)
      setInvites(i)
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败")
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteUsername.trim()) return
    try {
      await createInvite(inviteUsername.trim(), Number(inviteRole))
      setInviteUsername("")
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "邀请失败")
    }
  }

  const handleRoleChange = async (userId: number, role: number) => {
    try {
      await updateMemberRole(userId, role)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "修改失败")
    }
  }

  const handleRemove = async (userId: number) => {
    if (!confirm("确定要移除该成员吗？")) return
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

  return (
    <div className="animate-slide-up">
      {error && (
        <p className="mb-4 text-sm text-destructive">{error}</p>
      )}

      <h1 className="text-2xl font-bold tracking-tight">成员管理</h1>

      {/* Invite form */}
      <Card className="glass-panel glow-border mt-6 border-0 animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="size-4" />
            邀请成员
          </CardTitle>
          <CardDescription className="text-xs">
            输入用户名邀请加入工作区。对方注册或登录后将自动加入。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="invite-username" className="text-xs">用户名</Label>
              <Input
                id="invite-username"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="username"
                className="font-mono"
              />
            </div>
            <div className="w-32">
              <Label className="text-xs">角色</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">普通成员</SelectItem>
                  <SelectItem value="10">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit">邀请</Button>
          </form>
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
                <TableHead className="text-xs uppercase tracking-wider">角色</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">加入时间</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id} className="border-border/30 font-mono text-xs">
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {m.role === 10 && <Crown className="size-3.5 text-chart-3" />}
                      {m.username}
                    </span>
                  </TableCell>
                  <TableCell>
                    {m.role === 10 ? (
                      <Badge className="gap-1 bg-chart-3/10 text-chart-3 hover:bg-chart-3/20">
                        <Shield className="size-3" /> 管理员
                      </Badge>
                    ) : (
                      <Badge variant="secondary">成员</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(m.joined_at).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Select
                        value={String(m.role)}
                        onValueChange={(v) => handleRoleChange(m.user_id, Number(v))}
                      >
                        <SelectTrigger className="h-7 w-24 text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">成员</SelectItem>
                          <SelectItem value="10">管理员</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemove(m.user_id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending invites */}
      {invites.length > 0 && (
        <Card className="glass-panel glow-border mt-4 border-0 animate-fade-in">
          <CardHeader>
            <CardTitle className="text-base">待处理邀请</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs uppercase tracking-wider">用户名</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">指定角色</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">邀请时间</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((i) => (
                  <TableRow key={i.id} className="border-border/30 font-mono text-xs">
                    <TableCell>{i.username}</TableCell>
                    <TableCell>
                      <Badge variant={i.role === 10 ? "default" : "secondary"}>
                        {i.role === 10 ? "管理员" : "成员"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(i.created_at).toLocaleDateString("zh-CN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeleteInvite(i.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
