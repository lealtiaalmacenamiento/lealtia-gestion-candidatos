import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src')
    }
  },
  css: {
    postcss: {
      plugins: []
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
})
