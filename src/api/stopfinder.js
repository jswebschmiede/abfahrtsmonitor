/**
 * @typedef {Object} NearbyStop
 * @property {string} id Stable stop identifier from EFA.
 * @property {string} name Display name.
 * @property {number} [distanceM] Walking distance in meters when provided.
 * @property {number} [durationMin] Walking duration in minutes when provided.
 * @property {number} lat Latitude (WGS84).
 * @property {number} lon Longitude (WGS84).
 */

/**
 * @typedef {Object} NearbyStopsResult
 * @property {string} resolvedLabel
 * @property {NearbyStop[]} stops
 * @property {boolean} outOfVerbund
 */

const EFA_VERSION = '10.4.18.18'

/**
 * Detects BROKER -8011 (address outside the regional association / no binding resolution).
 * @param {Record<string, unknown>} data Raw JSON body from `outputFormat=rapidJSON`.
 * @returns {boolean}
 */
function brokerIndicatesOutOfVerbund(data) {
  const msgs = Array.isArray(data.systemMessages) ? data.systemMessages : []
  for (const raw of msgs) {
    if (!raw || typeof raw !== 'object') continue
    const o = /** @type {Record<string, unknown>} */ (raw)
    const msgType = typeof o.type === 'string' ? o.type : ''
    const code =
      typeof o.code === 'number'
        ? o.code
        : typeof o.code === 'string'
          ? Number(o.code)
          : NaN
    const mod = typeof o.module === 'string' ? o.module : ''
    if (msgType !== 'error' || code !== -8011) continue
    if (mod && mod !== 'BROKER') continue
    return true
  }
  return false
}

/**
 * Builds the StopFinder GET path and query for the regional EFA instance (served via same-origin Vite proxy).
 * @param {string} address Free-text address or location query for `name_sf`.
 * @returns {string} Relative URL beginning with `/efa/XML_STOPFINDER_REQUEST`.
 */
export function buildStopFinderUrl(address) {
  const params = new URLSearchParams({
    coordOutputFormat: 'WGS84[dd.ddddd]',
    language: 'de',
    locationInfoActive: '1',
    locationServerActive: '1',
    name_sf: address.trim(),
    nwlStopFinderMacro: '1',
    outputFormat: 'rapidJSON',
    serverInfo: '1',
    sl3plusStopFinderMacro: '1',
    type_sf: 'any',
    version: EFA_VERSION,
  })
  return `/efa/XML_STOPFINDER_REQUEST?${params.toString()}`
}

/**
 * Builds `name_sf` for StopFinder coordinate mode (`lon` before `lat`, bracket syntax per EFA).
 * @param {number} lat Latitude WGS84.
 * @param {number} lon Longitude WGS84.
 * @returns {string}
 */
export function formatCoordNameSf(lat, lon) {
  const latStr = Number(lat).toFixed(5)
  const lonStr = Number(lon).toFixed(5)
  return `${lonStr}:${latStr}:WGS84[dd.ddddd]`
}

/**
 * Builds StopFinder GET URL using `type_sf=coord` and encoded coordinate in `name_sf`.
 * @param {number} lat Latitude WGS84 (degrees).
 * @param {number} lon Longitude WGS84 (degrees).
 * @returns {string} Relative URL beginning with `/efa/XML_STOPFINDER_REQUEST`.
 */
export function buildStopFinderCoordUrl(lat, lon) {
  const params = new URLSearchParams({
    coordOutputFormat: 'WGS84[dd.ddddd]',
    language: 'de',
    locationInfoActive: '1',
    locationServerActive: '1',
    name_sf: formatCoordNameSf(lat, lon),
    nwlStopFinderMacro: '1',
    outputFormat: 'rapidJSON',
    serverInfo: '1',
    sl3plusStopFinderMacro: '1',
    type_sf: 'coord',
    version: EFA_VERSION,
  })
  return `/efa/XML_STOPFINDER_REQUEST?${params.toString()}`
}

/**
 * Fetches nearby transit stops for a geographic point (`type_sf=coord`).
 * @param {number} lat Latitude WGS84.
 * @param {number} lon Longitude WGS84.
 * @returns {Promise<NearbyStopsResult>}
 */
export async function fetchNearbyStopsByCoord(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { resolvedLabel: '', stops: [], outOfVerbund: false }
  }

  const res = await fetch(buildStopFinderCoordUrl(lat, lon))
  if (!res.ok) {
    throw new Error(`StopFinder request failed (${res.status})`)
  }

  /** @type {Record<string, unknown>} */
  const data = await res.json()
  return parseStopFinderResponse(data)
}

/**
 * Fetches nearby transit stops for a resolved address using the proxied StopFinder endpoint.
 * @param {string} address User-entered address or place string.
 * @returns {Promise<NearbyStopsResult>}
 */
export async function fetchNearbyStops(address) {
  const query = address.trim()
  if (!query) {
    return { resolvedLabel: '', stops: [], outOfVerbund: false }
  }

  const res = await fetch(buildStopFinderUrl(query))
  if (!res.ok) {
    throw new Error(`StopFinder request failed (${res.status})`)
  }

  /** @type {Record<string, unknown>} */
  const data = await res.json()
  return parseStopFinderResponse(data)
}

/**
 * Normalizes rapidJSON StopFinder payload into nearby stops and a resolved location label.
 * @param {Record<string, unknown>} data Raw JSON body from `outputFormat=rapidJSON`.
 * @returns {NearbyStopsResult}
 */
export function parseStopFinderResponse(data) {
  const outOfVerbund = brokerIndicatesOutOfVerbund(data)
  const locations = Array.isArray(data.locations) ? data.locations : []

  const bestWithStops =
    locations.find(
      (loc) =>
        loc &&
        typeof loc === 'object' &&
        Array.isArray(loc.assignedStops) &&
        loc.assignedStops.length > 0 &&
        loc.isBest === true,
    ) ??
    locations.find(
      (loc) =>
        loc &&
        typeof loc === 'object' &&
        Array.isArray(loc.assignedStops) &&
        loc.assignedStops.length > 0,
    )

  if (bestWithStops && typeof bestWithStops === 'object') {
    const label =
      typeof bestWithStops.name === 'string'
        ? bestWithStops.name
        : typeof bestWithStops.disassembledName === 'string'
          ? bestWithStops.disassembledName
          : ''
    return {
      resolvedLabel: label,
      stops: normalizeStopList(/** @type {unknown[]} */ (bestWithStops.assignedStops)),
      outOfVerbund,
    }
  }

  const directStops = locations.filter(
    (loc) => loc && typeof loc === 'object' && loc.type === 'stop',
  )
  let resolvedLabel = ''
  if (directStops.length > 0) {
    const first = /** @type {Record<string, unknown>} */ (directStops[0])
    const parent = first.parent
    if (parent && typeof parent === 'object' && parent !== null) {
      const pname = /** @type {Record<string, unknown>} */ (parent).name
      if (typeof pname === 'string') resolvedLabel = pname
    }
  }

  return {
    resolvedLabel,
    stops: normalizeStopList(directStops),
    outOfVerbund,
  }
}

/**
 * Maps mixed location/stop entries to {@link NearbyStop} objects.
 * @param {unknown[]} items Assigned stop list or location objects of type `stop`.
 * @returns {NearbyStop[]}
 */
function normalizeStopList(items) {
  const out = []
  const seen = new Set()
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const o = /** @type {Record<string, unknown>} */ (item)
    const id = o.id !== undefined ? String(o.id) : ''
    const key = id || `${o.name}-${String(o.coord)}`
    if (seen.has(key)) continue
    seen.add(key)

    const name =
      typeof o.name === 'string'
        ? o.name
        : typeof o.disassembledName === 'string'
          ? o.disassembledName
          : ''

    const coord = Array.isArray(o.coord) ? o.coord : []
    const lat = toNumber(coord[0])
    const lon = toNumber(coord[1])

    out.push({
      id,
      name,
      distanceM: typeof o.distance === 'number' ? o.distance : undefined,
      durationMin: typeof o.duration === 'number' ? o.duration : undefined,
      lat,
      lon,
    })
  }
  return out
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : NaN
  }
  return NaN
}
