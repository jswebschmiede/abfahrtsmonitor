import './style.css'
import { buildStopFinderUrl, fetchNearbyStops } from './api/stopfinder.js'
import { formatMapsClientError, reverseGeocodeLatLng } from './utils/reverseGeocode.js'
import { generateWestfalenTripDeepLink } from './utils/westfalenDeepLink.js'
import haltestellePinSvg from './assets/haltestelle-pin.svg?raw'

const root = document.querySelector('#app')
if (!root) throw new Error('Missing #app')

root.innerHTML = `
  <div class="min-h-dvh bg-slate-950 text-slate-100">
    <main class="mx-auto max-w-2xl px-4 py-10">
      <h1 class="text-2xl font-semibold tracking-tight text-white">Haltestellen in der Nähe</h1>
      <p class="mt-2 text-sm text-slate-400">
        Adresse — Westfalenfahrplan StopFinder (EFA, rapidJSON).
      </p>

      <div class="mt-6 space-y-4 p-4 bg-slate-900 rounded-lg">
      <h2 class="text-sm font-medium text-violet-300/90">Debug-Info</h2>
        <div class="rounded-lg border border-violet-500/30 bg-violet-950/30 p-3 shadow-sm shadow-violet-950/20">
          <p class="text-xs font-medium text-violet-300/90">Anfrage-URL (gleiche wie beim Suchen, über Vite-Proxy)</p>
          <p id="api-url-placeholder" class="mt-2 text-sm text-slate-400"><!-- JS --></p>
          <a
            id="api-url-link"
            class="mt-2 hidden break-all text-sm text-violet-300 underline decoration-violet-400/50 underline-offset-2 hover:text-violet-200"
            href="#"
            target="_blank"
            rel="noopener noreferrer"
            ><!-- JS --></a>
        </div>

        <div class="rounded-lg border border-teal-500/30 bg-teal-950/25 p-3 shadow-sm shadow-teal-950/20">
          <label for="test-coords" class="mb-1 block text-xs font-medium text-teal-300/90">Teststandort (Koordinaten)</label>
          <select
            id="test-coords"
            class="w-full rounded-lg border border-teal-700/60 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25"
          >
            <option value="">Teststandort wählen …</option>
            <option value="51.474173,7.468198">Dortmund</option>
            <option value="52.030228,8.532471">Bielefeld</option>
            <option value="51.36315339820182,7.658555983747803">Iserlohn</option>
            <option value="52.525005943782894, 13.368535484975883">Berlin (außerhalb NWL)</option>
          </select>
          <p class="mt-2 text-xs text-slate-500">Wählt eine Koordinate; die Adresse wird wie bei „Standort vom Gerät“ per Geocoding gesetzt.</p>
        </div>
      </div>

      <form id="search-form" class="mt-8 space-y-6 p-4 bg-slate-900 rounded-lg" novalidate>
        <h2 class="text-sm font-medium text-violet-300/90">Abfahrtsmonitor</h2>
        <div id="block-address" class="space-y-3">
          <label for="address" class="mb-1 block text-sm font-medium text-slate-300">Adresse</label>
          <div
            class="flex overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-sm transition focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/30"
          >
            <input
              id="address"
              name="address"
              type="text"
              autocomplete="street-address"
              placeholder="z. B. Dortmund, Mergelteichstraße 80"
              class="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-slate-100 placeholder:text-slate-500 outline-none ring-0 focus:ring-0"
            />
            <button
              type="button"
              id="geo-btn"
              class="inline-flex shrink-0 items-center justify-center border-l border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
              title="Standort vom Gerät ermitteln"
            >
              Standort vom Gerät
            </button>
          </div>
        </div>

        <button
          type="submit"
          id="submit-btn"
          class="inline-flex w-full shrink-0 items-center justify-center rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          Suchen
        </button>
      </form>

      <p id="status" class="mt-4 text-sm text-slate-400" role="status" aria-live="polite"></p>
      <p
        id="verbund-notice"
        class="mt-3 hidden rounded-lg border border-amber-800/70 bg-amber-950/50 px-3 py-2 text-sm text-amber-100"
        role="status"
        aria-live="polite"
      ></p>
      <div id="error" class="mt-2 hidden rounded-lg border border-red-900/80 bg-red-950/50 px-3 py-2 text-sm text-red-200" role="alert" aria-live="assertive"></div>

      <section id="result-section" class="mt-8 hidden" aria-labelledby="results-heading">
        <h2 id="results-heading" class="text-lg font-medium text-white">In der Nähe befinden sich folgende Haltestellen:</h2>
        <p id="resolved" class="mt-1 text-sm text-slate-400"></p>
        <ul id="stop-list" class="mt-4 flex list-none flex-col gap-3 p-0"></ul>
      </section>
    </main>
  </div>
`

const form = /** @type {HTMLFormElement} */ (root.querySelector('#search-form'))
const addressInput = /** @type {HTMLInputElement} */ (root.querySelector('#address'))
const geoBtn = /** @type {HTMLButtonElement} */ (root.querySelector('#geo-btn'))
const testCoordsSelect = /** @type {HTMLSelectElement} */ (root.querySelector('#test-coords'))
const submitBtn = /** @type {HTMLButtonElement} */ (root.querySelector('#submit-btn'))
const statusEl = root.querySelector('#status')
const verbundNoticeEl = root.querySelector('#verbund-notice')
const errorEl = root.querySelector('#error')
const resultSection = root.querySelector('#result-section')
const resolvedEl = root.querySelector('#resolved')
const stopListEl = root.querySelector('#stop-list')
const apiUrlPlaceholder = root.querySelector('#api-url-placeholder')
const apiUrlLink = /** @type {HTMLAnchorElement | null} */ (root.querySelector('#api-url-link'))

/**
 * Updates the preview link for the StopFinder address query.
 */
function updateApiUrlPreview() {
    if (!apiUrlPlaceholder || !apiUrlLink) return
    apiUrlLink.classList.add('hidden')
    apiUrlLink.removeAttribute('href')

    const q = addressInput.value.trim()
    if (!q) {
        apiUrlPlaceholder.textContent = 'Adresse eintragen, um die URL zu sehen.'
        return
    }
    const path = buildStopFinderUrl(q)
    const fullUrl = `${window.location.origin}${path}`
    apiUrlPlaceholder.textContent = ''
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
 * Shows or hides the Westfalenfahrplan Verbund notice (BROKER -8011).
 * @param {boolean} show Whether the address is outside the association coverage.
 */
function setVerbundNotice(show) {
    if (!verbundNoticeEl) return
    if (show) {
        verbundNoticeEl.textContent =
            'Diese Adresse liegt nicht im Verbund des Westfalenfahrplans (BROKER -8011).'
        verbundNoticeEl.classList.remove('hidden')
    } else {
        verbundNoticeEl.textContent = ''
        verbundNoticeEl.classList.add('hidden')
    }
}

/**
 * Reverse-geocodes coordinates into the address field and refreshes the URL preview.
 * @param {number} lat Latitude WGS84.
 * @param {number} lng Longitude WGS84.
 * @returns {Promise<void>}
 */
async function fillAddressFromCoordinates(lat, lng) {
    if (!statusEl) return
    statusEl.textContent = 'Adresse wird ermittelt …'
    const line = await reverseGeocodeLatLng(lat, lng)
    addressInput.value = line
    updateApiUrlPreview()
    statusEl.textContent = 'Adresse übernommen. „Suchen“ zum Abfragen.'
}

/**
 * Sets disabled state on geocoding controls (device location + test select).
 * @param {boolean} disabled Whether inputs are blocked.
 */
function setGeocodeControlsDisabled(disabled) {
    geoBtn.disabled = disabled
    testCoordsSelect.disabled = disabled
}

const stopLinkClass =
    'text-sm font-medium underline decoration-slate-500/60 underline-offset-2 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400'

/**
 * @returns {SVGSVGElement}
 */
function createHaltestelleIcon() {
    const clipId = `hs-clip-${Math.random().toString(36).slice(2, 11)}`
    const markup = haltestellePinSvg.trim().replaceAll('CLIP_ID_PLACEHOLDER', clipId)
    const wrap = document.createElement('div')
    wrap.innerHTML = markup
    const svg = /** @type {SVGSVGElement} */ (wrap.firstElementChild)
    if (!svg) throw new Error('haltestelle-pin.svg parse failed')
    svg.setAttribute(
        'class',
        'h-11 w-auto shrink-0 text-slate-400 [aspect-ratio:384/515]',
    )
    svg.setAttribute('focusable', 'false')
    return svg
}

/**
 * Builds a Google Maps directions URL (optional origin = user address, destination = stop).
 * @param {import('./api/stopfinder.js').NearbyStop} stop Normalized stop.
 * @param {string} [originText=''] - Start address as entered in the search field.
 * @returns {string | null} URL or null if no usable destination.
 */
function buildGoogleMapsDirectionsUrl(stop, originText = '') {
    const name = typeof stop.name === 'string' ? stop.name.trim() : ''
    const origin = typeof originText === 'string' ? originText.trim() : ''
    const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : ''

    if (Number.isFinite(stop.lat) && Number.isFinite(stop.lon)) {
        return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lon}${originParam}`
    }
    if (name) {
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}${originParam}`
    }
    return null
}

/**
 * Renders stop cards into the list element.
 * @param {import('./api/stopfinder.js').NearbyStop[]} stops Normalized stops.
 * @param {string} [originAddress=''] - Address string from the search input (Google Maps origin).
 */
function renderStops(stops, originAddress = '') {
    if (!stopListEl) return
    stopListEl.innerHTML = ''
    for (const stop of stops) {
        const li = document.createElement('li')
        li.className =
            'rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 shadow-sm shadow-black/20'

        const row = document.createElement('div')
        row.className = 'flex gap-3 items-center'
        row.appendChild(createHaltestelleIcon())

        const body = document.createElement('div')
        body.className = 'min-w-0 flex-1'

        const label = stop.name || '(ohne Namen)'
        const title = document.createElement('p')
        title.className = 'font-medium text-white'
        title.textContent = label

        const meta = document.createElement('p')
        meta.className = 'mt-1 text-sm text-slate-400'
        const parts = []
        if (stop.distanceM !== undefined) parts.push(`${stop.distanceM} m Fußweg`)
        if (stop.durationMin !== undefined) parts.push(`ca. ${stop.durationMin} Min.`)
        meta.textContent = parts.join(' · ') || '—'

        const actions = document.createElement('div')
        actions.className = 'mt-3 flex flex-wrap items-center gap-x-5 gap-y-2'

        if (stop.id) {
            const plan = document.createElement('a')
            plan.className = `${stopLinkClass} text-violet-300 hover:text-violet-200`
            plan.href = generateWestfalenTripDeepLink(stop.id, new Date())
            plan.target = '_blank'
            plan.rel = 'noopener noreferrer'
            plan.textContent = 'Fahrplan aufrufen'
            actions.appendChild(plan)
        }

        const mapsUrl = buildGoogleMapsDirectionsUrl(stop, originAddress)
        if (mapsUrl) {
            const route = document.createElement('a')
            route.className = `${stopLinkClass} text-teal-300 hover:text-teal-200`
            route.href = mapsUrl
            route.target = '_blank'
            route.rel = 'noopener noreferrer'
            route.textContent = 'Route planen'
            actions.appendChild(route)
        }

        body.append(title, meta)
        if (actions.childNodes.length > 0) {
            body.appendChild(actions)
        }
        row.appendChild(body)
        li.appendChild(row)
        stopListEl.appendChild(li)
    }
}

/**
 * Maps GeolocationPositionError code to German text.
 * @param {number} code Error code from the Geolocation API.
 * @returns {string}
 */
function geoErrorMessage(code) {
    switch (code) {
        case 1:
            return 'Standort: Zugriff verweigert. Bitte Berechtigung in den Browser-Einstellungen erlauben.'
        case 2:
            return 'Standort: Position nicht verfügbar.'
        case 3:
            return 'Standort: Zeitüberschreitung. Bitte erneut versuchen.'
        default:
            return 'Standort: Unbekannter Fehler.'
    }
}

addressInput.addEventListener('input', updateApiUrlPreview)
addressInput.addEventListener('change', updateApiUrlPreview)

geoBtn.addEventListener('click', async () => {
    setError(null)
    if (!navigator.geolocation) {
        setError('Geolocation wird von diesem Browser nicht unterstützt.')
        return
    }
    if (!statusEl) return

    setGeocodeControlsDisabled(true)
    statusEl.textContent = 'Standort wird ermittelt …'

    try {
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15_000,
                maximumAge: 60_000,
            })
        })
        const lat = /** @type {GeolocationPosition} */ (pos).coords.latitude
        const lng = /** @type {GeolocationPosition} */ (pos).coords.longitude
        await fillAddressFromCoordinates(lat, lng)
    } catch (err) {
        if (typeof GeolocationPositionError !== 'undefined' && err instanceof GeolocationPositionError) {
            setError(geoErrorMessage(err.code))
        } else {
            setError(formatMapsClientError(err))
        }
        if (statusEl) statusEl.textContent = ''
    } finally {
        setGeocodeControlsDisabled(false)
    }
})

testCoordsSelect.addEventListener('change', async () => {
    const raw = testCoordsSelect.value.trim()
    if (!raw) return

    setError(null)
    const parts = raw.split(',').map((s) => s.trim())
    const lat = Number(parts[0])
    const lng = Number(parts[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        testCoordsSelect.value = ''
        return
    }

    if (!statusEl) return
    setGeocodeControlsDisabled(true)
    statusEl.textContent = 'Standort wird ermittelt …'

    try {
        await fillAddressFromCoordinates(lat, lng)
    } catch (err) {
        setError(formatMapsClientError(err))
        if (statusEl) statusEl.textContent = ''
    } finally {
        testCoordsSelect.value = ''
        setGeocodeControlsDisabled(false)
    }
})

updateApiUrlPreview()

form.addEventListener('submit', async (e) => {
    e.preventDefault()
    setError(null)
    setVerbundNotice(false)
    if (!resultSection || !resolvedEl || !statusEl) return

    submitBtn.disabled = true
    statusEl.textContent = 'Suche läuft …'
    resultSection.classList.add('hidden')

    try {
        const q = addressInput.value.trim()
        if (!q) {
            setError('Bitte eine Adresse eingeben.')
            statusEl.textContent = ''
            return
        }

        const { resolvedLabel, stops, outOfVerbund } = await fetchNearbyStops(q)
        setVerbundNotice(outOfVerbund)

        if (outOfVerbund) {
            resolvedEl.innerHTML = ''
            renderStops([], q)
            resultSection.classList.add('hidden')
            statusEl.textContent = ''
            return
        }

        if (stops.length === 0) {
            statusEl.textContent = 'Keine Haltestellen gefunden.'
            renderStops([], q)
            resultSection.classList.remove('hidden')
            return
        }

        statusEl.textContent = `${stops.length} Haltestelle${stops.length === 1 ? '' : 'n'} in der Nähe.`
        renderStops(stops, q)
        resultSection.classList.remove('hidden')
    } catch (err) {
        console.error(err)
        setVerbundNotice(false)
        const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
        setError(msg)
        statusEl.textContent = ''
        resultSection.classList.add('hidden')
    } finally {
        submitBtn.disabled = false
    }
})
