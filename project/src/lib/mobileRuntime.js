import { Capacitor } from '@capacitor/core';

export const MOBILE_APP_SCHEME =
  import.meta.env.VITE_MOBILE_APP_SCHEME || 'penthousedispatch';
export const MOBILE_APP_HOST = 'app';
export const WEB_APP_ORIGIN =
  import.meta.env.VITE_PUBLIC_APP_ORIGIN || 'https://www.penthousedps.com';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function getAuthRedirectUrl(path = '/change-password') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (isNativeApp()) {
    return `${MOBILE_APP_SCHEME}://${MOBILE_APP_HOST}${normalizedPath}`;
  }
  if (typeof window !== 'undefined' && (import.meta.env.DEV || window.location.hostname === 'localhost')) {
    return `${window.location.origin}${normalizedPath}`;
  }
  return `${WEB_APP_ORIGIN}${normalizedPath}`;
}

export function getPublicAppUrl(path = '/', options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const preferNative = Boolean(options.preferNative);

  if (preferNative && isNativeApp()) {
    return `${MOBILE_APP_SCHEME}://${MOBILE_APP_HOST}${normalizedPath}`;
  }

  if (typeof window !== 'undefined' && (import.meta.env.DEV || window.location.hostname === 'localhost')) {
    return `${window.location.origin}${normalizedPath}`;
  }

  return `${WEB_APP_ORIGIN}${normalizedPath}`;
}

export function parseIncomingAppUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const isMobileScheme = parsed.protocol === `${MOBILE_APP_SCHEME}:`;
    if (!isMobileScheme) return null;

    const path = parsed.pathname || '/';
    const search = parsed.search || '';
    const hash = parsed.hash || '';
    return `${path}${search}${hash}`;
  } catch {
    return null;
  }
}
