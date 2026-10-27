import { defineConfig } from 'vite'

// Deploy target: GitHub Pages (project site => https://<user>.github.io/<repo>/)
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
})
