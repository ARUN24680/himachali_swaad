// Production build: bundle the server into dist/ (npm dependencies stay external, installed in the image).
// The pay page (web/) is built separately by `vite build` into dist/web.
import { build } from 'esbuild';

await build({
  entryPoints: { server: 'src/server.ts', admin: 'scripts/admin.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  packages: 'external',
});
