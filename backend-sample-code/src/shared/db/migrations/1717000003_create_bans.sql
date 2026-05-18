-- Migration: create room_bans and app_bans tables

CREATE TABLE room_bans (
    room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE app_bans (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    banned_by   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT,
    banned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
