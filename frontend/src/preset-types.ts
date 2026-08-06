export interface ModelOverride {
  endpoint_url?: string
  auth_type?: string
}

export interface ProviderPreset {
  id: string
  name: string
  endpoint_url: string
  auth_type: string
  models: (string | [string, ModelOverride])[]
}

export function modelId(model: string | [string, ModelOverride]): string {
  return typeof model === "string" ? model : model[0]
}

export function modelOverride(model: string | [string, ModelOverride]): ModelOverride | undefined {
  return typeof model === "string" ? undefined : model[1]
}
