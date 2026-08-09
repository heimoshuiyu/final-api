import { useMemo } from "react"
import type { TimeSeriesPoint } from "../types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const BLOCK_COUNT = 12
const HOURS_PER_BLOCK = 2
const LEVEL_PCT = [0, 22, 42, 62, 82, 100]
const HOURLY_RE = / \d{2}:00$/

interface Cell {
  v: number
  req: number
  cached: number
  prompt: number
}

interface DayColumn {
  date: string
  blocks: Cell[]
}

interface DayCell {
  date: string
  value: number
  cached: number
  prompt: number
  inRange: boolean
}

const CELL_CLASS =
  "rounded-[3px] border border-border/40 outline-none transition-all duration-100 hover:scale-110 hover:border-primary/60 data-[level=0]:bg-muted/55"

function newCell(): Cell {
  return { v: 0, req: 0, cached: 0, prompt: 0 }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function slotLabel(blockIndex: number): string {
  const start = blockIndex * HOURS_PER_BLOCK
  const end = start + HOURS_PER_BLOCK
  const endLabel = end >= 24 ? "24:00" : `${pad2(end)}:00`
  return `${pad2(start)}:00–${endLabel}`
}

function levelFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0
  const ratio = Math.sqrt(value / max)
  return Math.min(LEVEL_PCT.length - 1, Math.max(1, Math.ceil(ratio * 5)))
}

function cellBg(level: number): string {
  return `color-mix(in oklch, var(--primary) ${LEVEL_PCT[level]}%, transparent)`
}

const HOURLY_ROW_H = 22
const CALENDAR_ROW_H = 16

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

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

const WEEKDAY_LABELS_ZH = ["一", "二", "三", "四", "五", "六", "日"]
const LABELED_WEEKDAYS = new Set([0, 2, 4])

export type MetricKey =
  | "total_tokens"
  | "prompt_tokens"
  | "completion_tokens"
  | "cached_tokens"
  | "cache_creation_tokens"
  | "request_count"
  | "cost"
  | "cache_hit_rate"
  | "runtime"
  | "runtime_dedup"

interface MetricDef {
  value: MetricKey
  label: string
  color: string
  isCost?: boolean
  isPercent?: boolean
  isDuration?: boolean
}

export const METRICS: MetricDef[] = [
  { value: "total_tokens", label: "总 Token", color: "var(--chart-1)" },
  { value: "prompt_tokens", label: "输入", color: "var(--chart-1)" },
  { value: "completion_tokens", label: "输出", color: "var(--chart-2)" },
  { value: "cached_tokens", label: "缓存命中", color: "var(--chart-3)" },
  { value: "cache_creation_tokens", label: "缓存写入", color: "var(--chart-4)" },
  { value: "cache_hit_rate", label: "缓存命中率", color: "var(--chart-5)", isPercent: true },
  { value: "request_count", label: "请求数", color: "var(--chart-5)" },
  { value: "runtime", label: "时间", color: "var(--chart-4)", isDuration: true },
  { value: "runtime_dedup", label: "时间（去重）", color: "var(--chart-2)", isDuration: true },
  { value: "cost", label: "费用", color: "var(--chart-3)", isCost: true },
]

export function metricDef(key: MetricKey): MetricDef | undefined {
  return METRICS.find((m) => m.value === key)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function getMetricValue(d: any, metric: MetricKey): number {
  if (metric === "cache_hit_rate") {
    const p = d.prompt_tokens ?? 0
    return p > 0 ? ((d.cached_tokens ?? 0) / p) * 100 : 0
  }
  return (d[metric] as number) ?? 0
}

function resolveMetric(metric: MetricKey, rawValue: number, cached: number, prompt: number): number {
  if (metric === "cache_hit_rate") {
    return prompt > 0 ? (cached / prompt) * 100 : 0
  }
  return rawValue
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return Math.round(ms) + "ms"
  const s = ms / 1000
  if (s < 60) return s.toFixed(1) + "s"
  const m = Math.floor(s / 60)
  const rs = Math.round(s % 60)
  if (m < 60) return `${m}m${rs}s`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return `${h}h${rm}m`
}

export function metricLabel(key: MetricKey): string {
  return metricDef(key)?.label ?? key
}

export function metricFmt(key: MetricKey, n: number): string {
  const def = metricDef(key)
  if (def?.isPercent) return n.toFixed(1) + "%"
  if (def?.isDuration) return fmtDuration(n)
  if (def?.isCost) return fmtCost(n)
  return fmtCompact(n)
}

export function Heatmap({
  days,
  metric,
  loading,
}: {
  days: TimeSeriesPoint[]
  metric: MetricKey
  loading: boolean
}) {
  const isHourly = days.length > 0 && HOURLY_RE.test(days[0].bucket)

  const hourlyView = useMemo(() => {
    if (!isHourly) return { columns: [] as DayColumn[], maxValue: 0, total: 0 }
    const hourly = days.filter((d) => HOURLY_RE.test(d.bucket))
    const byDate = new Map<string, Cell[]>()
    const dateOrder: string[] = []

    for (const d of hourly) {
      const [date, hourStr] = d.bucket.split(" ")
      const hour = parseInt(hourStr, 10)
      if (isNaN(hour)) continue
      const blockIndex = Math.min(BLOCK_COUNT - 1, Math.floor(hour / HOURS_PER_BLOCK))
      let blocks = byDate.get(date)
      if (!blocks) {
        blocks = Array.from({ length: BLOCK_COUNT }, newCell)
        byDate.set(date, blocks)
        dateOrder.push(date)
      }
      const cell = blocks[blockIndex]
      cell.v += getMetricValue(d, metric)
      cell.cached += d.cached_tokens ?? 0
      cell.prompt += d.prompt_tokens ?? 0
      cell.req += d.request_count
    }

    for (const blocks of byDate.values()) {
      for (const cell of blocks) {
        cell.v = resolveMetric(metric, cell.v, cell.cached, cell.prompt)
      }
    }

    const columns = dateOrder.sort().map((date) => ({
      date,
      blocks: byDate.get(date)!,
    }))

    let max = 0
    let sum = 0
    for (const col of columns) {
      for (const cell of col.blocks) {
        if (cell.v > max) max = cell.v
        sum += cell.v
      }
    }
    return { columns, maxValue: max, total: sum }
  }, [days, isHourly, metric])

  const calendarView = useMemo(() => {
    if (isHourly) return { weeks: [] as DayCell[][], monthLabels: [] as string[], weekdayLabels: WEEKDAY_LABELS_ZH, maxValue: 0, total: 0 }
    const daily = days.filter((d) => !HOURLY_RE.test(d.bucket))
    if (!daily.length) return { weeks: [] as DayCell[][], monthLabels: [] as string[], weekdayLabels: WEEKDAY_LABELS_ZH, maxValue: 0, total: 0 }

    const dataMap = new Map<string, { v: number; cached: number; prompt: number }>()
    for (const d of daily) {
      const prev = dataMap.get(d.bucket)
      const v = getMetricValue(d, metric)
      const cached = d.cached_tokens ?? 0
      const prompt = d.prompt_tokens ?? 0
      dataMap.set(d.bucket, {
        v: (prev?.v ?? 0) + v,
        cached: (prev?.cached ?? 0) + cached,
        prompt: (prev?.prompt ?? 0) + prompt,
      })
    }
    for (const [, val] of dataMap) {
      val.v = resolveMetric(metric, val.v, val.cached, val.prompt)
    }

    const sorted = [...dataMap.keys()].sort()
    const minDate = new Date(`${sorted[0]}T00:00:00`)
    const maxDate = new Date(`${sorted[sorted.length - 1]}T00:00:00`)

    const start = new Date(minDate)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    const end = new Date(maxDate)
    end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)))

    const weeks: DayCell[][] = []
    const cur = new Date(start)
    while (cur <= end) {
      const week: DayCell[] = []
      for (let i = 0; i < 7; i++) {
        const ds = toISODate(cur)
        const inRange = cur >= minDate && cur <= maxDate
        const data = dataMap.get(ds)
        week.push({
          date: ds,
          value: data?.v ?? 0,
          cached: data?.cached ?? 0,
          prompt: data?.prompt ?? 0,
          inRange,
        })
        cur.setDate(cur.getDate() + 1)
      }
      weeks.push(week)
    }

    let max = 0
    let sum = 0
    for (const w of weeks) {
      for (const c of w) {
        if (!c.inRange) continue
        if (c.value > max) max = c.value
        sum += c.value
      }
    }

    const monthFmt = new Intl.DateTimeFormat("zh-CN", { month: "short" })
    let prevMonth = -1
    const monthLabels = weeks.map((w) => {
      const mon = new Date(`${w[0].date}T00:00:00`)
      const m = mon.getMonth()
      if (m !== prevMonth) {
        prevMonth = m
        return monthFmt.format(mon)
      }
      return ""
    })

    return { weeks, monthLabels, weekdayLabels: WEEKDAY_LABELS_ZH, maxValue: max, total: sum }
  }, [days, isHourly, metric])

  const view = isHourly ? hourlyView : calendarView
  const hasData = isHourly ? hourlyView.columns.length > 0 : calendarView.weeks.length > 0
  const maxValue = view.maxValue
  const total = view.total

  if (loading) {
    return (
      <Card className="glass-panel glow-border mt-6 border-0 animate-fade-in stagger-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">活动热力图</CardTitle>
          <CardDescription className="text-xs">加载中...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[220px] w-full animate-pulse rounded-lg bg-muted/30" />
        </CardContent>
      </Card>
    )
  }

  if (!hasData) {
    return null
  }

  return (
    <Card className="glass-panel glow-border mt-6 border-0 animate-fade-in stagger-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">活动热力图</CardTitle>
        <CardDescription className="text-xs">
          {isHourly ? "按天 × 2小时" : "按天"} · 总计 {metricFmt(metric, total)} {metricLabel(metric)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={120}>
          {isHourly ? (
            <HourlyGrid columns={hourlyView.columns} maxValue={maxValue} metric={metric} />
          ) : (
            <CalendarGrid
              weeks={calendarView.weeks}
              monthLabels={calendarView.monthLabels}
              weekdayLabels={calendarView.weekdayLabels}
              maxValue={maxValue}
              metric={metric}
            />
          )}
        </TooltipProvider>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>少</span>
            {[0, 1, 2, 3, 4, 5].map((lvl) => (
              <span
                key={lvl}
                className="size-3 rounded-[3px] border border-border/60"
                style={{
                  backgroundColor:
                    lvl === 0
                      ? "color-mix(in oklch, var(--muted) 60%, transparent)"
                      : cellBg(lvl),
                }}
              />
            ))}
            <span>多</span>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            总计: <span className="font-semibold text-foreground">{metricFmt(metric, total)}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function HourlyGrid({ columns, maxValue, metric }: { columns: DayColumn[]; maxValue: number; metric: MetricKey }) {
  const dayCount = columns.length
  const size = HOURLY_ROW_H
  const gap = 3
  const labelW = 46
  const headerH = 16
  const labelStep = dayCount <= 14 ? 1 : Math.ceil(dayCount / 14)

  return (
    <div className="overflow-x-auto overflow-y-auto pb-1" style={{ maxHeight: 360 }}>
      <div
        className="mx-auto grid w-fit"
        style={{
          gridTemplateColumns: `${labelW}px repeat(${dayCount}, ${size}px)`,
          gridTemplateRows: `${headerH}px repeat(${BLOCK_COUNT}, ${size}px)`,
          columnGap: `${gap}px`,
          rowGap: `${gap}px`,
        }}
      >
        <div />
        {columns.map((col, i) => (
          <div
            key={`h-${col.date}`}
            className="flex items-end justify-center overflow-visible pb-0.5 text-[9px] font-medium leading-none text-muted-foreground"
          >
            {i % labelStep === 0 ? col.date.slice(5) : ""}
          </div>
        ))}

        {Array.from({ length: BLOCK_COUNT }, (_, blockIndex) => {
          const showLabel = blockIndex % 2 === 0
          return (
            <HourlyRowFragment
              key={`r-${blockIndex}`}
              blockIndex={blockIndex}
              columns={columns}
              maxValue={maxValue}
              size={size}
              showLabel={showLabel}
              metric={metric}
            />
          )
        })}
      </div>
    </div>
  )
}

function HourlyRowFragment({
  blockIndex,
  columns,
  maxValue,
  size,
  showLabel,
  metric,
}: {
  blockIndex: number
  columns: DayColumn[]
  maxValue: number
  size: number
  showLabel: boolean
  metric: MetricKey
}) {
  return (
    <>
      <div
        className="flex items-center justify-end pr-1 text-[9px] font-medium leading-none text-muted-foreground"
        style={{ height: size }}
      >
        {showLabel ? `${pad2(blockIndex * HOURS_PER_BLOCK)}:00` : ""}
      </div>
      {columns.map((col) => {
        const cell = col.blocks[blockIndex]
        const level = levelFor(cell.v, maxValue)
        return (
          <Tooltip key={`${col.date}-${blockIndex}`}>
            <TooltipTrigger asChild>
              <div
                tabIndex={0}
                role="img"
                aria-label={`${col.date} ${slotLabel(blockIndex)}: ${metricFmt(metric, cell.v)} ${metricLabel(metric)}`}
                className={CELL_CLASS}
                data-level={level}
                style={{
                  width: size,
                  height: size,
                  backgroundColor: level === 0 ? undefined : cellBg(level),
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="flex flex-col items-start gap-0.5">
              <span className="font-medium">{col.date}</span>
              <span className="font-mono text-[10px] text-background/80">{slotLabel(blockIndex)}</span>
              <span className="font-mono text-[11px] font-semibold">{metricFmt(metric, cell.v)} {metricLabel(metric)}</span>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </>
  )
}

function CalendarGrid({
  weeks,
  monthLabels,
  weekdayLabels,
  maxValue,
  metric,
}: {
  weeks: DayCell[][]
  monthLabels: string[]
  weekdayLabels: string[]
  maxValue: number
  metric: MetricKey
}) {
  const weekCount = weeks.length
  const size = CALENDAR_ROW_H
  const gap = 3
  const labelW = 34
  const monthH = 14

  return (
    <div className="overflow-x-auto overflow-y-auto pb-1" style={{ maxHeight: 360 }}>
      <div
        className="mx-auto grid w-fit"
        style={{
          gridTemplateColumns: `${labelW}px repeat(${weekCount}, ${size}px)`,
          gridTemplateRows: `${monthH}px repeat(7, ${size}px)`,
          columnGap: `${gap}px`,
          rowGap: `${gap}px`,
        }}
      >
        <div />
        {monthLabels.map((label, i) => (
          <div
            key={`m-${i}`}
            className="flex items-end justify-start overflow-visible pb-0.5 text-[9px] font-medium leading-none text-muted-foreground"
          >
            {label}
          </div>
        ))}

        {Array.from({ length: 7 }, (_, row) => (
          <CalendarRowFragment
            key={`d-${row}`}
            row={row}
            weeks={weeks}
            maxValue={maxValue}
            size={size}
            weekdayLabel={LABELED_WEEKDAYS.has(row) ? weekdayLabels[row] : ""}
            metric={metric}
          />
        ))}
      </div>
    </div>
  )
}

function CalendarRowFragment({
  row,
  weeks,
  maxValue,
  size,
  weekdayLabel,
  metric,
}: {
  row: number
  weeks: DayCell[][]
  maxValue: number
  size: number
  weekdayLabel: string
  metric: MetricKey
}) {
  return (
    <>
      <div
        className="flex items-center justify-end pr-1 text-[9px] font-medium leading-none text-muted-foreground"
        style={{ height: size }}
      >
        {weekdayLabel}
      </div>
      {weeks.map((week, wi) => {
        const cell = week[row]
        if (!cell.inRange) {
          return <div key={`c-${wi}-${row}`} style={{ width: size, height: size }} />
        }
        const level = levelFor(cell.value, maxValue)
        return (
          <Tooltip key={`c-${wi}-${row}`}>
            <TooltipTrigger asChild>
              <div
                tabIndex={0}
                role="img"
                aria-label={`${cell.date}: ${metricFmt(metric, cell.value)} ${metricLabel(metric)}`}
                className={CELL_CLASS}
                data-level={level}
                style={{
                  width: size,
                  height: size,
                  backgroundColor: level === 0 ? undefined : cellBg(level),
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="flex flex-col items-start gap-0.5">
              <span className="font-medium">{cell.date}</span>
              <span className="font-mono text-[11px] font-semibold">{metricFmt(metric, cell.value)} {metricLabel(metric)}</span>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </>
  )
}
