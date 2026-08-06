import { useCallback, useEffect, useMemo, useState } from "react"
import { createChannel, deleteChannel, fetchChannels, fetchPresets, updateChannel } from "../api"
import type { Channel, CreateChannelRequest, FormatOverride, ModelOverrideEntry, ProviderPreset } from "../types"

interface FormatEntry {
  format: string
  endpointUrl: string
  authType: string
}

interface ModelRow {
  name: string
  mappedTo: string
  weight: number
  formats: FormatEntry[]
}

const AUTH_LABELS: Record<string, string> = {
  bearer: "Bearer",
  "x-api-key": "x-api-key",
}

const FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: "chat/completions", label: "Chat" },
  { value: "messages", label: "Anthropic" },
  { value: "responses", label: "Responses" },
]

function formatLabel(fmt: string): string {
  return FORMAT_OPTIONS.find((f) => f.value === fmt)?.label ?? fmt
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

const inputCls =
  "w-full px-3 py-2 bg-base border border-line text-text text-sm focus:border-mint focus:outline-none transition-colors"

const subInputCls =
  "w-full px-2.5 py-1.5 bg-base border border-line text-text text-xs font-mono focus:border-mint focus:outline-none transition-colors"

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
  const [modelRows, setModelRows] = useState<ModelRow[]>([])
  const [expandedModels, setExpandedModels] = useState<Set<number>>(new Set())

  const [presetSearch, setPresetSearch] = useState("")
  const [showPresetList, setShowPresetList] = useState(false)
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [saving, setSaving] = useState(false)

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
    const q = presetSearch.toLowerCase().trim()
    if (!q) return presets
    return presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.models.some((m) => m.id.toLowerCase().includes(q)),
    )
  }, [presetSearch, presets])

  const resetForm = () => {
    setName("")
    setEndpointUrl("")
    setApiKey("")
    setAuthType("bearer")
    setWeight(1)
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
        return {
          name: m,
          mappedTo: mapping[m] || "",
          weight: modelWeight ?? 0,
          formats: Object.entries(fmtEntries).map(([fmt, ov]) => ({
            format: fmt,
            endpointUrl: ov.endpoint_url || "",
            authType: ov.auth_type || "",
          })),
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
            format: formatFromUrl(m.override?.endpoint_url || preset.endpoint_url),
            endpointUrl: m.override?.endpoint_url || "",
            authType: m.override?.auth_type || "",
          })
        }
        return { name: m.id, mappedTo: "", weight: 0, formats }
      }),
    )
    setShowPresetList(false)
    setPresetSearch("")
  }

  const addModelRow = () => {
    setModelRows((prev) => [...prev, { name: "", mappedTo: "", weight: 0, formats: [] }])
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
        const usedFormats = new Set(r.formats.map((f) => f.format))
        const nextFmt = FORMAT_OPTIONS.find((f) => !usedFormats.has(f.value))
        return {
          ...r,
          formats: [...r.formats, { format: nextFmt?.value || "chat/completions", endpointUrl: "", authType: "" }],
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
      for (const row of validRows) {
        const m = row.name.trim()
        if (row.mappedTo.trim()) model_mapping[m] = row.mappedTo.trim()
        const entry: ModelOverrideEntry = {}
        if (row.weight > 0) entry.weight = row.weight
        for (const fe of row.formats) {
          if (fe.endpointUrl.trim() || fe.authType) {
            const ov: FormatOverride = {}
            if (fe.endpointUrl.trim()) ov.endpoint_url = fe.endpointUrl.trim()
            if (fe.authType) ov.auth_type = fe.authType
            entry[fe.format] = ov
          }
        }
        if (Object.keys(entry).length > 0) model_overrides[m] = entry
      }

      const payload: CreateChannelRequest = {
        name: name.trim(),
        endpoint_url: endpointUrl.trim(),
        auth_type: authType,
        api_key: apiKey,
        models,
        weight,
        model_mapping,
        model_overrides,
      }

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
    <div style={{ animation: "slide-up 0.3s ease-out" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-heading" style={{ letterSpacing: "-0.02em" }}>
            渠道
          </h1>
          <p className="mt-2 text-sm text-dim">网关路由到的上游服务商。</p>
        </div>
        {!showForm && (
          <button
            onClick={openCreate}
            className="px-4 py-2 border border-bright-line text-sm text-text hover:border-mint hover:text-heading transition-colors"
          >
            添加渠道
          </button>
        )}
      </div>

      {error && (
        <div className="mt-6 px-4 py-2 border border-rose/30 bg-rose/5">
          <p className="font-mono text-xs text-rose">{error}</p>
        </div>
      )}

      {showForm && (
        <div className="mt-8 border border-bright-line bg-panel">
          {/* Preset import */}
          {!editingId && (
            <div className="border-b border-line px-6 py-4">
              {!showPresetList ? (
                <button onClick={() => setShowPresetList(true)} className="font-mono text-xs text-mint hover:underline">
                  + 从预置导入（{presets.length} 个服务商可选）
                </button>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] text-dim uppercase tracking-widest">从预置导入</span>
                    <button onClick={() => { setShowPresetList(false); setPresetSearch("") }} className="font-mono text-xs text-dim hover:text-text">
                      收起
                    </button>
                  </div>
                  <input
                    value={presetSearch}
                    onChange={(e) => setPresetSearch(e.target.value)}
                    placeholder="搜索服务商或模型…"
                    className={`${inputCls} mb-2`}
                  />
                  <div className="border border-line max-h-48 overflow-y-auto">
                    {filteredPresets.slice(0, 50).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => importPreset(p)}
                        className="w-full text-left px-3 py-2 text-sm border-b border-line/50 hover:bg-elevated transition-colors"
                      >
                        <span className="font-medium text-text">{p.name}</span>
                        <span className="font-mono text-[10px] text-dim ml-2">{p.models.length} 个模型</span>
                      </button>
                    ))}
                    {filteredPresets.length > 50 && (
                      <div className="px-3 py-2 font-mono text-[10px] text-dim text-center">
                        还有 {filteredPresets.length - 50} 个，请搜索缩小范围
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Channel settings */}
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="渠道名称">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="my-channel" />
              </Field>
              <Field label="权重">
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  className={`${inputCls} font-mono`}
                />
              </Field>
            </div>

            <Field label="端点 URL">
              <input
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                className={`${inputCls} font-mono text-xs`}
                placeholder="https://api.openai.com/v1/chat/completions"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="认证方式">
                <select value={authType} onChange={(e) => setAuthType(e.target.value)} className={inputCls}>
                  <option value="bearer">Bearer</option>
                  <option value="x-api-key">x-api-key</option>
                </select>
              </Field>
              <Field label="API 密钥">
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className={`${inputCls} font-mono`}
                  placeholder={editingId ? "留空则保持不变" : "sk-…"}
                  type="password"
                />
              </Field>
            </div>
          </div>

          {/* Models */}
          <div className="border-t border-line px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] text-dim uppercase tracking-widest">模型（{modelRows.length}）</span>
              <span className="font-mono text-[10px] text-dim">展开编辑映射与覆盖</span>
            </div>

            {modelRows.length > 0 ? (
              <div className="space-y-px">
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
                    onAddFormat={() => addFormatEntry(i)}
                    onUpdateFormat={(fi, patch) => updateFormatEntry(i, fi, patch)}
                    onRemoveFormat={(fi) => removeFormatEntry(i, fi)}
                  />
                ))}
              </div>
            ) : (
              <div className="border border-line px-4 py-8 text-center">
                <p className="font-mono text-xs text-dim">还没有模型，点击下方按钮添加。</p>
              </div>
            )}

            <button onClick={addModelRow} className="mt-3 font-mono text-xs text-mint hover:underline">
              + 添加模型
            </button>
          </div>

          {/* Actions */}
          <div className="border-t border-line px-6 py-4 flex gap-3">
            <button
              onClick={submit}
              disabled={saving}
              className="px-5 py-2 bg-mint text-base text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
            >
              {saving ? "保存中…" : editingId ? "更新渠道" : "保存渠道"}
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(false) }}
              className="px-5 py-2 border border-bright-line text-sm text-dim hover:text-text transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Channel list */}
      {channels.length === 0 && !showForm ? (
        <div className="mt-8 border border-line px-6 py-12 text-center">
          <p className="font-mono text-xs text-dim">还没有配置渠道，添加一个来开始路由。</p>
        </div>
      ) : (
        <div className="mt-8 space-y-px">
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} onDelete={remove} onEdit={openEdit} />
          ))}
        </div>
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
  onAddFormat,
  onUpdateFormat,
  onRemoveFormat,
}: {
  row: ModelRow
  expanded: boolean
  onToggle: () => void
  onRemove: () => void
  onUpdateName: (v: string) => void
  onUpdateMappedTo: (v: string) => void
  onUpdateWeight: (v: number) => void
  onAddFormat: () => void
  onUpdateFormat: (fi: number, patch: Partial<FormatEntry>) => void
  onRemoveFormat: (fi: number) => void
}) {
  const overrideSummary = [
    ...(row.weight > 0 ? [`权重 ${row.weight}`] : []),
    ...(row.mappedTo.trim() ? [`→ ${row.mappedTo}`] : []),
    ...row.formats.map((f) => formatLabel(f.format)),
  ]

  return (
    <div className="border border-line bg-base">
      {/* Header row — always uniform */}
      <div className="flex items-center px-3 py-2 gap-2">
        <input
          value={row.name}
          onChange={(e) => onUpdateName(e.target.value)}
          placeholder="模型名"
          className="flex-1 min-w-0 bg-transparent px-1 py-0.5 text-text font-mono text-xs focus:outline-none"
        />
        {/* Override summary badges */}
        <div className="flex gap-1 items-center min-w-0 flex-shrink-0">
          {overrideSummary.length > 0 && (
            <span className="font-mono text-[9px] text-amber px-1.5 py-0.5 border border-amber/30 whitespace-nowrap">
              {overrideSummary.length} 项覆盖
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="font-mono text-xs text-dim hover:text-text transition-colors px-1.5 flex-shrink-0"
          title={expanded ? "收起" : "展开"}
        >
          {expanded ? "▴" : "▾"}
        </button>
        <button
          onClick={onRemove}
          className="text-dim hover:text-rose transition-colors font-mono text-xs px-1.5 flex-shrink-0"
          title="删除模型"
        >
          ✕
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-line/60 px-3 py-3 space-y-3 bg-panel/30">
          {/* Mapping + weight row */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block font-mono text-[9px] text-dim uppercase tracking-wider mb-1">映射到</span>
              <input
                value={row.mappedTo}
                onChange={(e) => onUpdateMappedTo(e.target.value)}
                placeholder="继承原名"
                className={subInputCls}
              />
            </label>
            <label className="block">
              <span className="block font-mono text-[9px] text-dim uppercase tracking-wider mb-1">权重覆盖</span>
              <input
                type="number"
                value={row.weight || ""}
                onChange={(e) => onUpdateWeight(Number(e.target.value))}
                placeholder="继承渠道"
                className={subInputCls}
              />
            </label>
          </div>

          {/* Format overrides */}
          {row.formats.length > 0 && (
            <div className="space-y-1.5">
              <span className="block font-mono text-[9px] text-dim uppercase tracking-wider">格式覆盖</span>
              {row.formats.map((f, fi) => (
                <div key={fi} className="grid grid-cols-[7rem_1fr_7rem_auto] gap-1.5 items-center">
                  <select
                    value={f.format}
                    onChange={(e) => onUpdateFormat(fi, { format: e.target.value })}
                    className={subInputCls}
                  >
                    {FORMAT_OPTIONS.map((fo) => (
                      <option key={fo.value} value={fo.value}>{fo.label}</option>
                    ))}
                  </select>
                  <input
                    value={f.endpointUrl}
                    onChange={(e) => onUpdateFormat(fi, { endpointUrl: e.target.value })}
                    placeholder="端点 URL"
                    className={subInputCls}
                  />
                  <select
                    value={f.authType}
                    onChange={(e) => onUpdateFormat(fi, { authType: e.target.value })}
                    className={subInputCls}
                  >
                    <option value="">认证继承</option>
                    <option value="bearer">Bearer</option>
                    <option value="x-api-key">x-api-key</option>
                  </select>
                  <button
                    onClick={() => onRemoveFormat(fi)}
                    className="text-dim hover:text-rose transition-colors font-mono text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={onAddFormat}
            className="font-mono text-[10px] text-mint hover:underline"
          >
            + 添加格式覆盖
          </button>
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

  return (
    <div className="border border-line px-5 py-4 bg-panel hover:bg-elevated/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-dim">#{String(channel.id).padStart(2, "0")}</span>
            <span className="text-sm font-medium text-heading">{channel.name}</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-base border border-line text-dim">
              {AUTH_LABELS[channel.auth_type] || channel.auth_type}
            </span>
            {channel.status === 1 ? (
              <span className="w-1.5 h-1.5 bg-mint" style={{ borderRadius: "50%" }} />
            ) : (
              <span className="w-1.5 h-1.5 bg-dim" style={{ borderRadius: "50%" }} />
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-dim truncate">{channel.endpoint_url}</p>
        </div>
        <div className="flex gap-3 ml-4">
          <button onClick={() => onEdit(channel)} className="font-mono text-xs text-dim hover:text-mint transition-colors">编辑</button>
          <button onClick={() => onDelete(channel.id)} className="font-mono text-xs text-dim hover:text-rose transition-colors">删除</button>
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
              <span
                key={model}
                className={`font-mono text-[10px] px-2 py-0.5 bg-base text-text border ${hasOverride ? "border-amber/40" : "border-line"}`}
              >
                {model}
                {mapped && mapped !== model && <span className="text-mint"> → {mapped}</span>}
                {modelWeight !== undefined && (
                  <span className="text-mint"> ⚖{modelWeight}</span>
                )}
                {fmtKeys.map((fk) => (
                  <span key={fk} className="text-amber" title={(modelOv[fk] as FormatOverride)?.endpoint_url}>
                    {" "}⚡{formatLabel(fk)}
                  </span>
                ))}
              </span>
            )
          })}
        </div>
      )}

      <div className="mt-2 flex gap-4 font-mono text-[10px] text-dim flex-wrap">
        <span>权重 {channel.weight}</span>
        {mappingCount > 0 && <span>{mappingCount} 条映射</span>}
        {overrideCount > 0 && <span className="text-amber">{overrideCount} 个覆盖</span>}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] text-dim uppercase tracking-widest mb-1.5">{label}</span>
      {children}
    </label>
  )
}
