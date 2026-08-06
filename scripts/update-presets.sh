#!/bin/bash
# Download and generate provider presets from models.dev
set -e

OUT="frontend/src/provider-presets.json"

python3 -c "
import json, urllib.request

data = json.loads(urllib.request.urlopen('https://models.dev/api.json').read())

def detect_format(npm):
    if 'anthropic' in npm: return 'anthropic'
    if 'google' in npm or 'gemini' in npm: return 'gemini'
    return 'openai'

def build_endpoint(api_base, fmt):
    base = api_base.rstrip('/')
    if fmt == 'anthropic':
        if base.endswith('/v1'):
            return base + '/messages'
        else:
            return base + '/v1/messages'
    else:
        return base + '/chat/completions'

presets = []
for pid, pinfo in data.items():
    fmt = detect_format(pinfo.get('npm', ''))
    api_base = pinfo.get('api', '')
    auth = 'x-api-key' if fmt == 'anthropic' else 'bearer'
    endpoint = build_endpoint(api_base, fmt) if api_base else ''

    models = []
    for mid, minfo in pinfo.get('models', {}).items():
        model_prov = minfo.get('provider', {})
        model_npm = model_prov.get('npm', '')
        model_fmt = detect_format(model_npm) if model_npm else fmt

        if model_fmt != fmt:
            m_endpoint = build_endpoint(api_base, model_fmt) if api_base else ''
            m_auth = 'x-api-key' if model_fmt == 'anthropic' else 'bearer'
            models.append([mid, {'endpoint_url': m_endpoint, 'auth_type': m_auth}])
        else:
            models.append(mid)

    presets.append({
        'id': pinfo.get('id', pid),
        'name': pinfo.get('name', pid),
        'endpoint_url': endpoint,
        'auth_type': auth,
        'models': models,
    })

presets.sort(key=lambda x: x['name'].lower())

with open('$OUT', 'w') as f:
    json.dump(presets, f, ensure_ascii=False, separators=(',',':'))

print(f'Generated {len(presets)} providers, {sum(len(p[\"models\"]) for p in presets)} models → $OUT')
"
