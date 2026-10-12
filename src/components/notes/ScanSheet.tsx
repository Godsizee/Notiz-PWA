"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Circle, Camera, RotateCcw, X, Loader2 } from 'lucide-react';
import type { RecordModel } from 'pocketbase';
import { prepareScanImage } from '@/lib/images';
import { requestScan, ScanError } from '@/lib/scan/client';
import { planMerge, type MergeRow, type MergeReason } from '@/lib/scan/merge';
import type { ScanResult } from '@/lib/scan/result';
import { hapticLight } from '@/lib/haptics';

// Foto-Scan, Schritt 2 von 2: liest die gewaehlten Fotos ueber /api/scan aus
// und zeigt die Vorschlaege zur Pruefung, bevor irgendetwas in der Liste
// landet. Geschrieben wird erst ueber onCommit (ChecklistEditor).
//
// Per Portal an <body>: der Editor sitzt in der BottomSheet, deren
// motion.div per transform animiert wird — ein position:fixed-Kind wuerde
// sonst relativ zu dieser Sheet statt zum Viewport positioniert.

type Phase =
  | { kind: 'preparing' }
  | { kind: 'scanning'; slow: boolean }
  | { kind: 'review'; result: ScanResult }
  | { kind: 'committing'; result: ScanResult }
  | { kind: 'error'; code: string; message: string; retryable: boolean };

interface ScanSheetProps {
  /** Gewaehlte Fotos (max. 3 werden gelesen). null = Sheet geschlossen. */
  files: File[] | null;
  /** Aktuelle Eintraege der offenen Liste, fuer die Dubletten-Erkennung. */
  existingItems: RecordModel[];
  onClose: () => void;
  /** Schreibt die bestaetigten Zeilen. Wirft bei Fehler, dann bleibt das Review offen. */
  onCommit: (rows: MergeRow[], result: ScanResult) => Promise<void>;
  /** Kamera/Galerie erneut oeffnen ("Anderes Foto"). */
  onRetake: () => void;
}

const MAX_FILES = 3;
const SLOW_AFTER_MS = 8000;
// Ohne neue Bytes ist ein erneuter Versuch sinnlos. (Ob wiederholt werden darf,
// steht im State statt aus blobsRef gelesen zu werden: Refs beim Rendern zu lesen
// verbietet react-hooks/refs aus eslint-config-next.)
const NOT_RETRYABLE = new Set(['decode_failed', 'invalid_input', 'too_large', 'unauthenticated', 'llm_refused']);

const REASON_LABEL: Record<MergeReason, string> = {
  duplicate_open: 'Steht schon auf der Liste',
  duplicate_scan: 'Doppelt im Foto',
  reopen_completed: 'Wird wieder aktiviert',
  low_confidence: 'Unsicher gelesen – bitte prüfen',
};

const REASON_CLASS: Record<MergeReason, string> = {
  duplicate_open: 'bg-[var(--text-primary)]/5 text-[var(--text-secondary)]',
  duplicate_scan: 'bg-[var(--text-primary)]/5 text-[var(--text-secondary)]',
  reopen_completed: 'bg-primary/10 text-primary',
  low_confidence: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

function sourceLabel(result: ScanResult): string {
  if (result.sourceType === 'recipe') return result.title ? `Rezept: ${result.title}` : 'Rezept';
  if (result.sourceType === 'shopping_list') return 'Einkaufszettel';
  return 'Foto';
}

export default function ScanSheet({ files, existingItems, onClose, onCommit, onRetake }: ScanSheetProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'preparing' });
  const [rows, setRows] = useState<MergeRow[]>([]);
  const blobsRef = useRef<Blob[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const existingRef = useRef(existingItems);
  useEffect(() => { existingRef.current = existingItems; }, [existingItems]);

  const runScan = useCallback(async (blobs: Blob[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'scanning', slow: false });
    const slowTimer = setTimeout(() => {
      setPhase((p) => (p.kind === 'scanning' ? { kind: 'scanning', slow: true } : p));
    }, SLOW_AFTER_MS);

    try {
      const result = await requestScan(blobs, controller.signal);
      if (controller.signal.aborted) return;
      const existing = existingRef.current.map((i) => ({
        id: i.id,
        text: String(i.text ?? ''),
        is_completed: !!i.is_completed,
      }));
      setRows(planMerge(result.items, existing, result.sourceType));
      setPhase({ kind: 'review', result });
      hapticLight();
    } catch (err) {
      if (controller.signal.aborted) return;
      const e = err instanceof ScanError ? err : new ScanError('network', 'Unbekannter Fehler beim Foto-Scan.');
      setPhase({ kind: 'error', code: e.code, message: e.message, retryable: !NOT_RETRYABLE.has(e.code) });
    } finally {
      clearTimeout(slowTimer);
    }
  }, []);

  // Neue Fotos → vorbereiten (nacheinander: mehrere 12-MP-Bitmaps parallel
  // bringen Mittelklasse-Handys zum Absturz, siehe processImages) → scannen.
  useEffect(() => {
    if (!files || files.length === 0) return;
    let cancelled = false;
    blobsRef.current = null;
    setRows([]);
    setPhase({ kind: 'preparing' });

    (async () => {
      try {
        const blobs: Blob[] = [];
        for (const file of files.slice(0, MAX_FILES)) {
          blobs.push(await prepareScanImage(file));
          if (cancelled) return;
        }
        blobsRef.current = blobs;
        await runScan(blobs);
      } catch (err) {
        if (cancelled) return;
        setPhase({
          kind: 'error',
          code: 'decode_failed',
          message: err instanceof Error && err.message ? err.message : 'Das Foto konnte nicht gelesen werden.',
          retryable: false,
        });
      }
    })();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [files, runScan]);

  // Escape schliesst nur den Scan, nicht den Editor dahinter: page.tsx haengt
  // seinen Escape-Handler in der Bubble-Phase an window, dieser hier laeuft in
  // der Capture-Phase davor.
  useEffect(() => {
    if (!files) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (phase.kind !== 'committing') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [files, phase.kind, onClose]);

  useEffect(() => {
    if (files) dialogRef.current?.focus();
  }, [files]);

  const toggleRow = (rowId: string) => {
    hapticLight();
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, selected: !r.selected } : r)));
  };

  const editRow = (rowId: string, text: string) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, text } : r)));
  };

  const selectedCount = rows.filter((r) => r.selected && r.text.trim()).length;
  const allSelected = rows.length > 0 && rows.every((r) => r.selected);

  const toggleAll = () => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  };

  const commit = async () => {
    if (phase.kind !== 'review' || selectedCount === 0) return;
    const { result } = phase;
    setPhase({ kind: 'committing', result });
    try {
      await onCommit(rows, result);
    } catch {
      setPhase({ kind: 'review', result });
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {files && (
        <>
          <motion.div
            key="scan-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50"
            aria-hidden="true"
          />
          <motion.div
            key="scan-sheet"
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-sheet-title"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed inset-x-0 bottom-0 z-[65] mx-auto flex h-[88dvh] max-w-4xl flex-col rounded-t-3xl border-t border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--shadow-elevated)] outline-none"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Header */}
            <div className="flex items-start gap-3 px-5 pt-5 pb-3">
              <div className="min-w-0 flex-1">
                <h2 id="scan-sheet-title" className="text-xl font-extrabold text-[var(--text-primary)]">
                  Vom Foto übernehmen
                </h2>
                {(phase.kind === 'review' || phase.kind === 'committing') && (
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)] truncate">
                    {sourceLabel(phase.result)} · {rows.length} erkannt
                  </p>
                )}
              </div>
              <button
                onClick={cancel}
                disabled={phase.kind === 'committing'}
                className="tap-target -mr-2 -mt-2 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--background)]/80 disabled:opacity-40"
                aria-label="Scan schließen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5" aria-live="polite">
              {(phase.kind === 'preparing' || phase.kind === 'scanning') && (
                <div className="flex h-full flex-col items-center justify-center gap-4 pb-16 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-base font-bold text-[var(--text-primary)]">
                    {phase.kind === 'preparing' ? 'Foto wird vorbereitet …' : 'Zettel wird gelesen …'}
                  </p>
                  <p className="max-w-xs text-sm text-[var(--text-secondary)]">
                    {phase.kind === 'scanning' && phase.slow
                      ? 'Dauert etwas länger als sonst. Du kannst abbrechen und es gleich noch einmal versuchen.'
                      : 'Einkaufszettel werden 1:1 übernommen, Rezepte in Einkaufsmengen umgerechnet.'}
                  </p>
                </div>
              )}

              {phase.kind === 'error' && (
                <div className="flex h-full flex-col items-center justify-center gap-4 pb-16 text-center">
                  <AlertTriangle className="h-10 w-10 text-amber-500" />
                  <p className="max-w-xs text-base font-bold text-[var(--text-primary)]">{phase.message}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {phase.retryable && (
                      <button
                        onClick={() => blobsRef.current && runScan(blobsRef.current)}
                        className="flex min-h-11 items-center gap-2 rounded-xl bg-primary-strong px-4 text-sm font-bold text-white"
                      >
                        <RotateCcw className="h-4 w-4" /> Erneut versuchen
                      </button>
                    )}
                    <button
                      onClick={onRetake}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-color)] px-4 text-sm font-bold text-[var(--text-primary)]"
                    >
                      <Camera className="h-4 w-4" /> Anderes Foto
                    </button>
                  </div>
                </div>
              )}

              {(phase.kind === 'review' || phase.kind === 'committing') && (
                <>
                  {(!phase.result.legible || phase.result.warnings.length > 0) && rows.length > 0 && (
                    <div className="mb-3 flex gap-2.5 rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        {!phase.result.legible && 'Teile des Fotos waren schwer lesbar. Bitte prüfe die Einträge. '}
                        {phase.result.warnings.join(' ')}
                      </p>
                    </div>
                  )}

                  {rows.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 pb-16 text-center">
                      <p className="text-base font-bold text-[var(--text-primary)]">Keine Einträge erkannt</p>
                      <p className="max-w-xs text-sm text-[var(--text-secondary)]">
                        {phase.result.sourceType === 'other'
                          ? 'Das sieht nicht nach Einkaufszettel oder Rezept aus.'
                          : 'Das Foto ist zu unscharf, zu dunkel oder abgeschnitten.'}
                      </p>
                      <button
                        onClick={onRetake}
                        className="mt-2 flex min-h-11 items-center gap-2 rounded-xl bg-primary-strong px-4 text-sm font-bold text-white"
                      >
                        <Camera className="h-4 w-4" /> Neues Foto
                      </button>
                    </div>
                  ) : (
                    <ul className="space-y-1 pb-4">
                      {rows.map((row, index) => (
                        <li key={row.rowId} className="flex items-start gap-1">
                          <button
                            role="checkbox"
                            aria-checked={row.selected}
                            aria-label={`${row.text || 'Eintrag'} übernehmen`}
                            onClick={() => toggleRow(row.rowId)}
                            className="tap-target shrink-0 text-primary"
                          >
                            {row.selected ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5 text-[var(--text-muted)]" />}
                          </button>
                          <div className="min-w-0 flex-1 py-1.5">
                            <input
                              value={row.text}
                              onChange={(e) => editRow(row.rowId, e.target.value)}
                              aria-label={`Eintrag ${index + 1}`}
                              className={`w-full bg-transparent text-base outline-none ${row.selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through'}`}
                            />
                            {row.item.raw && row.item.raw !== row.text && (
                              <p className="truncate text-xs text-[var(--text-muted)]">Gelesen: {row.item.raw}</p>
                            )}
                            {row.reason && (
                              <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold ${REASON_CLASS[row.reason]}`}>
                                {REASON_LABEL[row.reason]}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {(phase.kind === 'review' || phase.kind === 'committing') && rows.length > 0 && (
              <div className="flex items-center gap-2 border-t border-[var(--border-color)] px-5 py-3">
                <button
                  onClick={toggleAll}
                  disabled={phase.kind === 'committing'}
                  className="min-h-11 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--background)]/80"
                >
                  {allSelected ? 'Keine' : 'Alle'}
                </button>
                <button
                  onClick={commit}
                  disabled={selectedCount === 0 || phase.kind === 'committing'}
                  className="ml-auto flex min-h-11 items-center gap-2 rounded-xl bg-primary-strong px-5 text-sm font-bold text-white disabled:opacity-40"
                >
                  {phase.kind === 'committing' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {selectedCount === 1 ? '1 Eintrag übernehmen' : `${selectedCount} Einträge übernehmen`}
                </button>
              </div>
            )}

            {(phase.kind === 'preparing' || phase.kind === 'scanning') && (
              <div className="flex justify-center border-t border-[var(--border-color)] px-5 py-3">
                <button
                  onClick={cancel}
                  className="min-h-11 rounded-xl px-5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--background)]/80"
                >
                  Abbrechen
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
