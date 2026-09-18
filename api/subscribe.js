/**
 * POST /api/subscribe
 * מקבל כתובת מייל מהטופס באתר, מוסיף אותה לרשימה בריסנד במצב "ממתין לאישור",
 * ושולח מייל אישור עם קישור חתום שפג אחרי 14 יום.
 *
 * למה אישור כפול: חוק הספאם דורש הסכמה מפורשת מראש. תיבת הסימון היא ההסכמה,
 * והלחיצה על הקישור במייל היא ההוכחה שהכתובת באמת שייכת למי שסימן אותה.
 *
 * הגנות (ראו lib/api-guard.js): רק מהאתר עצמו, עם הגבלת קצב לכל כתובת IP ולכל
 * כתובת מייל — כדי שאי אפשר יהיה להשתמש בטופס כדי להציף מישהו במיילים מהדומיין שלנו.
 */
import { makeToken } from '../lib/confirm-token.js';
import {
  apiHeaders, isSameSite, clientIp, rateLimited, readJson, clean, EMAIL_RE, logEvent,
} from '../lib/api-guard.js';

const RESEND_API = 'https://api.resend.com';

export default async function handler(req, res) {
  apiHeaders(res);
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const secret = process.env.CONFIRM_SECRET;
  const from = process.env.MAIL_FROM;          // ריק עד שיהיה דומיין מאומת
  const site = process.env.SITE_URL || 'https://kfitzat-madrega.vercel.app';

  // בדיקת בריאות: מאפשרת לוודא שהחיווט תקין בלי לשלוח כלום
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      list: Boolean(apiKey && audienceId),
      signing: Boolean(secret),
      sending: Boolean(from),
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!isSameSite(req)) {
    logEvent('subscribe', 'foreign_origin');
    return res.status(403).json({ error: 'forbidden', message: 'הטופס עובד רק מתוך האתר' });
  }

  const ip = clientIp(req);
  if (rateLimited(`subscribe:ip:${ip}`, 5, 10 * 60_000)) {
    logEvent('subscribe', 'rate_limited_ip');
    return res.status(429).json({ error: 'too_many', message: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות' });
  }

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: 'bad_request', message: 'הבקשה לא תקינה' });
  }

  // מלכודת בוטים: שדה מוסתר שאדם לא רואה ולכן לא ממלא
  if (body.website) return res.status(200).json({ ok: true });

  const email = clean(body.email, 254).toLowerCase();
  const consent = body.consent === true || body.consent === 'true';

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'invalid_email', message: 'כתובת המייל לא נראית תקינה' });
  }
  if (!consent) {
    return res.status(400).json({ error: 'consent_required', message: 'צריך לאשר את קבלת המיילים' });
  }
  // אותה כתובת: מייל אישור אחד לעשר דקות, גם אם הבקשות מגיעות מכתובות IP שונות
  if (rateLimited(`subscribe:email:${email}`, 1, 10 * 60_000)) {
    logEvent('subscribe', 'rate_limited_email');
    return res.status(200).json({ ok: true });
  }
  if (!apiKey || !audienceId) {
    return res.status(503).json({ error: 'not_configured', message: 'ההרשמה עוד לא פעילה. נסו שוב מאוחר יותר' });
  }

  try {
    // נכנס כ"לא רשום" — כלומר ממתין לאישור. רק הלחיצה במייל הופכת אותו לרשום.
    const created = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, unsubscribed: true }),
    });

    if (!created.ok && created.status !== 409) {
      logEvent('subscribe', 'resend_contact_failed', { status: created.status });
      return res.status(502).json({ error: 'list_failed', message: 'משהו נתקע אצלנו. נסו שוב בעוד רגע' });
    }

    // בלי דומיין מאומת אי אפשר לשלוח. הכתובת נשמרת, והאישור יישלח כשהדומיין יעלה.
    if (!from || !secret) {
      return res.status(200).json({ ok: true, pending: true });
    }

    const link = `${site}/api/confirm?e=${encodeURIComponent(email)}&t=${makeToken(email, secret)}`;
    const sent = await fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'רק לאשר, ומתחילים',
        html: confirmEmail(link, site),
      }),
    });

    if (!sent.ok) {
      logEvent('subscribe', 'resend_send_failed', { status: sent.status });
      return res.status(502).json({ error: 'send_failed', message: 'לא הצלחנו לשלוח את מייל האישור' });
    }
  } catch (err) {
    logEvent('subscribe', 'resend_error', { message: String(err?.message || err) });
    return res.status(502).json({ error: 'send_failed', message: 'משהו נתקע אצלנו. נסו שוב בעוד רגע' });
  }

  return res.status(200).json({ ok: true });
}

function confirmEmail(link, site) {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#F1F4F4;font-family:'Segoe UI',Arial,sans-serif;color:#12313A;line-height:1.7">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="font-size:20px;font-weight:700;color:#0C2831;margin-bottom:24px">Nexadapt</div>
    <div style="background:#FFFFFF;border-radius:10px;padding:28px">
      <p style="margin:0 0 16px">ביקשתם לקבל מאיתנו שיעור אחד בשבוע. נשאר רק לאשר שזו באמת הכתובת שלכם:</p>
      <p style="margin:0 0 20px">
        <a href="${link}" style="display:inline-block;background:#C6D63F;color:#0C2831;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:6px">כן, אני מאשר</a>
      </p>
      <p style="margin:0;font-size:14px;color:#4A6670">הקישור תקף ל־14 יום. אם לא ביקשתם — אפשר פשוט להתעלם מהמייל הזה, ולא נשלח לכם שום דבר.</p>
    </div>
    <p style="margin:20px 0 0;font-size:13px;color:#7B9199">
      ארן נחמיאס ומתי מצוינים · <a href="${site}" style="color:#7B9199">${site.replace(/^https?:\/\//, '')}</a>
    </p>
  </div>
</body></html>`;
}
