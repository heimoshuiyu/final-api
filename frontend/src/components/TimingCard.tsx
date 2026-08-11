import {
  Activity,
  PanelTop,
  RadioTower,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface TimingData {
  duration_ms: number
  upstream_headers_ms: number | null
  upstream_first_data_ms: number | null
  upstream_complete_ms: number | null
}

export function TimingCard({ data }: { data: TimingData }) {
  const headersMs = normalize(data.upstream_headers_ms)
  const firstDataMs = normalize(data.upstream_first_data_ms)
  const completeMs = normalize(data.upstream_complete_ms) ?? normalize(data.duration_ms)

  const total = completeMs ?? data.duration_ms

  const ttftMs = headersMs !== null && firstDataMs !== null
    ? Math.max(0, firstDataMs - headersMs)
    : null
  const streamMs = firstDataMs !== null && completeMs !== null
    ? Math.max(0, completeMs - firstDataMs)
    : null

  const keyPhases: KeyPhase[] = [
    {
      key: "gateway",
      label: "网关 + 连接",
      description: "路由选择 → 收到响应头",
      value: headersMs,
      icon: PanelTop,
      barClassName: "bg-chart-3",
      iconClassName: "bg-chart-3/10 text-chart-3",
    },
    {
      key: "ttft",
      label: "TTFB",
      description: "响应头 → 首段数据",
      value: ttftMs,
      icon: RadioTower,
      barClassName: "bg-primary",
      iconClassName: "bg-primary/10 text-primary",
    },
    {
      key: "stream",
      label: "流式传输",
      description: "首段数据 → 接收完成",
      value: streamMs,
      icon: CheckCircle2,
      barClassName: "bg-chart-2",
      iconClassName: "bg-chart-2/10 text-chart-2",
    },
  ]

  const stages: TimingStage[] = [
    {
      key: "headers",
      label: "收到上游响应头",
      description: "路由 + 连接 + 发送 + 等待",
      value: headersMs,
      icon: PanelTop,
      barClassName: "bg-chart-3",
    },
    {
      key: "first-data",
      label: "收到上游首段数据",
      description: "首个响应数据块已到达",
      value: firstDataMs,
      icon: RadioTower,
      barClassName: "bg-primary",
    },
    {
      key: "complete",
      label: "上游数据接收完成",
      description: "上游响应已完整读取",
      value: completeMs,
      icon: CheckCircle2,
      barClassName: "bg-chart-2",
    },
  ]

  const scaleMax = Math.max(1, total, ...stages.map((s) => s.value ?? 0))
  const waterfallRows = buildWaterfallRows(stages, scaleMax)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Activity className="size-4 text-primary" />
        请求阶段延迟
        <Badge variant="outline" className="ml-auto">
          {stages.filter((s) => s.value !== null).length}/{stages.length} 阶段
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {keyPhases.map((phase) => (
          <SummaryMetric key={phase.key} phase={phase} />
        ))}
      </div>

      <PhaseDistribution phases={keyPhases} scaleMax={scaleMax} totalMs={total} />

      <div className="flex flex-col gap-2.5">
        <div className="flex items-end justify-between gap-4">
          <div className="text-sm font-medium">阶段瀑布</div>
          <Badge variant="outline">累计上限 {formatDuration(scaleMax)}</Badge>
        </div>

        <div className="rounded-xl border bg-muted/20 p-3">
          <ol className="flex flex-col gap-2">
            {waterfallRows.map((row, index) => (
              <WaterfallRow key={row.key} row={row} index={index} />
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>所有时间均为相对请求开始时刻的累计毫秒数。</span>
          <span className="tabular-nums">0 ms → {scaleMax} ms</span>
        </div>
      </div>
    </div>
  )
}

type TimingStage = {
  key: string
  label: string
  description: string
  value: number | null
  icon: LucideIcon
  barClassName: string
}

type KeyPhase = {
  key: string
  label: string
  description: string
  value: number | null
  icon: LucideIcon
  barClassName: string
  iconClassName: string
}

type WaterfallRowData = TimingStage & {
  delta: number | null
  leftPercent: number
  widthPercent: number
}

function SummaryMetric({ phase }: { phase: KeyPhase }) {
  const Icon = phase.icon
  return (
    <div className="relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-lg border bg-card/70 p-2.5 shadow-sm">
      <div aria-hidden className={cn("absolute inset-x-0 bottom-0 h-0.5", phase.barClassName)} />
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-md [&>svg]:size-4", phase.iconClassName)}>
        <Icon aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium">{phase.label}</div>
        <div className="font-mono text-base font-semibold tracking-tight tabular-nums">{formatDuration(phase.value)}</div>
        <div className="truncate text-[0.625rem] text-muted-foreground">{phase.description}</div>
      </div>
    </div>
  )
}

function PhaseDistribution({ phases, scaleMax, totalMs }: { phases: KeyPhase[]; scaleMax: number; totalMs: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium">三段关键路径</div>
        <div className="font-mono text-xs font-semibold tabular-nums">总耗时 {formatDuration(totalMs)}</div>
      </div>
      <div aria-label="三段关键路径分布" className="flex h-2.5 overflow-hidden rounded-full bg-muted shadow-inner" role="img">
        {phases.map((phase) => (
          phase.value !== null && phase.value > 0 && (
            <div
              key={phase.key}
              aria-hidden
              className={phase.barClassName}
              style={{ width: `${Math.min(100, (phase.value / scaleMax) * 100)}%`, minWidth: "3px" }}
            />
          )
        ))}
      </div>
      <div className="grid gap-1.5 text-[0.6875rem] text-muted-foreground sm:grid-cols-3 sm:gap-3">
        {phases.map((phase) => (
          <div key={phase.key} className="flex items-center justify-between gap-2 sm:justify-start">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2 rounded-full", phase.barClassName)} />
              {phase.label}
            </span>
            <span className="font-mono tabular-nums">{formatDuration(phase.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WaterfallRow({ row, index }: { row: WaterfallRowData; index: number }) {
  const Icon = row.icon
  return (
    <li
      className="grid animate-slide-up gap-2 rounded-lg border bg-card/65 p-2.5 opacity-0 shadow-sm [animation-fill-mode:forwards] sm:grid-cols-[minmax(8rem,0.9fr)_minmax(12rem,2fr)_6rem] sm:items-center sm:gap-4"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&>svg]:size-4", row.value !== null && "bg-primary/10 text-primary")}>
          <Icon aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">{row.label}</div>
          <div className="truncate text-[0.6875rem] text-muted-foreground">{row.description}</div>
        </div>
      </div>

      <div className="min-w-0">
        <div
          aria-label={row.value === null ? `${row.label}暂无数据` : `${row.label}累计 ${row.value} 毫秒，本阶段 ${row.delta} 毫秒`}
          className="relative h-7 overflow-hidden rounded-md border bg-muted/40"
          role="img"
        >
          <div aria-hidden className="absolute inset-0 grid grid-cols-4 divide-x divide-border/60">
            <span />
            <span />
            <span />
            <span />
          </div>
          {row.value === null ? (
            <div className="absolute inset-0 grid place-items-center text-[0.625rem] text-muted-foreground">暂无数据</div>
          ) : (
            <div
              aria-hidden
              className={cn("absolute inset-y-1 rounded-sm opacity-85 shadow-sm", row.barClassName)}
              style={{ left: `${row.leftPercent}%`, width: `${row.widthPercent}%`, minWidth: "0.5rem" }}
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 lg:flex-col lg:items-end lg:justify-center lg:gap-0.5">
        <span className="font-mono text-xs font-semibold tabular-nums">{row.value === null ? "-" : `${row.value} ms`}</span>
        <Badge variant="outline">{row.delta === null ? "无数据" : `+${row.delta} ms`}</Badge>
      </div>
    </li>
  )
}

function buildWaterfallRows(stages: TimingStage[], scaleMax: number): WaterfallRowData[] {
  let previousValue = 0
  return stages.map((stage) => {
    const startValue = previousValue
    const endValue = stage.value === null ? null : Math.max(previousValue, stage.value)
    const delta = endValue === null ? null : endValue - startValue
    if (endValue !== null) previousValue = endValue
    return {
      ...stage,
      delta,
      leftPercent: Math.min(99, (startValue / scaleMax) * 100),
      widthPercent: delta === null ? 0 : Math.min(100 - (startValue / scaleMax) * 100, (delta / scaleMax) * 100),
    }
  })
}

function normalize(value?: number | null) {
  return value == null || !Number.isFinite(value) || value < 0 ? null : value
}

function formatDuration(value?: number | null) {
  if (value == null) return "-"
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)}s`
  return `${value}ms`
}
