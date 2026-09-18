/**
 * GET /api/confirm?e=<email>&t=<token>
 * מאשר את ההרשמה: בודק את החתימה ואת התפוגה, ומסמן את איש הקשר בריסנד כרשום.
 * בלי חתימה תקינה אי אפשר לאשר כתובת של מישהו אחר; קישור בן יותר מ־14 יום פג.
 */
import { verifyToken } from '../lib/confirm-token.js';
import { apiHeaders, clientIp, rateLimited, logEvent, EMAIL_RE } from '../lib/api-guard.js';

const RESEND_API = 'https://api.resend.com';

export default async function handler(req, res) {
  apiHeaders(res);
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const secret = process.env.CONFIRM_SECRET;
  const site = process.env.SITE_URL || 'https://kfitzat-madrega.vercel.app';

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // ניחוש חתימות בכוח: 30 ניסיונות לכתובת IP בעשר דקות, ואז עוצרים.
  if (rateLimited(`confirm:ip:${clientIp(req)}`, 30, 10 * 60_000)) {
    logEvent('confirm', 'rate_limited');
    return res.redirect(302, '/toda?status=invalid');
  }

  let email = '';
  let token = '';
  try {
    const url = new URL(req.url, site);
    email = String(url.searchParams.get('e') || '').trim().toLowerCase();
    token = String(url.searchParams.get('t') || '');
  } catch {
    return res.redirect(302, '/toda?status=invalid');
  }

  if (!apiKey || !audienceId || !secret) {
    logEvent('confirm', 'not_configured');
    return res.redirect(302, '/toda?status=error');
  }
  if (!EMAIL_RE.test(email)) {
    return res.redirect(302, '/toda?status=invalid');
  }

  const verdict = verifyToken(email, token, secret);
  if (verdict === 'expired') return res.redirect(302, '/toda?status=expired');
  if (verdict !== 'ok') {
    logEvent('confirm', 'bad_token');
    return res.redirect(302, '/toda?status=invalid');
  }

  try {
    const updated = await fetch(
      `${RESEND_API}/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ unsubscribed: false }),
      },
    );
    if (!updated.ok) {
      logEvent('confirm', 'resend_failed', { status: updated.status });
      return res.redirect(302, '/toda?status=error');
    }
  } catch (err) {
    logEvent('confirm', 'resend_error', { message: String(err?.message || err) });
    return res.redirect(302, '/toda?status=error');
  }

  return res.redirect(302, '/toda?status=ok');
}
