/**
 * Build Configuration Tests
 *
 * Guards against the production build emitting the entry point somewhere other than
 * where `npm start` / `main` (and the Dockerfile CMD) expect it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '../..');

interface PackageJson {
  main: string;
  scripts: Record<string, string>;
}

function loadPackageJson(): PackageJson {
  return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as PackageJson;
}

function loadTsConfig(file: string): ts.ParsedCommandLine {
  const configPath = path.join(ROOT, file);
  const result = ts.readConfigFile(configPath, (p) => ts.sys.readFile(p));
  if (result.error) {
    throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, '\n'));
  }
  const config: unknown = result.config;
  return ts.parseJsonConfigFileContent(config, ts.sys, ROOT, undefined, configPath);
}

/** Where tsc will emit src/index.ts for the given parsed config. */
function emittedEntry(parsed: ts.ParsedCommandLine): string {
  const { rootDir, outDir } = parsed.options;
  if (!rootDir || !outDir) {
    throw new Error('Build tsconfig must set rootDir and outDir explicitly');
  }
  const rel = path.relative(rootDir, path.join(ROOT, 'src/index.ts')).replace(/\.ts$/, '.js');
  return path.relative(ROOT, path.join(outDir, rel)).split(path.sep).join('/');
}

describe('Build configuration', () => {
  const pkg = loadPackageJson();

  it('should build with the dedicated build tsconfig', () => {
    expect(pkg.scripts.build).toBe('tsc -p tsconfig.build.json');
  });

  it('should emit src/index.ts to the path used by main and npm start', () => {
    const entry = emittedEntry(loadTsConfig('tsconfig.build.json'));
    expect(entry).toBe('dist/index.js');
    expect(pkg.main).toBe(entry);
    expect(pkg.scripts.start).toBe(`node ${entry}`);
  });

  it('should compile only src/ (no tests or scripts in dist)', () => {
    const files = loadTsConfig('tsconfig.build.json').fileNames.map((f) =>
      path.relative(ROOT, f).split(path.sep).join('/')
    );
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.startsWith('src/'))).toBe(true);
  });

  it('should keep typechecking src, tests and scripts in the base tsconfig', () => {
    const files = loadTsConfig('tsconfig.json').fileNames.map((f) =>
      path.relative(ROOT, f).split(path.sep).join('/')
    );
    expect(files.some((f) => f.startsWith('src/'))).toBe(true);
    expect(files.some((f) => f.startsWith('tests/'))).toBe(true);
    expect(files.some((f) => f.startsWith('scripts/'))).toBe(true);
  });
});
