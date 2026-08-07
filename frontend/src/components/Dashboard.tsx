import { useEffect, useState } from "react"
import { fetchChannels, fetchLogs, fetchTokens } from "../api"
import type { Channel, LogEntry, Token } from "../types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  KeyRound,
  Network,
  Boxes,
  ArrowRight,
  AlertTriangle,
} from "lucide-react"

export function Dashboard({ navigate }: { navigate: (r: string) => void }) {
  const [tokens, setTokens] = useState<Token[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    Promise.all([fetchTokens(), fetchChannels(), fetchLogs({ page_size: 5 })])
      .then(([t, c, l]) => {
        setTokens(t)
        setChannels(c)
        setRecentLogs(l.data)
      })
      .catch((e) => setError(e.message))
  }, [])

  const activeChannels = channels.filter((c) => c.status === 1)
  const totalModels = new Set(channels.flatMap((c) => c.models)).size
  const errorCount = recentLogs.filter((l) => l.status_code !== 200).length

  const stats = [
    {
      label: "活跃令牌",
      value: tokens.filter((t) => t.status === 1).length,
      icon: KeyRound,
      color: "text-chart-1",
      onClick: () => navigate("/tokens"),
    },
    {
      label: "在线渠道",
      value: activeChannels.length,
      suffix: `/ ${channels.length}`,
      icon: Network,
      color: "text-chart-2",
      onClick: () => navigate("/channels"),
    },
    {
      label: "路由模型",
      value: totalModels,
      icon: Boxes,
      color: "text-chart-3",
      onClick: () => navigate("/channels"),
    },
  ]

  return (
    <div className="animate-slide-up">
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <h1 className="text-2xl font-bold tracking-tight">概览</h1>

      {/* Stat cards */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Card
              key={stat.label}
              className="glass-panel glow-border card-hover animate-fade-in gap-0 overflow-hidden border-0"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <button onClick={stat.onClick} className="text-left">
                {/* Top accent bar */}
                <div className={`h-[2px] origin-left scale-x-80 transition-transform hover:scale-x-100 ${stat.color} bg-current`} />
                <CardContent className="flex items-center gap-4 pt-5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary/50">
                    <Icon className={`size-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {stat.label}
                    </p>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="font-mono text-2xl font-bold">{stat.value}</span>
                      {stat.suffix && (
                        <span className="font-mono text-sm text-muted-foreground">{stat.suffix}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </button>
            </Card>
          )
        })}
      </div>

      {/* Recent requests */}
      <Card className="glass-panel glow-border mt-8 border-0 animate-fade-in stagger-3">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">最近请求</CardTitle>
            <CardDescription className="text-xs">最近的网关路由记录</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/logs")} className="gap-1 text-muted-foreground">
            查看全部
            <ArrowRight className="size-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">还没有请求被路由。</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs uppercase tracking-wider">状态</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">模型</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">耗时</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.map((log) => (
                  <TableRow key={log.id} className="border-border/30 font-mono text-xs">
                    <TableCell>
                      <span
                        className={
                          log.status_code === 200 ? "text-chart-2" : "text-destructive"
                        }
                      >
                        {log.status_code}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">{log.model}</TableCell>
                    <TableCell className="text-muted-foreground">{log.duration_ms}ms</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(log.created_at).toLocaleTimeString("zh-CN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {errorCount > 0 && (
        <Alert className="mt-4 border-chart-3/30 bg-chart-3/5">
          <AlertTriangle className="size-4 text-chart-3" />
          <AlertDescription className="text-chart-3">
            最近 {recentLogs.length} 次请求中有 {errorCount} 次返回错误。{" "}
            <button onClick={() => navigate("/logs")} className="underline">
              查看日志
            </button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
