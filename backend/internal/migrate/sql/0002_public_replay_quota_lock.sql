CREATE TABLE IF NOT EXISTS public_replay_quota_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1)
);

INSERT OR IGNORE INTO public_replay_quota_lock (id) VALUES (1);
