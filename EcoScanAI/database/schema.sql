CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  eco_point_searches INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detections (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  bin TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT '',
  decomposition TEXT NOT NULL DEFAULT '',
  fact TEXT NOT NULL DEFAULT '',
  confidence DOUBLE PRECISION,
  source TEXT NOT NULL DEFAULT 'camera',
  model TEXT NOT NULL DEFAULT 'COCO-SSD',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detections_uid_date ON detections(uid, detected_at DESC);
