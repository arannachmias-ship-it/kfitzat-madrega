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
ok((await page.locator('.gcard__count').first().innerText()).includes('15 מתוך 15'), 'הכרטיס הראשון מראה 15 מתוך 15');
ok((await page.locator('.gcard__count').nth(1).innerText()).includes('15 מתוך 15'), 'הכרטיס השני מראה 15 מתוך 15');
ok((await page.locator('.gcard__count').nth(2).innerText()).includes('15 מתוך 15'), 'הכרטיס השלישי מראה 15 מתוך 15');
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
ok((await page.locator('.mm__item:not(.mm__item--soon)').count()) === 15, 'ChatGPT: כל חמישה עשר ניתנים ללחיצה');
ok((await page.locator('.mm__soon').count()) === 0, 'ChatGPT: אין בקרוב');
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
const PAGES = ['/kelim', '/kelim/chatgpt', '/kelim/gemini', '/kelim/claude', '/kelim/claude/artifacts', '/kelim/claude/cowork', '/kelim/claude/pratiyut-umimshal', '/kelim/chatgpt/ma-hishtana-2026', '/kelim/chatgpt/bloki-ktiva', '/kelim/chatgpt/chatgpt-work', '/kelim/chatgpt/skillim-veplaginim', '/kelim/chatgpt/pratiyut', '/kelim/gemini/ivrit', '/kelim/gemini/notebook'];
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
ok((await page.locator('.lsn__navItem').count()) === 2, 'שיעור עשירי: קודם והבא, כי 11 כבר נכתב');
await go('/kelim/chatgpt/pratiyut');
ok((await page.locator('.lsn__navItem').count()) === 1, 'שיעור חמישה עשר, האחרון שנכתב: רק הקודם');
await go('/kelim/gemini/shlosha-mutzarim');
ok((await page.locator('.lsn__navItem').count()) === 1, 'ג׳מיני שיעור ראשון: רק הבא');
await go('/kelim/gemini/betoch-workspace');
ok((await page.locator('.lsn__navItem').count()) === 2, 'ג׳מיני שיעור עשירי: קודם והבא');
await go('/kelim/gemini/shmirat-peilut');
ok((await page.locator('.lsn__navItem').count()) === 1, 'ג׳מיני שיעור חמישה עשר: רק הקודם');
await go('/kelim/claude/ma-hu-tov-bo');
ok((await page.locator('.lsn__navItem').count()) === 1, 'קלוד שיעור ראשון: רק הבא');
await go('/kelim/claude/pratiyut-umimshal');
ok((await page.locator('.lsn__navItem').count()) === 1, 'קלוד שיעור חמישה עשר: רק הקודם');
await go('/kelim/chatgpt/proyektim');
ok((await page.locator('.lsn__navItem').count()) === 2, 'שיעור אמצעי: קודם והבא');
// כל הקישורים הפנימיים בשיעורים חייבים להוביל לעמוד קיים
const links = new Set();
const CHATGPT = ['ma-hishtana-2026','hameshbonot','bchirat-model','horaot-vezikaron','proyektim','bloki-ktiva','nituach-netunim','tmunot-vekol','mechkar-amok','chatgpt-work','mismachim-hachutza','shlosha-dafdafanim','mesimot-metuzmanot','skillim-veplaginim','pratiyut'];
const GEMINI = ['shlosha-mutzarim','mechirim-bashkalim','ivrit','bchirat-model-gemini','canvas','gems','mechkar-amok-gemini','notebook','skirot-shema','betoch-workspace','tmunot-vevideo','peulot-metuzmanot','bechrome-vebashulchan','aplikatziot-mechubarot','shmirat-peilut'];
const CLAUDE = ['ma-hu-tov-bo','hameshbonot-claude','model-umaamatz','kvatzim','proyektim-claude','zikaron','chipus-vemechkar','artifacts','skillim','chiburim','plaginim','cowork','mesimot-metuzmanot-claude','bechrome-ubeoffice','pratiyut-umimshal'];
const ALL_LESSONS = CHATGPT.map((x) => '/kelim/chatgpt/' + x)
  .concat(GEMINI.map((x) => '/kelim/gemini/' + x))
  .concat(CLAUDE.map((x) => '/kelim/claude/' + x));
for (const p of ALL_LESSONS) {
  await go(p);
  for (const h of await page.locator('.lsn__body a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
    if (h && h.startsWith('/')) links.add(h);
  }
}
for (const h of links) {
  const r = await page.request.get(BASE + h);
  ok(r.status() === 200, `קישור פנימי חי: ${h}`);
}


// ---------- 8. מפת ג'מיני ----------
console.log('\n== מפת גמיני ==');
await go('/kelim/gemini');
const gAll = await page.locator('.mm__item').count();
const gSoon = await page.locator('.mm__item--soon').count();
ok(gAll === 15, `גמיני: 15 פריטים במפה (נמצאו ${gAll})`);
ok(gSoon === 0, `גמיני: אין בקרוב (נמצאו ${gSoon})`);
const gLinks = await page.locator('.mm__item a.mm__row').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
for (const h of gLinks) {
  const r = await page.request.get(BASE + h);
  ok(r.status() === 200, `מפת גמיני: ${h} חי`);
}

// ---------- 9. SkillShelf ----------
console.log('\n== SkillShelf ==');
await go('/kelim/chatgpt/skillim-veplaginim');
ok((await page.locator('[data-ss-item]').count()) === 6, 'SkillShelf: שישה פריטים');
ok((await page.locator('[data-ss-drop]').count()) === 3, 'SkillShelf: שלושה מדפים');
// כולם נכון
for (const li of await page.locator('[data-ss-item]').all()) {
  const want = await li.getAttribute('data-ss-answer');
  await li.locator(`[data-ss-to="${want}"]`).click();
}
await page.waitForTimeout(150);
ok((await page.locator('[data-tally]').getAttribute('data-tally')) === '6', 'SkillShelf: שישה מתוך שישה');
ok((await page.locator('.ss__row').count()) === 6, 'SkillShelf: שש שורות הסבר');
ok((await page.locator('.ss__row--ok').count()) === 6, 'SkillShelf: כולן מסומנות נכון');
ok(await page.locator('.ss__punch').isVisible(), 'SkillShelf: השורה על חשבון ארגוני מופיעה');
ok(!(await page.locator('[data-ss-pool]').isVisible()), 'SkillShelf: המאגר נעלם אחרי שכולם סודרו');
// אחד שגוי
const first = page.locator('[data-ss-item]').first();
const wrong = (await first.getAttribute('data-ss-answer')) === 'skill' ? 'plugin' : 'skill';
await first.locator(`[data-ss-to="${wrong}"]`).click();
await page.waitForTimeout(150);
ok((await page.locator('[data-tally]').getAttribute('data-tally')) === '5', 'SkillShelf: טעות אחת מורידה לחמש');
ok((await page.locator('.ss__row:not(.ss__row--ok)').count()) === 1, 'SkillShelf: שורה אחת מסומנת שגויה');

// ---------- 10. PrivacyTrace ----------
console.log('\n== PrivacyTrace ==');
await go('/kelim/chatgpt/pratiyut');
ok((await page.locator('[data-pt-go]').count()) === 5, 'PrivacyTrace: חמש תחנות');
ok((await page.locator('.pt__col').count()) === 2, 'PrivacyTrace: שני טורים');
const st0 = await page.locator('.pt__q').innerText();
await page.click('[data-pt-go="3"]');
await page.waitForTimeout(120);
const st3 = await page.locator('.pt__q').innerText();
ok(st0 !== st3, 'PrivacyTrace: מעבר תחנה מחליף תוכן');
ok((await page.locator('[data-pt-go][aria-selected="true"]').count()) === 1, 'PrivacyTrace: תחנה אחת נבחרת בכל רגע');
let stings = 0;
for (let i = 0; i < 5; i++) {
  await page.click(`[data-pt-go="${i}"]`);
  await page.waitForTimeout(80);
  const body = await page.locator('.pt__col--org .pt__body').innerText();
  ok(body.trim().length > 0, `PrivacyTrace: תחנה ${i + 1} מציגה טור ארגוני`);
  if (await page.locator('.pt__sting').count()) stings++;
}
ok(stings === 5, `PrivacyTrace: בכל חמש התחנות יש שורה שמפתיעה (נמצאו ${stings})`);

// ---------- 11. HebrewGaps ----------
console.log('\n== HebrewGaps ==');
await go('/kelim/gemini/ivrit');
ok((await page.locator('[data-hg-go]').count()) === 9, 'HebrewGaps: תשע משימות');
ok(!(await page.locator('[data-hg-out]').isVisible()), 'HebrewGaps: אין תשובה לפני בחירה');
await page.click('[data-hg-go="app"]');
await page.waitForTimeout(120);
ok((await page.locator('.hg__card--ok').count()) === 1, 'HebrewGaps: אפליקציה = עובד');
ok((await page.locator('.hg__work').count()) === 0, 'HebrewGaps: ליכולת שעובדת אין עקיפה');
await page.click('[data-hg-go="meet"]');
await page.waitForTimeout(120);
ok((await page.locator('.hg__card--no').count()) === 1, 'HebrewGaps: Meet = לא עובד');
ok((await page.locator('.hg__work').count()) === 1, 'HebrewGaps: ליכולת שבורה יש עקיפה');
const hgLink = await page.locator('.hg__work a').getAttribute('href');
ok((await page.request.get(BASE + hgLink)).status() === 200, `HebrewGaps: הקישור בעקיפה חי (${hgLink})`);
await page.click('[data-hg-go="audio"]');
await page.waitForTimeout(120);
ok((await page.locator('.hg__card--part').count()) === 1, 'HebrewGaps: סקירת שמע = הסתייגות');
await page.click('[data-hg-go="chrome"]');
await page.waitForTimeout(120);
ok((await page.locator('.hg__card--part').count()) === 1, 'HebrewGaps: כרום = עובד עם הסתייגות');
ok((await page.locator('.hg__work').count()) === 1, 'HebrewGaps: לכרום יש הסבר על שפת המכשיר');
ok((await page.locator('.hg__tally').getAttribute('data-tally')) === '4', 'HebrewGaps: מונה ארבע משימות שנבדקו');

// ---------- 12. NotebookBuild ----------
console.log('\n== NotebookBuild ==');
await go('/kelim/gemini/notebook');
ok((await page.locator('[data-nb-plan]').count()) === 5, 'NotebookBuild: חמש תוכניות');
ok((await page.locator('.nb__row').count()) === 4, 'NotebookBuild: ארבעה תרחישים');
ok((await page.locator('[data-nb-plan][aria-pressed="true"]').count()) === 1, 'NotebookBuild: תוכנית אחת נבחרת');
const freeBlocked = await page.locator('.nb__verdict').getAttribute('data-tally');
ok(freeBlocked === '3', `חינם: שלושה מתוך ארבעה נחסמים (התקבל ${freeBlocked})`);
await page.click('[data-nb-plan="plus"]');
await page.waitForTimeout(120);
ok((await page.locator('.nb__verdict').getAttribute('data-tally')) === '2', 'Plus: שניים נחסמים');
await page.click('[data-nb-plan="pro"]');
await page.waitForTimeout(120);
ok((await page.locator('.nb__verdict').getAttribute('data-tally')) === '0', 'Pro: הכל נכנס');
ok((await page.locator('.nb__row--ok').count()) === 4, 'Pro: ארבע שורות ירוקות');
const nbLink = await page.locator('.nb__first a').getAttribute('href');
ok((await page.request.get(BASE + nbLink)).status() === 200, `NotebookBuild: הקישור בסיכום חי (${nbLink})`);
await page.click('[data-nb-plan="u30"]');
await page.waitForTimeout(120);
ok((await page.locator('.nb__verdict').getAttribute('data-tally')) === '0', 'Ultra 30TB: הכל נכנס');

// ---------- 13. מצב כהה ברכיבים החדשים ----------
console.log('\n== מצב כהה ברכיבים החדשים ==');
await go('/kelim/gemini/ivrit');
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.click('[data-hg-go="meet"]');
await page.waitForTimeout(120);
const hgSel = await page.locator('[data-hg-go][aria-pressed="true"]').evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, fg: s.color }; });
ok(hgSel.bg !== hgSel.fg, `HebrewGaps כהה: הנבחר קריא (רקע ${hgSel.bg}, טקסט ${hgSel.fg})`);
await go('/kelim/chatgpt/pratiyut');
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.waitForTimeout(120);
const ptSel = await page.locator('[data-pt-go][aria-selected="true"]').evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, fg: s.color }; });
ok(ptSel.bg !== ptSel.fg, `PrivacyTrace כהה: הנבחר קריא (רקע ${ptSel.bg}, טקסט ${ptSel.fg})`);


// ---------- 14. מפת קלוד ----------
console.log('\n== מפת קלוד ==');
await go('/kelim/claude');
ok((await page.locator('.mm__item').count()) === 15, 'קלוד: 15 פריטים במפה');
ok((await page.locator('.mm__item--soon').count()) === 0, 'קלוד: אין בקרוב');
for (const h of await page.locator('.mm__item a.mm__row').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
  const r = await page.request.get(BASE + h);
  ok(r.status() === 200, `מפת קלוד: ${h} חי`);
}

// ---------- 15. ArtifactReach ----------
console.log('\n== ArtifactReach ==');
await go('/kelim/claude/artifacts');
ok((await page.locator('[data-ar-acc]').count()) === 3, 'ArtifactReach: שלושה סוגי חשבון');
ok((await page.locator('[data-ar-tgt]').count()) === 3, 'ArtifactReach: שלושה נמענים');
for (const t of ['colleague', 'client', 'public']) {
  await page.click('[data-ar-acc="personal"]');
  await page.click(`[data-ar-tgt="${t}"]`);
  await page.waitForTimeout(80);
  ok((await page.locator('.ar__card').getAttribute('data-tally')) === '1', `ArtifactReach: פרטי אל ${t} נפתח`);
}
for (const a of ['team', 'org']) {
  await page.click(`[data-ar-acc="${a}"]`);
  await page.click('[data-ar-tgt="colleague"]');
  await page.waitForTimeout(80);
  ok((await page.locator('.ar__card').getAttribute('data-tally')) === '1', `ArtifactReach: ${a} אל עמית נפתח`);
  for (const t of ['client', 'public']) {
    await page.click(`[data-ar-tgt="${t}"]`);
    await page.waitForTimeout(80);
    ok((await page.locator('.ar__card').getAttribute('data-tally')) === '0', `ArtifactReach: ${a} אל ${t} נחסם`);
  }
}
ok((await page.locator('.ar__sting').innerText()).length > 20, 'ArtifactReach: תמיד יש שורת אזהרה');

// ---------- 16. CoworkCheck ----------
console.log('\n== CoworkCheck ==');
await go('/kelim/claude/cowork');
ok((await page.locator('[data-cw-plan]').count()) === 5, 'CoworkCheck: חמש תוכניות');
ok((await page.locator('.cw__row').count()) === 5, 'CoworkCheck: חמש יכולות');
const cwExpect = { free: '0', pro: '4', max: '4', team: '4', org: '3' };
for (const [plan, want] of Object.entries(cwExpect)) {
  await page.click(`[data-cw-plan="${plan}"]`);
  await page.waitForTimeout(80);
  const got = await page.locator('.cw__verdict').getAttribute('data-tally');
  ok(got === want, `CoworkCheck: ${plan} = ${want} יכולות (התקבל ${got})`);
}
for (const plan of ['team', 'org']) {
  await page.click(`[data-cw-plan="${plan}"]`);
  await page.waitForTimeout(80);
  const rowClass = await page.locator('.cw__row').nth(2).getAttribute('class');
  ok(rowClass.includes('cw__row--no'), `CoworkCheck: ${plan} — שליטה במחשב מסומנת כאין`);
}
await page.click('[data-cw-plan="pro"]');
await page.waitForTimeout(80);
ok((await page.locator('.cw__row').nth(2).getAttribute('class')).includes('cw__row--beta'), 'CoworkCheck: Pro — שליטה במחשב מסומנת ביתא');
ok((await page.locator('.cw__row').nth(4).getAttribute('class')).includes('cw__row--no'), 'CoworkCheck: Pro — אין הפצת סקילים לארגון');

// ---------- 17. PrivacyTrace בשלושת המדריכים ----------
console.log('\n== PrivacyTrace בשלושתם ==');
for (const p of ['/kelim/chatgpt/pratiyut', '/kelim/gemini/shmirat-peilut', '/kelim/claude/pratiyut-umimshal']) {
  await go(p);
  ok((await page.locator('[data-pt-go]').count()) === 5, `${p}: חמש תחנות`);
  const names = [];
  for (let i = 0; i < 5; i++) {
    await page.click(`[data-pt-go="${i}"]`);
    await page.waitForTimeout(60);
    names.push(await page.locator('.pt__q').innerText());
    ok((await page.locator('.pt__col--org .pt__body').innerText()).trim().length > 0, `${p}: תחנה ${i + 1} עם טור ארגוני`);
  }
  ok(new Set(names).size === 5, `${p}: חמש תחנות שונות זו מזו`);
}
await go('/kelim/gemini/shmirat-peilut');
const gOrgName = await page.locator('.pt__col--org .pt__colname').innerText();
await go('/kelim/claude/pratiyut-umimshal');
const cOrgName = await page.locator('.pt__col--org .pt__colname').innerText();
ok(gOrgName !== cOrgName, `PrivacyTrace: שם הטור הארגוני מותאם לכלי (${gOrgName} מול ${cOrgName})`);

// ---------- 18. מצב כהה ברכיבי קלוד ----------
console.log('\n== מצב כהה ברכיבי קלוד ==');
await go('/kelim/claude/cowork');
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.waitForTimeout(100);
const cwSel = await page.locator('[data-cw-plan][aria-pressed="true"]').evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, fg: s.color }; });
ok(cwSel.bg !== cwSel.fg, `CoworkCheck כהה: הנבחר קריא (רקע ${cwSel.bg}, טקסט ${cwSel.fg})`);
await go('/kelim/claude/artifacts');
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.waitForTimeout(100);
const arSel = await page.locator('[data-ar-acc][aria-pressed="true"]').evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, fg: s.color }; });
ok(arSel.bg !== arSel.fg, `ArtifactReach כהה: הנבחר קריא (רקע ${arSel.bg}, טקסט ${arSel.fg})`);

console.log('\n== שגיאות ריצה ==');
ok(errs.length === 0, errs.length ? 'שגיאות: ' + errs.join(' | ') : 'אין שגיאות ריצה בדף');

await browser.close();
server.close();
console.log('\n' + (fails.length ? `נכשלו ${fails.length}:\n- ` + fails.join('\n- ') : 'הכול עבר.'));
process.exit(fails.length ? 1 : 0);
