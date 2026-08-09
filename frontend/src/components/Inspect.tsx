import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { fetchChannels, fetchTokens } from "../api"
import type { Channel, InspectEvent, RequestCard, Token } from "../types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Pause,
  Play,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
} from "lucide-react"

const MAX_REQUESTS = 100

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 4)
}

function formatBody(body: unknown): string {
  if (body === null || body === undefined) return ""
  if (typeof body === "string") return body
  try {
    return JSON.stringify(body, null, 2)
  } catch {
    return String(body)
  }
}

function bodySize(body: unknown): number {
  if (body === null || body === undefined) return 0
  if (typeof body === "string") return body.length
  try {
    return JSON.stringify(body).length
  } catch {
    return 0
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false })
}

interface FilterState {
  tokenIds: Set<number>
  models: Set<string>
  channelIds: Set<number>
}

export function Inspect({ scope = "user" }: { scope?: "user" | "workspace" }) {
  const [requests, setRequests] = useState<RequestCard[]>([])
  const [paused, setPaused] = useState(false)
  const [connState, setConnState] = useState<"connecting" | "live" | "reconnecting">("connecting")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<FilterState>({ tokenIds: new Set(), models: new Set(), channelIds: new Set() })
  const [tokens, setTokens] = useState<Token[]>([])
  const [channels, setChannels] = useState<Channel[]>([])

  const pausedRef = useRef(false)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    fetchTokens().then(setTokens).catch(() => {})
    fetchChannels().then(setChannels).catch(() => {})
  }, [])

  const allModels = useMemo(() => {
    const set = new Set<string>()
    channels.forEach((c) => c.models.forEach((m) => set.add(m)))
    return [...set].sort()
  }, [channels])

  const activeCount = requests.filter((r) => r.status === undefined).length

  const handleEvent = useCallback((event: InspectEvent) => {
    if (event.type === "start") {
      if (pausedRef.current) return
      setRequests((prev) => {
        const card: RequestCard = {
          reqId: event.req_id,
          ts: event.ts,
          tokenId: event.token_id,
          tokenName: event.token_name,
          channelId: event.channel_id,
          channelName: event.channel_name,
          model: event.model,
          endpoint: event.endpoint,
          isStream: event.is_stream,
          body: event.body,
          reqHeaders: event.req_headers || {},
          upstreamHeaders: event.upstream_headers || {},
          chunks: [],
        }
        const next = [card, ...prev]
        if (next.length > MAX_REQUESTS) next.length = MAX_REQUESTS
        return next
      })
      if (event.is_stream) {
        setExpandedIds((prev) => new Set(prev).add(event.req_id))
      }
    } else if (event.type === "chunk") {
      setRequests((prev) =>
        prev.map((r) => {
          if (r.reqId !== event.req_id) return r
          return { ...r, chunks: [...r.chunks, event.data] }
        }),
      )
    } else if (event.type === "end") {
      setRequests((prev) =>
        prev.map((r) =>
          r.reqId === event.req_id
            ? {
                ...r,
                status: event.status,
                durationMs: event.duration_ms,
                respHeaders: event.resp_headers || {},
                usage: event.usage ?? null,
                cost: event.cost ?? null,
              }
            : r,
        ),
      )
    }
  }, [])

  useEffect(() => {
    let aborted = false
    let retryTimer: ReturnType<typeof setTimeout>

    async function connect() {
      if (aborted) return
      setConnState("connecting")

      const params = new URLSearchParams()
      if (scope === "workspace") params.set("scope", "workspace")
      if (filters.tokenIds.size) params.set("token_ids", [...filters.tokenIds].join(","))
      if (filters.models.size) params.set("models", [...filters.models].join(","))
      if (filters.channelIds.size) params.set("channel_ids", [...filters.channelIds].join(","))

      const jwt = localStorage.getItem("token")
      const wsId = localStorage.getItem("workspace_id")

      try {
        const res = await fetch(`/api/inspect/stream?${params}`, {
          headers: {
            Authorization: `Bearer ${jwt}`,
            ...(wsId ? { "X-Workspace-Id": wsId } : {}),
          },
        })

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          let idx: number
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const rawEvent = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)

            const dataLines = rawEvent.split("\n").filter((l) => l.startsWith("data:"))

            if (dataLines.length > 0) {
              const data = dataLines.map((l) => l.slice(5).replace(/^ /, "")).join("\n")
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === "connected") {
                  setConnState("live")
                  continue
                }
                handleEvent(parsed as InspectEvent)
              } catch {
                /* skip malformed */
              }
            }
          }
        }
      } catch {
        if (!aborted) {
          setConnState("reconnecting")
          retryTimer = setTimeout(connect, 2000)
        }
      }
    }

    connect()

    return () => {
      aborted = true
      clearTimeout(retryTimer)
    }
  }, [filters, handleEvent, scope])

  const toggleExpand = (reqId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(reqId)) next.delete(reqId)
      else next.add(reqId)
      return next
    })
  }

  const clearAll = () => {
    setRequests([])
    setExpandedIds(new Set())
  }

  const connColor =
    connState === "live" ? "bg-chart-2" : connState === "reconnecting" ? "bg-destructive" : "bg-chart-3"
  const connLabel =
    connState === "live" ? (paused ? "已暂停" : "LIVE") : connState === "reconnecting" ? "重连中" : "连接中"

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {scope === "workspace" ? "工作区监控" : "实时监控"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope === "workspace" ? "监控整个工作区的请求。" : "实时查看你的请求体与流式响应。"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={paused ? "default" : "outline"} onClick={() => setPaused((p) => !p)}>
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? "继续" : "暂停"}
          </Button>
          <Button variant="outline" onClick={clearAll} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-4" />
            清空
          </Button>
        </div>
      </div>

      {/* Status bar */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            {connState === "live" && !paused && (
              <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-75", connColor)} />
            )}
            <span className={cn("relative inline-flex size-2 rounded-full", connColor)} />
          </span>
          <span className="text-xs font-medium">{connLabel}</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-2 gap-1">
              <Loader2 className="size-3 animate-spin" />
              {activeCount} 活跃
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            label="令牌"
            options={tokens.map((t) => ({ value: String(t.id), label: t.name }))}
            selected={filters.tokenIds}
            onChange={(next) => setFilters((f) => ({ ...f, tokenIds: next as Set<number> }))}
            parseValue={Number}
          />
          <MultiSelect
            label="模型"
            options={allModels.map((m) => ({ value: m, label: m }))}
            selected={filters.models}
            onChange={(next) => setFilters((f) => ({ ...f, models: next as Set<string> }))}
          />
          <MultiSelect
            label="渠道"
            options={channels.map((c) => ({ value: String(c.id), label: c.name }))}
            selected={filters.channelIds}
            onChange={(next) => setFilters((f) => ({ ...f, channelIds: next as Set<number> }))}
            parseValue={Number}
          />
          {(filters.tokenIds.size > 0 || filters.models.size > 0 || filters.channelIds.size > 0) && (
            <Button variant="ghost" size="xs" onClick={() => setFilters({ tokenIds: new Set(), models: new Set(), channelIds: new Set() })}>
              重置筛选
            </Button>
          )}
        </div>
      </div>

      {/* Request list */}
      <div className="mt-6 flex flex-col gap-2">
        {requests.length === 0 ? (
          <div className="glass-panel glow-border flex flex-col items-center rounded-xl py-16 text-center">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-chart-2 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-chart-2" />
            </span>
            <p className="mt-4 text-sm text-muted-foreground">等待请求流入…</p>
          </div>
        ) : (
          requests.map((card) => (
            <RequestCardView
              key={card.reqId}
              card={card}
              expanded={expandedIds.has(card.reqId)}
              onToggle={() => toggleExpand(card.reqId)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function RequestCardView({
  card,
  expanded,
  onToggle,
}: {
  card: RequestCard
  expanded: boolean
  onToggle: () => void
}) {
  const streaming = card.status === undefined
  const responseText = card.chunks.join("")
  const responseBytes = new Blob([responseText]).size

  return (
    <div
      className={cn(
        "glass-panel glow-border overflow-hidden rounded-xl",
        expanded ? undefined : "animate-fade-in",
      )}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/40"
      >
        {/* Status indicator */}
          <span
            className={cn(
              "relative inline-flex size-1.5 shrink-0 rounded-full",
              streaming ? "bg-chart-3" : card.status && card.status >= 200 && card.status < 300 ? "bg-chart-2" : card.status && card.status >= 400 ? "bg-destructive" : "bg-muted-foreground",
            )}
          >
          {streaming && (
            <span className="absolute inline-flex animate-ping rounded-full bg-chart-3 opacity-75" style={{ width: "0.375rem", height: "0.375rem" }} />
          )}
        </span>

        {/* Model */}
        <span className="max-w-[20rem] shrink-0 truncate font-mono text-xs font-medium">
          {card.model}
        </span>

        {/* Channel · Token */}
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
          {card.channelName} · {card.tokenName}
        </span>

        {/* Status / Duration */}
        <span className="shrink-0 font-mono text-xs">
          {streaming ? (
            <span className="flex items-center gap-1 text-chart-3">
              <Loader2 className="size-3 animate-spin" />
              streaming…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  card.status && card.status >= 200 && card.status < 300 && "text-chart-2",
                  card.status && card.status >= 400 && "text-destructive",
                )}
              >
                {card.status}
              </span>
              <span className="text-muted-foreground">{card.durationMs}ms</span>
              {card.usage?.total_tokens != null && (
                <span className="text-muted-foreground/60">
                  · {card.usage.total_tokens} tok
                  {card.usage.cached_tokens != null && card.usage.cached_tokens > 0 && (
                    <span className="text-chart-2"> ↻{card.usage.cached_tokens}</span>
                  )}
                  {card.usage.cache_creation_tokens != null && card.usage.cache_creation_tokens > 0 && (
                    <span className="text-chart-3"> +{card.usage.cache_creation_tokens}</span>
                  )}
                </span>
              )}
              {card.cost != null && card.cost > 0 && (
                <span className="text-chart-2">${card.cost.toFixed(4)}</span>
              )}
            </span>
          )}
        </span>

        {/* Time + req_id */}
        <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:inline">
          {formatTime(card.ts)}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
          #{shortId(card.reqId)}
        </span>
        <span className="shrink-0">
          {expanded ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3">
          <HeadersSection title="入站请求头" headers={card.reqHeaders} defaultOpen={false} />
          <HeadersSection title="上游请求头" headers={card.upstreamHeaders} defaultOpen={false} />
          {card.respHeaders && (
            <HeadersSection title="上游响应头" headers={card.respHeaders} defaultOpen={false} />
          )}

          <CollapsibleText title="请求体" meta={`${bodySize(card.body)} bytes`} text={formatBody(card.body)} hideWhenClosed />

          <CollapsibleText
            title="响应流"
            meta={streaming ? "receiving…" : `${responseBytes} bytes`}
            text={responseText}
            streaming={streaming}
            autoScrollBottom
          />

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">上游</span>
            <span className="truncate font-mono text-[10px] text-muted-foreground/80">{card.endpoint}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function HeadersSection({
  title,
  headers,
  defaultOpen,
}: {
  title: string
  headers: Record<string, string>
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const entries = Object.entries(headers)
  if (entries.length === 0) return null

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="group flex w-full items-center gap-2 text-left">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground transition-colors group-hover:text-foreground">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground/60">{entries.length}</span>
        <span className="ml-auto">
          {open ? <ChevronUp className="size-3 text-muted-foreground/40" /> : <ChevronDown className="size-3 text-muted-foreground/40" />}
        </span>
      </button>
      {open && (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-border/50">
          {entries.map(([key, value]) => (
            <div key={key} className="flex border-b border-border/30 last:border-b-0">
              <span className="w-40 shrink-0 truncate border-r border-border/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                {key}
              </span>
              <span className="min-w-0 flex-1 break-all px-2 py-1 font-mono text-[10px]">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CollapsibleText({
  title,
  meta,
  text,
  streaming,
  autoScrollBottom,
  hideWhenClosed,
}: {
  title: string
  meta: string
  text: string
  streaming?: boolean
  autoScrollBottom?: boolean
  hideWhenClosed?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!open && autoScrollBottom && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [text, open, autoScrollBottom])

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <button onClick={() => setOpen(!open)} className="group flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground transition-colors group-hover:text-foreground">
            {title}
          </span>
          {open ? <ChevronUp className="size-3 text-muted-foreground/40" /> : <ChevronDown className="size-3 text-muted-foreground/40" />}
        </button>
        <span className="font-mono text-[10px] text-muted-foreground/60">{meta}</span>
      </div>
      {(!hideWhenClosed || open) && (
        <pre
          ref={ref}
          className={cn(
            "overflow-auto rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all",
            !open && "max-h-[14rem]",
          )}
          style={{ overflowAnchor: "none" }}
        >
          {text}
          {streaming && (
            <span className="text-chart-2" style={{ animation: "blink-cursor 1s step-end infinite" }}>
              ▌
            </span>
          )}
          {!streaming && !text && <span className="italic text-muted-foreground">（空响应）</span>}
        </pre>
      )}
    </div>
  )
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  parseValue,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: Set<string> | Set<number>
  onChange: (next: Set<string | number>) => void
  parseValue?: (v: string) => number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const selectedSet = selected as Set<string>
  const count = selected.size

  const toggle = (value: string) => {
    const next = new Set(selectedSet)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="xs"
        onClick={() => setOpen(!open)}
        className={cn(count > 0 && "border-chart-2/40 text-chart-2")}
      >
        {label}
        {count > 0 && ` (${count})`}
        {open ? <ChevronUp className="ml-1 size-3 opacity-60" /> : <ChevronDown className="ml-1 size-3 opacity-60" />}
      </Button>
      {open && (
        <div className="glass-panel absolute left-0 top-full z-50 mt-1 max-h-64 min-w-full w-max overflow-auto rounded-lg border">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-muted-foreground">无选项</div>
          ) : (
            options.map((opt) => {
              const checked = selectedSet.has(opt.value)
              return (
                <button
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex size-3 shrink-0 items-center justify-center rounded border",
                      checked ? "border-chart-2 bg-chart-2" : "border-border",
                    )}
                  >
                    {checked && <Check className="size-2 text-background" />}
                  </span>
                  <span className="truncate font-mono text-[11px]">{opt.label}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
