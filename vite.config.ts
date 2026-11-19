import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        sidepanel: 'index.html',
        navigator: resolve(__dirname, 'navigator.html'),
        background: resolve(__dirname, 'src/background.ts'),
        // DEV-only page the in-panel test runner parks on in unattended mode
        // (src/tests/inpanel/parked.ts) - kept out of release builds.
        ...(mode === 'development' ? { parked: resolve(__dirname, 'test-parked.html') } : {}),
        // DEV-only tone page the audio cases play in unattended mode
        // (src/tests/inpanel/testAudioPage.ts) - kept out of release builds.
        ...(mode === 'development' ? { testAudio: resolve(__dirname, 'test-audio.html') } : {}),
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
}))
