import { Fragment, type ReactNode } from 'react';
import { Circle, CheckCircle2 } from 'lucide-react';

/**
 * Leichtgewichtige, abhängigkeitsfreie Darstellung von Klartext-Notizen.
 * Wertet nur auf, was Nutzer ohnehin natürlich schreiben — niemand muss
 * Markdown lernen, unerkannter Text bleibt unverändert:
 *  - URLs werden hervorgehoben
 *  - Zeilen mit "- ", "* " oder "• " werden zu Aufzählungspunkten
 *  - "- [ ]" / "- [x]" werden zu Häkchen
 *  - **fett** wird fett
 * Kein dangerouslySetInnerHTML → kein XSS-Risiko.
 */

// Fett (**…**) und URLs innerhalb einer Zeile darstellen.
function renderInline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part, bi) => {
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      out.push(
        <strong key={`${key}-b${bi}`} className="font-semibold text-[var(--text-primary)]">
          {part.slice(2, -2)}
        </strong>
      );
      return;
    }
    part.split(/(https?:\/\/[^\s]+)/g).forEach((seg, si) => {
      if (!seg) return;
      if (/^https?:\/\//.test(seg)) {
        out.push(
          <span
            key={`${key}-u${bi}-${si}`}
            className="text-primary underline decoration-primary/40 underline-offset-2"
          >
            {seg.replace(/^https?:\/\/(www\.)?/, '')}
          </span>
        );
      } else {
        out.push(<Fragment key={`${key}-t${bi}-${si}`}>{seg}</Fragment>);
      }
    });
  });
  return out;
}

interface NoteContentProps {
  text: string;
  className?: string;
}

export default function NoteContent({ text, className = '' }: NoteContentProps) {
  const lines = text.split('\n');

  return (
    <div className={className}>
      {lines.map((line, i) => {
        const br = i > 0 ? <br /> : null;

        const checkbox = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (checkbox) {
          const done = checkbox[1].toLowerCase() === 'x';
          return (
            <Fragment key={i}>
              {br}
              {done ? (
                <CheckCircle2 className="inline w-3.5 h-3.5 shrink-0 -translate-y-px text-primary" />
              ) : (
                <Circle className="inline w-3.5 h-3.5 shrink-0 -translate-y-px text-[var(--text-muted)]/50" />
              )}{' '}
              <span className={done ? 'line-through text-[var(--text-muted)]/60' : ''}>
                {renderInline(checkbox[2], `l${i}`)}
              </span>
            </Fragment>
          );
        }

        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet) {
          return (
            <Fragment key={i}>
              {br}
              <span className="text-[var(--text-muted)]">•</span>{' '}
              {renderInline(bullet[1], `l${i}`)}
            </Fragment>
          );
        }

        return (
          <Fragment key={i}>
            {br}
            {renderInline(line, `l${i}`)}
          </Fragment>
        );
      })}
    </div>
  );
}
