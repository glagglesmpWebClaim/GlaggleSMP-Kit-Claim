CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'fulfilled', 'rejected', 'expired')),
  message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS claims_status_expiry ON claims(status, expires_at);
CREATE INDEX IF NOT EXISTS claims_player_status ON claims(player_name, status);

CREATE TABLE IF NOT EXISTS submit_rates (
  player_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
