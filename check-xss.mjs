// הרצה: npm run build && CHROME_PATH=<chrome> node check-xss.mjs
// DOM-XSS sweep: for every built page, put an HTML/JS payload into every free-text input,
// trigger every button/change handler, and check whether the payload executed or landed as live HTML.
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = join(process.cwd(), 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let f = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(4322, r));
const BASE = 'http://localhost:4322';

const pages = [];
(function walk(d, rel) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, rel + '/' + n);
    else if (n === 'index.html') pages.push(rel || '/');
  }
})(ROOT, '');

const PAYLOAD = `<img src=x onerror="window.__xss=(window.__xss||0)+1"><b id="xsscanary">c</b>`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await browser.newContext();
await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === 'localhost' ? r.continue() : r.abort()));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
const hits = [];
let tested = 0, fields = 0;

for (const p of pages) {
  await page.goto(BASE + p + '?status=' + encodeURIComponent(PAYLOAD) + '#' + encodeURIComponent(PAYLOAD), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(150);
  const n = await page.evaluate(async (PAYLOAD) => {
    const els = [...document.querySelectorAll('textarea, input:not([type=radio]):not([type=checkbox]):not([type=hidden]):not([type=submit]):not([type=button]):not([type=range])')];
    for (const el of els) {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
      set.call(el, el.type === 'number' ? '999' : PAYLOAD);
      for (const t of ['input', 'change', 'keyup', 'blur']) el.dispatchEvent(new Event(t, { bubbles: true }));
    }
    // ranges/radios/checkboxes: poke them so outputs render
    for (const r of document.querySelectorAll('input[type=radio], input[type=checkbox]')) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); r.dispatchEvent(new Event('input', { bubbles: true })); }
    for (const b of document.querySelectorAll('button:not([type=submit])')) { try { b.click(); } catch {} }
    for (const f of document.querySelectorAll('form')) { try { f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } catch {} }
    await new Promise((r) => setTimeout(r, 300));
    return els.length;
  }, PAYLOAD);
  fields += n; tested++;
  const res = await page.evaluate(() => ({ xss: window.__xss || 0, canary: document.querySelectorAll('#xsscanary').length }));
  if (res.xss || res.canary) hits.push({ page: p, ...res });
}
console.log(`pages: ${tested}, free-text fields exercised: ${fields}`);
console.log('XSS hits:', JSON.stringify(hits));
console.log('page errors:', errs.length ? errs.slice(0, 5) : 'none');
await browser.close(); server.close();
process.exit(hits.length ? 1 : 0);
