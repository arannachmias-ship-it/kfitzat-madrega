/**
 * GET /api/confirm?e=<email>&t=<hmac>
 * מאשר את ההרשמה: בודק את החתימה, ומסמן את איש הקשר בריסנד כרשום.
 * בלי חתימה תקינה אי אפשר לאשר כתובת של מישהו אחר.
 */
import crypto from 'node:crypto';

const RESEND_API = 'https://api.resend.com';

function sign(email, secret) {
  return crypto.createHmac('sha256', secret).update(email.toLowerCase()).digest('base64url');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const secret = process.env.CONFIRM_SECRET;
  const site = process.env.SITE_URL || 'https://kfitzat-madrega.vercel.app';

  const url = new URL(req.url, site);
  const email = String(url.searchParams.get('e') || '').trim().toLowerCase();
  const token = String(url.searchParams.get('t') || '');

  if (!apiKey || !audienceId || !secret) {
    return res.redirect(302, '/toda?status=error');
  }
  if (!email || !token || !safeEqual(token, sign(email, secret))) {
    return res.redirect(302, '/toda?status=invalid');
  }

  const updated = await fetch(
    `${RESEND_API}/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ unsubscribed: false }),
    },
  );

  if (!updated.ok) {
    console.error('resend confirm failed', updated.status, await updated.text());
    return res.redirect(302, '/toda?status=error');
  }

  return res.redirect(302, '/toda?status=ok');
}
