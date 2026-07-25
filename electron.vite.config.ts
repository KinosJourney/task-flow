import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const shared = resolve(__dirname, 'src/shared');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': shared },
    },
    build: {
      // 原生模块不能被打包，交给运行时 require（architecture.md 5.1）
      rollupOptions: { external: ['better-sqlite3'] },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': shared },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@shared': shared,
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
});
