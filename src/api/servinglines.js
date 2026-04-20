/**
 * @typedef {Object} ServingLineBadge
 * @property {string} label Short label for display (e.g. line number).
 * @property {string} [title] Optional tooltip (e.g. full line name).
 */

const EFA_VERSION = '10.4.18.18'

/** NWL operator filter (trial): same key as AddInfo; may limit ServingLines to this company if the server supports it. */
const SERVING_LINES_SEL_OPERATOR = 'MVG Märkische Verkehrsgesellschaft GmbH'

/**
 * MOT-style `product.class` values kept for badges: bus-only (EFA trip table: 5 city bus, 6 regional bus, 7 coach / e.g. Schnellbus).
 */
const BUS_ONLY_PRODUCT_CLASSES = new Set([5, 6, 7])

/**
 * Builds ServingLines GET URL for lines at a stop (`mode=odv`, `type_sl=stopID`).
 * Does not request explicit train services (`lsShowTrainsExplicit` omitted).
 * Includes `itdLPxx_selOperator` for operator-scoped trial (NWL).
 * @param {string} stopId Global or internal stop ID from StopFinder.
 * @returns {string} Relative URL beginning with `/efa/XML_SERVINGLINES_REQUEST`.
 */
export function buildServingLinesUrl(stopId) {
  const id = typeof stopId === 'string' ? stopId.trim() : ''
  const params = new URLSearchParams({
    coordOutputFormat: 'WGS84[dd.ddddd]',
    itdLPxx_selOperator: SERVING_LINES_SEL_OPERATOR,
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
 * Normalizes rapidJSON ServingLines payload to badge data (bus lines only).
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
 * Fetches bus serving lines for a stop (for UI badges).
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
