-- ADR-0015: how a note reached the agent — injected by a hook, queued into
-- Codex by the watcher, or pushed through the Claude Code channel.
ALTER TABLE deliveries ADD COLUMN via TEXT NOT NULL DEFAULT 'hook';
