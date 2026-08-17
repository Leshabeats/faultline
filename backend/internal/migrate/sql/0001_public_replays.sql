CREATE TABLE IF NOT EXISTS public_replays (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  delete_token_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS public_replays_created_at_idx
  ON public_replays (created_at);
