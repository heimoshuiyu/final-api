import { useEffect, useMemo, useState } from "react"
import { fetchPresets } from "../api"
import type { ModelPrice, ProviderPreset } from "../types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface FlatModel {
  modelId: string
  providerName: string
  cost: NonNullable<ProviderPreset["models"][number]["cost"]>
}

function fmtCost(v: number | undefined): string {
  if (v == null) return "—"
  return `$${parseFloat(v.toFixed(6))}`
}

export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

function hasNonZeroCost(cost: FlatModel["cost"]): boolean {
  const vals = [cost.input, cost.output, cost.cache_read, cost.cache_write]
  return vals.some((v) => v != null && v > 0)
}

export function PriceLookupDialog({
  open,
  onOpenChange,
  initialQuery,
  onSelect,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialQuery: string
  onSelect: (price: ModelPrice) => void
}) {
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [query, setQuery] = useState("")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setQuery(initialQuery || "")
      setSelectedKey(null)
      if (presets.length === 0) {
        fetchPresets().then(setPresets).catch(() => {})
      }
    }
  }, [open])

  const flatModels = useMemo<FlatModel[]>(() => {
    const list: FlatModel[] = []
    for (const p of presets) {
      for (const m of p.models) {
        if (m.cost && hasNonZeroCost(m.cost)) {
          list.push({ modelId: m.id, providerName: p.name, cost: m.cost })
        }
      }
    }
    return list
  }, [presets])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return flatModels.slice(0, 100)
    return flatModels
      .filter((m) => fuzzyMatch(q, m.modelId) || fuzzyMatch(q, m.providerName))
      .slice(0, 100)
  }, [query, flatModels])

  const handleSelect = (m: FlatModel) => {
    onSelect({
      input: m.cost.input,
      output: m.cost.output,
      cached: m.cost.cache_read,
      cache_creation: m.cost.cache_write,
    })
    onOpenChange(false)
  }

  const selectedModel = selectedKey
    ? filtered.find((f) => `${f.providerName}-${f.modelId}` === selectedKey)
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[80vh] flex-col gap-3 p-4"
        style={{ width: "fit-content", maxWidth: "calc(100vw - 2rem)" }}
      >
        <DialogHeader>
          <DialogTitle className="text-base">查询模型价格</DialogTitle>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索模型名称或服务商…"
            className="h-9 pl-9"
            autoFocus
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible rounded-md border border-border/40">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-background [&_tr]:border-b">
              <tr className="border-border/50">
                <th className="h-10 px-2 text-left align-middle text-[10px] font-medium uppercase tracking-wider">模型</th>
                <th className="h-10 px-2 text-left align-middle text-[10px] font-medium uppercase tracking-wider">服务商</th>
                <th className="h-10 px-2 text-right align-middle text-[10px] font-medium uppercase tracking-wider">输入</th>
                <th className="h-10 px-2 text-right align-middle text-[10px] font-medium uppercase tracking-wider">输出</th>
                <th className="h-10 px-2 text-right align-middle text-[10px] font-medium uppercase tracking-wider">缓存读</th>
                <th className="h-10 px-2 text-right align-middle text-[10px] font-medium uppercase tracking-wider">缓存写</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {filtered.map((m) => {
                const key = `${m.providerName}-${m.modelId}`
                return (
                  <tr
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    onDoubleClick={() => handleSelect(m)}
                    className={cn(
                      "cursor-pointer border-b border-border/30 font-mono text-xs transition-colors hover:bg-muted/50",
                      selectedKey === key && "bg-accent",
                    )}
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 align-middle font-medium">
                      {m.modelId}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 align-middle text-muted-foreground">
                      {m.providerName}
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle tabular-nums">{fmtCost(m.cost.input)}</td>
                    <td className="px-2 py-1.5 text-right align-middle tabular-nums">{fmtCost(m.cost.output)}</td>
                    <td className="px-2 py-1.5 text-right align-middle tabular-nums text-chart-2/80">{fmtCost(m.cost.cache_read)}</td>
                    <td className="px-2 py-1.5 text-right align-middle tabular-nums text-chart-3/80">{fmtCost(m.cost.cache_write)}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center align-middle">
                    <p className="text-sm text-muted-foreground">
                      {presets.length === 0 ? "加载中…" : "未找到匹配的模型"}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedModel && (
          <Button
            size="sm"
            className="w-full shrink-0"
            onClick={() => handleSelect(selectedModel)}
          >
            <Check className="size-3.5" />
            填入 {selectedModel.modelId}（{selectedModel.providerName}）
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
