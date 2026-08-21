import { useEffect, useState, useCallback, useMemo } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"
import { fetchStats, fetchMembers } from "../api"
import type {
  StatsResponse,
  StatsSummary,
  ModelBreakdown,
  WorkspaceMember,
} from "../types"
import { Heatmap, METRICS, metricLabel, metricFmt, getMetricValue, type MetricKey } from "./Heatmap"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Activity,
  Coins,
  Zap,
  TrendingUp,
  RefreshCw,
  DatabaseZap,
} from "lucide-react"
import { cn } from "@/lib/utils"

const RANGES = [
  { label: "7天", value: 7 },
  { label: "30天", value: 30 },
  { label: "90天", value: 90 },
  { label: "180天", value: 180 },
  { label: "1年", value: 365 },
  { label: "全部", value: 0 },
]

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "oklch(0.6 0.15 200)",
  "oklch(0.6 0.15 30)",
  "oklch(0.6 0.15 150)",
]

function fmtCompact(n: number): string {
  if (n === 0) return "0"
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B"
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M"
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K"
  return String(n)
}

function fmtCost(n: number): string {
  if (n === 0) return "$0"
  if (n < 0.01) return "$" + n.toFixed(4)
  if (n < 1) return "$" + n.toFixed(3)
  return "$" + n.toFixed(2)
}

function fmtMs(n: number): string {
  if (n < 1000) return Math.round(n) + "ms"
  return (n / 1000).toFixed(1) + "s"
}

function fmtCompactRaw(summary: StatsSummary, metric: MetricKey): string {
  // summary 的字段名与 TimeSeriesPoint 不同（total_runtime / total_cost），做一次映射
  const adapted = {
    ...summary,
    runtime: summary.total_runtime,
    runtime_dedup: summary.total_runtime_dedup,
    cost: summary.total_cost,
  }
  return metricFmt(metric, getMetricValue(adapted, metric))
}

function subText(summary: StatsSummary, metric: MetricKey): string {
  if (metric === "total_tokens") {
    return `${fmtCompact(summary.prompt_tokens)} + ${fmtCompact(summary.completion_tokens)}`
  }
  if (metric === "cache_hit_rate") {
    return `${fmtCompact(summary.cached_tokens)} / ${fmtCompact(summary.prompt_tokens)}`
  }
  return ""
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>
  label?: string
}

function TrendTooltip({
  active,
  payload,
  label,
  metric,
}: ChartTooltipProps & { metric: MetricKey }) {
  if (!active || !payload?.length) return null
  const metricEntry = payload.find((e) => e.dataKey !== "cost")
  const costEntry = payload.find((e) => e.dataKey === "cost")
  return (
    <div className="glass-panel glow-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {metricEntry && (
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: metricEntry.color }} />
            {metricLabel(metric)}
          </span>
          <span className="font-mono text-muted-foreground">
            {metricFmt(metric, metricEntry.value)}
          </span>
        </div>
      )}
      {costEntry && (
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: costEntry.color }} />
            费用
          </span>
          <span className="font-mono text-muted-foreground">
            {fmtCost(costEntry.value)}
          </span>
        </div>
      )}
    </div>
  )
}

function CostTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-panel glow-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((e) => (
        <div key={e.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: e.color }} />
            {e.name}
          </span>
          <span className="font-mono text-muted-foreground">{fmtCost(e.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function Stats({
  scope = "user",
}: {
  scope?: "user" | "workspace"
}) {
  const [range, setRange] = useState(30)
  const [metric, setMetric] = useState<MetricKey>("total_tokens")
  const [userId, setUserId] = useState<string>("all")
  const [data, setData] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [members, setMembers] = useState<WorkspaceMember[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params: { scope?: string; user_id?: number; range?: number } = { range }
      if (scope === "workspace") {
        params.scope = "workspace"
        if (userId !== "all") params.user_id = Number(userId)
      }
      const res = await fetchStats(params)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [range, userId, scope])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (scope === "workspace") {
      fetchMembers().then(setMembers).catch(() => {})
    }
  }, [scope])

  const summary = data?.summary
  const rawDays = data?.days ?? []

  // Fill in days that have no data at all so the time axis stays continuous
  const days = useMemo(() => {
    if (rawDays.length === 0) return rawDays
    const map = new Map(rawDays.map((d) => [d.bucket, d]))
    const sorted = [...map.keys()].sort()
    const filled: typeof rawDays = []
    const cur = new Date(`${sorted[0]}T00:00:00`)
    const last = new Date(`${sorted[sorted.length - 1]}T00:00:00`)
    while (cur <= last) {
      const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`
      filled.push(
        map.get(ds) ?? {
          bucket: ds,
          request_count: 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          cached_tokens: 0,
          cache_creation_tokens: 0,
          cost: 0,
          runtime: 0,
          runtime_dedup: 0,
        },
      )
      cur.setDate(cur.getDate() + 1)
    }
    return filled
  }, [rawDays])

  const heatmap = data?.heatmap ?? []
  const models = data?.models ?? []
  const channels = data?.channels ?? []
  const users = data?.users ?? []

  const modelData = models.map((m) => ({
    ...m,
    cache_hit_rate: m.prompt_tokens > 0 ? (m.cached_tokens / m.prompt_tokens) * 100 : 0,
  }))
  const topModels = [...modelData].sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric)).slice(0, 8)
  const costByModel = models
    .filter((m) => m.cost > 0)
    .slice(0, 8)
    .map((m) => ({ name: m.model, value: m.cost }))

  const title = scope === "workspace" ? "工作区统计" : "统计"
  const desc = scope === "workspace"
    ? "工作区请求量、Token 用量和费用分析"
    : "请求量、Token 用量和费用分析"

  return (
    <div className="animate-slide-up">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scope === "workspace" && members && members.length > 0 && (
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部用户</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={String(m.user_id)}>
                    {m.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap rounded-lg border border-border/60 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  range === r.value
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon-xs" onClick={load} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="总请求"
          value={summary ? fmtCompact(summary.request_count) : "—"}
          sub=""
          icon={Activity}
          color="text-chart-1"
          delay={0}
        />
        <StatCard
          label={metricLabel(metric)}
          value={summary ? fmtCompactRaw(summary, metric) : "—"}
          sub={summary ? subText(summary, metric) : ""}
          icon={Zap}
          color="text-chart-2"
          delay={60}
        />
        <StatCard
          label="缓存命中"
          value={summary ? (summary.prompt_tokens > 0 ? ((summary.cached_tokens / summary.prompt_tokens) * 100).toFixed(1) + "%" : "0%") : "—"}
          sub={summary ? `${fmtCompact(summary.cached_tokens)} / ${fmtCompact(summary.prompt_tokens)}` : ""}
          icon={DatabaseZap}
          color="text-chart-5"
          delay={120}
        />
        <StatCard
          label="总费用"
          value={summary ? fmtCost(summary.total_cost) : "—"}
          sub=""
          icon={Coins}
          color="text-chart-3"
          delay={180}
        />
      </div>

      {/* Heatmap */}
      <Heatmap days={heatmap} metric={metric} loading={loading} />

      {/* Trend Chart — selected metric (left axis) + cost (right axis) */}
      <Card className="glass-panel glow-border mt-6 border-0 animate-fade-in stagger-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4 text-chart-1" />
            {metricLabel(metric)} 趋势
          </CardTitle>
          <CardDescription className="text-xs">
            按天 · <span style={{ color: "var(--chart-1)" }}>{metricLabel(metric)}</span>
            {" / "}
            <span style={{ color: "var(--chart-3)" }}>费用</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {days.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              暂无数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={
                  metric === "cache_hit_rate"
                    ? days.map((d) => ({
                        ...d,
                        __cache_hit_rate: d.prompt_tokens > 0 ? (d.cached_tokens / d.prompt_tokens) * 100 : 0,
                      }))
                    : days
                }
                margin={{ top: 5, right: 10, bottom: 0, left: -10 }}
              >
                <defs>
                  <linearGradient id="g-trend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.max(0, Math.floor(days.length / 12))}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => metricFmt(metric, v)}
                  width={50}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "var(--chart-3)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => "$" + fmtCompact(v)}
                  width={50}
                />
                <Tooltip content={<TrendTooltip metric={metric} />} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey={metric === "cache_hit_rate" ? "__cache_hit_rate" : metric}
                  name={metricLabel(metric)}
                  stroke="var(--chart-1)"
                  fill="url(#g-trend)"
                  strokeWidth={2}
                  dot={days.length <= 30 ? { r: 2, fill: "var(--chart-1)" } : false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cost"
                  name="费用"
                  stroke="var(--chart-3)"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={{ r: 3, fill: "var(--chart-3)" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Charts Row: Model Bar + Cost Pie */}
      <div className="mt-6 grid gap-4 lg:grid-cols-7">
        {/* Model Breakdown */}
        <Card className="glass-panel glow-border border-0 animate-fade-in stagger-4 lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">模型用量排行</CardTitle>
            <CardDescription className="text-xs">按 {metricLabel(metric)} 排序（Top 8）</CardDescription>
          </CardHeader>
          <CardContent>
            {topModels.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, topModels.length * 42)}>
                <BarChart
                  data={topModels}
                  layout="vertical"
                  margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.2} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => metricFmt(metric, v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="model"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={140}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                    content={({ active, payload }: { active?: boolean; payload?: unknown }) => {
                      if (!active || !payload) return null
                      const entries = payload as Array<{ payload: ModelBreakdown }>
                      if (!entries.length) return null
                      const m = entries[0].payload
                      return (
                        <div className="glass-panel glow-border rounded-lg px-3 py-2 text-xs shadow-lg">
                          <p className="mb-1 font-medium">{m.model}</p>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-muted-foreground">
                            <span>请求</span><span>{fmtCompact(m.request_count)}</span>
                            <span>输入</span><span>{fmtCompact(m.prompt_tokens)}</span>
                            <span>输出</span><span>{fmtCompact(m.completion_tokens)}</span>
                            <span>缓存命中</span><span>{fmtCompact(m.cached_tokens)}</span>
                            <span>缓存写入</span><span>{fmtCompact(m.cache_creation_tokens)}</span>
                            <span>费用</span><span>{fmtCost(m.cost)}</span>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar
                    dataKey={metric}
                    name={metricLabel(metric)}
                    radius={[0, 4, 4, 0]}
                    fill="var(--chart-1)"
                    label={{ position: "right", fontSize: 10, fill: "var(--muted-foreground)", formatter: (v: unknown) => metricFmt(metric, Number(v)) }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Cost Distribution */}
        <Card className="glass-panel glow-border border-0 animate-fade-in stagger-5 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">费用分布</CardTitle>
            <CardDescription className="text-xs">按模型</CardDescription>
          </CardHeader>
          <CardContent>
            {costByModel.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                暂无费用数据
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, costByModel.length * 36 + 40)}>
                <PieChart>
                  <Pie
                    data={costByModel}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    innerRadius={34}
                    paddingAngle={2}
                    label={((props: { value?: number }) => fmtCost(props.value ?? 0))}
                    labelLine={false}
                  >
                    {costByModel.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CostTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 10 }}
                    iconType="circle"
                    iconSize={7}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Tables (workspace scope only) */}
      {scope === "workspace" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* Channel Breakdown */}
          <Card className="glass-panel glow-border border-0 animate-fade-in stagger-6">
            <CardHeader>
              <CardTitle className="text-base">渠道用量</CardTitle>
              <CardDescription className="text-xs">按渠道统计 · {metricLabel(metric)}</CardDescription>
            </CardHeader>
            <CardContent>
              {channels.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">暂无数据</div>
              ) : (
                <div className="space-y-1.5">
                  {channels.map((c, i) => (
                    <div
                      key={c.channel_id ?? i}
                      className="flex items-center justify-between rounded-md border border-border/30 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn("font-mono text-[10px]", i === 0 && "border-chart-2/40")}
                        >
                          {c.channel_name || (c.channel_id ? `#${c.channel_id}` : "未知")}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
                        <span>{fmtCompact(c.request_count)} 次</span>
                        <span className="text-foreground">{metricFmt(metric, getMetricValue(c, metric))}</span>
                        <span className="text-chart-3">{fmtCost(c.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* User Breakdown */}
          <Card className="glass-panel glow-border border-0 animate-fade-in stagger-7">
            <CardHeader>
              <CardTitle className="text-base">用户用量</CardTitle>
              <CardDescription className="text-xs">按用户统计 · {metricLabel(metric)}</CardDescription>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">暂无数据</div>
              ) : (
                <div className="space-y-1.5">
                  {users.map((u, i) => (
                    <div
                      key={u.user_id ?? i}
                      className="flex items-center justify-between rounded-md border border-border/30 px-3 py-2"
                    >
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", i === 0 && "border-chart-2/40")}
                      >
                        {u.username || `用户 #${u.user_id}` || "未知"}
                      </Badge>
                      <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
                        <span>{fmtCompact(u.request_count)} 次</span>
                        <span className="text-foreground">{metricFmt(metric, getMetricValue(u, metric))}</span>
                        <span className="text-chart-3">{fmtCost(u.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  delay,
}: {
  label: string
  value: string
  sub: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  delay: number
}) {
  return (
    <Card
      className="glass-panel glow-border card-hover animate-fade-in gap-0 overflow-hidden border-0"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`h-[2px] origin-left scale-x-80 transition-transform hover:scale-x-100 ${color} bg-current`} />
      <CardContent className="flex items-center gap-3 pt-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary/50">
          <Icon className={`size-4 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold">{value}</p>
          {sub && (
            <p className="truncate font-mono text-[10px] text-muted-foreground">{sub}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
