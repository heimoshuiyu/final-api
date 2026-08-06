import { useCallback, useEffect, useState } from "react"
import { fetchLogs } from "../api"
import type { LogEntry } from "../types"

const PAGE_SIZE = 20

export function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState("")
  const [modelFilter, setModelFilter] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

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

  const handleFilter = () => {
    setPage(1)
  }

  return (
    <div style={{ animation: "slide-up 0.3s ease-out" }}>
      <h1 className="text-3xl font-bold text-heading" style={{ letterSpacing: "-0.02em" }}>
        请求
      </h1>
      <p className="mt-2 text-sm text-dim">
        所有通过网关路由的请求记录。<span className="font-mono">共 {total} 条</span>
      </p>

      {error && (
        <div className="mt-6 px-4 py-2 border border-rose/30 bg-rose/5">
          <p className="font-mono text-xs text-rose">{error}</p>
        </div>
      )}

      <div className="mt-8 flex gap-2">
        <input
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFilter()}
          placeholder="按模型名称筛选"
          className="flex-1 max-w-xs px-3 py-1.5 bg-panel border border-line text-text font-mono text-xs focus:border-mint focus:outline-none transition-colors"
        />
        <button
          onClick={handleFilter}
          className="px-3 py-1.5 border border-line text-xs text-dim hover:text-text hover:border-mint transition-colors font-mono"
        >
          筛选
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="mt-8 border border-line px-6 py-12 text-center">
          <p className="font-mono text-xs text-dim">
            {modelFilter
              ? `没有找到模型"${modelFilter}"的请求。`
              : "还没有请求记录。"}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 border border-line overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-line text-dim bg-panel">
                  <th className="text-left py-2 px-3 font-normal uppercase tracking-wider text-[10px]">
                    状态
                  </th>
                  <th className="text-left py-2 px-3 font-normal uppercase tracking-wider text-[10px]">
                    模型
                  </th>
                  <th className="text-left py-2 px-3 font-normal uppercase tracking-wider text-[10px]">
                    渠道
                  </th>
                  <th className="text-left py-2 px-3 font-normal uppercase tracking-wider text-[10px]">
                    流式
                  </th>
                  <th className="text-left py-2 px-3 font-normal uppercase tracking-wider text-[10px]">
                    耗时
                  </th>
                  <th className="text-left py-2 px-3 font-normal uppercase tracking-wider text-[10px]">
                    会话
                  </th>
                  <th className="text-left py-2 px-3 font-normal uppercase tracking-wider text-[10px]">
                    时间
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-line/40 hover:bg-panel/50">
                    <td className="py-2 px-3">
                      <span
                        className={
                          log.status_code === 200
                            ? "text-mint"
                            : log.status_code >= 500
                              ? "text-rose"
                              : "text-amber"
                        }
                      >
                        {log.status_code}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-text">{log.model || "—"}</td>
                    <td className="py-2 px-3 text-dim">
                      {log.channel_id ? `#${String(log.channel_id).padStart(2, "0")}` : "—"}
                    </td>
                    <td className="py-2 px-3 text-dim">{log.is_stream ? "是" : "—"}</td>
                    <td className="py-2 px-3 text-dim">{log.duration_ms}ms</td>
                    <td className="py-2 px-3 text-dim truncate max-w-[120px]">
                      {log.session_id || "—"}
                    </td>
                    <td className="py-2 px-3 text-dim whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("zh-CN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <span className="font-mono text-[10px] text-dim">
              第 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1 || loading}
                className="px-2 py-1 border border-line text-xs text-dim hover:text-text hover:border-mint transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-mono"
              >
                «
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="px-2 py-1 border border-line text-xs text-dim hover:text-text hover:border-mint transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-mono"
              >
                ‹
              </button>
              <span className="font-mono text-xs text-dim min-w-[60px] text-center">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="px-2 py-1 border border-line text-xs text-dim hover:text-text hover:border-mint transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-mono"
              >
                ›
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages || loading}
                className="px-2 py-1 border border-line text-xs text-dim hover:text-text hover:border-mint transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-mono"
              >
                »
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
