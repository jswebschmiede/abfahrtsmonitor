/**
 * Vercel serverless handler: forwards Geocoding API requests with a server-side API key.
 * Expects GET with query `latlng`. Reads `GOOGLE_MAPS_API_KEY` from the environment.
 * @param {import('http').IncomingMessage & { query?: Record<string, string | string[] | undefined> }} req
 * @param {import('http').ServerResponse} res
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  const sendJson = (statusCode, body) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET' })
    res.end()
    return
  }

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) {
    sendJson(500, {
      status: 'ERROR',
      error_message: 'Server configuration: missing GOOGLE_MAPS_API_KEY',
    })
    return
  }

  const raw = req.query?.latlng
  let latlng = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
  if (!latlng && typeof req.url === 'string') {
    try {
      latlng = new URL(req.url, 'http://localhost').searchParams.get('latlng') || ''
    } catch {
      latlng = ''
    }
  }
  if (!latlng || typeof latlng !== 'string') {
    sendJson(400, {
      status: 'INVALID_REQUEST',
      error_message: 'Missing latlng',
    })
    return
  }

  const googleUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  googleUrl.searchParams.set('latlng', latlng)
  googleUrl.searchParams.set('key', key)
  googleUrl.searchParams.set('language', 'de')

  try {
    const r = await fetch(googleUrl.toString())
    const data = await r.json()
    sendJson(200, data)
  } catch {
    sendJson(502, {
      status: 'ERROR',
      error_message: 'Upstream geocoding request failed',
    })
  }
}
