import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

/** Proxy stops browser CORS when calling the regional EFA instance from localhost. Static deploys need their own backend or edge proxy. */
const efaProxy = {
  '/efa': {
    target: 'https://www.westfalenfahrplan.de',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/efa/, '/nwl-efa'),
    secure: true,
  },
}

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  server: {
    proxy: efaProxy,
  },
  preview: {
    proxy: efaProxy,
  },
})
