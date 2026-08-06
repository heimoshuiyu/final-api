import { useCallback, useEffect, useState } from "react"
import { createToken, deleteToken, fetchTokens } from "../api"
import type { Token } from "../types"

export function Tokens() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set())
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setTokens(await fetchTokens())
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载令牌失败")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    setError("")
    try {
      await createToken({ name: name.trim() })
      setName("")
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建令牌失败")
    } finally {
      setCreating(false)
    }
  }

  const remove = async (id: number) => {
    try {
      await deleteToken(id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除令牌失败")
    }
  }

  const toggleReveal = (id: number) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyKey = (id: number, key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div style={{ animation: "slide-up 0.3s ease-out" }}>
      <h1 className="text-3xl font-bold text-heading" style={{ letterSpacing: "-0.02em" }}>
        令牌
      </h1>
      <p className="mt-2 text-sm text-dim">
        用于通过网关认证请求的 API 密钥。
      </p>

      {error && (
        <div className="mt-6 px-4 py-2 border border-rose/30 bg-rose/5">
          <p className="font-mono text-xs text-rose">{error}</p>
        </div>
      )}

      <div className="mt-8 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="令牌名称"
          className="flex-1 px-3 py-2 bg-panel border border-line text-text font-mono text-sm focus:border-mint focus:outline-none transition-colors"
        />
        <button
          onClick={create}
          disabled={creating || !name.trim()}
          className="px-5 py-2 bg-mint text-base text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
        >
          创建令牌
        </button>
      </div>

      {tokens.length === 0 ? (
        <div className="mt-8 border border-line px-6 py-12 text-center">
          <p className="font-mono text-xs text-dim">
            还没有令牌，创建一个来开始路由请求。
          </p>
        </div>
      ) : (
        <div className="mt-8 border border-line">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-dim">
                <th className="text-left py-2.5 px-4 font-mono text-[10px] uppercase tracking-widest font-normal">
                  名称
                </th>
                <th className="text-left py-2.5 px-4 font-mono text-[10px] uppercase tracking-widest font-normal">
                  密钥
                </th>
                <th className="text-left py-2.5 px-4 font-mono text-[10px] uppercase tracking-widest font-normal">
                  状态
                </th>
                <th className="text-left py-2.5 px-4 font-mono text-[10px] uppercase tracking-widest font-normal">
                  创建时间
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => {
                const revealed = revealedIds.has(token.id)
                return (
                  <tr key={token.id} className="border-b border-line/50 hover:bg-panel/50">
                    <td className="py-2.5 px-4 text-sm text-text">{token.name}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-text">
                          {revealed ? token.key : `${token.key.slice(0, 10)}…${token.key.slice(-4)}`}
                        </span>
                        <button
                          onClick={() => toggleReveal(token.id)}
                          className="font-mono text-[10px] text-dim hover:text-mint transition-colors"
                        >
                          {revealed ? "隐藏" : "显示"}
                        </button>
                        {revealed && (
                          <button
                            onClick={() => copyKey(token.id, token.key)}
                            className="font-mono text-[10px] text-dim hover:text-mint transition-colors"
                          >
                            {copiedId === token.id ? "已复制" : "复制"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusBadge status={token.status} />
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-dim">
                      {new Date(token.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => remove(token.id)}
                        className="font-mono text-xs text-dim hover:text-rose transition-colors"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: number }) {
  if (status === 1) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 bg-mint" style={{ borderRadius: "50%" }} />
        <span className="font-mono text-[10px] text-mint uppercase">活跃</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 bg-dim" style={{ borderRadius: "50%" }} />
      <span className="font-mono text-[10px] text-dim uppercase">停用</span>
    </span>
  )
}
