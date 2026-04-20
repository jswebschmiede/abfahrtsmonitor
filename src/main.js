import './style.css'
import { buildStopFinderUrl, fetchNearbyStops } from './api/stopfinder.js'

const root = document.querySelector('#app')
if (!root) throw new Error('Missing #app')

root.innerHTML = `
  <div class="min-h-dvh bg-slate-950 text-slate-100">
    <main class="mx-auto max-w-2xl px-4 py-10">
      <h1 class="text-2xl font-semibold tracking-tight text-white">Haltestellen in der Nähe</h1>
      <p class="mt-2 text-sm text-slate-400">
        Adresse eingeben — Anzeige über den Westfalenfahrplan StopFinder (EFA, rapidJSON).
      </p>

      <div class="mt-6 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
        <p class="text-xs font-medium text-slate-500">Anfrage-URL (gleiche wie beim Suchen, über Vite-Proxy)</p>
        <p id="api-url-placeholder" class="mt-2 text-sm text-slate-500">Adresse eintragen, um die URL zu sehen.</p>
        <a
          id="api-url-link"
          class="mt-2 hidden break-all text-sm text-violet-400 underline decoration-violet-500/50 underline-offset-2 hover:text-violet-300"
          href="#"
          target="_blank"
          rel="noopener noreferrer"
          ><!-- filled by JS --></a>
      </div>

      <form id="address-form" class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end" novalidate>
        <div class="min-w-0 flex-1">
          <label for="address" class="mb-1 block text-sm font-medium text-slate-300">Adresse</label>
          <input
            id="address"
            name="address"
            type="text"
            autocomplete="street-address"
            placeholder="z. B. Dortmund, Mergelteichstraße 80"
            class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 outline-none ring-violet-500/0 transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
          />
        </div>
        <button
          type="submit"
          id="submit-btn"
          class="inline-flex shrink-0 items-center justify-center rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Suchen
        </button>
      </form>

      <p id="status" class="mt-4 text-sm text-slate-400" role="status" aria-live="polite"></p>
      <div
        id="system-messages"
        class="mt-3 hidden space-y-2"
        role="region"
        aria-label="Servermeldungen (systemMessages)"
      ></div>
      <div id="error" class="mt-2 hidden rounded-lg border border-red-900/80 bg-red-950/50 px-3 py-2 text-sm text-red-200" role="alert" aria-live="assertive"></div>

      <section id="result-section" class="mt-8 hidden" aria-labelledby="results-heading">
        <h2 id="results-heading" class="text-lg font-medium text-white">Ergebnis</h2>
        <p id="resolved" class="mt-1 text-sm text-slate-400"></p>
        <ul id="stop-list" class="mt-4 flex list-none flex-col gap-3 p-0"></ul>
      </section>
    </main>
  </div>
`

const form = /** @type {HTMLFormElement} */ (root.querySelector('#address-form'))
const addressInput = /** @type {HTMLInputElement} */ (root.querySelector('#address'))
const submitBtn = /** @type {HTMLButtonElement} */ (root.querySelector('#submit-btn'))
const statusEl = root.querySelector('#status')
const errorEl = root.querySelector('#error')
const resultSection = root.querySelector('#result-section')
const resolvedEl = root.querySelector('#resolved')
const stopListEl = root.querySelector('#stop-list')
const apiUrlPlaceholder = root.querySelector('#api-url-placeholder')
const apiUrlLink = /** @type {HTMLAnchorElement | null} */ (root.querySelector('#api-url-link'))
const systemMessagesEl = root.querySelector('#system-messages')

/**
 * Updates the preview link to the proxied StopFinder URL for the current address field value.
 */
function updateApiUrlPreview() {
  if (!apiUrlPlaceholder || !apiUrlLink || !addressInput) return
  const q = addressInput.value.trim()
  if (!q) {
    apiUrlPlaceholder.classList.remove('hidden')
    apiUrlLink.classList.add('hidden')
    apiUrlLink.removeAttribute('href')
    return
  }
  const path = buildStopFinderUrl(q)
  const fullUrl = `${window.location.origin}${path}`
  apiUrlPlaceholder.classList.add('hidden')
  apiUrlLink.classList.remove('hidden')
  apiUrlLink.href = fullUrl
  apiUrlLink.textContent = fullUrl
}

/**
 * Escapes text for safe insertion as HTML text nodes.
 * @param {string} text Raw user or API string.
 * @returns {string} Escaped string.
 */
function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
  return text.replace(/[&<>"']/g, (ch) => map[ch] ?? ch)
}

/**
 * Shows or hides the error banner with a message.
 * @param {string | null} message Error text, or null to hide.
 */
function setError(message) {
  if (!errorEl) return
  if (!message) {
    errorEl.classList.add('hidden')
    errorEl.textContent = ''
    return
  }
  errorEl.textContent = message
  errorEl.classList.remove('hidden')
}

/**
 * Shows BROKER `systemMessages` from StopFinder below the status line.
 * @param {Array<{ severity: string, label: string }>} rows Parsed rows from `fetchNearbyStops`.
 */
function renderSystemMessages(rows) {
  if (!systemMessagesEl) return
  systemMessagesEl.innerHTML = ''
  if (rows.length === 0) {
    systemMessagesEl.classList.add('hidden')
    return
  }
  systemMessagesEl.classList.remove('hidden')
  const title = document.createElement('p')
  title.className = 'text-xs font-medium uppercase tracking-wide text-slate-500'
  title.textContent = 'Meldungen der API (systemMessages)'
  systemMessagesEl.appendChild(title)

  for (const row of rows) {
    const wrap = document.createElement('div')
    const bar =
      row.severity === 'error'
        ? 'border-amber-700/80 bg-amber-950/40 text-amber-100'
        : row.severity === 'info'
          ? 'border-sky-800/80 bg-sky-950/40 text-sky-100'
          : 'border-slate-700 bg-slate-900/60 text-slate-300'
    wrap.className = `rounded-lg border px-3 py-2 text-sm ${bar}`
    wrap.textContent = row.label
    systemMessagesEl.appendChild(wrap)
  }
}

/**
 * Renders stop cards into the list element.
 * @param {import('./api/stopfinder.js').NearbyStop[]} stops Normalized stops.
 */
function renderStops(stops) {
  if (!stopListEl) return
  stopListEl.innerHTML = ''
  for (const stop of stops) {
    const li = document.createElement('li')
    li.className =
      'rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 shadow-sm shadow-black/20'

    const title = document.createElement('p')
    title.className = 'font-medium text-white'
    title.textContent = stop.name || '(ohne Namen)'

    const meta = document.createElement('p')
    meta.className = 'mt-1 text-sm text-slate-400'
    const parts = []
    if (stop.distanceM !== undefined) parts.push(`${stop.distanceM} m Fußweg`)
    if (stop.durationMin !== undefined) parts.push(`ca. ${stop.durationMin} Min.`)
    if (Number.isFinite(stop.lat) && Number.isFinite(stop.lon)) {
      parts.push(`${stop.lat.toFixed(5)}, ${stop.lon.toFixed(5)}`)
    }
    meta.textContent = parts.join(' · ') || '—'

    li.append(title, meta)
    stopListEl.appendChild(li)
  }
}

addressInput.addEventListener('input', updateApiUrlPreview)
addressInput.addEventListener('change', updateApiUrlPreview)
updateApiUrlPreview()

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const q = addressInput.value.trim()
  setError(null)
  renderSystemMessages([])
  if (!resultSection || !resolvedEl || !statusEl) return

  if (!q) {
    setError('Bitte eine Adresse eingeben.')
    resultSection.classList.add('hidden')
    statusEl.textContent = ''
    return
  }

  submitBtn.disabled = true
  statusEl.textContent = 'Suche läuft …'
  resultSection.classList.add('hidden')

  try {
    const { resolvedLabel, stops, systemMessages } = await fetchNearbyStops(q)

    renderSystemMessages(systemMessages)

    resolvedEl.innerHTML = resolvedLabel
      ? `Treffer: <span class="text-slate-200">${escapeHtml(resolvedLabel)}</span>`
      : ''

    if (stops.length === 0) {
      statusEl.textContent = 'Keine Haltestellen gefunden.'
      renderStops([])
      resultSection.classList.remove('hidden')
      return
    }

    statusEl.textContent = `${stops.length} Haltestelle${stops.length === 1 ? '' : 'n'} in der Nähe.`
    renderStops(stops)
    resultSection.classList.remove('hidden')
  } catch (err) {
    console.error(err)
    renderSystemMessages([])
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    setError(msg)
    statusEl.textContent = ''
    resultSection.classList.add('hidden')
  } finally {
    submitBtn.disabled = false
  }
})
