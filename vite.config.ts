import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const src = resolve(__dirname, 'src');

export default defineConfig(({ mode }) => {
  if (!existsSync(resolve(__dirname, 'public/ort/ort-wasm-simd-threaded.asyncify.wasm'))) {
    console.warn('\n[thread.io] public/ort is missing; run `npm run models` for the offline embedding fallback.\n');
  }
  return {
    root: src,
    publicDir: resolve(__dirname, 'public'),
    base: './',
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
      target: 'chrome116',
      sourcemap: mode === 'development' ? 'inline' : false,
      minify: mode !== 'development',
      chunkSizeWarningLimit: 4000,
      // The extension ships its own files; inlining keeps the CSP happy.
      assetsInlineLimit: 0,
      modulePreload: { polyfill: false },
      rolldownOptions: {
        input: {
          sidepanel: resolve(src, 'sidepanel.html'),
          map: resolve(src, 'map.html'),
          offscreen: resolve(src, 'offscreen.html'),
          background: resolve(src, 'background/index.ts'),
        },
        output: {
          entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    test: {
      root: __dirname,
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
      setupFiles: ['tests/unit/setup.ts'],
    },
  };
});
