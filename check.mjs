/**
 * בדיקת דפדפן למדריכים. מריצה כשישים בדיקות על תיקיית dist מקומית.
 *
 * הכלל בפרויקט הוא שבודקים בדפדפן **לפני** הדחיפה, לא אחריה.
 * הבדיקה עוברת על כל ענפי הלוגיקה של הרכיבים, מצב כהה, רוחב נייד, כיווניות RTL,
 * ו— הבדיקה שתפסה בפועל שתי תקלות — שכל קישור פנימי בגוף כל שיעור מחזיר 200.
 *
 * הרצה:
 *   npm run build
 *   npm install playwright      # לא תלות של האתר, ולכן לא ב-package.json
 *   node check.mjs
 *
 * יוצא עם קוד 1 אם משהו נכשל, כדי שאפשר יהיה לשרשר אותו לפני דחיפה.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = join(process.cwd(), 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(4321, r));
const BASE = 'http://localhost:4321';

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? '  ok   ' : '  FAIL ') + msg); };

// נתיב מפורש רק אם הוגדר בסביבה; אחרת Playwright מוצא את הדפדפן לבד
const CHROME = process.env.CHROME_PATH;
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// אף בקשה לא יוצאת מהמכונה הזאת
await ctx.route('**/*', (route) => {
  const h = new URL(route.request().url()).hostname;
  return h === 'localhost' ? route.continue() : route.abort();
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(250); };

// ---------- 1. /kelim : כרטיסי המדריכים ו-ToolMatch ----------
console.log('\n== /kelim ==');
await go('/kelim');
ok((await page.locator('.gcard').count()) === 3, 'שלושה כרטיסי מדריך');
ok((await page.locator('.gcard__count').first().innerText()).includes('10 מתוך 15'), 'הכרטיס הראשון מראה 10 מתוך 15');
ok(await page.locator('#tmx-form').isVisible(), 'ToolMatch מוצג');

// תשובה חלקית לא אמורה להכריע
await page.check('input[name="env"][value="google"]');
ok((await page.locator('#tmx-out').innerText()).includes('3 שאלות'), 'עם תשובה אחת: מבקש עוד שלוש');

// google + write + solo + price => ג'מיני אמור לנצח בבירור
await page.check('input[name="need"][value="write"]');
await page.check('input[name="who"][value="solo"]');
await page.check('input[name="top"][value="price"]');
let t = await page.locator('#tmx-out').innerText();
ok(t.includes("ג'מיני"), 'ענף גוגל: ההמלצה היא ג\'מיני');
ok(t.includes('ומה הוא לא נותן לכם'), 'התשובה כוללת גם את החיסרון');
ok((await page.locator('.tmx__go').count()) === 1, 'יש קישור אחד למדריך');

// ענף שני: משימה שלמה + אבטחה => קלוד
await page.check('input[name="env"][value="ms"]');
await page.check('input[name="need"][value="task"]');
await page.check('input[name="who"][value="org"]');
await page.check('input[name="top"][value="sec"]');
t = await page.locator('#tmx-out').innerText();
ok(t.includes('קלוד'), 'ענף המשימה השלמה: ההמלצה היא קלוד');

// ענף שלישי: קבצים + עברית => ChatGPT
await page.check('input[name="env"][value="none"]');
await page.check('input[name="need"][value="files"]');
await page.check('input[name="who"][value="team"]');
await page.check('input[name="top"][value="hebrew"]');
t = await page.locator('#tmx-out').innerText();
ok(t.includes('ChatGPT'), 'ענף הקבצים: ההמלצה היא ChatGPT');

// מצב נבחר חייב להיות קריא (ציטרון עם טקסט כהה)
const lab = page.locator('.tmx__opts label:has(input:checked)').first();
const bg = await lab.evaluate((el) => getComputedStyle(el).backgroundColor);
ok(bg !== 'rgba(0, 0, 0, 0)', 'למצב הנבחר יש רקע מלא');

// ---------- 2. /kelim/chatgpt : מפת המדריך ----------
console.log('\n== /kelim/chatgpt ==');
await go('/kelim/chatgpt');
ok((await page.locator('.mm__item').count()) === 15, 'חמישה עשר שיעורים במפה');
ok((await page.locator('.mm__item:not(.mm__item--soon)').count()) === 10, 'עשרה ניתנים ללחיצה');
ok((await page.locator('.mm__soon').count()) === 5, 'חמישה מסומנים בקרוב');
ok((await page.locator('.mm__int').count()) === 5, 'חמישה מסומנים אינטראקטיביים');
// כלי בלי מדריך לא מייצר כלום
await go('/kelim/perplexity');
ok((await page.locator('.mm').count()) === 0, 'כלי בלי מדריך: אין מפה ואין רווח');

// ---------- 3. שיעור 1 : WhatChanged ----------
console.log('\n== שיעור 1 · WhatChanged ==');
await go('/kelim/chatgpt/ma-hishtana-2026');
ok(await page.locator('.lsn__checked').isVisible(), 'תאריך הבדיקה מוצג בראש');
ok((await page.locator('.lsn__principle').count()) === 1, 'קישור חזרה לעיקרון במסלול');
ok((await page.locator('[data-wc-gone] li').count()) >= 1, 'החודש הראשון כבר מציג פריט');
const tally0 = await page.locator('[data-wc-tally]').innerText();
ok(tally0.includes('פברואר'), 'המונה פותח בפברואר');
// התקדמות קדימה
for (let i = 0; i < 7; i++) await page.click('[data-wc-fwd]');
ok((await page.locator('[data-wc-now]').innerText()).includes('ספטמבר'), 'שבע לחיצות קדימה מגיעות לספטמבר');
const goneN = await page.locator('[data-wc-gone] li').count();
const newN = await page.locator('[data-wc-new] li').count();
// שמונה חודשים שיש בהם סגירה, ועוד הפריט שאין לו תאריך מפורסם
ok(goneN === 9 && newN === 10, `בסוף: ${goneN} נסגרו ו-${newN} החליפו`);
ok(await page.locator('[data-wc-end]').isVisible(), 'הערת הסיום מופיעה רק בחודש האחרון');
ok((await page.locator('[data-wc-gone]').innerText()).includes('בלי תאריך מפורסם'), 'הפריט בלי תאריך מסומן ככזה');
// אחורה מחזיר את המצב
await page.click('[data-wc-back]');
ok(!(await page.locator('[data-wc-end]').isVisible()), 'צעד אחורה מסתיר את הערת הסיום');
// קפיצה ישירה לחודש
await page.click('[data-wc-m="0"]');
ok((await page.locator('[data-wc-gone] li').count()) === 1, 'קפיצה לפברואר מאפסת את הרשימה');

// ---------- 4. שיעור 6 : BlockEditor ----------
console.log('\n== שיעור 6 · BlockEditor ==');
await go('/kelim/chatgpt/bloki-ktiva');
ok(!(await page.locator('[data-be-panes]').isVisible()), 'לפני בחירה: אין פאנלים');
for (const i of [0, 1, 2]) {
  await page.click(`[data-be-o="${i}"]`);
  const chat = await page.locator('[data-be-chat]').innerText();
  const block = await page.locator('[data-be-block]').innerText();
  const red = await page.locator('[data-be-chat] .be__r').count();
  ok(chat.length > 40 && block.length > 40 && red >= 1, `אפשרות ${i + 1}: שני הפאנלים מלאים ויש שינוי לא מבוקש`);
}
ok(await page.locator('[data-be-caveat]').isVisible(), 'ההסתייגות מופיעה אחרי בחירה');
ok((await page.locator('[data-be-caveat]').innerText()).includes('אין תגית כזאת'), 'ההסתייגות אומרת שבפלט אמיתי אין סימון');

// ---------- 5. שיעור 10 : WorkOrChat ----------
console.log('\n== שיעור 10 · WorkOrChat ==');
await go('/kelim/chatgpt/chatgpt-work');
await page.check('input[name="steps"][value="1"]');
await page.check('input[name="out"][value="1"]');
await page.check('input[name="src"][value="1"]');
await page.check('input[name="wait"][value="1"]');
t = await page.locator('[data-wo-out]').innerText();
ok(t.includes('שיחה רגילה'), 'הכי נמוך: שיחה רגילה');
ok(t.includes('ואם בכל זאת תשלחו את זה ל'), 'גם בשיחה מוצגת הטעות ההפוכה');
await page.check('input[name="steps"][value="3"]');
await page.check('input[name="out"][value="3"]');
await page.check('input[name="src"][value="3"]');
await page.check('input[name="wait"][value="3"]');
t = await page.locator('[data-wo-out]').innerText();
ok(t.includes('ChatGPT Work'), 'הכי גבוה: Work');
ok(t.includes('ואם בכל זאת תעשו את זה בשיחה'), 'גם ב-Work מוצגת הטעות ההפוכה');
// מקרה גבול
await page.check('input[name="steps"][value="2"]');
await page.check('input[name="out"][value="3"]');
await page.check('input[name="src"][value="1"]');
await page.check('input[name="wait"][value="1"]');
t = await page.locator('[data-wo-out]').innerText();
ok(t.includes('ממש על הגבול'), 'ניקוד 7: מזוהה כמקרה גבול');

// ---------- 6. RTL, מצב כהה, ונייד ----------
console.log('\n== RTL, כהה ונייד ==');
const PAGES = ['/kelim', '/kelim/chatgpt', '/kelim/chatgpt/ma-hishtana-2026', '/kelim/chatgpt/bloki-ktiva', '/kelim/chatgpt/chatgpt-work'];
for (const p of PAGES) {
  await go(p);
  const dir = await page.evaluate(() => getComputedStyle(document.documentElement).direction);
  ok(dir === 'rtl', `${p}: הכיוון rtl`);
}
// מצב כהה: לוודא שמצב נבחר נשאר קריא
await go('/kelim/chatgpt/chatgpt-work');
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.check('input[name="steps"][value="3"]');
const darkLab = page.locator('.wo__form label:has(input:checked)').first();
const dc = await darkLab.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, fg: s.color }; });
ok(dc.bg !== dc.fg, `מצב כהה: הנבחר קריא (רקע ${dc.bg}, טקסט ${dc.fg})`);

// נייד: אסור גלילה אופקית
await page.setViewportSize({ width: 390, height: 844 });
for (const p of PAGES) {
  await go(p);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 1, `${p}: אין גלילה אופקית בנייד (חריגה ${over}px)`);
}

// ---------- 7. ניווט בין שיעורים ----------
console.log('\n== ניווט ==');
await page.setViewportSize({ width: 1280, height: 900 });
await go('/kelim/chatgpt/ma-hishtana-2026');
ok((await page.locator('.lsn__navItem').count()) === 1, 'שיעור ראשון: רק הבא');
await go('/kelim/chatgpt/chatgpt-work');
ok((await page.locator('.lsn__navItem').count()) === 1, 'שיעור עשירי: רק הקודם, כי 11 עוד לא נכתב');
await go('/kelim/chatgpt/proyektim');
ok((await page.locator('.lsn__navItem').count()) === 2, 'שיעור אמצעי: קודם והבא');
// כל הקישורים הפנימיים בשיעורים חייבים להוביל לעמוד קיים
const links = new Set();
for (const p of ['/kelim/chatgpt/ma-hishtana-2026','/kelim/chatgpt/hameshbonot','/kelim/chatgpt/bchirat-model','/kelim/chatgpt/horaot-vezikaron','/kelim/chatgpt/proyektim','/kelim/chatgpt/bloki-ktiva','/kelim/chatgpt/nituach-netunim','/kelim/chatgpt/tmunot-vekol','/kelim/chatgpt/mechkar-amok','/kelim/chatgpt/chatgpt-work']) {
  await go(p);
  for (const h of await page.locator('.lsn__body a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
    if (h && h.startsWith('/')) links.add(h);
  }
}
for (const h of links) {
  const r = await page.request.get(BASE + h);
  ok(r.status() === 200, `קישור פנימי חי: ${h}`);
}

console.log('\n== שגיאות ריצה ==');
ok(errs.length === 0, errs.length ? 'שגיאות: ' + errs.join(' | ') : 'אין שגיאות ריצה בדף');

await browser.close();
server.close();
console.log('\n' + (fails.length ? `נכשלו ${fails.length}:\n- ` + fails.join('\n- ') : 'הכול עבר.'));
process.exit(fails.length ? 1 : 0);
