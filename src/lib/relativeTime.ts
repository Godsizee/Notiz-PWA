const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });

export function formatRelative(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 60) return 'gerade eben';
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  if (diffHrs < 24) return rtf.format(-diffHrs, 'hour');
  if (diffDays < 2) return 'gestern';
  if (diffDays < 7) return rtf.format(-diffDays, 'day');
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}
