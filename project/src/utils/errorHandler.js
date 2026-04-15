const listeners = new Set();

let failureLog = [];

export function onToast(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(toast) {
  listeners.forEach(cb => cb(toast));
}

export function toast(message, type = 'error', duration = 5000) {
  const id = Date.now() + Math.random();
  emit({ id, message, type, duration });
  return id;
}

export function toastSuccess(message) {
  return toast(message, 'success', 3500);
}

export function toastWarn(message) {
  return toast(message, 'warn', 4500);
}

export function toastError(message) {
  return toast(message, 'error', 6000);
}

export function logFailure(context, error) {
  const entry = {
    context,
    message: error?.message || String(error),
    code: error?.code,
    ts: new Date().toISOString(),
  };
  failureLog.push(entry);
  if (failureLog.length > 200) failureLog = failureLog.slice(-200);

  if (import.meta.env.DEV) {
    console.error(`[${context}]`, error);
  }
  return entry;
}

export function getFailureLog() {
  return [...failureLog];
}

export function handleSupabaseError(error, context, opts = {}) {
  if (!error) return false;
  const { silent = false, fallback } = opts;
  logFailure(context, error);
  if (!silent) {
    toastError(fallback || error.message || `${context} failed.`);
  }
  return true;
}
