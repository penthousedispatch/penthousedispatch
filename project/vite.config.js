import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: process.env.VITE_BUILD_OUTDIR || 'dist',
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
