import { toastError, toastSuccess } from './errorHandler';

/** After CSVImportModal closes — same messaging for company dashboard and dispatch. */
export function toastFleetImportSummary(payload) {
  if (!payload) return;
  const a = payload.added || 0;
  const u = payload.updated || 0;
  const k = payload.unchanged || 0;
  const s = payload.skipped || 0;
  const f = payload.failed || 0;
  if (a + u + k > 0) {
    const parts = [];
    if (a) parts.push(`${a} added`);
    if (u) parts.push(`${u} updated`);
    if (k) parts.push(`${k} unchanged`);
    if (s) parts.push(`${s} skipped`);
    toastSuccess(`Fleet import: ${parts.join(', ')}.`);
  } else if (s && !f) {
    toastSuccess(`Fleet import: ${s} skipped (no rows changed).`);
  } else if (f) {
    toastError(`Fleet import: ${f} failed — see import summary.`);
  }
}
