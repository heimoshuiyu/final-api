-- Migrate model_overrides from flat {endpoint_url, auth_type} to format-keyed structure
-- Old: {"model": {"endpoint_url": "...", "auth_type": "..."}}
-- New: {"model": {"chat/completions": {"endpoint_url": "...", "auth_type": "..."}}}
DO $$
DECLARE
    ch RECORD;
    new_overrides jsonb;
    model_key text;
    model_val jsonb;
    endpoint_url text;
    fmt_key text;
BEGIN
    FOR ch IN SELECT id, model_overrides FROM channels WHERE model_overrides IS NOT NULL AND model_overrides != '{}'::jsonb
    LOOP
        new_overrides := '{}'::jsonb;
        FOR model_key, model_val IN SELECT * FROM jsonb_each(ch.model_overrides)
        LOOP
            IF model_val ? 'endpoint_url' THEN
                endpoint_url := model_val->>'endpoint_url';
                IF endpoint_url LIKE '%/messages' THEN
                    fmt_key := 'messages';
                ELSIF endpoint_url LIKE '%/chat/completions' THEN
                    fmt_key := 'chat/completions';
                ELSIF endpoint_url LIKE '%/responses' THEN
                    fmt_key := 'responses';
                ELSIF endpoint_url LIKE '%/completions' THEN
                    fmt_key := 'completions';
                ELSIF endpoint_url LIKE '%/embeddings' THEN
                    fmt_key := 'embeddings';
                ELSIF endpoint_url LIKE '%/moderations' THEN
                    fmt_key := 'moderations';
                ELSE
                    fmt_key := 'chat/completions';
                END IF;
                new_overrides := new_overrides || jsonb_build_object(
                    model_key,
                    jsonb_build_object(fmt_key, model_val)
                );
            ELSE
                new_overrides := new_overrides || jsonb_build_object(model_key, model_val);
            END IF;
        END LOOP;
        UPDATE channels SET model_overrides = new_overrides WHERE id = ch.id;
    END LOOP;
END $$;
