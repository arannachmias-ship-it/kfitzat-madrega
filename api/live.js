/**
 * /api/live — הכלים החיים של הסדנאות (כרגע: דנשר, 11.11.2026).
 *
 * שני דברים:
 * 1. סקרים אנונימיים שהתוצאות שלהם מופיעות על המקרן: הסקר (survey), הניבוי (predict),
 *    ומונה העסקאות שנסגרו מול הסוכן (deal, אפשרות אחת שסופרים).
 *    POST ?op=vote {poll, choice} — הצבעה אחת. GET ?op=votes&poll= — הספירה.
 *    כל הצבעה נשמרת כקובץ ריק בנתיב votes/<poll>/<choice>/<uuid>, וסופרים לפי הנתיב.
 *    בלי שם, בלי טלפון, בלי כתובת IP שנשמרת.
 * 2. סרט הסיום: מתי מעלה תוצרים מהכלי שלו, והמלווה שעל המקרן מושך אותם לבד.
 *    POST ?op=part&id=&n= (גוף בינארי עד 3.5MB) — חלק מתוצר. מחזיר את הכתובת שלו.
 *    POST ?op=manifest {items, settings} — הרשימה והסדר. GET ?op=manifest — הרשימה האחרונה.
 *    GET ?op=part&u=<כתובת> — מעביר חלק למלווה (שם מותר לפנות רק לאתר עצמו).
 *    POST ?op=clear — מוחק את כל הקבצים של הסדנה. לאחר הסדנה.
 * 3. הסוכן שנבנה בסדנה: GET ?op=agent — {url, room}. POST ?op=agent {url, room} — עם קוד.
 *    url: הקישור לשיתוף של ה-Gem (רק של Gemini). room: עד שלושה משפטים קשים ששמענו בחדר.
 *    הברקוד על המקרן מפנה תמיד ל-/live/danshar/a, והדף הזה פותח את הקישור ששמור כאן,
 *    ומוסיף את המשפטים מהחדר להוראות שמעתיקים.
 *    הכתיבה לסרט דורשת קוד (x-live-code). כאן נשמר רק ה-SHA-256 שלו.
 *
 * ההגנות מ-lib/api-guard.js: רק מהאתר עצמו, הגבלת קצב, תקרת גודל.
 */
import crypto from 'node:crypto';
import { apiHeaders, isSameSite, clientIp, rateLimited, readJson, clean, logEvent } from '../lib/api-guard.js';
import { store } from '../lib/live-store.js';

const ROOT = 'live/danshar';
const POLLS = { survey: 4, predict: 4, deal: 1 };
// ה-SHA-256 של קוד ההעלאה. הקוד עצמו לא נמצא בקוד. בבדיקות מחליפים אותו במשתנה סביבה.
const CODE_SHA = process.env.LIVE_CODE_SHA || '195c04267395655a97f7688568978f5029f3ff3bf8ff77997592b0ddc77bdde1';
const PART_MAX = 3.5 * 1024 * 1024;
const ID_RE = /^[a-z0-9-]{6,48}$/;
const PUB = { access: 'public', addRandomSuffix: false, allowOverwrite: true };

function okCode(req) {
  const c = String(req.headers?.['x-live-code'] || '');
  if (!c || c.length > 64) return false;
  const a = Buffer.from(crypto.createHash('sha256').update(c).digest('hex'));
  const b = Buffer.from(CODE_SHA);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readRaw(req, max) {
  const declared = Number(req.headers?.['content-length'] || 0);
  if (declared > max) throw Object.assign(new Error('body_too_large'), { status: 413 });
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error('body_too_large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const r = await store().list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

/** קישור לסוכן: רק https, ורק של Gemini */
function isAgentUrl(u) {
  try {
    const x = new URL(u);
    return u.length <= 300 && x.protocol === 'https:' && !x.username && !x.password && !x.port &&
      ['gemini.google.com', 'g.co', 'share.gemini.google'].includes(x.hostname);
  } catch { return false; }
}

/** המשפטים מהחדר: עד שלושה, כל אחד עד 160 תווים, בלי שורות ריקות */
function cleanRoom(v) {
  return (Array.isArray(v) ? v : []).map((x) => clean(String(x ?? ''), 160).replace(/[\r\n]+/g, ' ').trim()).filter(Boolean).slice(0, 3);
}

/** כתובת של קובץ מהאחסון שלנו, ורק מתחת לתיקיית הסרט */
function isOurPart(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && /\.public\.blob\.vercel-storage\.com$/.test(x.hostname) && x.pathname.startsWith('/' + ROOT + '/film/items/');
  } catch { return false; }
}

export default async function handler(req, res) {
  apiHeaders(res);
  if (!process.env.BLOB_READ_WRITE_TOKEN && !globalThis.__liveStore) return res.status(503).json({ error: 'not_configured' });
  let url;
  try { url = new URL(req.url, 'https://nexadapt.co.il'); } catch { return res.status(400).json({ error: 'bad_request' }); }
  const op = url.searchParams.get('op');
  const ip = clientIp(req);

  try {
    // ---------- הסקר ----------
    if (op === 'votes' && req.method === 'GET') {
      const poll = url.searchParams.get('poll');
      if (!POLLS[poll]) return res.status(404).json({ error: 'no_poll' });
      if (rateLimited(`votes:${ip}`, 120, 60_000)) return res.status(429).json({ error: 'rate_limited' });
      const counts = Array(POLLS[poll]).fill(0);
      for (const b of await listAll(`${ROOT}/votes/${poll}/`)) {
        const c = Number(b.pathname.split('/')[4]);
        if (Number.isInteger(c) && c >= 0 && c < counts.length) counts[c] += 1;
      }
      return res.status(200).json({ poll, counts, total: counts.reduce((a, b) => a + b, 0) });
    }
    if (op === 'vote' && req.method === 'POST') {
      if (!isSameSite(req)) return res.status(403).json({ error: 'forbidden' });
      // תקרה גבוהה: כל החדר עשוי לצאת מאותה כתובת של ה-Wi-Fi באולם
      if (rateLimited(`vote:${ip}`, 300, 10 * 60_000)) return res.status(429).json({ error: 'rate_limited' });
      const body = await readJson(req, 1024);
      const poll = clean(body.poll, 20);
      const choice = Number(body.choice);
      if (!POLLS[poll] || !Number.isInteger(choice) || choice < 0 || choice >= POLLS[poll]) return res.status(400).json({ error: 'bad_vote' });
      await store().put(`${ROOT}/votes/${poll}/${choice}/${crypto.randomUUID()}`, '1', { ...PUB, contentType: 'text/plain' });
      return res.status(200).json({ ok: true });
    }

    // ---------- הקישור לסוכן ----------
    if (op === 'agent' && req.method === 'GET') {
      if (rateLimited(`agent:${ip}`, 300, 60_000)) return res.status(429).json({ error: 'rate_limited' });
      const all = await listAll(`${ROOT}/agent/`);
      if (!all.length) return res.status(200).json({ url: null, room: [] });
      all.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const r = await fetch(all[0].url, { cache: 'no-store' });
      if (!r.ok) return res.status(502).json({ error: 'store_error' });
      const m = await r.json();
      return res.status(200).json({ url: isAgentUrl(String(m.url || '')) ? m.url : null, room: cleanRoom(m.room), updatedAt: all[0].uploadedAt });
    }
    if (op === 'agent' && req.method === 'POST') {
      if (!isSameSite(req)) return res.status(403).json({ error: 'forbidden' });
      if (!okCode(req)) { logEvent('live', 'bad_code'); return res.status(401).json({ error: 'bad_code' }); }
      const body = await readJson(req, 4096);
      const u = String(body.url || '').trim();
      const room = cleanRoom(body.room);
      if (u !== '' && !isAgentUrl(u)) return res.status(400).json({ error: 'bad_url' });
      const old = await listAll(`${ROOT}/agent/`);
      if (u === '' && !room.length) {
        if (old.length) await store().del(old.map((b) => b.url));
        return res.status(200).json({ ok: true, url: null, room: [] });
      }
      const b = await store().put(`${ROOT}/agent/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.json`, JSON.stringify({ url: u || null, room }), { ...PUB, contentType: 'application/json' });
      const stale = old.filter((x) => x.url !== b.url);
      if (stale.length) await store().del(stale.map((x) => x.url));
      return res.status(200).json({ ok: true, url: u || null, room });
    }

    // ---------- סרט הסיום ----------
    if (op === 'manifest' && req.method === 'GET') {
      if (rateLimited(`manifest:${ip}`, 60, 60_000)) return res.status(429).json({ error: 'rate_limited' });
      const all = await listAll(`${ROOT}/film/manifest/`);
      if (!all.length) return res.status(200).json({ items: [], settings: null, updatedAt: null });
      all.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const r = await fetch(all[0].url, { cache: 'no-store' });
      if (!r.ok) return res.status(502).json({ error: 'store_error' });
      const m = await r.json();
      return res.status(200).json({ ...m, updatedAt: all[0].uploadedAt });
    }
    if (op === 'manifest' && req.method === 'POST') {
      if (!isSameSite(req)) return res.status(403).json({ error: 'forbidden' });
      if (!okCode(req)) { logEvent('live', 'bad_code'); return res.status(401).json({ error: 'bad_code' }); }
      const body = await readJson(req, 64 * 1024);
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 200).map((it) => ({
        id: clean(it.id, 48),
        kind: it.kind === 'video' ? 'video' : 'image',
        mime: clean(it.mime, 60),
        name: clean(it.name, 120),
        parts: (Array.isArray(it.parts) ? it.parts : []).slice(0, 100).map((p) => String(p)).filter(isOurPart),
      })).filter((it) => ID_RE.test(it.id) && it.parts.length);
      const s = body.settings || {};
      const settings = { t1: clean(s.t1, 80), t2: clean(s.t2, 80), len: Number(s.len) === 0 ? 0 : 90, logo: s.logo !== false };
      await store().put(`${ROOT}/film/manifest/${Date.now()}.json`, JSON.stringify({ items, settings }), { ...PUB, contentType: 'application/json' });
      // שומרים רק את שלוש הרשימות האחרונות
      const old = (await listAll(`${ROOT}/film/manifest/`)).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(3);
      if (old.length) await store().del(old.map((b) => b.url));
      return res.status(200).json({ ok: true, count: items.length });
    }
    if (op === 'part' && req.method === 'POST') {
      if (!isSameSite(req)) return res.status(403).json({ error: 'forbidden' });
      if (!okCode(req)) { logEvent('live', 'bad_code'); return res.status(401).json({ error: 'bad_code' }); }
      const id = String(url.searchParams.get('id') || '');
      const n = Number(url.searchParams.get('n'));
      if (!ID_RE.test(id) || !Number.isInteger(n) || n < 0 || n > 99) return res.status(400).json({ error: 'bad_part' });
      const buf = await readRaw(req, PART_MAX);
      if (!buf.length) return res.status(400).json({ error: 'empty' });
      const b = await store().put(`${ROOT}/film/items/${id}/${String(n).padStart(3, '0')}`, buf, { ...PUB, contentType: 'application/octet-stream' });
      return res.status(200).json({ ok: true, url: b.url, size: buf.length });
    }
    if (op === 'part' && req.method === 'GET') {
      const u = String(url.searchParams.get('u') || '');
      if (!isOurPart(u)) return res.status(400).json({ error: 'bad_part' });
      if (rateLimited(`part:${ip}`, 600, 60_000)) return res.status(429).json({ error: 'rate_limited' });
      const r = await fetch(u);
      if (!r.ok) return res.status(404).json({ error: 'not_found' });
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.status(200).send(buf);
    }
    if (op === 'clear' && req.method === 'POST') {
      if (!isSameSite(req)) return res.status(403).json({ error: 'forbidden' });
      if (!okCode(req)) return res.status(401).json({ error: 'bad_code' });
      const w = url.searchParams.get('what');
      const what = ['votes', 'film', 'agent'].includes(w) ? w : 'all';
      const prefixes = what === 'all' ? [`${ROOT}/votes/`, `${ROOT}/film/`, `${ROOT}/agent/`] : [`${ROOT}/${what}/`];
      let n = 0;
      for (const p of prefixes) {
        const all = await listAll(p);
        for (let i = 0; i < all.length; i += 500) { await store().del(all.slice(i, i + 500).map((b) => b.url)); }
        n += all.length;
      }
      return res.status(200).json({ ok: true, deleted: n });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    if (e?.status === 413) return res.status(413).json({ error: 'body_too_large' });
    logEvent('live', 'error');
    return res.status(500).json({ error: 'server_error' });
  }
}
