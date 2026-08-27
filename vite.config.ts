import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: true,
    watch: {
      ignored: ['**/.tmp/**'],
    },
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  preview: {
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
