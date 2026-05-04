import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Verifies all SDK package entry points exist after build.
 * Catches misconfigured exports in package.json before npm publish.
 */
describe('SDK Package Exports', () => {
  const distDir = resolve(__dirname, '../dist');

  const entryPoints = [
    { name: 'main (.)', esm: 'index.js', cjs: 'index.cjs', types: 'index.d.ts' },
    { name: 'server', esm: 'server.js', cjs: 'server.cjs', types: 'server.d.ts' },
    { name: 'client', esm: 'client.js', cjs: 'client.cjs', types: 'client.d.ts' },
    { name: 'react', esm: 'react.js', cjs: 'react.cjs', types: 'react.d.ts' },
  ];

  for (const entry of entryPoints) {
    describe(`Entry point: ${entry.name}`, () => {
      it('has ESM build output', () => {
        expect(existsSync(resolve(distDir, entry.esm))).toBe(true);
      });

      it('has CJS build output', () => {
        expect(existsSync(resolve(distDir, entry.cjs))).toBe(true);
      });

      it('has TypeScript declarations', () => {
        expect(existsSync(resolve(distDir, entry.types))).toBe(true);
      });
    });
  }

  it('package.json exports field references existing files', async () => {
    const pkg = await import('../package.json', { assert: { type: 'json' } });
    const exports = pkg.default.exports || pkg.exports;

    for (const [path, conditions] of Object.entries(exports)) {
      const cond = conditions as Record<string, string>;
      for (const [key, filePath] of Object.entries(cond)) {
        const fullPath = resolve(__dirname, '..', filePath);
        expect(existsSync(fullPath), `${path} → ${key}: ${filePath} should exist`).toBe(true);
      }
    }
  });

  it('ESM entry points are importable', async () => {
    // Dynamic import of the built ESM files
    const main = await import('../dist/index.js');
    expect(main).toBeDefined();

    const server = await import('../dist/server.js');
    expect(server).toBeDefined();

    const client = await import('../dist/client.js');
    expect(client).toBeDefined();

    // React entry requires React as peer dep - just check file exists
    expect(existsSync(resolve(distDir, 'react.js'))).toBe(true);
  });
});
