import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { readFileSync } from 'node:fs'

// https://vite.dev/config/
// Read version from package.json to inject into the client at build/dev time
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version?: string }

export default defineConfig({
  plugins: [react()],
  // Produce relative asset paths in built index.html (e.g., assets/..., not /assets/...)
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? ''),
  },
})
