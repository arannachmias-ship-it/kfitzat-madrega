/**
 * קישור האישור במייל: חתימת HMAC עם תאריך תפוגה.
 *
 * למה תפוגה: בלי תאריך, קישור אישור תקף לנצח. מי שמייל האישור הגיע אליו בטעות
 * (העברה, תיבה משותפת) יכול לרשום מחדש כתובת שכבר ביקשה להסיר את עצמה —
 * גם שנה אחרי. עם תפוגה, הקישור מת אחרי 14 יום, והרשמה חדשה מייצרת קישור חדש.
 *
 * מבנה הטוקן: `<exp>.<sig>` כאשר sig = HMAC-SHA256(secret, `${email}\n${exp}`).
 * קישורים מהפורמט הישן (חתימה על המייל בלבד) מתקבלים עד LEGACY_UNTIL,
 * כדי שמי שקיבל מייל אישור לפני השינוי יוכל עדיין ללחוץ עליו.
 */
import crypto from 'node:crypto';

export const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** אחרי התאריך הזה קישורים בפורמט הישן נדחים. */
export const LEGACY_UNTIL = Date.parse('2026-11-01T00:00:00Z');

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** יוצר טוקן חדש לכתובת. */
export function makeToken(email, secret, now = Date.now()) {
  const exp = String(now + TOKEN_TTL_MS);
  return `${exp}.${hmac(secret, `${email.toLowerCase()}\n${exp}`)}`;
}

/**
 * בודק טוקן. מחזיר 'ok' | 'expired' | 'invalid'.
 */
export function verifyToken(email, token, secret, now = Date.now()) {
  const e = String(email || '').toLowerCase();
  const t = String(token || '');
  if (!e || !t || !secret) return 'invalid';

  const dot = t.indexOf('.');
  if (dot > 0) {
    const exp = t.slice(0, dot);
    const sig = t.slice(dot + 1);
    if (!/^\d{10,16}$/.test(exp)) return 'invalid';
    if (!safeEqual(sig, hmac(secret, `${e}\n${exp}`))) return 'invalid';
    return now > Number(exp) ? 'expired' : 'ok';
  }

  // פורמט ישן: חתימה על המייל בלבד, בלי תפוגה.
  if (now < LEGACY_UNTIL && safeEqual(t, hmac(secret, e))) return 'ok';
  return 'invalid';
}
