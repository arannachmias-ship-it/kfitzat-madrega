/**
 * הקוריקולום המלא. 29 שיעורים, חמישה שלבים.
 * שיעור שנכתב מקבל קובץ MDX ב-src/content/maslul עם אותו slug, ואז הוא נהיה קליק.
 * שיעור שעוד לא נכתב מופיע במפה כ"בקרוב" — כדי שהיקף התוכנית ייראה מהיום הראשון.
 */

export type TrackItem = {
  slug: string;
  n: string;          // 1.3
  title: string;
  note: string;       // one line, what it gives
  interactive?: boolean;
};

export type Stage = {
  n: number;
  title: string;
  question: string;
  outcome: string;
  items: TrackItem[];
};

export const STAGES: Stage[] = [
  {
    n: 0,
    title: 'להבין מה זה, בלי מיסטיקה',
    question: 'מה הדבר הזה בעצם עושה, ולמה הוא לפעמים ממציא?',
    outcome: 'תדעו להסביר לצוות במשפט אחד למה לא סומכים על התשובה בעיניים עצומות.',
    items: [
      { slug: 'ma-model-safa-ose', n: '0.1', title: 'מה מודל שפה בעצם עושה', note: 'בלי מתמטיקה, ובלי המילה "חושב".' },
      { slug: 'lama-ai-mamtzi', n: '0.2', title: 'למה AI ממציא דברים', note: 'ולמה זה משנה לגמרי איך משתמשים בו בעבודה.' },
      { slug: 'chat-kli-sochen', n: '0.3', title: "צ'אט, כלי וסוכן: מה ההבדל", note: 'שלוש מילים שמתבלבלות, ומה מתאים למה.' },
    ],
  },
  {
    n: 1,
    title: 'לדבר עם המכונה',
    question: 'למה לעובד אחד זה עובד ולשאר יוצאת גנריות?',
    outcome: 'יהיו לצוות שלושה פרומפטים משותפים שבאמת מריצים כל שבוע.',
    items: [
      { slug: 'prompt-garua-mul-tov', n: '1.1', title: 'פרומפט גרוע מול פרומפט טוב', note: 'על סיכום ישיבה אמיתי. שנו ותראו את התוצאה משתנה.', interactive: true },
      { slug: 'heksher-lifnei-bakasha', n: '1.2', title: 'הקשר לפני בקשה', note: 'השינוי היחיד שמשפר יותר מכל טכניקה אחרת.' },
      { slug: 'dugma-bimkom-hesber', n: '1.3', title: 'לתת דוגמה במקום להסביר', note: 'למה פלט אחד לדוגמה שווה פסקה של הנחיות.' },
      { slug: 'levakesh-mivne', n: '1.4', title: 'לבקש מבנה, לא טקסט', note: 'טבלה, רשימה, שדות. פלט שאפשר להשתמש בו ישר.' },
      { slug: 'prompt-kavua-latzevet', n: '1.5', title: 'פרומפט קבוע לצוות', note: 'לבנות אחד, לשמור, ולהשתמש בו שוב במקום להמציא כל פעם.' },
    ],
  },
  {
    n: 2,
    title: 'להפוך את זה לעבודה אמיתית',
    question: 'איפה זה חוסך לצוות שעות השבוע, לא בעתיד?',
    outcome: 'תהיה מדידה ראשונה: כמה שעות בשבוע חזרו לצוות, ואיפה.',
    items: [
      { slug: 'dochot-umatzagot', n: '2.1', title: 'דוחות ומצגות: מנתונים לטיוטה', note: 'איפה זה חוסך שעה, ואיפה זה עולה לכם שעה.' },
      { slug: 'sikum-yeshiva-lemesimot', n: '2.2', title: 'מסיכום ישיבה לרשימת משימות', note: 'בארבע דקות במקום ארבעים, כולל מי אחראי.' },
      { slug: 'lechaletz-netunim', n: '2.3', title: 'לחלץ נתונים ממסמכים בלי להקליד', note: 'הרגע שבו זה מפסיק להיות צעצוע.' },
      { slug: 'tikshoret-pnim-irgunit', n: '2.4', title: 'תקשורת פנים־ארגונית שנקראת עד הסוף', note: 'הודעות שאנשים באמת פותחים.' },
      { slug: 'teur-misra', n: '2.5', title: 'תיאור משרה שלא נשמע כמו כולם', note: 'הדוגמה הכי קרובה לעבודה היומיומית של HR.' },
      { slug: 'miyun-korot-chaim', n: '2.6', title: 'מיון קורות חיים, ואיפה זה נהיה מסוכן', note: 'מה מותר, מה אסור, ומה חושף אתכם לתביעה.' },
      { slug: 'yeda-pnimi', n: '2.7', title: 'לתת למודל את הידע הפנימי של הארגון', note: 'נהלים, מסמכים, היסטוריה. בלי להעלות הכל לאינטרנט.' },
    ],
  },
  {
    n: 3,
    title: 'לבנות מערכת שרצה לבד',
    question: 'אפשר שזה יקרה בלי שמישהו לוחץ על כלום?',
    outcome: 'תהיה בארגון אוטומציה אחת שרצה בלי תלות באדם ספציפי.',
    items: [
      { slug: 'metrigger-lepeula', n: '3.1', title: 'מטריגר לפעולה: איך אוטומציה בנויה', note: 'המבנה שחוזר בכל אוטומציה, בלי קוד.', interactive: true },
      { slug: 'lechaber-kelim-kayamim', n: '3.2', title: 'לחבר את הכלים שכבר יש לכם', note: 'מייל, יומן, אקסל, CRM. מה מתחבר למה.', interactive: true },
      { slug: 'automatzia-rishona', n: '3.3', title: 'האוטומציה הראשונה שלכם, מקצה לקצה', note: 'אחת קטנה שעובדת, מההתחלה עד שהיא רצה.', interactive: true },
      { slug: 'matai-sochen', n: '3.4', title: 'מתי סוכן ומתי סתם סקריפט', note: 'רוב מה שקוראים לו סוכן לא צריך להיות סוכן.' },
      { slug: 'kshe-ze-nishbar', n: '3.5', title: 'מה קורה כשזה נשבר, ומי אחראי', note: 'השאלה שאף אחד לא שואל לפני שבונים.' },
      { slug: 'letachzek-bli-mefateach', n: '3.6', title: 'לתחזק אוטומציה בלי מפתח', note: 'איך לא להיות תלויים באדם שבנה את זה.' },
    ],
  },
  {
    n: 4,
    title: 'ממשל, סיכון והטמעה',
    question: 'מה מותר, מה אסור, ואיך גורמים לאנשים באמת להשתמש?',
    outcome: 'יהיו לכם מסמך מדיניות ותוכנית 90 יום שאפשר להביא להנהלה.',
    items: [
      { slug: 'ma-asur-lehachnis', n: '4.1', title: 'מה אסור להכניס ל־AI: המדריך למשאבי אנוש', note: 'מידע עובדים, מועמדים, לקוחות וכספים. הקווים האדומים.' },
      { slug: 'mediniyut-amud-echad', n: '4.2', title: 'מדיניות AI בעמוד אחד', note: 'תבנית להעתקה, כתובה בשפה שעובדים מבינים.' },
      { slug: 'pratiyut-ovdim', n: '4.3', title: 'פרטיות עובדים ומועמדים', note: 'מה החוק דורש ומה פשוט לא כדאי.' },
      { slug: 'lama-hatzevet-lo-mishtamesh', n: '4.4', title: 'למה הצוות לא משתמש במה שקניתם', note: 'חמש סיבות אמיתיות, ומה עוזר לכל אחת.' },
      { slug: 'shloshet-alafim-be-30-yom', n: '4.5', title: 'איך מעבירים 3,000 אנשים לטכנולוגיה חדשה ב־30 יום', note: 'חמישה לקחים מהשטח, עם מספרים אמיתיים.' },
      { slug: 'lelamed-mi-shebatuach-shelo-bishvilo', n: '4.6', title: 'ללמד את מי שבטוח שזה לא בשבילו', note: 'עשרים שנות הוראה, מזוקקות לשבעה כללים.' },
      { slug: 'eich-modedim-imutz', n: '4.7', title: 'איך מודדים אימוץ, ולא שביעות רצון', note: 'המדד שההנהלה מבקשת הוא בדרך כלל המדד הלא נכון.' },
      { slug: 'tochnit-90-yom', n: '4.8', title: 'תוכנית 90 יום להטמעת AI בארגון', note: 'מה עושים בכל שבוע, ומי אחראי על מה.' },
    ],
  },
];

export const TOTAL_LESSONS = STAGES.reduce((n, s) => n + s.items.length, 0);
