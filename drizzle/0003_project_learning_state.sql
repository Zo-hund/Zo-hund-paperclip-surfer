CREATE TABLE IF NOT EXISTS project_learning_state (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS project_learning_lookup_idx
  ON project_learning_state (tenant_id, project_id, learner_id, updated_at);
