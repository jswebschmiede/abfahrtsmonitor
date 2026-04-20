import { defineConfig, loadEnv } from 'vite'
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const googleKey = env.VITE_GOOGLE_MAPS_API_KEY || env.GOOGLE_MAPS_API_KEY || ''

  /** Forwards to Geocoding API (HTTP); avoids Maps JavaScript API and browser CORS. Key stays on the dev server. */
  const googleGeocodeProxy = {
    '/google-geocode': {
      target: 'https://maps.googleapis.com',
      changeOrigin: true,
      secure: true,
      rewrite: (path) => {
        const qIndex = path.indexOf('?')
        const qs = qIndex >= 0 ? path.slice(qIndex) : ''
        if (!qs) return '/maps/api/geocode/json'
        return `/maps/api/geocode/json${qs}&key=${encodeURIComponent(googleKey)}&language=de`
      },
    },
  }

  const proxy = { ...efaProxy, ...googleGeocodeProxy }

  return {
    plugins: [tailwindcss()],
    server: {
      proxy,
    },
    preview: {
      proxy,
    },
  }
})
