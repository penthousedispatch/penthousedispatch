import pkg from '../../package.json';

const now = new Date();
const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`;
const fallbackTag = `ops-${stamp}`;

export const BUILD_INFO = {
  version: pkg.version || '1.0.0',
  releaseTag: import.meta.env.VITE_BUILD_TAG || fallbackTag,
  commitHint: import.meta.env.VITE_BUILD_HINT || 'runtime build metadata',
};
