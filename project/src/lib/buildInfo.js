import pkg from '../../package.json';

export const BUILD_INFO = {
  version: pkg.version || '1.0.0',
  releaseTag: 'ops-2026-04-15',
  commitHint: 'latest main deploy',
};
