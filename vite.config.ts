import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cordisPluginsVite, linkConfiguredPackages } from './packages/host-plugin-loader/src/host/index.ts'

const root = dirname(fileURLToPath(import.meta.url))
linkConfiguredPackages(root)

export default defineConfig({
  plugins: [react(), tailwindcss(), cordisPluginsVite(root)],
  appType: 'spa',
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      // 商店插件写在仓库根 .plugin，不能触发 Vite 整页刷新
      ignored: ['**/.plugin/**', '**/.plugin-dev/**'],
    },
    proxy: {
      '/api': 'http://127.0.0.1:3141',
      '/collaboration': { target: 'ws://127.0.0.1:3141', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['host/**', 'node'],
      ['packages/host-*/**', 'node'],
      ['packages/cap-*/src/host/**', 'node'],
      ['packages/core-*/src/host/**', 'node'],
      ['packages/type-*/**', 'node'],
      ['packages/public-*/**/*.test.ts', 'node'],
      ['scripts/**', 'node'],
    ],
  },
})
