import { Capacitor } from '@capacitor/core';

export const MOBILE_APP_SCHEME = 'penthousedispatch';
export const MOBILE_APP_HOST = 'app';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function getAuthRedirectUrl(path = '/change-password') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (isNativeApp()) {
    return `${MOBILE_APP_SCHEME}://${MOBILE_APP_HOST}${normalizedPath}`;
  }
  return `${window.location.origin}${normalizedPath}`;
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
