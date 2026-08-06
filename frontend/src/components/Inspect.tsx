import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { fetchChannels, fetchTokens } from "../api"
import type { Channel, InspectEvent, RequestCard, Token } from "../types"

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
  const d = new Date(ts)
  return d.toLocaleTimeString("zh-CN", { hour12: false })
}

interface FilterState {
  tokenIds: Set<number>
  models: Set<string>
  channelIds: Set<number>
}

export function Inspect() {
  const [requests, setRequests] = useState<RequestCard[]>([])
  const [paused, setPaused] = useState(false)
  const [connState, setConnState] = useState<"connecting" | "live" | "reconnecting">("connecting")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<FilterState>({ tokenIds: new Set(), models: new Set(), channelIds: new Set() })
  const [tokens, setTokens] = useState<Token[]>([])
  const [channels, setChannels] = useState<Channel[]>([])

  const pausedRef = useRef(false)
  useEffect(() => { pausedRef.current = paused }, [paused])

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
            ? { ...r, status: event.status, durationMs: event.duration_ms, respHeaders: event.resp_headers || {} }
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
      if (filters.tokenIds.size) params.set("token_ids", [...filters.tokenIds].join(","))
      if (filters.models.size) params.set("models", [...filters.models].join(","))
      if (filters.channelIds.size) params.set("channel_ids", [...filters.channelIds].join(","))

      const jwt = localStorage.getItem("token")

      try {
        const res = await fetch(`/api/inspect/stream?${params}`, {
          headers: { Authorization: `Bearer ${jwt}` },
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

            const dataLines = rawEvent
              .split("\n")
              .filter((l) => l.startsWith("data:"))

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
  }, [filters, handleEvent])

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

  const connDot =
    connState === "live" ? "bg-mint" : connState === "reconnecting" ? "bg-rose" : "bg-amber"
  const connLabel =
    connState === "live" ? (paused ? "已暂停" : "LIVE") : connState === "reconnecting" ? "重连中" : "连接中"

  return (
    <div style={{ animation: "slide-up 0.3s ease-out" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-heading" style={{ letterSpacing: "-0.02em" }}>
            实时监控
          </h1>
          <p className="mt-2 text-sm text-dim">实时查看请求体与流式响应。</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              paused
                ? "bg-mint text-base hover:opacity-90"
                : "border border-bright-line text-text hover:border-mint"
            }`}
          >
            {paused ? "继续" : "暂停"}
          </button>
          <button
            onClick={clearAll}
            className="px-4 py-2 border border-bright-line text-sm text-dim hover:text-rose hover:border-rose/40 transition-colors"
          >
            清空
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="mt-6 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 ${connDot}`}
            style={{
              borderRadius: "50%",
              animation: connState === "live" && !paused ? "pulse-dot 1.5s ease-in-out infinite" : undefined,
            }}
          />
          <span className="font-mono text-xs text-text font-medium">{connLabel}</span>
          {activeCount > 0 && (
            <span className="font-mono text-xs text-dim ml-2">{activeCount} 个活跃请求</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
            <button
              onClick={() => setFilters({ tokenIds: new Set(), models: new Set(), channelIds: new Set() })}
              className="font-mono text-xs text-dim hover:text-text transition-colors px-2"
            >
              重置筛选
            </button>
          )}
        </div>
      </div>

      {/* Request list */}
      <div className="mt-6 space-y-2">
        {requests.length === 0 ? (
          <div className="border border-line px-6 py-16 text-center">
            <div className="inline-block w-2 h-2 bg-mint mb-4" style={{ borderRadius: "50%", animation: "pulse-dot 1.5s ease-in-out infinite" }} />
            <p className="font-mono text-xs text-dim">等待请求流入…</p>
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
      className="border border-line bg-panel"
      style={expanded ? undefined : { animation: "flash-in 0.4s ease-out" }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-elevated/40 transition-colors"
      >
        {/* Status indicator */}
        <span
          className={`inline-block w-1.5 h-1.5 flex-shrink-0 ${
            streaming ? "bg-amber" : card.status && card.status >= 200 && card.status < 300 ? "bg-mint" : card.status && card.status >= 400 ? "bg-rose" : "bg-dim"
          }`}
          style={{ borderRadius: "50%", animation: streaming ? "pulse-dot 1s ease-in-out infinite" : undefined }}
        />

        {/* Model */}
        <span className="font-mono text-xs font-medium text-heading truncate flex-shrink-0 max-w-[20rem]">
          {card.model}
        </span>

        {/* Channel · Token */}
        <span className="font-mono text-[10px] text-dim truncate flex-1 min-w-0">
          {card.channelName} · {card.tokenName}
        </span>

        {/* Status / Duration */}
        <span className="font-mono text-xs flex-shrink-0">
          {streaming ? (
            <span className="text-amber">streaming…</span>
          ) : (
            <>
              <span
                className={
                  card.status && card.status >= 200 && card.status < 300
                    ? "text-mint"
                    : card.status && card.status >= 400
                      ? "text-rose"
                      : "text-dim"
                }
              >
                {card.status}
              </span>
              <span className="text-dim ml-2">{card.durationMs}ms</span>
            </>
          )}
        </span>

        {/* Time + req_id */}
        <span className="font-mono text-[10px] text-dim flex-shrink-0 hidden sm:inline">
          {formatTime(card.ts)}
        </span>
        <span className="font-mono text-[10px] text-dim/60 flex-shrink-0">
          #{shortId(card.reqId)}
        </span>
        <span className="font-mono text-xs text-dim flex-shrink-0">
          {expanded ? "▴" : "▾"}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-line/60 px-4 py-3 space-y-3">
          {/* Headers */}
          <HeadersSection title="入站请求头" headers={card.reqHeaders} defaultOpen={false} />
          <HeadersSection title="上游请求头" headers={card.upstreamHeaders} defaultOpen={false} />
          {card.respHeaders && (
            <HeadersSection title="上游响应头" headers={card.respHeaders} defaultOpen={false} />
          )}

          {/* Request body */}
          <CollapsibleText
            title="请求体"
            meta={`${bodySize(card.body)} bytes`}
            text={formatBody(card.body)}
          />

          {/* Response stream */}
          <CollapsibleText
            title="响应流"
            meta={streaming ? "receiving…" : `${responseBytes} bytes`}
            text={responseText}
            streaming={streaming}
            autoScrollBottom
          />

          {/* Endpoint */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-dim uppercase tracking-widest">上游</span>
            <span className="font-mono text-[10px] text-dim/80 truncate">{card.endpoint}</span>
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
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left group"
      >
        <span className="font-mono text-[10px] text-dim uppercase tracking-widest group-hover:text-text transition-colors">
          {title}
        </span>
        <span className="font-mono text-[10px] text-dim/60">{entries.length}</span>
        <span className="font-mono text-[10px] text-dim/40 ml-auto">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-1.5 bg-base border border-line">
          {entries.map(([key, value]) => (
            <div key={key} className="flex border-b border-line/40 last:border-b-0">
              <span className="font-mono text-[10px] text-dim px-2 py-1 flex-shrink-0 w-40 truncate border-r border-line/40">
                {key}
              </span>
              <span className="font-mono text-[10px] text-text px-2 py-1 break-all min-w-0 flex-1">
                {value}
              </span>
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
}: {
  title: string
  meta: string
  text: string
  streaming?: boolean
  autoScrollBottom?: boolean
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
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 group"
        >
          <span className="font-mono text-[10px] text-dim uppercase tracking-widest group-hover:text-text transition-colors">
            {title}
          </span>
          <span className="font-mono text-[10px] text-dim/40">{open ? "▴" : "▾"}</span>
        </button>
        <span className="font-mono text-[10px] text-dim/60">{meta}</span>
      </div>
      <pre
        ref={ref}
        className={`bg-base border border-line p-3 overflow-auto font-mono text-[11px] leading-relaxed text-text whitespace-pre-wrap break-all ${
          open ? "" : "max-h-[14rem]"
        }`}
        style={{ overflowAnchor: "none" }}
      >
        {text}
        {streaming && (
          <span className="text-mint" style={{ animation: "blink-cursor 1s step-end infinite" }}>
            ▌
          </span>
        )}
        {!streaming && !text && <span className="text-dim italic">（空响应）</span>}
      </pre>
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
      <button
        onClick={() => setOpen(!open)}
        className={`px-3 py-1.5 text-xs font-mono transition-colors ${
          count > 0
            ? "border border-mint/40 text-mint"
            : "border border-line text-dim hover:text-text"
        }`}
      >
        {label}
        {count > 0 && ` (${count})`}
        <span className="ml-1.5 opacity-60">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-px z-50 bg-panel border border-bright-line max-h-64 overflow-auto min-w-full w-max">
          {options.length === 0 ? (
            <div className="px-3 py-2 font-mono text-[10px] text-dim">无选项</div>
          ) : (
            options.map((opt) => {
              const checked = selectedSet.has(opt.value)
              return (
                <button
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-elevated transition-colors"
                >
                  <span
                    className={`inline-flex items-center justify-center w-3 h-3 border flex-shrink-0 ${
                      checked ? "bg-mint border-mint" : "border-line"
                    }`}
                  >
                    {checked && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1 4l2 2 4-4" stroke="#0a0b0e" strokeWidth="1.5" />
                      </svg>
                    )}
                  </span>
                  <span className="font-mono text-[11px] text-text truncate">{opt.label}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
