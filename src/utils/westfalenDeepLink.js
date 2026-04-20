/**
 * Westfalenfahrplan SL3+ journey planner shared links (`/nwlsl3+/trip?formik=…`).
 * Parameter names and encoding match NWL “Einbindung Schnelleingabemaske” (formik nested in query).
 * Any formik field may be omitted; we set `origin` plus date/time for a pre-filled “Abfahrt” query.
 * @see https://www.westfalenfahrplan.de/nwlsl3+/trip
 */

const WFP_TRIP_BASE = 'https://www.westfalenfahrplan.de/nwlsl3+/trip'

/**
 * Formats a {@link Date} as DDMMYYYY for `itdDateDayMonthYear` in shared links.
 * @param {Date} date - Reference instant (local time).
 * @returns {string} Eight-digit date string.
 */
export function formatDateDayMonthYear(date) {
  const d = date instanceof Date ? date : new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return day + month + year
}

/**
 * Formats a {@link Date} as HHmm (24h) for `itdTime` in shared links.
 * @param {Date} date - Reference instant (local time).
 * @returns {string} Four-digit time string.
 */
export function formatTimeHHmm(date) {
  const d = date instanceof Date ? date : new Date(date)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return h + m
}

/**
 * Encodes key/value pairs into the nested `formik` query string (then URL-encoded as a single value).
 * @param {Record<string, string>} params - Raw parameter values before outer encoding.
 * @returns {string} Inner formik string (not yet wrapped in `formik=`).
 */
function encodeFormikParams(params) {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
}

/**
 * Builds an NWL journey planner deep link with a pre-filled origin stop (no destination).
 * Uses the same `formik` encoding as the official examples (`lng=de`, `sharedLink=true`).
 * @param {string} originStopId - Stop identifier for the “Von” field, e.g. `de:05978:11218`.
 * @param {Date} [referenceDate=new Date()] - Date and time for `itdDateDayMonthYear` / `itdTime` (local).
 * @returns {string} Absolute HTTPS URL to `nwlsl3+/trip`.
 */
export function generateWestfalenTripDeepLink(originStopId, referenceDate = new Date()) {
  const d = referenceDate instanceof Date ? referenceDate : new Date(referenceDate)
  const formik = encodeFormikParams({
    origin: originStopId,
    itdDateDayMonthYear: formatDateDayMonthYear(d),
    itdTime: formatTimeHHmm(d),
    itdTripDateTimeDepArr: 'dep',
  })
  return `${WFP_TRIP_BASE}?formik=${encodeURIComponent(formik)}&lng=de&sharedLink=true`
}
