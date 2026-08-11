import { useCallback, useEffect, useState } from "react"
import { fetchLogs } from "../api"
import type { LogEntry } from "../types"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Search,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { TimingCard } from "./TimingCard"

const PAGE_SIZE = 20

export function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState("")
  const [modelFilter, setModelFilter] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<LogEntry | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, page_size: PAGE_SIZE }
      if (modelFilter) query.model = modelFilter
      const res = await fetchLogs(query as never)
      setLogs(res.data)
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载日志失败")
    } finally {
      setLoading(false)
    }
  }, [modelFilter, page])

  useEffect(() => {
    load()
  }, [load])

  const handleFilter = () => setPage(1)

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">请求</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            所有通过网关路由的请求记录。
            <span className="ml-1 font-mono text-xs">共 {total} 条</span>
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex gap-2">
        <Input
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFilter()}
          placeholder="按模型名称筛选"
          className="max-w-xs font-mono text-xs"
        />
        <Button variant="outline" size="sm" onClick={handleFilter} className="gap-1.5">
          <Search className="size-3.5" />
          筛选
        </Button>
      </div>

      <Card className="glass-panel glow-border mt-4 border-0 animate-fade-in">
        <CardContent className="pt-6">
          {logs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {modelFilter ? `没有找到模型 "${modelFilter}" 的请求。` : "还没有请求记录。"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  {["状态", "模型", "渠道", "流式", "Token", "缓存", "耗时", "费用", "会话", "时间"].map((h) => (
                    <TableHead key={h} className="text-[10px] uppercase tracking-wider">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer border-border/30 font-mono text-xs transition-colors hover:bg-muted/40"
                    onClick={() => setSelected(log)}
                  >
                    <TableCell>
                      <span
                        className={cn(
                          log.status_code === 200 && "text-chart-2",
                          log.status_code >= 500 && "text-destructive",
                          log.status_code >= 300 && log.status_code < 500 && "text-chart-3",
                        )}
                      >
                        {log.status_code}
                      </span>
                    </TableCell>
                    <TableCell>{log.model || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.channel_id ? `#${String(log.channel_id).padStart(2, "0")}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{log.is_stream ? "是" : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {log.total_tokens != null ? (
                        <span>
                          <span className="text-foreground">{log.total_tokens}</span>
                          <span className="text-muted-foreground/50">
                            {" "}({log.prompt_tokens ?? 0}+{log.completion_tokens ?? 0})
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {log.cached_tokens != null || log.cache_creation_tokens != null ? (
                        <span>
                          {log.cached_tokens != null && (
                            <span className="text-chart-2">↻{log.cached_tokens}</span>
                          )}
                          {log.cache_creation_tokens != null && (
                            <span className="ml-1 text-chart-3">+{log.cache_creation_tokens}</span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{log.duration_ms}ms</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {log.cost != null && log.cost > 0 ? (
                        <span className="text-chart-2">${log.cost.toFixed(4)}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-muted-foreground" title={log.sticky_id}>
                      {log.sticky_id || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("zh-CN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {logs.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            第 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} 条
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-xs" onClick={() => setPage(1)} disabled={page === 1 || loading}>
              <ChevronsLeft className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon-xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}>
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="min-w-[60px] text-center text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="icon-xs" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}>
              <ChevronRight className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon-xs" onClick={() => setPage(totalPages)} disabled={page === totalPages || loading}>
              <ChevronsRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="glass-panel glow-border max-h-[85vh] max-w-2xl overflow-y-auto border-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span>请求详情</span>
              {selected && (
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono",
                    selected.status_code === 200 && "text-chart-2",
                    selected.status_code >= 500 && "text-destructive",
                    selected.status_code >= 300 && selected.status_code < 500 && "text-chart-3",
                  )}
                >
                  {selected.status_code}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-4">
              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <MetaItem label="模型" value={selected.model || "—"} mono />
                <MetaItem label="渠道" value={selected.channel_id ? `#${selected.channel_id}` : "—"} mono />
                <MetaItem label="流式" value={selected.is_stream ? "是" : "否"} />
                <MetaItem
                  label="时间"
                  value={new Date(selected.created_at).toLocaleString("zh-CN")}
                />
                <MetaItem
                  label="Token"
                  value={
                    selected.total_tokens != null
                      ? `${selected.total_tokens} (${selected.prompt_tokens ?? 0}+${selected.completion_tokens ?? 0})`
                      : "—"
                  }
                  mono
                />
                <MetaItem
                  label="缓存"
                  value={
                    selected.cached_tokens != null || selected.cache_creation_tokens != null
                      ? `${selected.cached_tokens ?? 0} / ${selected.cache_creation_tokens ?? 0}`
                      : "—"
                  }
                  mono
                />
                <MetaItem
                  label="费用"
                  value={selected.cost != null && selected.cost > 0 ? `$${selected.cost.toFixed(4)}` : "—"}
                  mono
                />
                <MetaItem label="会话" value={selected.sticky_id || "—"} mono />
              </div>

              {selected.error_message && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{selected.error_message}</AlertDescription>
                </Alert>
              )}

              {/* Timing */}
              <TimingCard data={selected} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("truncate text-foreground", mono && "font-mono")} title={value}>
        {value}
      </span>
    </div>
  )
}
