// Production build: bundle server + worker into dist/, inlining @pk/* workspace packages
// (they ship TypeScript source) and keeping npm dependencies external (installed in the image).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts', 'src/worker.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'externalize-npm-deps',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith('@pk/') ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});
