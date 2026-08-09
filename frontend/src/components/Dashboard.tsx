import { useEffect, useMemo, useState } from "react"
import { fetchChannels, fetchLogs } from "../api"
import type { Channel, LogEntry, ModelPrice } from "../types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  ArrowRight,
  AlertTriangle,
  Tags,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"

function formatFromUrl(url: string): string {
  if (url.endsWith("/messages")) return "messages"
  if (url.endsWith("/chat/completions")) return "chat/completions"
  if (url.endsWith("/responses")) return "responses"
  if (url.endsWith("/completions")) return "completions"
  if (url.endsWith("/embeddings")) return "embeddings"
  if (url.endsWith("/moderations")) return "moderations"
  return "chat/completions"
}

const FORMAT_LABELS: Record<string, string> = {
  "messages": "Anthropic",
  "chat/completions": "OpenAI 兼容",
  "responses": "OpenAI Responses",
  "completions": "Completions",
  "embeddings": "Embeddings",
  "moderations": "Moderations",
}

const FORMAT_ROUTES: Record<string, string> = {
  "messages": "/v1/messages",
  "chat/completions": "/v1/chat/completions",
  "responses": "/v1/responses",
  "completions": "/v1/completions",
  "embeddings": "/v1/embeddings",
  "moderations": "/v1/moderations",
}

interface ModelInfo {
  name: string
  price: ModelPrice | null
  channelCount: number
  formats: string[]
}

function fmtPrice(v: number | undefined): string {
  if (v == null) return "—"
  if (v < 0.01) return `$${v}`
  return `$${v.toFixed(2)}`
}

function useBaseUrl() {
  const [baseUrl, setBaseUrl] = useState("")
  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])
  return baseUrl
}

function PriceItem({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      <span className={cn("font-mono text-xs", value != null ? "text-foreground/80" : "text-muted-foreground/40")}>
        {fmtPrice(value)}
      </span>
    </div>
  )
}

function ModelCard({ model }: { model: ModelInfo }) {
  const hasPrice = model.price != null && Object.values(model.price).some((v) => v != null)
  const uniqueFormats = Array.from(new Set(model.formats))
  return (
    <div className="glass-panel glow-border card-hover rounded-lg p-3" title={model.name}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-sm font-medium">{model.name}</span>
        {model.channelCount > 1 && (
          <span className="shrink-0 rounded-full bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ×{model.channelCount}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {uniqueFormats.map((f) => (
          <span
            key={f}
            className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary/80"
          >
            {FORMAT_LABELS[f] ?? f}
          </span>
        ))}
      </div>
      {hasPrice ? (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
          <PriceItem label="输入" value={model.price!.input} />
          <PriceItem label="输出" value={model.price!.output} />
          <PriceItem label="缓存读" value={model.price!.cached} />
          <PriceItem label="缓存写" value={model.price!.cache_creation} />
        </div>
      ) : (
        <div className="mt-3">
          <span className="text-[10px] text-muted-foreground/40">未配置价格</span>
        </div>
      )}
    </div>
  )
}

function QuickStart({ modelList, baseUrl }: { modelList: ModelInfo[]; baseUrl: string }) {
  const formats = useMemo(() => {
    const fmtMap = new Map<string, string[]>()
    for (const m of modelList) {
      for (const f of new Set(m.formats)) {
        if (!fmtMap.has(f)) fmtMap.set(f, [])
        fmtMap.get(f)!.push(m.name)
      }
    }
    return Array.from(fmtMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [modelList])

  if (formats.length === 0) return null

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="size-4 text-chart-3" />
        <div>
          <h2 className="text-base font-semibold">快速开始</h2>
          <p className="text-xs text-muted-foreground">
            将 API 客户端的 base_url 指向本网关，使用你的 API Key 即可
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {formats.map(([fmt, models]) => {
          const route = FORMAT_ROUTES[fmt] ?? "/v1/chat/completions"
          return (
            <div
              key={fmt}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/40 bg-muted/20 px-3 py-2"
            >
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary/80">
                {FORMAT_LABELS[fmt] ?? fmt}
              </span>
              <code className="break-all font-mono text-xs text-muted-foreground">
                {baseUrl}
                <span className="text-foreground/70">{route}</span>
              </code>
              <span className="font-mono text-[10px] text-muted-foreground/50">
                {models.join(" · ")}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Dashboard({ navigate }: { navigate: (r: string) => void }) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState("")

  const baseUrl = useBaseUrl()

  useEffect(() => {
    Promise.all([fetchChannels(), fetchLogs({ page_size: 5 })])
      .then(([c, l]) => {
        setChannels(c)
        setRecentLogs(l.data)
      })
      .catch((e) => setError(e.message))
  }, [])

  const activeChannels = channels.filter((c) => c.status === 1)
  const errorCount = recentLogs.filter((l) => l.status_code !== 200).length

  const modelList: ModelInfo[] = useMemo(() => {
    const map = new Map<string, ModelInfo>()
    for (const ch of activeChannels) {
      const baseUrlFmt = formatFromUrl(ch.endpoint_url)
      for (const m of ch.models) {
        const overrides = ch.model_overrides?.[m]
        const fmts = new Set<string>()
        if (overrides) {
          for (const key of Object.keys(overrides)) {
            if (key !== "weight" && typeof overrides[key] === "object") fmts.add(key)
          }
        }
        if (fmts.size === 0) fmts.add(baseUrlFmt)
        if (map.has(m)) {
          const existing = map.get(m)!
          existing.channelCount++
          fmts.forEach((f) => existing.formats.push(f))
        } else {
          const price = ch.model_prices?.[m] ?? null
          map.set(m, { name: m, price, channelCount: 1, formats: Array.from(fmts) })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [activeChannels])

  return (
    <div className="animate-slide-up">
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <h1 className="text-2xl font-bold tracking-tight">概览</h1>

      <QuickStart modelList={modelList} baseUrl={baseUrl} />

      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Tags className="size-4 text-chart-4" />
          <div>
            <h2 className="text-base font-semibold">可用模型</h2>
            <p className="text-xs text-muted-foreground">
              在线渠道支持的模型及价格（每百万 Token，USD）
            </p>
          </div>
        </div>
        {modelList.length === 0 ? (
          <Card className="glass-panel border-0 py-8 text-center">
            <p className="text-sm text-muted-foreground">暂无可用模型。</p>
          </Card>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {modelList.map((m, i) => (
              <div
                key={m.name}
                className="animate-fade-in"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <ModelCard model={m} />
              </div>
            ))}
          </div>
        )}
      </div>

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
                  {["状态", "模型", "Token", "缓存", "耗时", "会话", "时间"].map((h) => (
                    <TableHead key={h} className="text-[10px] uppercase tracking-wider">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.map((log) => (
                  <TableRow key={log.id} className="border-border/30 font-mono text-xs">
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
                    <TableCell className="max-w-[120px] truncate text-muted-foreground">
                      {log.session_id || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
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
