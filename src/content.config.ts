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
  }),
});

/**
 * מדור הכלים. בכוונה מחוץ למסלול.
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
  }),
});

export const collections = { maslul, kelim, efshar };
