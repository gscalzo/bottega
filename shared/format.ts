/** Times as the board says them. Local time; callers pass `now`. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "3 min", "2 h", "5 d" — the length of a span. */
export function duration(ms: number): string {
  if (ms < MINUTE) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h`;
  return `${Math.floor(ms / DAY)} d`;
}

/** "just now" or "3 min ago". */
export function ago(at: number, now: number): string {
  const span = duration(Math.max(0, now - at));
  return span === 'just now' ? span : `${span} ago`;
}

const two = (n: number) => String(n).padStart(2, '0');

/** "09:41" in local time. */
export function clock(at: number): string {
  const d = new Date(at);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "09:41" today, "yesterday 18:02", else "3 Sep 09:41". */
export function when(at: number, now: number): string {
  const d = new Date(at);
  const today = new Date(now);
  if (sameDay(d, today)) return clock(at);
  const yesterday = new Date(now - DAY);
  if (sameDay(d, yesterday)) return `yesterday ${clock(at)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${clock(at)}`;
}
