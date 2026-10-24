/**
 * Application Version Tests
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { APP_VERSION, readPackageVersion } from '../../src/utils/version.js';

describe('readPackageVersion', () => {
  const withPackageJson = (contents: string, run: (url: URL) => void) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'conduit-version-'));
    try {
      const file = path.join(dir, 'package.json');
      writeFileSync(file, contents);
      run(pathToFileURL(file));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('should read the version field', () => {
    withPackageJson(JSON.stringify({ version: '4.5.6' }), (url) => {
      expect(readPackageVersion(url)).toBe('4.5.6');
    });
  });

  it("should return 'unknown' when the version is missing", () => {
    withPackageJson(JSON.stringify({ name: 'x' }), (url) => {
      expect(readPackageVersion(url)).toBe('unknown');
    });
  });

  it("should return 'unknown' for invalid JSON", () => {
    withPackageJson('{ not json', (url) => {
      expect(readPackageVersion(url)).toBe('unknown');
    });
  });

  it("should return 'unknown' when the file does not exist", () => {
    expect(readPackageVersion(pathToFileURL('/nonexistent/conduit/package.json'))).toBe('unknown');
  });

  it('should resolve the real package version for the app', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
