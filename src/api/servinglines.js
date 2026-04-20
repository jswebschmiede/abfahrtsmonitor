/**
 * @typedef {Object} ServingLineBadge
 * @property {string} label Short label for display (e.g. line number).
 * @property {string} [title] Optional tooltip (e.g. full line name).
 */

const EFA_VERSION = '10.4.18.18'

/** MVG “Aktuell” info URL; matched against `properties.OperatorURL` client-side after fetch. */
const MVG_OPERATOR_URL = 'https://mvg-aktuell.de'

/**
 * MOT-style `product.class` values kept for badges: bus-only (EFA trip table: 5 city bus, 6 regional bus, 7 coach / e.g. Schnellbus).
 */
const BUS_ONLY_PRODUCT_CLASSES = new Set([5, 6, 7])

/**
 * Builds ServingLines GET URL for lines at a stop (`mode=odv`, `type_sl=stopID`).
 * Does not request explicit train services (`lsShowTrainsExplicit` omitted).
 * MVG filtering is applied in {@link parseServingLinesForBadges} (not via HTTP params).
 * @param {string} stopId Global or internal stop ID from StopFinder.
 * @returns {string} Relative URL beginning with `/efa/XML_SERVINGLINES_REQUEST`.
 */
export function buildServingLinesUrl(stopId) {
  const id = typeof stopId === 'string' ? stopId.trim() : ''
  const params = new URLSearchParams({
    coordOutputFormat: 'WGS84[dd.ddddd]',
    language: 'de',
    locationServerActive: '1',
    mode: 'odv',
    name_sl: id,
    nwlStopFinderMacro: '1',
    outputFormat: 'rapidJSON',
    serverInfo: '1',
    sl3plusStopFinderMacro: '1',
    type_sl: 'stopID',
    version: EFA_VERSION,
  })
  return `/efa/XML_SERVINGLINES_REQUEST?${params.toString()}`
}

/**
 * Reads operator info URL from a ServingLines row (`properties.OperatorURL` or `properties.operatorURL`).
 * @param {Record<string, unknown>} line Raw line from ServingLines response.
 * @returns {string | undefined} URL string if present.
 */
function getLineOperatorUrl(line) {
  const props = line.properties && typeof line.properties === 'object' ? /** @type {Record<string, unknown>} */ (line.properties) : undefined
  if (!props) return undefined
  const upper = props.OperatorURL
  const lower = props.operatorURL
  const raw = typeof upper === 'string' ? upper : typeof lower === 'string' ? lower : ''
  const t = raw.trim()
  return t || undefined
}

/**
 * Normalizes an operator URL for equality checks (trim, strip trailing slash).
 * @param {string} url Raw URL.
 * @returns {string}
 */
function normalizeOperatorUrlForCompare(url) {
  return url.trim().replace(/\/+$/, '')
}

/**
 * Returns true if the line is tagged with the MVG mvg-aktuell.de operator URL.
 * @param {Record<string, unknown>} line Raw line from ServingLines response.
 * @returns {boolean}
 */
function isMvgAktuellLine(line) {
  const u = getLineOperatorUrl(line)
  if (!u) return false
  return normalizeOperatorUrlForCompare(u) === normalizeOperatorUrlForCompare(MVG_OPERATOR_URL)
}

/**
 * Returns true if the line is a bus line (by EFA product class).
 * @param {Record<string, unknown> | null | undefined} product Line `product` object from rapidJSON.
 * @returns {boolean}
 */
function isBusLineProduct(product) {
  if (!product || typeof product !== 'object') return false
  const cls = /** @type {Record<string, unknown>} */ (product).class
  const n = typeof cls === 'number' ? cls : typeof cls === 'string' ? Number(cls) : NaN
  if (!Number.isFinite(n)) return false
  return BUS_ONLY_PRODUCT_CLASSES.has(n)
}

/**
 * Picks a short display label for a line entry.
 * @param {Record<string, unknown>} line Raw line from ServingLines response.
 * @returns {string}
 */
function lineLabel(line) {
  const dis = typeof line.disassembledName === 'string' ? line.disassembledName.trim() : ''
  if (dis) return dis
  const num = typeof line.number === 'string' ? line.number.trim() : ''
  if (num) return num
  const name = typeof line.name === 'string' ? line.name.trim() : ''
  return name || ''
}

/**
 * Dedupes lines by display label (direction variants often share the same number).
 * @param {ServingLineBadge[]} items Parsed badges.
 * @returns {ServingLineBadge[]}
 */
function dedupeByLabel(items) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const key = item.label.toLowerCase()
    if (!item.label || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/**
 * Normalizes rapidJSON ServingLines payload to badge data: bus lines with `properties.OperatorURL` matching MVG mvg-aktuell.de.
 * @param {Record<string, unknown>} data Raw JSON body from `outputFormat=rapidJSON`.
 * @returns {ServingLineBadge[]}
 */
export function parseServingLinesForBadges(data) {
  const raw = Array.isArray(data.lines) ? data.lines : []
  /** @type {ServingLineBadge[]} */
  const badges = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const line = /** @type {Record<string, unknown>} */ (entry)
    const product = line.product && typeof line.product === 'object' ? /** @type {Record<string, unknown>} */ (line.product) : undefined
    if (!isBusLineProduct(product)) continue
    if (!isMvgAktuellLine(line)) continue
    const label = lineLabel(line)
    if (!label) continue
    const fullName = typeof line.name === 'string' ? line.name.trim() : ''
    const desc = typeof line.description === 'string' ? line.description.trim() : ''
    const title = [fullName, desc].filter(Boolean).join(' — ') || undefined
    badges.push({ label, title })
  }
  const deduped = dedupeByLabel(badges)
  deduped.sort((a, b) => a.label.localeCompare(b.label, 'de'))
  return deduped
}

/**
 * Fetches serving lines for a stop and returns MVG (mvg-aktuell.de) bus badges only.
 * @param {string} stopId Stop ID from StopFinder.
 * @returns {Promise<ServingLineBadge[]>}
 */
export async function fetchServingLinesForBadges(stopId) {
  const id = typeof stopId === 'string' ? stopId.trim() : ''
  if (!id) return []

  const res = await fetch(buildServingLinesUrl(id))
  if (!res.ok) {
    throw new Error(`ServingLines request failed (${res.status})`)
  }

  /** @type {Record<string, unknown>} */
  const data = await res.json()
  return parseServingLinesForBadges(data)
}
