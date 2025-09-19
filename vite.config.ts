import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Produce relative asset paths in built index.html (e.g., assets/..., not /assets/...)
  base: './',
})
