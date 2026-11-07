-- 003_ai_business_scenes.sql — reserved business-scene definitions for Platform AI features.
CREATE TABLE IF NOT EXISTS ai_business_scenes (
  id          TEXT PRIMARY KEY,
  scene_key   TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  definition  TEXT NOT NULL DEFAULT '{}',
  createdAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_business_scenes_scene_key ON ai_business_scenes (scene_key);
