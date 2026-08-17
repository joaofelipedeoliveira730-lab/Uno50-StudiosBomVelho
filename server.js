require('dotenv').config();

const http = require('http');
const express = require('express');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and contain at least 32 characters.');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '32kb' }));

const httpRate = new Map();
const rooms = new Map();
const sockets = new Set();

const LIMITS = {
  actionPerSecond: 8,
  chatPer10Seconds: 10,
  turnSeconds: 30,
  reconnectSeconds: 60,
  roomIdleSeconds: 900,
  maxMatchSeconds: 3600,
  maxMessageLength: 300
};

function now() { return Date.now(); }
function uuid() { return crypto.randomUUID(); }
function code() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }

function sign(user) {
  return jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}

async function userById(id) {
  const r = await pool.query(`
    SELECT u.id, u.username, u.email, u.is_active, u.is_banned,
           p.avatar_id, p.platform, p.brightness, p.sound_enabled,
           p.reduced_animations, p.leader_badge
    FROM users u
    JOIN profiles p ON p.user_id = u.id
    WHERE u.id = $1
  `, [id]);
  return r.rows[0] || null;
}

async function banned(id) {
  const r = await pool.query(`
    SELECT 1 FROM users WHERE id=$1 AND (is_banned OR NOT is_active)
  `, [id]);
  return r.rowCount > 0;
}

function validUsername(v) {
  return typeof v === 'string' && /^[A-Za-z0-9_]{3,24}$/.test(v);
}
function validPassword(v) {
  return typeof v === 'string' && v.length >= 8 && v.length <= 128;
}
function validPlatform(v) { return v === 'mobile' || v === 'desktop'; }
function validMode(v) { return ['solo', 'duo', 'trio'].includes(v); }
function maxPlayers(mode) { return mode === 'solo' ? 2 : mode === 'duo' ? 2 : 3; }

function rate(key, max, windowMs) {
  const t = now();
  const old = httpRate.get(key) || [];
  const fresh = old.filter(x => t - x < windowMs);
  if (fresh.length >= max) return false;
  fresh.push(t);
  httpRate.set(key, fresh);
  return true;
}

function publicRoom(row) {
  return {
    code: row.code,
    name: row.name,
    visibility: row.visibility,
    mode: row.mode,
    bots: row.bots,
    mapId: row.map_id,
    description: row.description,
    status: row.status,
    players: Number(row.players || 0),
    maxPlayers: Number(row.max_players)
  };
}

/* --------------------------- UNO SERVER ENGINE --------------------------- */

const COLORS = ['red', 'yellow', 'green', 'blue'];
const TYPES = ['number', 'skip', 'reverse', 'draw2', 'wild', 'wild4'];

function makeDeck() {
  const d = [];
  for (const color of COLORS) {
    d.push({ color, type: 'number', value: 0 });
    for (let n = 1; n <= 9; n++) {
      d.push({ color, type: 'number', value: n });
      d.push({ color, type: 'number', value: n });
    }
    for (let i = 0; i < 2; i++) {
      d.push({ color, type: 'skip' });
      d.push({ color, type: 'reverse' });
      d.push({ color, type: 'draw2' });
    }
  }
  for (let i = 0; i < 4; i++) {
    d.push({ color: 'wild', type: 'wild' });
    d.push({ color: 'wild', type: 'wild4' });
  }
  for (let i = d.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function playable(card, top, activeColor) {
  return card.type === 'wild' || card.type === 'wild4' ||
    card.color === activeColor ||
    card.color === top.color ||
    (card.type === 'number' && top.type === 'number' && card.value === top.value) ||
    (card.type !== 'number' && card.type === top.type);
}

class UnoMatch {
  constructor(matchId, room, playerRows) {
    this.id = matchId;
    this.roomId = room.id;
    this.mode = room.mode;
    this.mapId = room.map_id;
    this.players = playerRows.map(x => ({
      seat: Number(x.seat),
      userId: x.user_id ? Number(x.user_id) : null,
      isBot: Boolean(x.is_bot),
      hand: [],
      missedTurns: 0,
      disconnectedAt: null
    }));
    this.draw = makeDeck();
    this.discard = [];
    this.activeColor = COLORS[0];
    this.currentSeat = 1;
    this.direction = 1;
    this.startedAt = now();
    this.turnDeadline = now() + LIMITS.turnSeconds * 1000;
    this.finished = false;
    this.winner = null;
    this.sequence = 0;
    this.lastActionAt = now();

    for (const p of this.players) {
      for (let i = 0; i < 7; i++) p.hand.push(this.drawCard());
    }

    let first = this.drawCard();
    while (first.type === 'wild4' || first.type === 'wild') {
      this.draw.push(first);
      first = this.drawCard();
    }
    this.discard.push(first);
    this.activeColor = first.color;
  }

  drawCard() {
    if (this.draw.length === 0) {
      if (this.discard.length <= 1) throw new Error('DRAW_EMPTY');
      const top = this.discard.pop();
      this.draw = this.discard.splice(0);
      this.discard = [top];
      for (let i = this.draw.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [this.draw[i], this.draw[j]] = [this.draw[j], this.draw[i]];
      }
    }
    return this.draw.pop();
  }

  playerFor(userId) {
    return this.players.find(p => String(p.userId) === String(userId));
  }

  current() {
    return this.players.find(p => p.seat === this.currentSeat);
  }

  nextSeat(steps = 1) {
    const n = this.players.length;
    let idx = this.players.findIndex(p => p.seat === this.currentSeat);
    idx = (idx + this.direction * steps + n * 10) % n;
    this.currentSeat = this.players[idx].seat;
  }

  advance(card) {
    if (card?.type === 'reverse' && this.players.length === 2) {
      this.nextSeat(2);
    } else {
      this.nextSeat(card?.type === 'reverse' ? 1 : card?.type === 'skip' ? 2 : 1);
    }
    this.turnDeadline = now() + LIMITS.turnSeconds * 1000;
  }

  snapshotFor(userId) {
    const me = this.playerFor(userId);
    return {
      id: this.id,
      roomId: this.roomId,
      mapId: this.mapId,
      currentSeat: this.currentSeat,
      direction: this.direction,
      activeColor: this.activeColor,
      topCard: this.discard[this.discard.length - 1],
      drawCount: this.draw.length,
      discardCount: this.discard.length,
      turnRemainingMs: Math.max(0, this.turnDeadline - now()),
      finished: this.finished,
      winner: this.winner,
      players: this.players.map(p => ({
        seat: p.seat,
        userId: p.userId,
        isBot: p.isBot,
        cardCount: p.hand.length,
        disconnected: Boolean(p.disconnectedAt)
      })),
      hand: me ? me.hand : []
    };
  }

  play(userId, cardIndex, chosenColor, nonce) {
    const p = this.playerFor(userId);
    if (!p || p.seat !== this.currentSeat || this.finished) throw new Error('NOT_YOUR_TURN');
    if (!nonce || typeof nonce !== 'string' || nonce.length > 100) throw new Error('BAD_NONCE');
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= p.hand.length) throw new Error('BAD_CARD');
    const card = p.hand[cardIndex];
    const top = this.discard[this.discard.length - 1];
    if (!playable(card, top, this.activeColor)) throw new Error('INVALID_CARD');
    if ((card.type === 'wild' || card.type === 'wild4') && !COLORS.includes(chosenColor)) throw new Error('BAD_COLOR');

    p.hand.splice(cardIndex, 1);
    this.discard.push(card);
    this.activeColor = card.type === 'wild' || card.type === 'wild4' ? chosenColor : card.color;
    this.lastActionAt = now();
    this.sequence++;

    if (p.hand.length === 0) {
      this.finished = true;
      this.winner = p.userId;
      return card;
    }

    if (card.type === 'draw2') {
      const next = this.nextPlayer();
      for (let i = 0; i < 2; i++) next.hand.push(this.drawCard());
      this.advance({ type: 'skip' });
    } else if (card.type === 'wild4') {
      const next = this.nextPlayer();
      for (let i = 0; i < 4; i++) next.hand.push(this.drawCard());
      this.advance({ type: 'skip' });
    } else {
      this.advance(card);
    }
    return card;
  }

  nextPlayer() {
    const n = this.players.length;
    let idx = this.players.findIndex(p => p.seat === this.currentSeat);
    idx = (idx + this.direction + n) % n;
    return this.players[idx];
  }

  drawFor(userId) {
    const p = this.playerFor(userId);
    if (!p || p.seat !== this.currentSeat || this.finished) throw new Error('NOT_YOUR_TURN');
    const c = this.drawCard();
    p.hand.push(c);
    this.sequence++;
    this.lastActionAt = now();
    this.advance(null);
    return c;
  }

  timeoutCurrent() {
    if (this.finished || now() < this.turnDeadline) return null;
    const p = this.current();
    if (!p) return null;
    p.missedTurns++;
    try { this.drawFor(p.userId); } catch { this.advance(null); }
    return p;
  }
}

async function persistAction(matchId, userId, type, payload, accepted, reason = null, nonce = null) {
  await pool.query(`
    INSERT INTO match_actions(match_id,user_id,sequence,nonce,action_type,payload,accepted,reject_reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (match_id, sequence) DO NOTHING
  `, [
    matchId, userId, payload.sequence || 0, nonce || uuid(), type,
    JSON.stringify(payload), accepted, reason
  ]);
}


async function startMatch(roomId) {
  const existing = await pool.query(
    `SELECT id FROM matches WHERE room_id=$1 AND status='running' LIMIT 1`, [roomId]
  );
  if (existing.rowCount) return rooms.get(String(existing.rows[0].id));

  const rr = await pool.query(`SELECT * FROM rooms WHERE id=$1`, [roomId]);
  if (!rr.rowCount) throw new Error('ROOM_NOT_FOUND');
  const room = rr.rows[0];

  const pr = await pool.query(`
    SELECT room_id,user_id,seat,is_bot
    FROM room_players
    WHERE room_id=$1
    ORDER BY seat
  `, [roomId]);

  const humanCount = pr.rows.filter(x => !x.is_bot).length;
  const shouldStart = room.mode === 'solo'
    ? humanCount >= 1
    : pr.rowCount >= room.max_players;
  if (!shouldStart) return null;

  const matchId = uuid();
  const match = new UnoMatch(matchId, room, pr.rows);
  await pool.query(`
    INSERT INTO matches(id,room_id,mode,map_id,status,current_turn_seat,current_color,turn_deadline_at)
    VALUES($1,$2,$3,$4,'running',$5,$6,to_timestamp($7/1000.0))
  `, [matchId, roomId, room.mode, room.map_id, match.currentSeat, match.activeColor, match.turnDeadline]);

  for (const p of match.players) {
    await pool.query(`
      INSERT INTO match_players(match_id,user_id,seat,is_bot,card_count)
      VALUES($1,$2,$3,$4,$5)
    `, [matchId, p.userId, p.seat, p.isBot, p.hand.length]);
  }

  await pool.query(`UPDATE rooms SET status='playing',last_activity_at=now() WHERE id=$1`, [roomId]);
  rooms.set(matchId, match);
  return match;
}

/* ----------------------------- HTTP API --------------------------------- */

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'Uno50', database: 'ok', version: '1.2.0 V2026' });
  } catch {
    res.status(503).json({ ok: false, service: 'Uno50', database: 'error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  if (!rate(`register:${req.ip}`, 5, 60_000)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const { username, password, email } = req.body || {};
  if (!validUsername(username) || !validPassword(password)) {
    return res.status(400).json({ error: 'INVALID_CREDENTIALS' });
  }
  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query(`
      INSERT INTO users(username,email,password_hash)
      VALUES($1,$2,$3) RETURNING id,username,email
    `, [username.trim(), email ? String(email).trim().slice(0,254) : null, hash]);
    await client.query('INSERT INTO profiles(user_id,avatar_id) VALUES($1,1)', [u.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ token: sign(u.rows[0]), user: await userById(u.rows[0].id) });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'USERNAME_OR_EMAIL_EXISTS' });
    console.error(e);
    res.status(500).json({ error: 'REGISTER_FAILED' });
  } finally { client.release(); }
});

app.post('/api/auth/login', async (req, res) => {
  if (!rate(`login:${req.ip}`, 10, 60_000)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const { username, password, platform } = req.body || {};
  if (!validUsername(username) || typeof password !== 'string') return res.status(400).json({ error: 'INVALID_LOGIN' });

  const r = await pool.query(`
    SELECT u.id,u.username,u.email,u.password_hash,u.is_active,u.is_banned
    FROM users u WHERE u.username=$1
  `, [username.trim()]);
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'INVALID_LOGIN' });
  if (!u.is_active || u.is_banned) return res.status(403).json({ error: 'ACCOUNT_BLOCKED' });

  if (platform && validPlatform(platform)) {
    await pool.query('UPDATE profiles SET platform=$1,updated_at=now() WHERE user_id=$2', [platform, u.id]);
  } else {
    await pool.query('UPDATE profiles SET platform=NULL,updated_at=now() WHERE user_id=$1', [u.id]);
  }
  await pool.query('UPDATE users SET last_login_at=now(),last_seen_at=now() WHERE id=$1', [u.id]);
  res.json({ token: sign(u), user: await userById(u.id), platformRequired: !platform });
});

app.post('/api/auth/recovery', (_req, res) => {
  res.status(503).json({ error: 'PASSWORD_RECOVERY_UNAVAILABLE' });
});

app.get('/api/me', auth, async (req, res) => {
  const u = await userById(req.user.sub);
  if (!u || u.is_banned || !u.is_active) return res.status(403).json({ error: 'ACCOUNT_BLOCKED' });
  await pool.query('UPDATE users SET last_seen_at=now() WHERE id=$1', [u.id]);
  res.json({ user: u });
});

app.put('/api/profile', auth, async (req, res) => {
  const { avatarId, platform, brightness, soundEnabled, reducedAnimations } = req.body || {};
  if (avatarId !== undefined && (!Number.isInteger(avatarId) || avatarId < 1 || avatarId > 10)) return res.status(400).json({ error:'BAD_AVATAR' });
  if (platform !== undefined && !validPlatform(platform)) return res.status(400).json({ error:'BAD_PLATFORM' });
  if (brightness !== undefined && (!Number.isInteger(brightness) || brightness < 30 || brightness > 100)) return res.status(400).json({ error:'BAD_BRIGHTNESS' });
  await pool.query(`
    UPDATE profiles SET
      avatar_id=COALESCE($1,avatar_id),
      platform=COALESCE($2,platform),
      brightness=COALESCE($3,brightness),
      sound_enabled=COALESCE($4,sound_enabled),
      reduced_animations=COALESCE($5,reduced_animations),
      updated_at=now()
    WHERE user_id=$6
  `, [avatarId ?? null, platform ?? null, brightness ?? null, soundEnabled ?? null, reducedAnimations ?? null, req.user.sub]);
  res.json({ user: await userById(req.user.sub) });
});

app.get('/api/rooms', auth, async (_req, res) => {
  const r = await pool.query(`
    SELECT r.*, COUNT(rp.user_id)::int AS players,
           CASE r.mode WHEN 'solo' THEN 1 WHEN 'duo' THEN 2 ELSE 3 END AS max_players
    FROM rooms r
    LEFT JOIN room_players rp ON rp.room_id=r.id
    WHERE r.visibility='public' AND r.status='waiting'
    GROUP BY r.id
    ORDER BY r.created_at DESC
    LIMIT 50
  `);
  res.json({ rooms: r.rows.map(publicRoom) });
});

app.post('/api/rooms', auth, async (req, res) => {
  if (await banned(req.user.sub)) return res.status(403).json({ error:'ACCOUNT_BLOCKED' });
  if (!rate(`room:${req.user.sub}`, 5, 60_000)) return res.status(429).json({ error:'RATE_LIMIT' });
  const { name, password, visibility='public', mode='solo', bots=false, mapId='pirate_ship', description='' } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 40) return res.status(400).json({error:'BAD_ROOM_NAME'});
  if (!['public','private'].includes(visibility) || !validMode(mode)) return res.status(400).json({error:'BAD_ROOM_SETTINGS'});
  const allowedMaps = ['pirate_ship','ancient_egypt','ancient_rome','edo_japan','silk_road'];
  if (!allowedMaps.includes(mapId)) return res.status(400).json({error:'BAD_MAP'});
  if (visibility === 'private' && password && String(password).length > 128) return res.status(400).json({error:'BAD_PASSWORD'});
  const id = uuid();
  let roomCode;
  for (let i=0;i<10;i++) {
    const c = code();
    const exists = await pool.query('SELECT 1 FROM rooms WHERE code=$1',[c]);
    if (!exists.rowCount) { roomCode=c; break; }
  }
  if (!roomCode) return res.status(500).json({error:'CODE_GENERATION_FAILED'});
  const hash = password ? await bcrypt.hash(String(password), 12) : null;
  const max = maxPlayers(mode);
  await pool.query(`
    INSERT INTO rooms(id,code,owner_id,name,password_hash,visibility,mode,bots,map_id,description,max_players)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  `, [id,roomCode,req.user.sub,name.trim(),hash,visibility,mode,Boolean(bots),mapId,String(description).slice(0,300),max]);
  await pool.query('INSERT INTO room_players(room_id,user_id,seat,is_bot) VALUES($1,$2,1,FALSE)', [id, req.user.sub]);
  if (mode === 'solo' && bots) await pool.query('INSERT INTO room_players(room_id,user_id,seat,is_bot) VALUES($1,NULL,2,TRUE)', [id]);
  const started = await startMatch(id);
  res.status(201).json({ code: roomCode, roomId: id, matchId: started?.id || null });
});

app.post('/api/rooms/:code/join', auth, async (req, res) => {
  const c = String(req.params.code).toUpperCase();
  const { password } = req.body || {};
  const r = await pool.query('SELECT * FROM rooms WHERE code=$1 AND status=$2',[c,'waiting']);
  if (!r.rowCount) return res.status(404).json({error:'ROOM_NOT_FOUND'});
  const room = r.rows[0];
  if (room.visibility === 'private') {
    if (!room.password_hash || typeof password !== 'string' || !(await bcrypt.compare(password, room.password_hash))) return res.status(403).json({error:'ROOM_PASSWORD_INVALID'});
  }
  const count = await pool.query('SELECT COUNT(*)::int AS n FROM room_players WHERE room_id=$1',[room.id]);
  if (Number(count.rows[0].n) >= room.max_players) return res.status(409).json({error:'ROOM_FULL'});
  const occupied = await pool.query('SELECT seat FROM room_players WHERE room_id=$1 ORDER BY seat',[room.id]);
  const used = new Set(occupied.rows.map(x=>Number(x.seat)));
  let seat=1; while(used.has(seat)) seat++;
  await pool.query('INSERT INTO room_players(room_id,user_id,seat,is_bot) VALUES($1,$2,$3,FALSE)',[room.id,req.user.sub,seat]);
  const started = await startMatch(room.id);
  res.json({ ok:true, code:c, seat, matchId: started?.id || null });
});

app.post('/api/rooms/:code/leave', auth, async (req,res) => {
  const c=String(req.params.code).toUpperCase();
  await pool.query(`
    DELETE FROM room_players rp USING rooms r
    WHERE rp.room_id=r.id AND r.code=$1 AND rp.user_id=$2
  `,[c,req.user.sub]);
  res.json({ok:true});
});

app.post('/api/reports', auth, async (req,res)=>{
  const { targetUserId, roomId, reason, details='' }=req.body||{};
  if(!Number.isInteger(Number(targetUserId)) || typeof reason!=='string' || reason.length<2) return res.status(400).json({error:'BAD_REPORT'});
  if(!rate(`report:${req.user.sub}`,5,3600000)) return res.status(429).json({error:'RATE_LIMIT'});
  await pool.query(`
    INSERT INTO reports(reporter_user_id,reported_user_id,room_id,reason,details)
    VALUES($1,$2,$3,$4,$5)
  `,[req.user.sub,Number(targetUserId),roomId||null,reason.slice(0,32),String(details).slice(0,500)]);
  res.status(201).json({ok:true});
});

app.get('/api/admin/reports', auth, async (req,res)=>{
  const u=await userById(req.user.sub);
  if(!u?.leader_badge) return res.status(403).json({error:'FORBIDDEN'});
  const r=await pool.query(`
    SELECT id,reporter_user_id,reported_user_id,room_id,reason,details,status,created_at
    FROM reports ORDER BY created_at DESC LIMIT 100
  `);
  res.json({reports:r.rows});
});

app.post('/api/admin/moderation', auth, async (req,res)=>{
  const u=await userById(req.user.sub);
  if(!u?.leader_badge) return res.status(403).json({error:'FORBIDDEN'});
  const {targetUserId,action,reason,durationSeconds}=req.body||{};
  const allowed=['warning','mute','kick','temporary_ban','permanent_ban'];
  if(!allowed.includes(action) || !Number.isInteger(Number(targetUserId)) || typeof reason!=='string') return res.status(400).json({error:'BAD_MODERATION'});
  await pool.query(`
    INSERT INTO moderation_actions(moderator_user_id,target_user_id,action_type,reason,duration_seconds)
    VALUES($1,$2,$3,$4,$5)
  `,[req.user.sub,Number(targetUserId),action,reason.slice(0,300),durationSeconds||null]);
  if(action==='permanent_ban') await pool.query('UPDATE users SET is_banned=TRUE WHERE id=$1',[targetUserId]);
  if(action==='temporary_ban') {
    await pool.query('UPDATE users SET is_active=FALSE WHERE id=$1',[targetUserId]);
  }
  res.json({ok:true});
});

/* --------------------------- WebSocket ---------------------------------- */

const server=http.createServer(app);
const wss=new WebSocketServer({server});
const wsMeta=new WeakMap();

function send(ws,obj) {
  if(ws.readyState===1) ws.send(JSON.stringify(obj));
}
function broadcastMatch(matchId) {
  for(const ws of sockets){
    const meta=wsMeta.get(ws);
    if(meta?.matchId===matchId) {
      const m=rooms.get(matchId);
      if(m) send(ws,{type:'state',data:m.snapshotFor(meta.userId)});
    }
  }
}
function wsRate(meta,type){
  const t=now();
  const arr=meta.rate[type]||[];
  const windowMs=type==='chat'?10000:1000;
  const limit=type==='chat'?LIMITS.chatPer10Seconds:LIMITS.actionPerSecond;
  meta.rate[type]=arr.filter(x=>t-x<windowMs);
  if(meta.rate[type].length>=limit)return false;
  meta.rate[type].push(t);return true;
}

wss.on('connection',(ws,req)=>{
  const url=new URL(req.url,'http://localhost');
  const token=url.searchParams.get('token');
  let claims;
  try { claims=jwt.verify(token||'',JWT_SECRET); } catch { ws.close(1008,'INVALID_TOKEN'); return; }
  const meta={userId:Number(claims.sub),matchId:null,rate:{action:[],chat:[]}};
  wsMeta.set(ws,meta); sockets.add(ws);
  send(ws,{type:'connected',data:{version:'1.2.0 V2026'}});

  ws.on('message',async raw=>{
    if(raw.length>8192){ws.close(1009,'MESSAGE_TOO_LARGE');return;}
    let msg;try{msg=JSON.parse(raw.toString())}catch{send(ws,{type:'error',error:'BAD_JSON'});return;}
    try{
      if(await banned(meta.userId)){ws.close(1008,'ACCOUNT_BLOCKED');return;}
      if(msg.type==='join_match'){
        const matchId=String(msg.matchId||'');
        const match=rooms.get(matchId);
        if(!match) {send(ws,{type:'error',error:'MATCH_NOT_FOUND'});return;}
        if(!match.playerFor(meta.userId)){send(ws,{type:'error',error:'NOT_IN_MATCH'});return;}
        meta.matchId=matchId;
        send(ws,{type:'state',data:match.snapshotFor(meta.userId)});
        return;
      }
      if(!meta.matchId){send(ws,{type:'error',error:'JOIN_MATCH_FIRST'});return;}
      const match=rooms.get(meta.matchId);
      if(!match){send(ws,{type:'error',error:'MATCH_NOT_FOUND'});return;}

      if(msg.type==='chat'){
        if(!wsRate(meta,'chat')){send(ws,{type:'error',error:'RATE_LIMIT'});return;}
        const text=String(msg.text||'').trim();
        if(!text || text.length>LIMITS.maxMessageLength){send(ws,{type:'error',error:'BAD_MESSAGE'});return;}
        await pool.query('INSERT INTO chat_messages(match_id,user_id,message) VALUES($1,$2,$3)',[match.id,meta.userId,text]);
        for(const peer of sockets){const pm=wsMeta.get(peer);if(pm?.matchId===match.id)send(peer,{type:'chat',data:{userId:meta.userId,message:text}});}
        return;
      }

      if(!wsRate(meta,'action')){send(ws,{type:'error',error:'RATE_LIMIT'});return;}
      const nonce=String(msg.nonce||'');
      if(!nonce || nonce.length>100){send(ws,{type:'error',error:'BAD_NONCE'});return;}
      let result;
      try{
        if(msg.type==='play') result=match.play(meta.userId,Number(msg.cardIndex),msg.chosenColor,nonce);
        else if(msg.type==='draw') result=match.drawFor(meta.userId);
        else if(msg.type==='uno') result={ok:true};
        else {send(ws,{type:'error',error:'UNKNOWN_ACTION'});return;}
      }catch(e){
        await pool.query(`
          INSERT INTO match_actions(match_id,user_id,sequence,nonce,action_type,payload,accepted,reject_reason)
          VALUES($1,$2,$3,$4,$5,$6,FALSE,$7)
          ON CONFLICT (match_id,nonce) DO NOTHING
        `,[match.id,meta.userId,match.sequence,nonce,msg.type,JSON.stringify(msg),e.message]);
        send(ws,{type:'error',error:e.message});return;
      }

      await pool.query(`
        INSERT INTO match_actions(match_id,user_id,sequence,nonce,action_type,payload,accepted)
        VALUES($1,$2,$3,$4,$5,$6,TRUE)
        ON CONFLICT (match_id,nonce) DO NOTHING
      `,[match.id,meta.userId,match.sequence,nonce,msg.type,JSON.stringify({sequence:match.sequence})]);

      await pool.query(`
        UPDATE matches
        SET current_turn_seat=$1,current_color=$2,
            turn_deadline_at=to_timestamp($3/1000.0)
        WHERE id=$4
      `,[match.currentSeat,match.activeColor,match.turnDeadline,match.id]);
      for(const p of match.players){
        await pool.query(
          'UPDATE match_players SET card_count=$1 WHERE match_id=$2 AND seat=$3',
          [p.hand.length,match.id,p.seat]
        );
      }
      await pool.query('UPDATE rooms SET last_activity_at=now() WHERE id=$1',[match.roomId]);
      if(match.finished){
        await pool.query('UPDATE matches SET status=$1,winner_id=$2,ended_at=now() WHERE id=$3',['finished',match.winner,match.id]);
        await pool.query('UPDATE rooms SET status=$1,last_activity_at=now() WHERE id=$2',['finished',match.roomId]);
      }
      broadcastMatch(match.id);
      void result;
    }catch(e){console.error('WS error',e);send(ws,{type:'error',error:'SERVER_ERROR'});}
  });

  ws.on('close',()=>sockets.delete(ws));
});

setInterval(async()=>{
  for(const [matchId,match] of rooms){
    if(match.finished) continue;
    if(now()-match.startedAt>LIMITS.maxMatchSeconds*1000){
      match.finished=true;
      await pool.query('UPDATE matches SET status=$1,ended_at=now(),abort_reason=$2 WHERE id=$3',['aborted','MATCH_TIMEOUT',matchId]).catch(()=>{});
      broadcastMatch(matchId);
      continue;
    }
    const timed=match.timeoutCurrent();
    if(timed){
      await pool.query('UPDATE room_players SET missed_turns=missed_turns+1,last_seen_at=now() WHERE room_id=$1 AND user_id=$2',[match.roomId,timed.userId]).catch(()=>{});
      broadcastMatch(matchId);
    }
  }
  await pool.query(`
    UPDATE rooms SET status='closed'
    WHERE status='waiting' AND last_activity_at < now() - interval '15 minutes'
  `).catch(()=>{});
},1000);

server.listen(PORT,()=>console.log(`Uno50 server listening on ${PORT}`));

process.on('SIGTERM',async()=>{await pool.end();process.exit(0)});
process.on('SIGINT',async()=>{await pool.end();process.exit(0)});
