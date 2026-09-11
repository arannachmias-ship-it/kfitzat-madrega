/**
 * POST /api/pniya
 * טופס "איך מתחילים" בעמוד הארגונים. שולח את הפנייה לתיבה של העסק.
 *
 * למה טופס ולא קישור mailto: קישור mailto נפתח רק אם למחשב יש תוכנת מייל
 * מוגדרת כברירת מחדל. למי שקורא מייל בדפדפן בלבד הדפדפן פשוט לא עושה כלום —
 * בלי שגיאה ובלי הודעה — והפנייה אובדת בשקט. טופס עובד אצל כולם.
 *
 * הפנייה נשלחת מהדומיין המאומת, עם reply_to של הפונה, כדי שתשובה במייל
 * תחזור ישירות אליו.
 */
const RESEND_API = 'https://api.resend.com';
const TO = 'nexadapt+contact@gmail.com';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
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
  const from = process.env.MAIL_FROM;

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, sending: Boolean(apiKey && from) });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = await readBody(req);

  // מלכודת בוטים: שדה מוסתר שאדם לא רואה ולכן לא ממלא
  if (body.website) return res.status(200).json({ ok: true });

  const name = String(body.name || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const message = String(body.message || '').trim().slice(0, 4000);

  if (!name) {
    return res.status(400).json({ error: 'name_required', message: 'צריך שם כדי שנדע למי לחזור' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email', message: 'כתובת המייל לא נראית תקינה' });
  }
  if (message.length < 10) {
    return res.status(400).json({ error: 'message_required', message: 'כתבו שורה או שתיים על מה שאתם צריכים' });
  }
  if (!apiKey || !from) {
    return res.status(503).json({ error: 'not_configured', message: 'הטופס לא פעיל כרגע. אפשר לכתוב לנו ישירות למייל' });
  }

  const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#12313A;line-height:1.7">
  <p><strong>פנייה חדשה מעמוד הארגונים</strong></p>
  <p>שם: ${esc(name)}<br>מייל: <a href="mailto:${esc(email)}" dir="ltr">${esc(email)}</a></p>
  <hr>
  <p style="white-space:pre-wrap">${esc(message)}</p>
</body></html>`;

  const sent = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: TO,
      reply_to: email,
      subject: `פנייה מהאתר — ${name}`,
      html,
    }),
  });

  if (!sent.ok) {
    console.error('pniya send failed', sent.status, await sent.text());
    return res.status(502).json({ error: 'send_failed', message: 'לא הצלחנו לשלוח. אפשר לכתוב לנו ישירות למייל' });
  }

  return res.status(200).json({ ok: true });
}
