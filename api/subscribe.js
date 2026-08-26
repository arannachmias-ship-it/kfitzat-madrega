/**
 * POST /api/subscribe
 * מקבל כתובת מייל מהטופס באתר, מוסיף אותה לרשימה בריסנד במצב "ממתין לאישור",
 * ושולח מייל אישור עם קישור חד־פעמי חתום.
 *
 * למה אישור כפול: חוק הספאם דורש הסכמה מפורשת מראש. תיבת הסימון היא ההסכמה,
 * והלחיצה על הקישור במייל היא ההוכחה שהכתובת באמת שייכת למי שסימן אותה.
 *
 * הפונקציה לא מחזיקה בסיס נתונים. הקישור חתום ב־HMAC, ולכן אי אפשר לזייף אישור.
 */
import crypto from 'node:crypto';

const RESEND_API = 'https://api.resend.com';

function sign(email, secret) {
  return crypto.createHmac('sha256', secret).update(email.toLowerCase()).digest('base64url');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
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

  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const consent = body.consent === true || body.consent === 'true';

  // מלכודת בוטים: שדה מוסתר שאדם לא רואה ולכן לא ממלא
  if (body.website) return res.status(200).json({ ok: true });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email', message: 'כתובת המייל לא נראית תקינה' });
  }
  if (!consent) {
    return res.status(400).json({ error: 'consent_required', message: 'צריך לאשר את קבלת המיילים' });
  }
  if (!apiKey || !audienceId) {
    return res.status(503).json({ error: 'not_configured', message: 'ההרשמה עוד לא פעילה. נסו שוב מאוחר יותר' });
  }

  // נכנס כ"לא רשום" — כלומר ממתין לאישור. רק הלחיצה במייל הופכת אותו לרשום.
  const created = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, unsubscribed: true }),
  });

  if (!created.ok && created.status !== 409) {
    const detail = await created.text();
    console.error('resend contact failed', created.status, detail);
    return res.status(502).json({ error: 'list_failed', message: 'משהו נתקע אצלנו. נסו שוב בעוד רגע' });
  }

  // בלי דומיין מאומת אי אפשר לשלוח. הכתובת נשמרת, והאישור יישלח כשהדומיין יעלה.
  if (!from || !secret) {
    return res.status(200).json({ ok: true, pending: true });
  }

  const link = `${site}/api/confirm?e=${encodeURIComponent(email)}&t=${sign(email, secret)}`;
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
    const detail = await sent.text();
    console.error('resend send failed', sent.status, detail);
    return res.status(502).json({ error: 'send_failed', message: 'לא הצלחנו לשלוח את מייל האישור' });
  }

  return res.status(200).json({ ok: true });
}

function confirmEmail(link, site) {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#F1F4F4;font-family:'Segoe UI',Arial,sans-serif;color:#12313A;line-height:1.7">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="font-size:20px;font-weight:700;color:#0C2831;margin-bottom:24px">קפיצת מדרגה</div>
    <div style="background:#FFFFFF;border-radius:10px;padding:28px">
      <p style="margin:0 0 16px">ביקשתם לקבל מאיתנו שיעור אחד בשבוע. נשאר רק לאשר שזו באמת הכתובת שלכם:</p>
      <p style="margin:0 0 20px">
        <a href="${link}" style="display:inline-block;background:#C6D63F;color:#0C2831;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:6px">כן, אני מאשר</a>
      </p>
      <p style="margin:0;font-size:14px;color:#4A6670">אם לא ביקשתם — אפשר פשוט להתעלם מהמייל הזה, ולא נשלח לכם שום דבר.</p>
    </div>
    <p style="margin:20px 0 0;font-size:13px;color:#7B9199">
      ארן נחמיאס ומתי מצוינים · <a href="${site}" style="color:#7B9199">${site.replace(/^https?:\/\//, '')}</a>
    </p>
  </div>
</body></html>`;
}
