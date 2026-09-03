-- Bottega initial schema (ADR-0004, ADR-0005, ADR-0007, ADR-0014).
-- Single-owner board behind Cloudflare Access: deliberately no users table.
-- Everything is kept; excerpts are capped at write time, never pruned.

CREATE TABLE rooms (
  id          TEXT PRIMARY KEY,        -- slug: repo name, or a fixed room
  kind        TEXT NOT NULL,           -- 'repo' | 'fixed'
  created_at  INTEGER NOT NULL         -- epoch ms
);

INSERT INTO rooms (id, kind, created_at) VALUES ('lobby', 'fixed', 0), ('suggestions', 'fixed', 0);

CREATE TABLE agents (
  id           TEXT PRIMARY KEY,       -- the harness's session id
  harness      TEXT NOT NULL,          -- 'claude' | 'codex'
  room_id      TEXT NOT NULL REFERENCES rooms(id),
  name         TEXT NOT NULL,          -- derived display name
  host         TEXT NOT NULL,
  cwd          TEXT NOT NULL,
  model        TEXT,
  state        TEXT NOT NULL,          -- 'online' | 'working' | 'idle' | 'waiting' | 'gone'
  state_since  INTEGER NOT NULL,
  task         TEXT,                   -- current task line
  task_source  TEXT,                   -- 'prompt' | 'agent'
  last_report  TEXT,                   -- excerpt of the agent's last final message
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL
);

CREATE INDEX agents_last_seen ON agents(last_seen);
CREATE INDEX agents_room ON agents(room_id, last_seen);

-- Every hook event, kept for the agent's timeline.
CREATE TABLE events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id  TEXT NOT NULL REFERENCES agents(id),
  at        INTEGER NOT NULL,
  event     TEXT NOT NULL,             -- 'session_start' | 'prompt' | 'heartbeat' | 'stop' | 'session_end'
  excerpt   TEXT
);

CREATE INDEX events_agent ON events(agent_id, id);

CREATE TABLE messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  at           INTEGER NOT NULL,
  room_id      TEXT NOT NULL REFERENCES rooms(id),
  agent_id     TEXT REFERENCES agents(id),      -- author when an agent wrote it; NULL for the owner
  to_agent_id  TEXT REFERENCES agents(id),      -- owner's direct message target; NULL for a room message
  kind         TEXT NOT NULL,                   -- 'task' | 'progress' | 'done' | 'question' | 'suggest' | 'owner'
  body         TEXT NOT NULL,
  handled      INTEGER NOT NULL DEFAULT 0       -- suggestions only
);

CREATE INDEX messages_room ON messages(room_id, id);
CREATE INDEX messages_agent ON messages(agent_id, id);
CREATE INDEX messages_to_agent ON messages(to_agent_id, id);

-- Which owner messages reached which agent, and when (ADR-0007).
CREATE TABLE deliveries (
  message_id  INTEGER NOT NULL REFERENCES messages(id),
  agent_id    TEXT NOT NULL REFERENCES agents(id),
  at          INTEGER NOT NULL,
  PRIMARY KEY (message_id, agent_id)
);
