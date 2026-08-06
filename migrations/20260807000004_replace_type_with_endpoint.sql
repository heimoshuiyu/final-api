-- Replace type/base_url/model_types with endpoint_url + auth_type + model_overrides
-- 1. Add new columns
ALTER TABLE channels ADD COLUMN IF NOT EXISTS endpoint_url TEXT NOT NULL DEFAULT '';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS auth_type VARCHAR(16) NOT NULL DEFAULT 'bearer';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS model_overrides JSONB NOT NULL DEFAULT '{}';

-- 2. Migrate existing data
-- Derive auth_type from old type column (14 = anthropic → x-api-key, else bearer)
UPDATE channels SET auth_type = CASE WHEN type = 14 THEN 'x-api-key' ELSE 'bearer' END;

-- Derive endpoint_url from base_url + type
UPDATE channels SET endpoint_url = CASE
  WHEN type = 14 THEN rtrim(base_url, '/') || '/messages'
  ELSE rtrim(base_url, '/') || '/chat/completions'
END;

-- Migrate model_types → model_overrides with per-model endpoint_url and auth_type
-- model_types was {"model": 14} where 14 means anthropic
UPDATE channels SET model_overrides = (
  SELECT jsonb_object_agg(
    key,
    CASE WHEN value::text::int = 14 THEN
      jsonb_build_object('auth_type', 'x-api-key')
    ELSE
      jsonb_build_object('auth_type', 'bearer')
    END
  )
  FROM jsonb_each(model_types)
) WHERE model_types IS NOT NULL AND model_types != '{}'::jsonb;

-- 3. Drop old columns
ALTER TABLE channels DROP COLUMN IF EXISTS type;
ALTER TABLE channels DROP COLUMN IF EXISTS base_url;
ALTER TABLE channels DROP COLUMN IF EXISTS model_types;
