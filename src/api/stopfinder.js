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
 * Ready-to-render row for `systemMessages` from StopFinder rapidJSON (BROKER notices).
 * @typedef {Object} EfaSystemMessageRow
 * @property {'error' | 'info' | 'neutral'} severity Maps `type:error` vs informational broker codes.
 * @property {string} label Short German summary for UI.
 */

const EFA_VERSION = '10.4.18.18'

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
 * Fetches nearby transit stops for a resolved address using the proxied StopFinder endpoint.
 * @param {string} address User-entered address or place string.
 * @returns {Promise<{ resolvedLabel: string, stops: NearbyStop[], systemMessages: EfaSystemMessageRow[] }>}
 */
export async function fetchNearbyStops(address) {
  const query = address.trim()
  if (!query) {
    return { resolvedLabel: '', stops: [], systemMessages: [] }
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
 * @returns {{ resolvedLabel: string, stops: NearbyStop[], systemMessages: EfaSystemMessageRow[] }}
 */
export function parseStopFinderResponse(data) {
  const systemMessages = extractSystemRows(data)
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
      systemMessages,
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
    systemMessages,
  }
}

/**
 * Maps `systemMessages` broker entries into UI rows with severity and German label.
 * @param {Record<string, unknown>} data Raw JSON body.
 * @returns {EfaSystemMessageRow[]}
 */
function extractSystemRows(data) {
  const msgs = Array.isArray(data.systemMessages) ? data.systemMessages : []
  /** @type {EfaSystemMessageRow[]} */
  const rows = []
  for (const m of msgs) {
    if (!m || typeof m !== 'object') continue
    const o = /** @type {Record<string, unknown>} */ (m)
    const msgType = typeof o.type === 'string' ? o.type : 'message'
    const code =
      typeof o.code === 'number'
        ? o.code
        : typeof o.code === 'string'
          ? Number(o.code)
          : undefined
    const rawText = typeof o.text === 'string' ? o.text.trim() : ''

    let severity = /** @type {'error' | 'info' | 'neutral'} */ ('neutral')
    if (msgType === 'error') severity = 'error'
    else if (code === -8010 && msgType === 'message') severity = 'info'

    const label = formatBrokerLabel(code, msgType, rawText)
    if (label) rows.push({ severity, label })
  }
  return rows
}

/**
 * Builds one German helper line per broker message (empty API text handled for known codes).
 * @param {number | undefined} code Broker code (e.g. -8010, -8011).
 * @param {string} msgType Original `systemMessages[].type`.
 * @param {string} rawText Trimmed `text` field from JSON.
 * @returns {string}
 */
function formatBrokerLabel(code, msgType, rawText) {
  if (rawText) return rawText
  if (code === -8011 && msgType === 'error') {
    return 'BROKER -8011: Keine verbindliche Zuordnung (leerer Text). Häufig bei Abfragen außerhalb des Verbunds oder bei Mehrdeutigkeit — die angezeigten Namenstreffer können irreführend sein.'
  }
  if (code === -8010) {
    return 'BROKER -8010: Eingabe vom Server als eindeutig erkannt.'
  }
  if (code !== undefined && Number.isFinite(code)) {
    return `BROKER ${code}`
  }
  return ''
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
