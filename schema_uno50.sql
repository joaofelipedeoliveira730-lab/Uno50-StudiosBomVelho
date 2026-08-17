-- UNO50 — PostgreSQL / Render
-- ATENÇÃO: DESTRUTIVO. Faz backup do banco antigo antes de executar.
-- O script apaga a estrutura/dados antigos do jogo e cria somente o núcleo novo.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS match_actions CASCADE;
DROP TABLE IF EXISTS moderation_actions CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS match_players CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS room_players CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP TABLE IF EXISTS inventario CASCADE;
DROP TABLE IF EXISTS loja_itens CASCADE;

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings(key,value) VALUES
('registration_enabled','true'),
('password_recovery_enabled','false'),
('turn_timeout_seconds','30'),
('reconnect_grace_seconds','60'),
('room_idle_timeout_seconds','900'),
('match_max_duration_seconds','3600'),
('max_message_length','300'),
('max_actions_per_second','8');

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(24) NOT NULL UNIQUE,
  email VARCHAR(254) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
);

CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_users_seen ON users(last_seen_at);

CREATE TABLE profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_id SMALLINT NOT NULL DEFAULT 1 CHECK (avatar_id BETWEEN 1 AND 10),
  platform VARCHAR(12) CHECK (platform IN ('mobile','desktop')),
  brightness SMALLINT NOT NULL DEFAULT 100 CHECK (brightness BETWEEN 30 AND 100),
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reduced_animations BOOLEAN NOT NULL DEFAULT FALSE,
  leader_badge BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(8) NOT NULL UNIQUE,
  name VARCHAR(40) NOT NULL,
  password_hash VARCHAR(255),
  visibility VARCHAR(8) NOT NULL CHECK (visibility IN ('public','private')),
  mode VARCHAR(5) NOT NULL CHECK (mode IN ('solo','duo','trio')),
  bots BOOLEAN NOT NULL DEFAULT FALSE,
  map_id VARCHAR(40) NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','starting','playing','finished','closed')),
  max_players SMALLINT NOT NULL CHECK (max_players BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rooms_public ON rooms(visibility,status,created_at);
CREATE INDEX idx_rooms_activity ON rooms(last_activity_at);

CREATE TABLE room_players (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  seat SMALLINT NOT NULL CHECK (seat BETWEEN 1 AND 3),
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(16) NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected','disconnected','left','forfeited')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  missed_turns SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY(room_id,user_id),
  UNIQUE(room_id,seat)
);

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  mode VARCHAR(5) NOT NULL CHECK (mode IN ('solo','duo','trio')),
  map_id VARCHAR(40) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','finished','aborted')),
  current_turn_seat SMALLINT,
  direction SMALLINT NOT NULL DEFAULT 1 CHECK (direction IN (-1,1)),
  current_color VARCHAR(8),
  turn_deadline_at TIMESTAMPTZ,
  winner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  abort_reason VARCHAR(100)
);

CREATE TABLE match_players (
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  seat SMALLINT NOT NULL CHECK (seat BETWEEN 1 AND 3),
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  card_count SMALLINT NOT NULL DEFAULT 7 CHECK (card_count >= 0),
  result VARCHAR(12),
  PRIMARY KEY(match_id,seat)
);

CREATE TABLE match_actions (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  sequence BIGINT NOT NULL,
  nonce VARCHAR(100) NOT NULL,
  action_type VARCHAR(24) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  accepted BOOLEAN NOT NULL,
  reject_reason VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(match_id,nonce)
);

CREATE INDEX idx_actions_match ON match_actions(match_id,sequence);

CREATE TABLE chat_messages (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  message VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_match ON chat_messages(match_id,created_at);

CREATE TABLE reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reported_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  reason VARCHAR(32) NOT NULL,
  details VARCHAR(500),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','reviewing','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE moderation_actions (
  id BIGSERIAL PRIMARY KEY,
  moderator_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type VARCHAR(24) NOT NULL
    CHECK(action_type IN ('warning','mute','kick','temporary_ban','permanent_ban')),
  reason VARCHAR(300) NOT NULL,
  duration_seconds INTEGER,
  reference_report_id BIGINT REFERENCES reports(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_mod_target ON moderation_actions(target_user_id,created_at);

COMMIT;

-- Depois do SQL, crie a conta CEO com:
-- CEO_USERNAME=CeoVelho
-- CEO_PASSWORD=<senha escolhida por você>
-- npm run bootstrap
