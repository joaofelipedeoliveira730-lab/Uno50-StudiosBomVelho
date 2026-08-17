-- Banco mínimo do Uno50. Execute em uma instância de manutenção e faça backup antes.
BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(24) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  leader_badge BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_id SMALLINT NOT NULL DEFAULT 1 CHECK (avatar_id BETWEEN 1 AND 10),
  platform VARCHAR(12) NOT NULL DEFAULT 'mobile' CHECK (platform IN ('mobile','desktop')),
  brightness SMALLINT NOT NULL DEFAULT 100 CHECK (brightness BETWEEN 30 AND 100),
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reduced_animations BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY,
  code VARCHAR(9) NOT NULL UNIQUE,
  name VARCHAR(40) NOT NULL,
  password_hash VARCHAR(255),
  visibility VARCHAR(8) NOT NULL CHECK (visibility IN ('public','private')),
  mode VARCHAR(5) NOT NULL CHECK (mode IN ('solo','duo','trio')),
  bots BOOLEAN NOT NULL DEFAULT FALSE,
  map_id VARCHAR(40) NOT NULL,
  description VARCHAR(180) NOT NULL DEFAULT '',
  owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_players (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  seat SMALLINT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(room_id,user_id),
  UNIQUE(room_id,seat)
);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  mode VARCHAR(5) NOT NULL CHECK (mode IN ('solo','duo','trio')),
  map_id VARCHAR(40) NOT NULL,
  winner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  seat SMALLINT NOT NULL,
  result VARCHAR(8),
  PRIMARY KEY(match_id,seat)
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(24) NOT NULL,
  reason VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Limpeza pedida: remove dados antigos, inclusive contas antigas.
TRUNCATE reports, moderation_actions, match_players, matches, room_players, rooms, profiles, users RESTART IDENTITY CASCADE;

COMMIT;

-- A conta CEO é criada pelo bootstrap seguro, usando bcrypt e uma senha fornecida
-- fora do SQL. Não coloque senha em texto puro neste arquivo.
