import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: ['.e2b.app', 'terminal.local'],
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      }
    };
});