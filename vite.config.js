import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const page = (p) => resolve(__dirname, 'client', p);

export default defineConfig({
  root: 'client',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: page('index.html'),
        hub: page('games/index.html'),
        profile: page('profile/index.html'),
        golf: page('play/golf/index.html'),
        merge: page('play/merge/index.html'),
        potato: page('play/potato/index.html'),
        rush: page('play/rush/index.html'),
        daily: page('play/daily/index.html'),
      },
    },
  },
  server: { port: 5173, fs: { allow: ['..'] } },
});
