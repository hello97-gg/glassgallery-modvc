import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'https://gg.modvc.org',
            changeOrigin: true,
          }
        }
      },
      plugins: [
        react(),
        {
          name: 'spa-fallback-app',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              const url = req.url ? req.url.split('?')[0] : '';
              if (url.toLowerCase() === '/app' || url.toLowerCase() === '/app/') {
                const search = req.url && req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
                req.url = '/index.html' + search;
              }
              next();
            });
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
