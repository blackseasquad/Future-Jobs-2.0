// Vite: React frontend в web/, готовият build отива в dist/ (сервира се от Vercel или от src/server.js).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
