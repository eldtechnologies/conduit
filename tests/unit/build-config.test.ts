/**
 * Build Configuration Tests
 *
 * Guards against the production build emitting the entry point somewhere other than
 * where `npm start` / `main` (and the Dockerfile CMD) expect it, and checks that the npm
 * run scripts load an optional .env file.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import ts from 'typescript';

const ENV_FILE_FLAG = '--env-file-if-exists=.env';

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
    expect(pkg.scripts.start).toBe(`node ${ENV_FILE_FLAG} ${entry}`);
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

  it('should load .env when present in npm run dev', () => {
    expect(pkg.scripts.dev).toBe(`tsx watch ${ENV_FILE_FLAG} src/index.ts`);
  });

  it('should keep the Dockerfile CMD independent of a .env file', () => {
    const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('CMD ["node", "dist/index.js"]');
  });

  describe(`node ${ENV_FILE_FLAG}`, () => {
    const runNode = (cwd: string, env: NodeJS.ProcessEnv = {}): string =>
      execFileSync(
        process.execPath,
        [ENV_FILE_FLAG, '-e', 'process.stdout.write(String(process.env.CONDUIT_ENV_FILE_TEST))'],
        { cwd, env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString();

    const withTempDir = (fn: (dir: string) => void) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'conduit-env-'));
      try {
        fn(dir);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };

    it('should load variables from .env', () => {
      withTempDir((dir) => {
        writeFileSync(path.join(dir, '.env'), 'CONDUIT_ENV_FILE_TEST=from-file\n');
        expect(runNode(dir)).toBe('from-file');
      });
    });

    it('should let variables from the environment override .env', () => {
      withTempDir((dir) => {
        writeFileSync(path.join(dir, '.env'), 'CONDUIT_ENV_FILE_TEST=from-file\n');
        expect(runNode(dir, { CONDUIT_ENV_FILE_TEST: 'from-shell' })).toBe('from-shell');
      });
    });

    it('should start without a .env file', () => {
      withTempDir((dir) => {
        expect(runNode(dir)).toBe('undefined');
      });
    });
  });
});
