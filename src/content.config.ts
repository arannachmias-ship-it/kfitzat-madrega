import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const maslul = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/maslul' }),
  schema: z.object({
    stage: z.number(),          // 0-4
    order: z.number(),          // position inside the track
    title: z.string(),
    kicker: z.string(),         // the pain, one line
    goal: z.string(),           // what you'll know by the end
    readingTime: z.number(),
    author: z.enum(['ארן נחמיאס', 'מתי מצוינים']),
    interactive: z.boolean().default(false),
    published: z.boolean().default(true),
    date: z.date(),
    tool: z.string().optional(),   // slug במדריך הכלים: הכלי האחד שמומלץ לשיעור הזה
    demo: z.string().optional(),   // slug ב"מה כבר אפשר": ההדגמה שמראה את זה עובד
  }),
});

/**
 * מדור הכלים. שכבה שנייה של המסלול: כל כלי משויך לשלבים (stages) ומופיע במפת המסלול ליד כל אחד מהם.
 * המסלול בנוי מעקרונות שלא מתיישנים; מדור הכלים מתיישן כל רבעון,
 * ולכן לכל כלי יש `checked` — תאריך הבדיקה — והוא מוצג בגלוי.
 */
const kelim = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/kelim' }),
  schema: z.object({
    name: z.string(),
    vendor: z.string(),
    category: z.enum(["צ'אטים כלליים", 'כלים למשימה מסוימת', 'תמלול וסיכום ישיבות']),
    order: z.number(),
    tagline: z.string(),          // מה זה, בשורה
    bestFor: z.string(),          // איפה הוא מנצח
    notFor: z.string(),           // איפה הוא לא הכלי הנכון
    hebrew: z.string(),           // מה המצב עם עברית, בקצרה
    priceFree: z.string(),
    pricePersonal: z.string(),
    priceOrg: z.string(),
    trainsPersonal: z.string(),   // האם מאמנים על התוכן בחשבון אישי
    trainsOrg: z.string(),        // ובחשבון ארגוני
    startUrl: z.string().optional(),   // עמוד השוואה אינו כלי יחיד, ולכן אין לו עמוד הרשמה
    checked: z.date(),            // תאריך הבדיקה האחרון
    published: z.boolean().default(true),
    stages: z.array(z.number()).default([]), // כל השלבים במסלול שבהם הכלי רלוונטי (0-4). כלי כללי מופיע בכולם.
    featured: z.boolean().default(false), // הכלי שמומלץ להתחיל איתו בשלב הזה
  }),
});

/**
 * "מה כבר אפשר" — המדור שתפקידו להראות, לא להסביר.
 * המסלול מלמד עקרונות; מדריך הכלים עונה במה להשתמש;
 * המדור הזה מראה מה נהיה אפשרי, ולכן הוא זה שמתיישן הכי מהר.
 * כל פריט נושא `checked` גלוי, ואומר במפורש כמה זמן לקח לבנות אותו.
 */
const efshar = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/efshar' }),
  schema: z.object({
    order: z.number(),
    title: z.string(),
    kicker: z.string(),        // הכאב, בשורה
    before: z.string(),        // מה קיים היום בארגון
    after: z.string(),         // מה בנינו במקום
    built: z.string(),         // כמה זמן זה לקח, בשפה אנושית
    needs: z.string(),         // מה צריך כדי לעשות את זה אצלכם
    checked: z.date(),
    published: z.boolean().default(true),
    stage: z.number().optional(),            // השלב במסלול שבו זה נהיה אפשרי
    tools: z.array(z.string()).default([]),  // slugs במדריך הכלים שבהם זה נבנה
  }),
});

/**
 * "מה השתנה" — הסריקה השבועית. שכבה רביעית שיושבת במשטח של "מה כבר אפשר",
 * ובאוסף נפרד ממנו בכוונה: הכללים של `efshar` מדברים על דברים שבנינו בפועל,
 * ועדכון שקראנו עליו אינו דבר שבנינו. לכל פריט כאן יש `source` — הדף הרשמי של הספק —
 * ו־`checked`, התאריך שבו נבדק. מה שלא אומת מסומן `unverified` ונכתב בגלוי.
 */
const shinuyim = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/shinuyim' }),
  schema: z.object({
    date: z.date(),                 // מתי הספק פרסם את השינוי
    title: z.string(),
    tool: z.string(),               // שם הכלי או המערכת, לתצוגה
    toolSlug: z.string().optional(),// slug במדריך הכלים, כשיש כזה
    what: z.string(),               // מה השתנה, בשתי שורות
    meaning: z.string(),            // מה זה אומר לכם: ההשלכה המעשית לארגון
    source: z.string(),             // קישור לדף הרשמי של הספק
    sourceName: z.string(),         // שם הדף, לתצוגה
    checked: z.date(),              // תאריך הבדיקה שלנו
    lesson: z.string().optional(),  // slug של שיעור אחד במסלול שמתחבר לזה
    unverified: z.boolean().default(false), // לא הצלחנו לאמת מול הדף הרשמי
    published: z.boolean().default(true),
  }),
});

/**
 * עדויות של משתתפים. התשתית קיימת, אבל האתר לא מציג דבר עד שיש עדות אמיתית.
 * שני שערים לפני פרסום, ושניהם חייבים להיות true: `consent` — אישור בכתב של האדם
 * לפרסום בשמו ובתפקידו; `published` — ההחלטה שלנו להעלות. ציטוט הוא גוף הקובץ,
 * במילים של האדם עצמו, בלי עריכה שמשנה משמעות. אין עדויות דמה, גם לא כדוגמה.
 */
const edut = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/edut' }),
  schema: z.object({
    name: z.string(),                 // שם מלא, כפי שאושר לפרסום
    role: z.string(),                 // תפקיד
    org: z.string(),                  // הארגון
    program: z.enum(['hartsaa', 'sadna', 'yom', 'sidra', 'livuy']), // איזו תוכנית
    date: z.date(),                   // מתי התקיימה
    consent: z.boolean().default(false),
    published: z.boolean().default(false),
  }),
});

export const collections = { maslul, kelim, efshar, shinuyim, edut };
