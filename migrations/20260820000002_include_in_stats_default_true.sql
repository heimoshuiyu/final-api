-- 默认计入统计：列默认值改为 TRUE，存量成员全部置为 TRUE
ALTER TABLE workspace_members ALTER COLUMN include_in_stats SET DEFAULT TRUE;
UPDATE workspace_members SET include_in_stats = TRUE;
