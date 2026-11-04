import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  publicDir: '../public',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900, target: 'es2022' },
  server: { port: 5173, fs: { allow: ['..'] } },
});
