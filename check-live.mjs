/**
 * בדיקות מקומיות ל-api/live.js. האחסון מדומה בזיכרון, ושום דבר לא יוצא לרשת.
 * הרצה: node check-live.mjs
 */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { _resetRateLimits } from './lib/api-guard.js';
import crypto from 'node:crypto';
import { BlobNotFoundError } from '@vercel/blob';

process.env.LIVE_CODE_SHA = crypto.createHash('sha256').update('test-code-123').digest('hex');

const blobs = new Map();
let t = 0;
globalThis.__liveStore = {
  async put(pathname, body) { const url = 'https://abc.public.blob.vercel-storage.com/' + pathname; blobs.set(pathname, { url, pathname, body: Buffer.from(body), uploadedAt: new Date(1e12 + (t++) * 1000).toISOString() }); return { url, pathname }; },
  async list({ prefix }) { return { blobs: [...blobs.values()].filter((b) => b.pathname.startsWith(prefix)), hasMore: false }; },
  async del(urls) { for (const u of [].concat(urls)) for (const [k, b] of blobs) if (b.url === u) blobs.delete(k); },
  // השגיאה האמיתית של הספרייה. שגיאה מומצאת עם name אחר הסתירה כאן באג שהיה בייצור
  async head(url) { const b = [...blobs.values()].find((x) => x.url === String(url)); if (!b) throw new BlobNotFoundError(); return { url: b.url, pathname: b.pathname }; },
};
globalThis.fetch = async (u) => { const b = [...blobs.values()].find((x) => x.url === String(u)); return b ? { ok: true, json: async () => JSON.parse(b.body.toString()), arrayBuffer: async () => b.body } : { ok: false, status: 404 }; };
const { default: live } = await import('./api/live.js');

function call({ method = 'GET', url, headers = {}, body, raw }) {
  const data = raw ? raw : body === undefined ? null : Buffer.from(JSON.stringify(body));
  const req = Readable.from(data ? [data] : []);
  req.method = method; req.url = url;
  req.headers = { origin: 'https://nexadapt.co.il', 'x-forwarded-for': '9.9.9.9', ...(data ? { 'content-length': String(data.length) } : {}), ...headers };
  if (body !== undefined && !raw) req.body = body;
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); }, send(b) { resolve({ status: this.statusCode, raw: b }); } };
    live(req, res);
  });
}
const CODE = { 'x-live-code': 'test-code-123' };

// הסקר
let r = await call({ url: '/api/live?op=votes&poll=survey' });
assert.equal(r.status, 200); assert.deepEqual(r.body.counts, [0, 0, 0, 0]);
for (const c of [0, 2, 2, 3]) { r = await call({ method: 'POST', url: '/api/live?op=vote', body: { poll: 'survey', choice: c } }); assert.equal(r.status, 200); }
r = await call({ url: '/api/live?op=votes&poll=survey' }); assert.deepEqual(r.body.counts, [1, 0, 2, 1]); assert.equal(r.body.total, 4);
r = await call({ method: 'POST', url: '/api/live?op=vote', body: { poll: 'survey', choice: 9 } }); assert.equal(r.status, 400);
r = await call({ method: 'POST', url: '/api/live?op=vote', body: { poll: 'nope', choice: 1 } }); assert.equal(r.status, 400);
r = await call({ method: 'POST', url: '/api/live?op=vote', headers: { origin: 'https://evil.example' }, body: { poll: 'survey', choice: 1 } }); assert.equal(r.status, 403);
_resetRateLimits();
for (let i = 0; i < 2000; i++) await call({ method: 'POST', url: '/api/live?op=vote', headers: { 'x-forwarded-for': '7.7.7.7' }, body: { poll: 'survey', choice: 1 } });
r = await call({ method: 'POST', url: '/api/live?op=vote', headers: { 'x-forwarded-for': '7.7.7.7' }, body: { poll: 'survey', choice: 1 } }); assert.equal(r.status, 429);

// הניבוי ומונה העסקאות
_resetRateLimits();
r = await call({ url: '/api/live?op=votes&poll=deal' }); assert.equal(r.status, 200); assert.deepEqual(r.body.counts, [0]);
for (let i = 0; i < 3; i++) { r = await call({ method: 'POST', url: '/api/live?op=vote', body: { poll: 'deal', choice: 0 } }); assert.equal(r.status, 200); }
r = await call({ method: 'POST', url: '/api/live?op=vote', body: { poll: 'deal', choice: 1 } }); assert.equal(r.status, 400);
r = await call({ url: '/api/live?op=votes&poll=deal' }); assert.equal(r.body.total, 3);
r = await call({ method: 'POST', url: '/api/live?op=vote', body: { poll: 'predict', choice: 3 } }); assert.equal(r.status, 200);
r = await call({ url: '/api/live?op=votes&poll=predict' }); assert.deepEqual(r.body.counts, [0, 0, 0, 1]);

// הקישור לסוכן
r = await call({ url: '/api/live?op=agent' }); assert.equal(r.status, 200); assert.equal(r.body.url, null); assert.deepEqual(r.body.room, []);
r = await call({ method: 'POST', url: '/api/live?op=agent', body: { room: ['אין לי מקום', '', 'תשאיר קטלוג', 'רביעי', 'חמישי'] }, headers: CODE }); assert.equal(r.status, 200);
r = await call({ url: '/api/live?op=agent' }); assert.equal(r.body.url, null); assert.deepEqual(r.body.room, ['אין לי מקום', 'תשאיר קטלוג', 'רביעי']);
r = await call({ method: 'POST', url: '/api/live?op=agent', body: { url: 'https://gemini.google.com/gem/zzz', room: ['<b>שורה\nשנייה</b>'] }, headers: CODE }); assert.equal(r.status, 200);
r = await call({ url: '/api/live?op=agent' }); assert.equal(r.body.room.length, 1); assert.ok(!/[\n]/.test(r.body.room[0]));
r = await call({ method: 'POST', url: '/api/live?op=agent', body: { url: 'https://gemini.google.com/gem/abc123?usp=sharing' } }); assert.equal(r.status, 401, 'בלי קוד אסור');
for (const bad of ['http://gemini.google.com/gem/x', 'https://evil.example/gem', 'https://gemini.google.com.evil.example/x', 'javascript:alert(1)', 'https://user:pw@gemini.google.com/x', 'https://gemini.google.com/' + 'a'.repeat(400)]) {
  r = await call({ method: 'POST', url: '/api/live?op=agent', body: { url: bad }, headers: CODE }); assert.equal(r.status, 400, bad);
}
r = await call({ method: 'POST', url: '/api/live?op=agent', body: { url: 'https://gemini.google.com/gem/abc123?usp=sharing' }, headers: { ...CODE, origin: 'https://evil.example' } }); assert.equal(r.status, 403);
r = await call({ method: 'POST', url: '/api/live?op=agent', body: { url: 'https://gemini.google.com/gem/abc123?usp=sharing' }, headers: CODE }); assert.equal(r.status, 200);
r = await call({ method: 'POST', url: '/api/live?op=agent', body: { url: 'https://gemini.google.com/gem/def456?usp=sharing' }, headers: CODE }); assert.equal(r.status, 200);
r = await call({ url: '/api/live?op=agent' }); assert.equal(r.body.url, 'https://gemini.google.com/gem/def456?usp=sharing');
assert.equal([...blobs.keys()].filter((k) => k.includes('/agent/')).length, 1, 'נשאר רק הקישור האחרון');
r = await call({ method: 'POST', url: '/api/live?op=agent', body: { url: '' }, headers: CODE }); assert.equal(r.status, 200);
r = await call({ url: '/api/live?op=agent' }); assert.equal(r.body.url, null);
r = await call({ method: 'POST', url: '/api/live?op=clear&what=agent', headers: CODE }); assert.equal(r.status, 200);
r = await call({ url: '/api/live?op=agent' }); assert.equal(r.body.url, null);
await call({ method: 'POST', url: '/api/live?op=agent', body: { url: 'https://g.co/gemini/share/abc' }, headers: CODE });

// הסרט
r = await call({ method: 'POST', url: '/api/live?op=part&id=item-abc123&n=0', raw: Buffer.from('hello'), headers: { 'content-type': 'application/octet-stream' } });
assert.equal(r.status, 401, 'בלי קוד אסור');
r = await call({ method: 'POST', url: '/api/live?op=part&id=item-abc123&n=0', raw: Buffer.from('hello'), headers: { ...CODE, 'content-type': 'application/octet-stream' } });
assert.equal(r.status, 200); const partUrl = r.body.url; assert.match(partUrl, /live\/danshar\/film\/items\/item-abc123\/000$/);
r = await call({ method: 'POST', url: '/api/live?op=part&id=BAD!&n=0', raw: Buffer.from('x'), headers: CODE }); assert.equal(r.status, 400);
r = await call({ method: 'POST', url: '/api/live?op=part&id=item-big000&n=0', raw: Buffer.alloc(4 * 1024 * 1024), headers: CODE }); assert.equal(r.status, 413);
r = await call({ method: 'POST', url: '/api/live?op=manifest', body: { items: [{ id: 'item-abc123', kind: 'image', mime: 'image/jpeg', name: 'a.jpg', parts: [partUrl, 'https://evil.example/x'] }], settings: { t1: 'א', t2: 'ב', len: 90 } }, headers: CODE });
assert.equal(r.status, 200); assert.equal(r.body.count, 1);
for (let i = 0; i < 4; i++) await call({ method: 'POST', url: '/api/live?op=manifest', body: { items: [], settings: {} }, headers: CODE });
await call({ method: 'POST', url: '/api/live?op=manifest', body: { items: [{ id: 'item-abc123', kind: 'image', mime: 'image/jpeg', name: 'a.jpg', parts: [partUrl] }], settings: { t1: 'סוף', len: 0 } }, headers: CODE });
r = await call({ url: '/api/live?op=manifest' }); assert.equal(r.status, 200); assert.equal(r.body.items.length, 1); assert.deepEqual(r.body.items[0].parts, [partUrl]); assert.equal(r.body.settings.t1, 'סוף'); assert.equal(r.body.settings.len, 0);
assert.ok([...blobs.keys()].filter((k) => k.includes('/manifest/')).length <= 3, 'נשארות רק שלוש רשימות');

// שני מחשבים: רשימה ממחשב אחד לא מוחקת את מה שהועלה ממחשב אחר
const it = (id) => ({ id, kind: 'image', mime: 'image/jpeg', name: id + '.jpg', parts: [partUrl] });
const ids = async () => (await call({ url: '/api/live?op=manifest' })).body.items.map((x) => x.id);
await call({ method: 'POST', url: '/api/live?op=manifest', body: { items: [it('mati-a1'), it('mati-a2')], settings: { t1: 'מתי' } }, headers: CODE });
r = await call({ method: 'POST', url: '/api/live?op=manifest', body: { items: [] }, headers: CODE });
assert.equal(r.body.others, 3, 'מחשב ריק רואה את מה שיש במצגת');
assert.ok((await ids()).includes('mati-a1') && (await ids()).includes('mati-a2'), 'רשימה ריקה ממחשב אחר לא מוחקת');
await call({ method: 'POST', url: '/api/live?op=manifest', body: { items: [it('aran-b1')] }, headers: CODE });
assert.equal((await call({ url: '/api/live?op=manifest' })).body.settings.t1, 'מתי', 'מחשב שלא שינה כותרות לא דורס אותן');
assert.deepEqual((await ids()).slice(0, 1), ['aran-b1'], 'מה שנשלח עכשיו בא ראשון');
assert.ok((await ids()).includes('mati-a1'), 'ושל מתי נשאר');
await call({ method: 'POST', url: '/api/live?op=manifest', body: { items: [it('mati-a2')], removed: ['mati-a1'] }, headers: CODE });
assert.ok(!(await ids()).includes('mati-a1'), 'מה שנמחק במחשב שלו יוצא מהמצגת');
assert.ok((await ids()).includes('aran-b1') && (await ids()).includes('mati-a2'), 'והשאר נשאר');
// תוצר שהקבצים שלו נמחקו (ניקוי ממחשב אחר): בבדיקה בפתיחה הוא יוצא מהרשימה, והכלי מקבל אותו ב-dead
const deadPart = 'https://abc.public.blob.vercel-storage.com/live/danshar/film/items/gone12/000';
r = await call({ method: 'POST', url: '/api/live?op=manifest', body: { items: [it('mati-a2'), { ...it('gone12'), parts: [deadPart] }], verify: ['mati-a2', 'gone12'] }, headers: CODE });
assert.deepEqual(r.body.dead, ['gone12'], 'תוצר בלי קבצים מסומן dead');
assert.ok(!(await ids()).includes('gone12') && (await ids()).includes('mati-a2'), 'ולא נכנס לרשימה, והשאר כן');
r = await call({ method: 'POST', url: '/api/live?op=manifest', body: { items: [{ ...it('gone34'), parts: [deadPart] }] }, headers: CODE });
assert.deepEqual(r.body.dead, [], 'בלי verify לא בודקים (תוצר שעלה עכשיו)');
r = await call({ url: '/api/live?op=part&u=' + encodeURIComponent(partUrl) }); assert.equal(r.status, 200); assert.equal(Buffer.from(r.raw).toString(), 'hello');
r = await call({ url: '/api/live?op=part&u=' + encodeURIComponent('https://evil.example/live/danshar/film/items/x') }); assert.equal(r.status, 400);
r = await call({ method: 'POST', url: '/api/live?op=clear', headers: CODE }); assert.equal(r.status, 200); assert.equal([...blobs.keys()].length, 0);
console.log('check-live: כל הבדיקות עברו');
