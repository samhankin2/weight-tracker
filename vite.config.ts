import { defineConfig } from 'vite'

// Deploy target: GitHub Pages (project site => https://<user>.github.io/<repo>/)
// Two entry points share one build and one origin, so their localStorage keys
// are readable by each other (needed by the later insight module).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: 'index.html',
        training: 'training.html',
      },
    },
  },
})
