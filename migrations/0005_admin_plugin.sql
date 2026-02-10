-- Better Auth admin plugin: role + ban columns on user, impersonation on session
-- Source: better-auth/dist/plugins/admin/schema.mjs

ALTER TABLE user ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE user ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user ADD COLUMN ban_reason TEXT;
ALTER TABLE user ADD COLUMN ban_expires INTEGER;

ALTER TABLE session ADD COLUMN impersonated_by TEXT;
