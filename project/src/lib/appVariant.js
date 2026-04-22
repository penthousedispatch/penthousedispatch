const rawVariant = String(import.meta.env.VITE_APP_VARIANT || 'ops').trim().toLowerCase();

export const APP_VARIANT = ['ops', 'driver', 'rider'].includes(rawVariant) ? rawVariant : 'ops';

export const APP_VARIANT_META = {
  ops: {
    label: 'Penthouse Dispatch',
    shortLabel: 'Ops',
    subtitle: 'Admin and company operations',
    authTitle: 'PENTHOUSE DISPATCH',
    authSubtitle: 'Premium NEMT Operations Platform',
    authHelp: 'Sign in as an admin or company user.',
  },
  driver: {
    label: 'Penthouse Driver',
    shortLabel: 'Driver',
    subtitle: 'Driver trips, navigation, and earnings',
    authTitle: 'PENTHOUSE DRIVER',
    authSubtitle: 'Driver trip, schedule, and payout app',
    authHelp: 'Drivers sign in with company-provided credentials.',
  },
  rider: {
    label: 'Penthouse Rider',
    shortLabel: 'Rider',
    subtitle: 'Rider trip tracking and ride support',
    authTitle: 'PENTHOUSE RIDER',
    authSubtitle: 'Ride updates, live tracking, and support',
    authHelp: 'Riders can create an account or sign in to manage ride links.',
  },
};

export function isOpsVariant() {
  return APP_VARIANT === 'ops';
}

export function isDriverVariant() {
  return APP_VARIANT === 'driver';
}

export function isRiderVariant() {
  return APP_VARIANT === 'rider';
}

export function allowsSelfSignup() {
  return APP_VARIANT !== 'driver';
}

export function getSignupRolesForVariant() {
  if (APP_VARIANT === 'rider') return ['rider'];
  if (APP_VARIANT === 'driver') return [];
  return ['company'];
}

export function isRoleAllowedInVariant(role) {
  if (!role) return false;
  if (APP_VARIANT === 'driver') return role === 'driver';
  if (APP_VARIANT === 'rider') return role === 'rider';
  return role === 'admin' || role === 'company';
}

export function getVariantDefaultPath(role) {
  if (APP_VARIANT === 'driver') return '/driver';
  if (APP_VARIANT === 'rider') return role === 'rider' ? '/rider/home' : '/auth';
  if (role === 'admin') return '/admin/platform';
  if (role === 'rider') return '/rider/home';
  return '/';
}
