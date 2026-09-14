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
  optimizeDeps: {
    // 插件 web 是动态 import。不预扫齐会中途重优化，浏览器拿到 504 Outdated Optimize Dep。
    include: [
      'yjs',
      '@hocuspocus/provider',
      '@tiptap/core',
      '@tiptap/extension-code-block-lowlight',
      '@tiptap/extension-collaboration',
      '@tiptap/extension-collaboration-caret',
      '@tiptap/extension-highlight',
      '@tiptap/extension-image',
      '@tiptap/extension-mathematics',
      '@tiptap/extension-mention',
      '@tiptap/extension-paragraph',
      '@tiptap/extension-placeholder',
      '@tiptap/extension-table',
      '@tiptap/extension-text-style',
      '@tiptap/markdown',
      '@tiptap/pm/state',
      '@tiptap/pm/view',
      '@tiptap/react',
      '@tiptap/react/menus',
      '@tiptap/starter-kit',
      '@tiptap/suggestion',
      '@codemirror/commands',
      '@codemirror/lang-markdown',
      '@codemirror/language',
      '@codemirror/language-data',
      '@codemirror/state',
      '@codemirror/view',
      '@lezer/highlight',
      '@xyflow/react',
      '@dnd-kit/core',
      '@dnd-kit/modifiers',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      '@heroicons/react/16/solid',
      '@radix-ui/react-dismissable-layer',
      '@radix-ui/react-popover',
      '@excalidraw/excalidraw',
      '@tanstack/react-virtual',
      'antd',
      'antd/locale/zh_CN',
      'cordis',
      'dayjs',
      'dayjs/locale/zh-cn',
      'dompurify',
      'echarts',
      'echarts-for-react',
      'highlight.js',
      'katex',
      'lowlight',
      'marked',
      'marked-highlight',
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'yaml',
      'zustand',
      'zustand/middleware',
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    warmup: {
      clientFiles: ['web/main.tsx', 'packages/*/src/web/index.ts', 'packages/*/src/web/index.tsx'],
    },
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
