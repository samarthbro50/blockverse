import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 4000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '256kb' }));

await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(24) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(48) NOT NULL,
    description VARCHAR(240) DEFAULT '',
    scene JSONB NOT NULL DEFAULT '{"blocks":[]}',
    published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
`);

const sign = user => jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
function optionalAuth(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) { try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch {} }
  next();
}
function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please log in.' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Session expired. Please log in again.' }); }
}
const safeGame = row => ({
  id: row.id, title: row.title, description: row.description,
  scene: row.scene, published: row.published, owner: row.username || 'Creator',
  updatedAt: row.updated_at
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Blockverse API' }));

app.post('/api/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'Username must be 3–24 letters, numbers, or underscores.' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be 8–72 characters.' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id,username', [username, hash]);
    res.status(201).json({ token: sign(rows[0]), user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That username is already taken.' });
    console.error(e); res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  if (!rows[0] || !(await bcrypt.compare(String(req.body.password || ''), rows[0].password_hash)))
    return res.status(401).json({ error: 'Incorrect username or password.' });
  res.json({ token: sign(rows[0]), user: { id: rows[0].id, username: rows[0].username } });
});

app.get('/api/me', auth, (req, res) => res.json({ user: { id: req.user.id, username: req.user.username } }));

app.get('/api/games', async (_req, res) => {
  const { rows } = await pool.query(`SELECT g.*,u.username FROM games g JOIN users u ON u.id=g.owner_id
    WHERE g.published=true ORDER BY g.updated_at DESC LIMIT 100`);
  res.json({ games: rows.map(safeGame) });
});

app.get('/api/my/games', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM games WHERE owner_id=$1 ORDER BY updated_at DESC', [req.user.id]);
  res.json({ games: rows.map(safeGame) });
});

app.get('/api/games/:id', optionalAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT g.*,u.username FROM games g JOIN users u ON u.id=g.owner_id WHERE g.id=$1`, [req.params.id]);
  const game = rows[0];
  if (!game || (!game.published && Number(game.owner_id) !== Number(req.user?.id))) return res.status(404).json({ error: 'Game not found.' });
  res.json({ game: safeGame(game) });
});

app.post('/api/games', auth, async (req, res) => {
  const title = String(req.body.title || 'Untitled world').trim().slice(0,48);
  const description = String(req.body.description || '').trim().slice(0,240);
  const scene = validateScene(req.body.scene);
  if (!scene) return res.status(400).json({ error: 'Invalid world data. Maximum 2000 blocks.' });
  const id = randomUUID();
  const { rows } = await pool.query(`INSERT INTO games(id,owner_id,title,description,scene)
    VALUES($1,$2,$3,$4,$5) RETURNING *`, [id, req.user.id, title || 'Untitled world', description, scene]);
  res.status(201).json({ game: safeGame(rows[0]) });
});

app.put('/api/games/:id', auth, async (req, res) => {
  const scene = validateScene(req.body.scene);
  if (!scene) return res.status(400).json({ error: 'Invalid world data. Maximum 2000 blocks.' });
  const title = String(req.body.title || 'Untitled world').trim().slice(0,48);
  const description = String(req.body.description || '').trim().slice(0,240);
  const published = Boolean(req.body.published);
  const { rows } = await pool.query(`UPDATE games SET title=$1,description=$2,scene=$3,published=$4,updated_at=NOW()
    WHERE id=$5 AND owner_id=$6 RETURNING *`, [title || 'Untitled world', description, scene, published, req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Game not found or not yours.' });
  res.json({ game: safeGame(rows[0]) });
});

app.delete('/api/games/:id', auth, async (req, res) => {
  const result = await pool.query('DELETE FROM games WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Game not found.' });
  res.json({ ok: true });
});

function validateScene(scene) {
  if (!scene || !Array.isArray(scene.blocks) || scene.blocks.length > 2000) return null;
  const blocks = [];
  for (const b of scene.blocks) {
    const x = Number(b.x), y = Number(b.y), z = Number(b.z);
    const color = String(b.color || '#7c5cff');
    if (![x,y,z].every(Number.isFinite) || Math.abs(x)>30 || y<0 || y>20 || Math.abs(z)>30 || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
    blocks.push({ x, y, z, color });
  }
  return { blocks };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, 'client/dist');
app.use(express.static(dist));
app.get('*', (req,res) => res.sendFile(path.join(dist,'index.html')));
app.listen(port, () => console.log(`Blockverse listening on ${port}`));
