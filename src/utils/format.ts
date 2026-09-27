// Peso formatter — manual implementation so it works identically on
// Hermes (Android/iOS) and web, regardless of Intl availability.
export function peso(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  const fixed = safe.toFixed(2);
  const [intPart = '0', decPart = '00'] = fixed.split('.');
  const signed = intPart.startsWith('-') ? '-' : '';
  const digits = signed ? intPart.slice(1) : intPart;
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${signed}\u20B1${withCommas}.${decPart}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Local-time YYYY-MM-DD key for "today" bucketing
export function todayKey(d: Date = new Date()): string {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isSameLocalDay(iso: string, d: Date = new Date()): boolean {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return false;
  return (
    then.getFullYear() === d.getFullYear() &&
    then.getMonth() === d.getMonth() &&
    then.getDate() === d.getDate()
  );
}
