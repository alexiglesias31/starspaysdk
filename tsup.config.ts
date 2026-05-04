import { defineConfig } from 'tsup';

export default defineConfig([
  // Main entry - shared types only
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  // Server entry - Node.js only
  {
    entry: { server: 'src/server.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    platform: 'node',
    target: 'node18',
  },
  // Client entry - browser only
  {
    entry: { client: 'src/client.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    platform: 'browser',
  },
  // React entry - browser + React
  {
    entry: { react: 'src/react.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    platform: 'browser',
    external: ['react', 'react-dom'],
  },
]);
