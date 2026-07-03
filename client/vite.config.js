import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // The lazy native-device view intentionally includes the full 83-device catalog.
    chunkSizeWarningLimit: 800,
  },
})
