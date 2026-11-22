/** Returns a date formatted as local YYYY-MM-DD without UTC day shifts. */
export function getLocalTodayIso(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses YYYY-MM-DD (or ISO prefix) strictly at local midnight instead of UTC. */
export function parseLocalDate(raw: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const fallback = new Date(raw);
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}
