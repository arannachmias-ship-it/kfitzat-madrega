/**
 * בדיקות מקומיות לפונקציות ה־API. Resend מדומה — שום מייל לא יוצא.
 * הרצה: node check-api.mjs
 */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import subscribe from './api/subscribe.js';
import pniya from './api/pniya.js';
import confirm from './api/confirm.js';
import { makeToken, verifyToken, LEGACY_UNTIL } from './lib/confirm-token.js';
import { _resetRateLimits } from './lib/api-guard.js';
import crypto from 'node:crypto';

process.env.RESEND_API_KEY = 'test-key';
process.env.RESEND_AUDIENCE_ID = 'aud';
process.env.CONFIRM_SECRET = 'unit-test-secret';
process.env.MAIL_FROM = 'Nexadapt <contact@nexadapt.co.il>';
process.env.SITE_URL = 'https://nexadapt.co.il';

const calls = [];
let fetchMode = 'ok';
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (fetchMode === 'throw') throw new Error('network down');
  return { ok: true, status: 200, text: async () => '' };
};

function req({ method = 'POST', url = '/api/x', headers = {}, body, ip = '1.1.1.1' } = {}) {
  const raw = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  const r = Readable.from(raw ? [Buffer.from(raw)] : []);
  r.method = method; r.url = url;
  r.headers = { 'x-forwarded-for': ip, 'content-length': String(Buffer.byteLength(raw)), ...headers };
  return r;
}
function res() {
  const out = { status: 200, headers: {}, body: undefined, redirect: undefined };
  return {
    out,
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    status(c) { out.status = c; return this; },
    json(b) { out.body = b; return this; },
    redirect(c, l) { out.status = c; out.redirect = l; return this; },
  };
}
const SAME = { origin: 'https://nexadapt.co.il', 'content-type': 'application/json' };
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); console.log('  ok  ', m); };

// ---------- subscribe ----------
console.log('== subscribe ==');
_resetRateLimits(); calls.length = 0;
let r = res(); await subscribe(req({ body: { email: 'a@b.co', consent: true } }), r);
ok(r.out.status === 403 && calls.length === 0, 'בלי Origin: 403 ואין קריאה לריסנד');
r = res(); await subscribe(req({ headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: { email: 'a@b.co', consent: true } }), r);
ok(r.out.status === 403 && calls.length === 0, 'Origin זר: 403');
r = res(); await subscribe(req({ headers: { referer: 'https://www.nexadapt.co.il/', 'content-type': 'text/plain' }, body: '{"email":"a@b.co","consent":true}' }), r);
ok(r.out.status === 200 && calls.length === 2, 'מהאתר (Referer, www): 200 ושתי קריאות לריסנד');
const link = JSON.parse(calls[1].init.body).html.match(/href="([^"]+)"/)[1];
ok(/\/api\/confirm\?e=a%40b\.co&t=\d{13}\.[A-Za-z0-9_-]{40,}$/.test(link), 'הקישור במייל נושא טוקן עם תפוגה: ' + link.slice(-60));
ok(r.out.headers['cache-control'] === 'no-store', 'תשובת API עם no-store');
calls.length = 0;
r = res(); await subscribe(req({ headers: SAME, body: { email: 'a@b.co', consent: true }, ip: '2.2.2.2' }), r);
ok(r.out.status === 200 && calls.length === 0, 'אותה כתובת שוב מ־IP אחר: 200 בלי שליחה (קירור לכתובת)');
r = res(); await subscribe(req({ headers: SAME, body: { email: 'x@y.co', consent: 'true' } }), r);
ok(r.out.status === 400 && r.out.body.error === 'invalid_email' || r.out.status === 200, 'כתובת אחרת מאותו IP עוברת');
for (let i = 0; i < 6; i++) { r = res(); await subscribe(req({ headers: SAME, body: { email: `u${i}@y.co`, consent: true } }), r); }
ok(r.out.status === 429, 'IP אחד, יותר מחמש בקשות בעשר דקות: 429');
_resetRateLimits(); calls.length = 0;
r = res(); await subscribe(req({ headers: SAME, body: '{"email":"' + 'a'.repeat(9000) + '@b.co"}' }), r);
ok(r.out.status === 413 && calls.length === 0, 'גוף גדול מ־8KB: 413');
// כמו ב־Vercel: הגוף כבר מפוענח לאובייקט, ורק content-length מסגיר את הגודל
{ const big = req({ headers: SAME, body: '{}' }); big.body = { email: 'a@b.co', consent: true, pad: 'x'.repeat(9000) }; big.headers['content-length'] = '9100'; r = res(); await subscribe(big, r); }
ok(r.out.status === 413 && calls.length === 0, 'גוף מפוענח מראש גדול מ־8KB: 413');
r = res(); await subscribe(req({ headers: SAME, body: { email: 'not an email', consent: true } }), r);
ok(r.out.status === 400 && r.out.body.error === 'invalid_email', 'כתובת לא תקינה: 400');
r = res(); await subscribe(req({ headers: SAME, body: { email: 'q@w.co', consent: false } }), r);
ok(r.out.status === 400 && r.out.body.error === 'consent_required', 'בלי הסכמה: 400');
r = res(); await subscribe(req({ headers: SAME, body: { email: 'q@w.co', consent: true, website: 'spam' } }), r);
ok(r.out.status === 200 && calls.length === 0, 'מלכודת בוטים: 200 שקט בלי שליחה');
fetchMode = 'throw'; _resetRateLimits();
r = res(); await subscribe(req({ headers: SAME, body: { email: 'z@w.co', consent: true } }), r);
ok(r.out.status === 502 && r.out.body.error === 'send_failed', 'ריסנד נופל: 502 מסודר, לא קריסה');
fetchMode = 'ok';

// ---------- pniya ----------
console.log('== pniya ==');
_resetRateLimits(); calls.length = 0;
r = res(); await pniya(req({ body: { name: 'a', email: 'a@b.co', message: 'hello there friend' } }), r);
ok(r.out.status === 403, 'בלי Origin: 403');
r = res(); await pniya(req({ headers: SAME, body: { name: 'דנה\r\nBcc: victim@x.co', email: 'a@b.co', message: 'שלום\nשורה שנייה\u0000' } }), r);
ok(r.out.status === 200 && calls.length === 1, 'פנייה תקינה: 200 וקריאה אחת');
const sentBody = JSON.parse(calls[0].init.body);
ok(!/[\r\n]/.test(sentBody.subject) && sentBody.subject.includes('דנה  Bcc'), 'תווי שורה חדשה בשם לא מגיעים לכותרת: ' + sentBody.subject);
ok(sentBody.html.includes('שלום\nשורה שנייה') && !sentBody.html.includes('\u0000'), 'שורות חדשות בהודעה נשמרות, תווי בקרה אחרים מנוקים');
ok(sentBody.html.includes('&lt;') === false && sentBody.html.includes('דנה'), 'HTML במייל מוברח (אין תגיות מהקלט)');
r = res(); await pniya(req({ headers: SAME, body: { name: '<b>x</b>', email: 'a@b.co', message: '<script>alert(1)</script>' } }), r);
ok(JSON.parse(calls[1].init.body).html.includes('&lt;script&gt;'), 'תגיות בקלט מוברחות במייל');
for (let i = 0; i < 6; i++) { r = res(); await pniya(req({ headers: SAME, body: { name: 'a', email: 'a@b.co', message: 'hello there friend' } }), r); }
ok(r.out.status === 429, 'IP אחד, יותר מחמש פניות בעשר דקות: 429');

// ---------- confirm ----------
console.log('== confirm ==');
_resetRateLimits(); calls.length = 0;
const secret = process.env.CONFIRM_SECRET;
const good = makeToken('a@b.co', secret);
r = res(); await confirm(req({ method: 'GET', url: `/api/confirm?e=a%40b.co&t=${good}` }), r);
ok(r.out.redirect === '/toda?status=ok' && calls.length === 1 && calls[0].init.method === 'PATCH', 'טוקן תקין: PATCH לריסנד והפניה ל־ok');
r = res(); await confirm(req({ method: 'GET', url: `/api/confirm?e=other%40b.co&t=${good}` }), r);
ok(r.out.redirect === '/toda?status=invalid', 'טוקן של כתובת אחרת: invalid');
const tampered = good.slice(0, -2) + 'AA';
r = res(); await confirm(req({ method: 'GET', url: `/api/confirm?e=a%40b.co&t=${tampered}` }), r);
ok(r.out.redirect === '/toda?status=invalid', 'טוקן משובש: invalid');
const old = makeToken('a@b.co', secret, Date.now() - 15 * 24 * 3600 * 1000);
r = res(); await confirm(req({ method: 'GET', url: `/api/confirm?e=a%40b.co&t=${old}` }), r);
ok(r.out.redirect === '/toda?status=expired', 'טוקן בן 15 יום: expired');
const legacy = crypto.createHmac('sha256', secret).update('a@b.co').digest('base64url');
r = res(); await confirm(req({ method: 'GET', url: `/api/confirm?e=a%40b.co&t=${legacy}` }), r);
ok(r.out.redirect === '/toda?status=ok', 'קישור בפורמט הישן עדיין עובד עד ' + new Date(LEGACY_UNTIL).toISOString().slice(0, 10));
ok(verifyToken('a@b.co', legacy, secret, LEGACY_UNTIL + 1) === 'invalid', 'ואחרי התאריך: נדחה');
r = res(); await confirm(req({ method: 'POST', url: `/api/confirm?e=a%40b.co&t=${good}` }), r);
ok(r.out.status === 405, 'POST ל־confirm: 405');
fetchMode = 'throw';
r = res(); await confirm(req({ method: 'GET', url: `/api/confirm?e=a%40b.co&t=${good}` }), r);
ok(r.out.redirect === '/toda?status=error', 'ריסנד נופל: הפניה ל־error, לא קריסה');
fetchMode = 'ok';
for (let i = 0; i < 31; i++) { r = res(); await confirm(req({ method: 'GET', url: `/api/confirm?e=a%40b.co&t=x${i}`, ip: '9.9.9.9' }), r); }
r = res(); await confirm(req({ method: 'GET', url: `/api/confirm?e=a%40b.co&t=${good}`, ip: '9.9.9.9' }), r);
ok(r.out.redirect === '/toda?status=invalid', 'אחרי 30 ניחושים מאותו IP: גם טוקן תקין נחסם (הגבלת קצב)');

console.log(`\nכל ${n} הבדיקות עברו.`);
