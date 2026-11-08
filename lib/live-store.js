/**
 * גישה לאחסון של Vercel Blob, דרך שכבה דקה אחת, כדי שהבדיקות יוכלו להחליף אותה.
 * בבדיקות: globalThis.__liveStore = { put, list, del, head }.
 */
import { put as bput, list as blist, del as bdel, head as bhead } from '@vercel/blob';

const real = { put: bput, list: blist, del: bdel, head: bhead };
export const store = () => globalThis.__liveStore || real;
