/**
 * שכבת הגנה משותפת לשלוש הפונקציות ב־api/.
 *
 * מה יש כאן ולמה:
 * - בדיקת מקור (Origin/Referer): הטפסים באתר נשלחים תמיד מהדפדפן עם כותרת Origin.
 *   בקשה בלי מקור, או ממקור זר, אינה מהאתר — והיא נדחית לפני שנוגעים בריסנד.
 * - הגבלת קצב: מונע שימוש בטופס ההרשמה כדי להציף כתובת זרה במיילים מהדומיין שלנו,
 *   ולשרוף את מכסת השליחה. המונה יושב בזיכרון של הפונקציה, ולכן הוא "ההגנה הראשונה",
 *   לא היחידה: מופע חדש של הפונקציה מתחיל מאפס. חומת האש של Vercel היא השכבה השנייה.
 * - קריאת גוף מוגבלת בגודל: טופס לגיטימי שוקל פחות מ־8KB. מעבר לזה — 413.
 * - ניקוי תווי בקרה מהקלט: שורה חדשה בשם או בכתובת לא תגיע לכותרת מייל.
 *
 * הקובץ יושב ב־lib/ ולא ב־api/, כדי ש־Vercel לא יהפוך אותו לפונקציה בפני עצמה.
 */

const DEFAULT_HOSTS = ['nexadapt.co.il', 'www.nexadapt.co.il', 'kfitzat-madrega.vercel.app'];

/** המארחים שמותר להם לשלוח טפסים. SITE_URL מצטרף אוטומטית. */
export function allowedHosts() {
  const hosts = new Set(DEFAULT_HOSTS);
  try {
    if (process.env.SITE_URL) hosts.add(new URL(process.env.SITE_URL).host);
  } catch { /* SITE_URL לא תקין — מתעלמים */ }
  return hosts;
}

function hostOf(value) {
  try { return new URL(String(value)).host; } catch { return ''; }
}

/**
 * true אם הבקשה הגיעה מהאתר עצמו. פריסות תצוגה מקדימה (*.vercel.app של הפרויקט)
 * מותרות כדי שאפשר יהיה לבדוק טפסים לפני שהם עולים לאוויר.
 */
export function isSameSite(req) {
  const origin = req.headers?.origin;
  const referer = req.headers?.referer;
  const host = origin ? hostOf(origin) : hostOf(referer);
  if (!host) return false;
  if (allowedHosts().has(host)) return true;
  return /^kfitzat-madrega(-[a-z0-9-]+)?\.vercel\.app$/i.test(host);
}

/** כתובת הלקוח כפי ש־Vercel מעביר אותה. */
export function clientIp(req) {
  const xff = String(req.headers?.['x-forwarded-for'] || '');
  const first = xff.split(',')[0].trim();
  return first || String(req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
}

// מונה קצב בזיכרון: מפתח -> [חותמות זמן של בקשות בחלון]
const buckets = new Map();
let lastSweep = Date.now();

/**
 * מחזיר true אם המפתח עבר את המכסה בחלון הזמן. כל קריאה נספרת.
 * @param {string} key   למשל `ip:1.2.3.4` או `email:a@b.co`
 * @param {number} limit כמה בקשות מותרות בחלון
 * @param {number} windowMs אורך החלון במילישניות
 */
export function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, times] of buckets) {
      const alive = times.filter((t) => now - t < windowMs);
      if (alive.length) buckets.set(k, alive); else buckets.delete(k);
    }
    lastSweep = now;
  }
  const times = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  times.push(now);
  buckets.set(key, times);
  return times.length > limit;
}

/** לבדיקות בלבד — מאפס את המונים. */
export function _resetRateLimits() { buckets.clear(); }

/**
 * קורא גוף JSON עם תקרת גודל. מחזיר אובייקט; גוף גדול מדי זורק שגיאה עם status 413.
 */
export async function readJson(req, maxBytes = 8 * 1024) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body) > maxBytes) throw Object.assign(new Error('body_too_large'), { status: 413 });
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const declared = Number(req.headers?.['content-length'] || 0);
  if (declared > maxBytes) throw Object.assign(new Error('body_too_large'), { status: 413 });
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > maxBytes) throw Object.assign(new Error('body_too_large'), { status: 413 });
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

/** מחרוזת נקייה: בלי תווי בקרה, קצוצה לאורך מרבי. */
export function clean(value, max) {
  return String(value ?? '')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .trim()
    .slice(0, max);
}

/** כתובת מייל תקינה לצרכינו: בלי רווחים, עם @ ונקודה, ובאורך סביר. */
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** כותרות שכל תשובת API צריכה. */
export function apiHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

/**
 * רישום אירוע אבטחה ללוגים של Vercel — בלי כתובות מייל ובלי תוכן הודעות.
 */
export function logEvent(fn, event, extra = {}) {
  console.warn(JSON.stringify({ fn, event, ...extra, at: new Date().toISOString() }));
}
