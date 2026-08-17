require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');
if (!process.env.CEO_PASSWORD || process.env.CEO_PASSWORD.length < 8) {
  throw new Error('CEO_PASSWORD deve ter pelo menos 8 caracteres.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    const username = (process.env.CEO_USERNAME || 'CeoVelho').trim();
    const hash = await bcrypt.hash(process.env.CEO_PASSWORD, 12);

    await client.query('BEGIN');
    await client.query('TRUNCATE reports, moderation_actions, match_actions, chat_messages, match_players, matches, room_players, rooms, profiles, users RESTART IDENTITY CASCADE');
    const r = await client.query(
      'INSERT INTO users(username,password_hash,is_active,is_banned) VALUES($1,$2,TRUE,FALSE) RETURNING id',
      [username, hash]
    );
    await client.query(
      'INSERT INTO profiles(user_id,avatar_id,leader_badge) VALUES($1,1,TRUE)',
      [r.rows[0].id]
    );
    await client.query('COMMIT');
    console.log(`CEO criada: ${username} (emblema Líder).`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
