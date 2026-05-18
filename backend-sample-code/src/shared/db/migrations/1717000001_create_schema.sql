-- Migration: create roles and users tables

CREATE TABLE roles (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(100) UNIQUE NOT NULL,
    password_hash   VARCHAR(255),
    role_id         INTEGER NOT NULL REFERENCES roles(id),
    avatar_speaking TEXT,
    avatar_silent   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default roles (NO guest - only members and admins)
INSERT INTO roles (name) VALUES ('member'), ('admin')
ON CONFLICT (name) DO NOTHING;