import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { whatsnewPlugin } from './vite-plugins/whatsnew'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), whatsnewPlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        sidepanel: 'index.html',
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) =>
        {
          // Output background.js at root level for service worker
          if (chunkInfo.name === 'background')
          {
            return 'background.js';
          }
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
})
