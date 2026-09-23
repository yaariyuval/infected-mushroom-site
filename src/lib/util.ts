const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Prefix a site-relative path ("/media/x.jpg") with the deploy base path. */
export function asset(path: string) {
  if (!path) return '';
  if (/^(https?:)?\/\//.test(path)) return path;
  return base + (path.startsWith('/') ? path : '/' + path);
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });

export const weekday = fmt({ weekday: 'short' });
export const day = fmt({ day: '2-digit' });
export const month = fmt({ month: 'short' });

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
