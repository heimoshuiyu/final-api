import { useCallback, useEffect, useState } from "react"
import { createToken, deleteToken, fetchTokens } from "../api"
import type { Token } from "../types"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Trash2, Eye, EyeOff, Copy, Check, Loader2, AlertCircle } from "lucide-react"

export function Tokens() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set())
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setTokens(await fetchTokens())
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载令牌失败")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    setError("")
    try {
      await createToken({ name: name.trim() })
      setName("")
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建令牌失败")
    } finally {
      setCreating(false)
    }
  }

  const remove = async (id: number) => {
    try {
      await deleteToken(id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除令牌失败")
    }
  }

  const toggleReveal = (id: number) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyKey = (id: number, key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">令牌</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            用于通过网关认证请求的 API 密钥。
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="glass-panel glow-border mt-6 border-0 animate-fade-in">
        <CardHeader>
          <CardTitle className="text-base">创建令牌</CardTitle>
          <CardDescription className="text-xs">生成一个新的 API 密钥</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="令牌名称"
              className="flex-1"
            />
            <Button onClick={create} disabled={creating || !name.trim()}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              创建令牌
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel glow-border mt-4 border-0 animate-fade-in stagger-2">
        <CardContent className="pt-6">
          {tokens.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                还没有令牌，创建一个来开始路由请求。
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs uppercase tracking-wider">名称</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">密钥</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">状态</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">创建时间</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => {
                  const revealed = revealedIds.has(token.id)
                  return (
                    <TableRow key={token.id} className="border-border/30">
                      <TableCell className="text-sm">{token.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">
                            {revealed ? token.key : `${token.key.slice(0, 10)}…${token.key.slice(-4)}`}
                          </span>
                          <Button variant="ghost" size="icon-xs" onClick={() => toggleReveal(token.id)}>
                            {revealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                          </Button>
                          {revealed && (
                            <Button variant="ghost" size="icon-xs" onClick={() => copyKey(token.id, token.key)}>
                              {copiedId === token.id ? <Check className="size-3 text-chart-2" /> : <Copy className="size-3" />}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={token.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(token.created_at).toLocaleDateString("zh-CN")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => remove(token.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: number }) {
  if (status === 1) {
    return (
      <Badge variant="secondary" className="gap-1.5 bg-chart-2/10 text-chart-2">
        <span className="size-1.5 rounded-full bg-chart-2" />
        活跃
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1.5">
      <span className="size-1.5 rounded-full bg-muted-foreground" />
      停用
    </Badge>
  )
}
