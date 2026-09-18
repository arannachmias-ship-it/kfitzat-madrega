// הרצה: npm run build && CHROME_PATH=<chrome> node check-csp.mjs
// מגיש את dist עם הכותרות מ־vercel.json בדיוק, מפעיל כל רכיב בכל עמוד, ואוסף הפרות CSP.
import { chromium } from 'playwright';
import http from 'node:http'; import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'; import { join, extname } from 'node:path';
const ROOT = join(process.cwd(), 'dist');
const HDRS = JSON.parse(readFileSync('vercel.json', 'utf8')).headers.find(h => h.source === '/(.*)').headers;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let f = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  const h = { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' };
  for (const { key, value } of HDRS) h[key] = value;
  res.writeHead(200, h); res.end(readFileSync(f));
});
await new Promise(r => server.listen(4324, r));
const pages = []; (function walk(d, rel) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, rel + '/' + n); else if (n === 'index.html') pages.push(rel || '/'); } })(ROOT, '');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await browser.newContext();
await ctx.route('**/*', r => { const h = new URL(r.request().url()).hostname; return (h === 'localhost' || h.endsWith('googleapis.com') || h.endsWith('gstatic.com')) ? r.continue() : r.abort(); });
const page = await ctx.newPage();
const viol = []; const errs = [];
page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) viol.push(m.text().slice(0, 160)); });
page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', e => console.error('CSP:' + e.violatedDirective + ' ' + e.blockedURI + ' @' + location.pathname)); });
let fontsOk = false;
page.on('response', r => { if (r.url().includes('fonts.g') && r.ok()) fontsOk = true; });
for (const p of pages) {
  await page.goto('http://localhost:4324' + p, { waitUntil: 'load' });
  await page.evaluate(async () => {
    for (const el of document.querySelectorAll('textarea, input[type=text], input:not([type])')) { el.value = 'בדיקה של טקסט'; for (const t of ['input','change','keyup']) el.dispatchEvent(new Event(t,{bubbles:true})); }
    for (const r of document.querySelectorAll('input[type=radio], input[type=checkbox]')) { r.checked = true; r.dispatchEvent(new Event('change',{bubbles:true})); r.dispatchEvent(new Event('input',{bubbles:true})); }
    for (const b of document.querySelectorAll('button:not([type=submit])')) { try { b.click(); } catch {} }
    document.documentElement.setAttribute('data-theme','dark');
    await new Promise(r => setTimeout(r, 250));
  });
}
// טופס ההרשמה שולח fetch ל־/api — connect-src 'self' חייב להרשות אותו
await page.goto('http://localhost:4324/', { waitUntil: 'load' });
const fetchAllowed = await page.evaluate(async () => { try { await fetch('/api/subscribe', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' }); return true; } catch (e) { return String(e); } });
console.log(`pages: ${pages.length}`);
console.log('CSP violations:', viol.length ? [...new Set(viol)] : 'none');
console.log('page errors:', errs.length ? [...new Set(errs)] : 'none');
console.log('google fonts loaded under CSP:', fontsOk, '| same-origin fetch allowed:', fetchAllowed);
await browser.close(); server.close();
process.exit(viol.length || errs.length ? 1 : 0);
