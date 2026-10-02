// Calendar dates as the person sees them. toISOString() gives the UTC date, which in Israel is still
// yesterday until 2-3 am, so "today" and "this month" come from the device's clock instead.

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' for `d` on this device. */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM' for `d` on this device. */
export const localMonth = (d = new Date()) => localDay(d).slice(0, 7);
