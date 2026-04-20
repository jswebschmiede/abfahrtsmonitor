/**
 * Maps thrown errors or API status strings to a short German user message (Geocoding API).
 * @param {unknown} err Error from fetch or parsing.
 * @returns {string}
 */
export function formatMapsClientError(err) {
  const raw = err instanceof Error ? err.message : String(err)
  if (/ApiNotActivated|api-not-activated/i.test(raw)) {
    return 'Die Geocoding API ist für diesen API-Key nicht aktiviert. In der Google Cloud Console unter „APIs und Dienste“ die „Geocoding API“ aktivieren.'
  }
  if (/InvalidKey|invalid.*key|ApiTargetBlocked|REQUEST_DENIED/i.test(raw)) {
    return 'Geocoding abgelehnt: Geocoding API aktivieren, Abrechnung prüfen. Bei serverseitigem Proxy (Vite) ggf. API-Key ohne strikte HTTP-Referrer-Bindung oder mit passender IP-Einschränkung nutzen.'
  }
  if (/OVER_QUERY_LIMIT|over.*quota/i.test(raw)) {
    return 'Geocoding-Kontingent überschritten. Bitte später erneut versuchen oder Abrechnung in der Cloud Console prüfen.'
  }
  if (/404|Geocoding-Proxy/i.test(raw)) {
    return 'Geocoding-Proxy nicht erreichbar. `npm run dev` / `vite preview` nutzen oder einen eigenen Server-Proxy bereitstellen.'
  }
  return raw || 'Adresse konnte nicht ermittelt werden.'
}

/**
 * @typedef {Object} GeocodeAddressComponent
 * @property {string} long_name
 * @property {string[]} types
 */

/**
 * @typedef {Object} GeocodeResultRow
 * @property {GeocodeAddressComponent[] | undefined} address_components
 * @property {string | undefined} formatted_address
 */

/**
 * Builds a single-line German-style address (street, number, postal + city) from a Geocoding API result row.
 * @param {GeocodeResultRow | null | undefined} result Geocoder result row.
 * @returns {string} Formatted line or empty string if nothing usable.
 */
export function formatGermanAddressFromResult(result) {
  if (!result) return ''
  const components = result.address_components
  if (!Array.isArray(components)) {
    return typeof result.formatted_address === 'string' ? result.formatted_address : ''
  }

  /** @type {Record<string, string>} */
  const byType = {}
  for (const c of components) {
    if (!c || !Array.isArray(c.types)) continue
    for (const t of c.types) {
      if (!byType[t]) byType[t] = c.long_name
    }
  }

  const route = byType.route ?? ''
  const streetNumber = byType.street_number ?? ''
  const postal = byType.postal_code ?? ''
  const city =
    byType.locality ??
    byType.postal_town ??
    byType.sublocality ??
    byType.administrative_area_level_2 ??
    ''

  const streetPart = [route, streetNumber].filter(Boolean).join(' ').trim()
  const cityPart = [postal, city].filter(Boolean).join(' ').trim()

  if (streetPart && cityPart) return `${streetPart}, ${cityPart}`
  if (streetPart) return streetPart
  if (cityPart) return cityPart

  return typeof result.formatted_address === 'string' ? result.formatted_address : ''
}

/**
 * Reverse-geocodes WGS84 coordinates via the Geocoding API (HTTP JSON), requested same-origin through the Vite dev/preview proxy.
 * @param {number} lat Latitude in degrees.
 * @param {number} lng Longitude in degrees.
 * @returns {Promise<string>} Single-line address string.
 */
export async function reverseGeocodeLatLng(lat, lng) {
  const latlng = `${lat},${lng}`
  const url = `/google-geocode?latlng=${encodeURIComponent(latlng)}`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Geocoding-Proxy (${res.status}). Läuft der Vite-Dev-Server?`)
  }

  /** @type {{ status: string, results?: GeocodeResultRow[], error_message?: string }} */
  const data = await res.json()

  if (data.status === 'REQUEST_DENIED') {
    const extra = data.error_message ? ` ${data.error_message}` : ''
    throw new Error(`REQUEST_DENIED.${extra}`)
  }

  if (data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
    throw new Error('Keine Adresse für diesen Standort gefunden.')
  }

  if (data.status !== 'OK') {
    throw new Error(data.error_message || data.status || 'Geocoding fehlgeschlagen.')
  }

  const line = formatGermanAddressFromResult(data.results[0])
  if (!line.trim()) {
    throw new Error('Adresse konnte nicht aufgebaut werden.')
  }
  return line.trim()
}
