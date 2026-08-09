import { useEffect, useState } from "react"
import { fetchAdminSettings, updateSettings } from "../api"
import type { AdminSettings } from "../types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Loader2, Check, Mail, Code, Building2 } from "lucide-react"

interface ProviderField {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
}

const PROVIDER_META: Record<string, { icon: typeof Code; docsUrl: string; fields: ProviderField[] }> = {
  github: {
    icon: Code,
    docsUrl: "https://github.com/settings/developers",
    fields: [
      { key: "client_id", label: "Client ID", placeholder: "Ov23li..." },
      { key: "client_secret", label: "Client Secret", secret: true, placeholder: "••••••" },
    ],
  },
  google: {
    icon: Mail,
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    fields: [
      { key: "client_id", label: "Client ID", placeholder: "xxxx.apps.googleusercontent.com" },
      { key: "client_secret", label: "Client Secret", secret: true, placeholder: "GOCSPX-..." },
    ],
  },
  wework: {
    icon: Building2,
    docsUrl: "https://developer.work.weixin.qq.com/document/path/91022",
    fields: [
      { key: "corpid", label: "企业 ID (CorpID)", placeholder: "ww..." },
      { key: "agentid", label: "应用 AgentID", placeholder: "1000002" },
      { key: "secret", label: "应用 Secret", secret: true, placeholder: "••••••" },
    ],
  },
}

export function Settings() {
  const [data, setData] = useState<AdminSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchAdminSettings()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!data) return
    setSaving(true)
    setError("")
    setSaved(false)
    try {
      await updateSettings({
        registration_enabled: data.registration_enabled,
        oauth_providers: data.oauth_providers.map((p) => ({
          provider: p.provider,
          enabled: p.enabled,
          config: p.config,
        })),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  const updateProvider = (provider: string, field: string, value: string | boolean) => {
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        oauth_providers: prev.oauth_providers.map((p) => {
          if (p.provider !== provider) return p
          if (field === "enabled") return { ...p, enabled: value as boolean }
          return { ...p, config: { ...p.config, [field]: String(value) } }
        }),
      }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>{error || "无法加载设置"}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">系统设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理自助注册和第三方登录
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
          {saving ? "保存中…" : saved ? "已保存" : "保存"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base">自助注册</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <div>
              <p className="text-sm font-medium">允许新用户自助注册</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                开启后，登录页面将显示注册入口
              </p>
            </div>
            <Switch
              checked={data.registration_enabled}
              onCheckedChange={(v) =>
                setData((prev) => (prev ? { ...prev, registration_enabled: v } : prev))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base">第三方登录</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.oauth_providers.map((p) => {
            const meta = PROVIDER_META[p.provider]
            const Icon = meta?.icon ?? Code
            return (
              <div key={p.provider} className="rounded-lg border border-border/50">
                <div className="flex items-center justify-between border-b border-border/40 p-4">
                  <div className="flex items-center gap-2.5">
                    <Icon className="size-4" />
                    <span className="text-sm font-medium">{p.name}</span>
                    <a
                      href={meta?.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary hover:underline"
                    >
                      获取凭据 →
                    </a>
                  </div>
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(v) => updateProvider(p.provider, "enabled", v)}
                  />
                </div>
                <div
                  className={`grid gap-3 p-4 transition-opacity ${
                    p.enabled ? "opacity-100" : "pointer-events-none opacity-40"
                  }`}
                >
                  {meta?.fields.map((f) => (
                    <div key={f.key} className="grid gap-1.5">
                      <Label htmlFor={`${p.provider}-${f.key}`} className="text-xs">
                        {f.label}
                      </Label>
                      <Input
                        id={`${p.provider}-${f.key}`}
                        type={f.secret ? "password" : "text"}
                        value={p.config[f.key] ?? ""}
                        onChange={(e) => updateProvider(p.provider, f.key, e.target.value)}
                        className="h-9 font-mono text-xs"
                        placeholder={f.placeholder}
                      />
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground">
                    回调地址：<code className="font-mono">{window.location.origin}/api/oauth/{p.provider}/callback</code>
                  </p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
