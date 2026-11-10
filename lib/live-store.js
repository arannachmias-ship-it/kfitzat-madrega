/**
 * גישה לאחסון של Vercel Blob, דרך שכבה דקה אחת, כדי שהבדיקות יוכלו להחליף אותה.
 * בבדיקות: globalThis.__liveStore = { put, list, del, head }.
 */
import { put as bput, list as blist, del as bdel, head as bhead, BlobNotFoundError } from '@vercel/blob';

const real = { put: bput, list: blist, del: bdel, head: bhead };
export const store = () => globalThis.__liveStore || real;

// "הקובץ לא קיים". הספרייה לא קובעת שם לשגיאה (name נשאר "Error"),
// וההודעה היא "Vercel Blob: The requested blob does not exist". לכן בודקים לפי הסוג, ולפי ההודעה כגיבוי
export const isNotFound = (e) => e instanceof BlobNotFoundError || /requested blob does not exist/i.test(String(e?.message || ''));
