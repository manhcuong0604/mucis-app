import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { autoStartPythonBackend, stopPythonBackend, handleNodeApiRequest, handleStreamProxy } from './vite-dev-backend';
import { handleAppRoutes } from './server/routes';

const mucisLocalBackendPlugin = (): Plugin => ({
  name: 'mucis-local-backend',
  configureServer(server) {
    // 1. Intercept internal DB & Auth API endpoints before proxy
    server.middlewares.use(async (req, res, next) => {
      try {
        const host = req.headers.host || '127.0.0.1:3000';
        const parsed = new URL(req.url || '', `http://${host}`);
        if (
          parsed.pathname.startsWith('/api/auth') ||
          parsed.pathname.startsWith('/api/admin') ||
          parsed.pathname.startsWith('/api/player') ||
          parsed.pathname.startsWith('/api/favorites')
        ) {
          const handled = await handleAppRoutes(req, res);
          if (handled) return;
        }

        // Direct Stream Proxy handling with HTTP 206 Range and Graceful Abort
        if (parsed.pathname === '/api/stream_proxy') {
          await handleStreamProxy(req, res);
          return;
        }
      } catch (err) {
        console.error('[Vite Middleware Error]', err);
      }
      next();
    });

    // 2. Tự động bật Python scraper backend
    try {
      autoStartPythonBackend();
    } catch (e) {
      console.warn('[Python Backend Auto-start Warning]', e);
    }

    server.httpServer?.on('close', () => {
      stopPythonBackend();
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), mucisLocalBackendPlugin()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    allowedHosts: true,
    cors: true,
    watch: {
      // Bỏ qua các file database và file tạm để Vite không tự restart
      ignored: [
        '**/dist/**',
        '**/dist-server/**',
        '**/dist-electron/**',
        '**/data/**',
        '**/*.db*',
        '**/music_player.db*',
        '**/*.db-journal*',
        '**/*.db-wal*',
        '**/*.db-shm*',
        '**/.system_generated/**',
        '**/logs/**',
        '**/.git/**'
      ]
    },
    hmr: {
      // Ngăn HMR client tự reload liên tục khi qua proxy ngoài
      clientPort: 3000,
      overlay: false
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization, bypass-tunnel-reminder, Bypass-Tunnel-Reminder',
      'bypass-tunnel-reminder': 'true'
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:47823',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', async (err, req, res) => {
            if (res && 'writeHead' in res && !res.headersSent) {
              await handleNodeApiRequest(req, res as any);
            }
          });
        }
      }
    }
  }
});