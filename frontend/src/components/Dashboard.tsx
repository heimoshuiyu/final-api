import { useEffect, useState } from "react"
import { fetchChannels, fetchLogs, fetchTokens } from "../api"
import type { Channel, LogEntry, Token } from "../types"

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

  return (
    <div style={{ animation: "slide-up 0.3s ease-out" }}>
      {error && <Notice message={error} />}

      <h1 className="text-3xl font-bold text-heading" style={{ letterSpacing: "-0.02em" }}>
        概览
      </h1>

      <div className="mt-10 grid grid-cols-3 gap-px bg-line">
        <Stat
          label="活跃令牌"
          value={tokens.filter((t) => t.status === 1).length}
          onClick={() => navigate("/tokens")}
        />
        <Stat
          label="在线渠道"
          value={activeChannels.length}
          suffix={`/ ${channels.length}`}
          onClick={() => navigate("/channels")}
        />
        <Stat
          label="路由模型"
          value={totalModels}
          onClick={() => navigate("/channels")}
        />
      </div>

      <section className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-heading">最近请求</h2>
          <button
            onClick={() => navigate("/logs")}
            className="font-mono text-xs text-dim hover:text-mint transition-colors"
          >
            查看全部 →
          </button>
        </div>

        {recentLogs.length === 0 ? (
          <EmptyState message="还没有请求被路由。" />
        ) : (
          <div className="border border-line">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-line text-dim">
                  <th className="text-left py-2 px-3 font-normal">状态</th>
                  <th className="text-left py-2 px-3 font-normal">模型</th>
                  <th className="text-left py-2 px-3 font-normal">耗时</th>
                  <th className="text-left py-2 px-3 font-normal">时间</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log.id} className="border-b border-line/50">
                    <td className="py-2 px-3">
                      <span className={log.status_code === 200 ? "text-mint" : "text-rose"}>
                        {log.status_code}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-text">{log.model}</td>
                    <td className="py-2 px-3 text-dim">{log.duration_ms}ms</td>
                    <td className="py-2 px-3 text-dim">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {errorCount > 0 && (
        <div className="mt-8 px-4 py-3 border border-amber/30 bg-amber/5">
          <p className="font-mono text-xs text-amber">
            最近 {recentLogs.length} 次请求中有 {errorCount} 次返回错误。{" "}
            <button onClick={() => navigate("/logs")} className="underline">
              查看日志
            </button>
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  suffix,
  onClick,
}: {
  label: string
  value: number
  suffix?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="bg-panel px-6 py-8 text-left hover:bg-elevated transition-colors group"
    >
      <div className="font-mono text-[10px] text-dim uppercase tracking-widest mb-2">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-bold text-heading group-hover:text-mint transition-colors">
          {value}
        </span>
        {suffix && <span className="font-mono text-sm text-dim">{suffix}</span>}
      </div>
    </button>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-line px-6 py-10 text-center">
      <p className="font-mono text-xs text-dim">{message}</p>
    </div>
  )
}

function Notice({ message }: { message: string }) {
  return (
    <div className="mb-6 px-4 py-2 border border-rose/30 bg-rose/5">
      <p className="font-mono text-xs text-rose">{message}</p>
    </div>
  )
}
