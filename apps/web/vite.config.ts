import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Same-origin /api in every environment: Vite proxies it in development, nginx in the container.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:4000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
