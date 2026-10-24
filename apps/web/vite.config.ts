import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: true,          // 🔥 IMPORTANT
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/static': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('jspdf') || id.includes('xlsx') || id.includes('html2canvas')) {
              return 'vendor-export';
            }
            if (id.includes('recharts') || id.includes('d3')) {
              return 'vendor-charts';
            }
          }
        }
      }
    }
  }
});