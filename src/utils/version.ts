/**
 * Application Version
 *
 * Reads the version from package.json once at startup. npm_package_version is only
 * set when the process is started through npm, and the Docker image runs
 * `node dist/index.js` directly, so it cannot be relied on.
 */

import { readFileSync } from 'fs';

/**
 * Read the `version` field from a package.json file
 *
 * @param packageJsonUrl - Location of package.json
 * @returns The version, or 'unknown' if the file is missing or has no version
 */
export function readPackageVersion(packageJsonUrl: URL): string {
  try {
    const pkg = JSON.parse(readFileSync(packageJsonUrl, 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * The running application's version.
 *
 * Resolved relative to this module: src/utils/ in development and tests, dist/utils/
 * in the build (the Dockerfile copies package.json to the app root next to dist/).
 */
export const APP_VERSION = readPackageVersion(new URL('../../package.json', import.meta.url));
