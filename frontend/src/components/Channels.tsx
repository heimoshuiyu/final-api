import { useCallback, useEffect, useMemo, useState } from "react"
import { createChannel, deleteChannel, fetchChannels, fetchPresets, updateChannel } from "../api"
import type { Channel, CreateChannelRequest, FormatOverride, ModelOverrideEntry, ModelPrice, ProviderPreset } from "../types"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Search,
  Loader2,
  AlertCircle,
  Pencil,
  DollarSign,
} from "lucide-react"
import { PriceLookupDialog, fuzzyMatch } from "./PriceLookupDialog"

interface FormatEntry {
  endpointUrl: string
  authType: string
}

interface ModelRow {
  name: string
  mappedTo: string
  weight: number
  formats: FormatEntry[]
  priceInput: string
  priceOutput: string
  priceCached: string
  priceCacheCreation: string
}

function formatFromUrl(url: string): string {
  if (url.endsWith("/messages")) return "messages"
  if (url.endsWith("/chat/completions")) return "chat/completions"
  if (url.endsWith("/responses")) return "responses"
  if (url.endsWith("/completions")) return "completions"
  if (url.endsWith("/embeddings")) return "embeddings"
  if (url.endsWith("/moderations")) return "moderations"
  return "chat/completions"
}

export function Channels() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [error, setError] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const [name, setName] = useState("")
  const [endpointUrl, setEndpointUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [authType, setAuthType] = useState("bearer")
  const [weight, setWeight] = useState(1)
  const [maxConcurrency, setMaxConcurrency] = useState(0)
  const [priority, setPriority] = useState(0)
  const [modelRows, setModelRows] = useState<ModelRow[]>([])
  const [expandedModels, setExpandedModels] = useState<Set<number>>(new Set())

  const [presetSearch, setPresetSearch] = useState("")
  const [showPresetList, setShowPresetList] = useState(false)
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [saving, setSaving] = useState(false)
  const [priceLookupIndex, setPriceLookupIndex] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setChannels(await fetchChannels())
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载渠道失败")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    fetchPresets().then(setPresets).catch(() => {})
  }, [])

  const filteredPresets = useMemo(() => {
    const q = presetSearch.trim()
    if (!q) return presets
    return presets.filter(
      (p) =>
        fuzzyMatch(q, p.name) ||
        fuzzyMatch(q, p.id) ||
        p.models.some((m) => fuzzyMatch(q, m.id)),
    )
  }, [presetSearch, presets])

  const resetForm = () => {
    setName("")
    setEndpointUrl("")
    setApiKey("")
    setAuthType("bearer")
    setWeight(1)
    setMaxConcurrency(0)
    setPriority(0)
    setModelRows([])
    setExpandedModels(new Set())
    setPresetSearch("")
    setShowPresetList(false)
    setEditingId(null)
    setError("")
  }

  const openCreate = () => {
    resetForm()
    setShowForm(true)
  }

  const openEdit = (ch: Channel) => {
    resetForm()
    setEditingId(ch.id)
    setName(ch.name)
    setEndpointUrl(ch.endpoint_url)
    setAuthType(ch.auth_type)
    setWeight(ch.weight)
    setMaxConcurrency(ch.max_concurrency ?? 0)
    setPriority(ch.priority ?? 0)
    const mapping = ch.model_mapping || {}
    const overrides = ch.model_overrides || {}
    setModelRows(
      ch.models.map((m) => {
        const modelFmts = overrides[m] || {}
        const modelWeight = modelFmts.weight as number | undefined
        const fmtEntries: Record<string, FormatOverride> = {}
        for (const [k, v] of Object.entries(modelFmts)) {
          if (k !== "weight" && typeof v === "object" && v !== null) {
            fmtEntries[k] = v as FormatOverride
          }
        }
        const prices = ch.model_prices?.[m] || {}
        return {
          name: m,
          mappedTo: mapping[m] || "",
          weight: modelWeight ?? 0,
          formats: Object.entries(fmtEntries).map(([fmt, ov]) => ({
            format: fmt,
            endpointUrl: ov.endpoint_url || "",
            authType: ov.auth_type || "inherit",
          })),
          priceInput: prices.input != null ? String(prices.input) : "",
          priceOutput: prices.output != null ? String(prices.output) : "",
          priceCached: prices.cached != null ? String(prices.cached) : "",
          priceCacheCreation: prices.cache_creation != null ? String(prices.cache_creation) : "",
        }
      }),
    )
    setShowForm(true)
  }

  const importPreset = (preset: ProviderPreset) => {
    setName(preset.name)
    setEndpointUrl(preset.endpoint_url)
    setAuthType(preset.auth_type)
    setModelRows(
      preset.models.map((m) => {
        const formats: FormatEntry[] = []
        if (m.override?.endpoint_url || m.override?.auth_type) {
          formats.push({
            endpointUrl: m.override?.endpoint_url || "",
            authType: m.override?.auth_type || "inherit",
          })
        }
        const c = m.cost
        return {
          name: m.id,
          mappedTo: "",
          weight: 0,
          formats,
          priceInput: c?.input != null ? String(c.input) : "",
          priceOutput: c?.output != null ? String(c.output) : "",
          priceCached: c?.cache_read != null ? String(c.cache_read) : "",
          priceCacheCreation: c?.cache_write != null ? String(c.cache_write) : "",
        }
      }),
    )
    setShowPresetList(false)
    setPresetSearch("")
  }

  const addModelRow = () => {
    setModelRows((prev) => [...prev, { name: "", mappedTo: "", weight: 0, formats: [], priceInput: "", priceOutput: "", priceCached: "", priceCacheCreation: "" }])
  }

  const updateModelRow = (index: number, patch: Partial<ModelRow>) => {
    setModelRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const toggleExpand = (index: number) => {
    setExpandedModels((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const addFormatEntry = (modelIndex: number) => {
    setModelRows((prev) =>
      prev.map((r, i) => {
        if (i !== modelIndex) return r
        return {
          ...r,
          formats: [...r.formats, { endpointUrl: "", authType: "inherit" }],
        }
      }),
    )
  }

  const updateFormatEntry = (modelIndex: number, fmtIndex: number, patch: Partial<FormatEntry>) => {
    setModelRows((prev) =>
      prev.map((r, i) => {
        if (i !== modelIndex) return r
        return { ...r, formats: r.formats.map((f, fi) => (fi === fmtIndex ? { ...f, ...patch } : f)) }
      }),
    )
  }

  const removeFormatEntry = (modelIndex: number, fmtIndex: number) => {
    setModelRows((prev) =>
      prev.map((r, i) => {
        if (i !== modelIndex) return r
        return { ...r, formats: r.formats.filter((_, fi) => fi !== fmtIndex) }
      }),
    )
  }

  const removeModelRow = (index: number) => {
    setModelRows((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = async () => {
    setError("")
    const validRows = modelRows.filter((r) => r.name.trim())
    if (validRows.length === 0) {
      setError("请至少添加一个模型")
      return
    }
    if (!name.trim() || !endpointUrl.trim() || (!apiKey && !editingId)) {
      setError("请填写渠道名称、端点 URL 和 API 密钥")
      return
    }

    setSaving(true)
    try {
      const models = validRows.map((r) => r.name.trim())
      const model_mapping: Record<string, string> = {}
      const model_overrides: Record<string, ModelOverrideEntry> = {}
      const model_prices: Record<string, ModelPrice> = {}
      for (const row of validRows) {
        const m = row.name.trim()
        if (row.mappedTo.trim()) model_mapping[m] = row.mappedTo.trim()
        const entry: ModelOverrideEntry = {}
        if (row.weight > 0) entry.weight = row.weight
        for (const fe of row.formats) {
          if (fe.endpointUrl.trim()) {
            const fmtKey = formatFromUrl(fe.endpointUrl.trim())
            const ov: FormatOverride = {}
            ov.endpoint_url = fe.endpointUrl.trim()
            const at = fe.authType === "inherit" ? "" : fe.authType
            if (at) ov.auth_type = at
            entry[fmtKey] = ov
          }
        }
        if (Object.keys(entry).length > 0) model_overrides[m] = entry

        const price: ModelPrice = {}
        const pi = parseFloat(row.priceInput)
        const po = parseFloat(row.priceOutput)
        const pc = parseFloat(row.priceCached)
        const pcc = parseFloat(row.priceCacheCreation)
        if (!isNaN(pi) && pi >= 0) price.input = pi
        if (!isNaN(po) && po >= 0) price.output = po
        if (!isNaN(pc) && pc >= 0) price.cached = pc
        if (!isNaN(pcc) && pcc >= 0) price.cache_creation = pcc
        if (Object.keys(price).length > 0) model_prices[m] = price
      }

      const payload: CreateChannelRequest = {
        name: name.trim(),
        endpoint_url: endpointUrl.trim(),
        auth_type: authType,
        api_key: apiKey,
        models,
        priority,
        weight,
        model_mapping,
        model_overrides,
        max_concurrency: maxConcurrency,
      }
      if (Object.keys(model_prices).length > 0) payload.model_prices = model_prices

      if (editingId) {
        await updateChannel(editingId, payload)
      } else {
        await createChannel(payload)
      }
      resetForm()
      setShowForm(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存渠道失败")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    try {
      await deleteChannel(id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除渠道失败")
    }
  }

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">渠道</h1>
          <p className="mt-1 text-sm text-muted-foreground">网关路由到的上游服务商。</p>
        </div>
        {!showForm && (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            添加渠道
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showForm && (
        <Card className="glass-panel glow-border mt-6 border-0 animate-scale-in">
          {/* Preset import */}
          {!editingId && (
            <div className="border-b border-border/50 px-6 py-4">
              {!showPresetList ? (
                <Button variant="link" className="h-auto p-0 text-chart-2" onClick={() => setShowPresetList(true)}>
                  + 从预置导入（{presets.length} 个服务商可选）
                </Button>
              ) : (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      从预置导入
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setShowPresetList(false)
                        setPresetSearch("")
                      }}
                    >
                      收起
                    </Button>
                  </div>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={presetSearch}
                      onChange={(e) => setPresetSearch(e.target.value)}
                      placeholder="搜索服务商或模型…"
                      className="pl-9"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border/50">
                    {filteredPresets.slice(0, 50).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => importPreset(p)}
                        className="flex w-full items-center justify-between border-b border-border/30 px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent"
                      >
                        <span className="font-medium">{p.name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {p.models.length} 模型
                        </Badge>
                      </button>
                    ))}
                    {filteredPresets.length > 50 && (
                      <div className="px-3 py-2 text-center text-[10px] text-muted-foreground">
                        还有 {filteredPresets.length - 50} 个，请搜索缩小范围
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Channel settings */}
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>渠道名称</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-channel" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-2">
                  <Label>优先级</Label>
                  <Input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="font-mono"
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>权重</Label>
                  <Input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                    className="font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>最大并发（0 = 无限制）</Label>
              <Input
                type="number"
                value={maxConcurrency}
                onChange={(e) => setMaxConcurrency(Number(e.target.value))}
                className="font-mono"
                placeholder="0"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>端点 URL</Label>
              <Input
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                className="font-mono text-xs"
                placeholder="https://api.openai.com/v1/chat/completions"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>认证方式</Label>
                <Select value={authType} onValueChange={setAuthType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bearer">Bearer</SelectItem>
                    <SelectItem value="x-api-key">x-api-key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>API 密钥</Label>
                <Input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono"
                  placeholder={editingId ? "留空则保持不变" : "sk-…"}
                  type="password"
                />
              </div>
            </div>
          </CardContent>

          {/* Models */}
          <div className="border-t border-border/50 px-6 py-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                模型（{modelRows.length}）
              </span>
              <span className="text-xs text-muted-foreground">展开编辑映射与覆盖</span>
            </div>

            {modelRows.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {modelRows.map((row, i) => (
                  <ModelCard
                    key={i}
                    row={row}
                    expanded={expandedModels.has(i)}
                    onToggle={() => toggleExpand(i)}
                    onRemove={() => removeModelRow(i)}
                    onUpdateName={(v) => updateModelRow(i, { name: v })}
                    onUpdateMappedTo={(v) => updateModelRow(i, { mappedTo: v })}
                    onUpdateWeight={(v) => updateModelRow(i, { weight: v })}
                    onUpdatePriceInput={(v) => updateModelRow(i, { priceInput: v })}
                    onUpdatePriceOutput={(v) => updateModelRow(i, { priceOutput: v })}
                    onUpdatePriceCached={(v) => updateModelRow(i, { priceCached: v })}
                    onUpdatePriceCacheCreation={(v) => updateModelRow(i, { priceCacheCreation: v })}
                    onAddFormat={() => addFormatEntry(i)}
                    onUpdateFormat={(fi, patch) => updateFormatEntry(i, fi, patch)}
                    onRemoveFormat={(fi) => removeFormatEntry(i, fi)}
                    onPriceLookup={() => setPriceLookupIndex(i)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border/50 py-8 text-center">
                <p className="text-xs text-muted-foreground">还没有模型，点击下方按钮添加。</p>
              </div>
            )}

            <Button variant="link" className="mt-3 h-auto p-0 text-chart-2" onClick={addModelRow}>
              + 添加模型
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 border-t border-border/50 px-6 py-4">
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "保存中…" : editingId ? "更新渠道" : "保存渠道"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                resetForm()
                setShowForm(false)
              }}
            >
              取消
            </Button>
          </div>
        </Card>
      )}

      {/* Channel list */}
      {channels.length === 0 && !showForm ? (
        <div className="glass-panel mt-8 rounded-xl border border-border/50 py-12 text-center">
          <p className="text-sm text-muted-foreground">还没有配置渠道，添加一个来开始路由。</p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-2">
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} onDelete={remove} onEdit={openEdit} />
          ))}
        </div>
      )}

      {priceLookupIndex != null && (
        <PriceLookupDialog
          open={priceLookupIndex != null}
          onOpenChange={(v) => !v && setPriceLookupIndex(null)}
          initialQuery={modelRows[priceLookupIndex]?.name || ""}
          onSelect={(price) => {
            updateModelRow(priceLookupIndex, {
              priceInput: price.input != null ? String(price.input) : "",
              priceOutput: price.output != null ? String(price.output) : "",
              priceCached: price.cached != null ? String(price.cached) : "",
              priceCacheCreation: price.cache_creation != null ? String(price.cache_creation) : "",
            })
          }}
        />
      )}
    </div>
  )
}

function ModelCard({
  row,
  expanded,
  onToggle,
  onRemove,
  onUpdateName,
  onUpdateMappedTo,
  onUpdateWeight,
  onUpdatePriceInput,
  onUpdatePriceOutput,
  onUpdatePriceCached,
  onUpdatePriceCacheCreation,
  onAddFormat,
  onUpdateFormat,
  onRemoveFormat,
  onPriceLookup,
}: {
  row: ModelRow
  expanded: boolean
  onToggle: () => void
  onRemove: () => void
  onUpdateName: (v: string) => void
  onUpdateMappedTo: (v: string) => void
  onUpdateWeight: (v: number) => void
  onUpdatePriceInput: (v: string) => void
  onUpdatePriceOutput: (v: string) => void
  onUpdatePriceCached: (v: string) => void
  onUpdatePriceCacheCreation: (v: string) => void
  onAddFormat: () => void
  onUpdateFormat: (fi: number, patch: Partial<FormatEntry>) => void
  onRemoveFormat: (fi: number) => void
  onPriceLookup: () => void
}) {
  const overrideSummary = [
    ...(row.weight > 0 ? [`权重 ${row.weight}`] : []),
    ...(row.mappedTo.trim() ? [`→ ${row.mappedTo}`] : []),
    ...row.formats.map((f) => f.endpointUrl.trim() ? formatFromUrl(f.endpointUrl.trim()) : null).filter(Boolean),
    ...((row.priceInput || row.priceOutput) ? [`$${row.priceInput || "0"}/${row.priceOutput || "0"}`] : []),
  ]

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/20">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          value={row.name}
          onChange={(e) => onUpdateName(e.target.value)}
          placeholder="模型名"
          className="min-w-0 flex-1 bg-transparent px-1 py-0.5 font-mono text-xs outline-none"
        />
        <div className="flex shrink-0 items-center gap-1">
          {overrideSummary.length > 0 && (
            <Badge variant="secondary" className="bg-chart-3/10 text-chart-3">
              {overrideSummary.length} 项覆盖
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onToggle}>
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border/50 bg-card/30 px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">映射到</Label>
              <Input
                value={row.mappedTo}
                onChange={(e) => onUpdateMappedTo(e.target.value)}
                placeholder="继承原名"
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">权重覆盖</Label>
              <Input
                type="number"
                value={row.weight || ""}
                onChange={(e) => onUpdateWeight(Number(e.target.value))}
                placeholder="继承渠道"
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px]">价格（USD / 1M tokens）</Label>
              <Button
                variant="link"
                size="xs"
                className="h-auto gap-1 p-0 text-chart-3"
                onClick={onPriceLookup}
              >
                <DollarSign className="size-3" />
                查价
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <Input
                type="number"
                step="0.01"
                value={row.priceInput}
                onChange={(e) => onUpdatePriceInput(e.target.value)}
                placeholder="输入"
                className="h-8 font-mono text-xs"
              />
              <Input
                type="number"
                step="0.01"
                value={row.priceOutput}
                onChange={(e) => onUpdatePriceOutput(e.target.value)}
                placeholder="输出"
                className="h-8 font-mono text-xs"
              />
              <Input
                type="number"
                step="0.01"
                value={row.priceCached}
                onChange={(e) => onUpdatePriceCached(e.target.value)}
                placeholder="缓存读"
                className="h-8 font-mono text-xs"
              />
              <Input
                type="number"
                step="0.01"
                value={row.priceCacheCreation}
                onChange={(e) => onUpdatePriceCacheCreation(e.target.value)}
                placeholder="缓存写"
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>

          {row.formats.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px]">端点配置</Label>
              {row.formats.map((f, fi) => (
                <div key={fi} className="grid grid-cols-[1fr_7rem_auto] items-center gap-1.5">
                  <Input
                    value={f.endpointUrl}
                    onChange={(e) => onUpdateFormat(fi, { endpointUrl: e.target.value })}
                    placeholder="端点 URL"
                    className="h-8 font-mono text-xs"
                  />
                  <Select
                    value={f.authType}
                    onValueChange={(v) => onUpdateFormat(fi, { authType: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="认证继承" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">认证继承</SelectItem>
                      <SelectItem value="bearer">Bearer</SelectItem>
                      <SelectItem value="x-api-key">x-api-key</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon-xs" onClick={() => onRemoveFormat(fi)} className="text-muted-foreground hover:text-destructive">
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button variant="link" className="h-auto p-0 text-chart-2" onClick={onAddFormat}>
            + 添加端点配置
          </Button>
        </div>
      )}
    </div>
  )
}

function ChannelCard({
  channel,
  onDelete,
  onEdit,
}: {
  channel: Channel
  onDelete: (id: number) => void
  onEdit: (channel: Channel) => void
}) {
  const mapping = channel.model_mapping || {}
  const overrides = channel.model_overrides || {}
  const mappingCount = Object.values(mapping).filter(Boolean).length
  const overrideCount = Object.values(overrides).filter((fmts) => Object.keys(fmts).length > 0).length
  const priceCount = Object.keys(channel.model_prices || {}).length

  return (
    <Card className="glass-panel glow-border card-hover border-0 px-5 py-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs text-muted-foreground">#{String(channel.id).padStart(2, "0")}</span>
            <span className="text-sm font-semibold">{channel.name}</span>
            <Badge variant="secondary" className="text-[10px]">
              {channel.auth_type}
            </Badge>
            {channel.status === 1 ? (
              <span className="size-1.5 rounded-full bg-chart-2" />
            ) : (
              <span className="size-1.5 rounded-full bg-muted-foreground" />
            )}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{channel.endpoint_url}</p>
        </div>
        <div className="ml-4 flex gap-1">
          <Button variant="ghost" size="icon-xs" onClick={() => onEdit(channel)} className="text-muted-foreground hover:text-chart-2">
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => onDelete(channel.id)} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {channel.models.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {channel.models.map((model) => {
            const mapped = mapping[model]
            const modelOv = overrides[model] || {}
            const modelWeight = modelOv.weight as number | undefined
            const fmtKeys = Object.keys(modelOv).filter((k) => k !== "weight")
            const hasOverride = fmtKeys.length > 0 || modelWeight !== undefined
            return (
              <Badge
                key={model}
                variant="outline"
                className={cn(
                  "gap-0.5 font-mono text-[10px]",
                  hasOverride ? "border-chart-3/40" : "border-border/50",
                )}
              >
                {model}
                {mapped && mapped !== model && <span className="text-chart-2"> → {mapped}</span>}
                {modelWeight !== undefined && <span className="text-chart-2"> ⚖{modelWeight}</span>}
                {fmtKeys.map((fk) => (
                  <span key={fk} className="text-chart-3" title={(modelOv[fk] as FormatOverride)?.endpoint_url}>
                    {" "}⚡{fk}
                  </span>
                ))}
              </Badge>
            )
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-4 font-mono text-[10px] text-muted-foreground">
        {channel.priority > 0 && <span>优先级 {channel.priority}</span>}
        <span>权重 {channel.weight}</span>
        {channel.max_concurrency > 0 && <span>并发 ≤ {channel.max_concurrency}</span>}
        {mappingCount > 0 && <span>{mappingCount} 条映射</span>}
        {overrideCount > 0 && <span className="text-chart-3">{overrideCount} 个覆盖</span>}
        {priceCount > 0 && <span className="text-chart-2">{priceCount} 个价格</span>}
      </div>
    </Card>
  )
}
