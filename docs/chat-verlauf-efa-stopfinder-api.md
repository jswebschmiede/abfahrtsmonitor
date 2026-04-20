# Chatverlauf: EFA StopFinder, Adressen, Haltestellen in der Nähe

Gespeicherte Zusammenfassung der Unterhaltung (technischer Fokus). Datum Kontext: April 2026.

---

## 1. Nutzt das Projekt die EFA-Schnittstelle? Adresse übergeben? Test-URL

**Projekt:** `fahrplanauskunft` nutzt den StopFinder von Westfalenfahrplan (`XML_STOPFINDER_REQUEST`, `rapidJSON`).

**Adresse:** Ja. Der Suchtext wird als `name_sf` übergeben (URL-encoded), mit u. a. `locationServerActive=1`, `type_sf=any`.

**Referenz im Code:** `src/utils/utils.js` — Funktion `getStopFinderURL(address)`.

**Beispiel-Test-URL (Browser, GET, rohe JSON):**

```
https://www.westfalenfahrplan.de/nwl-efa/XML_STOPFINDER_REQUEST?coordOutputFormat=WGS84%5Bdd.ddddd%5D&language=de&locationInfoActive=1&locationServerActive=1&name_sf=Dortmund%2C%20Mergelteichstra%C3%9Fe%2080&nwlStopFinderMacro=1&outputFormat=rapidJSON&serverInfo=1&sl3plusStopFinderMacro=1&type_sf=any&version=10.4.18.18
```

**Hinweis im Projekt:** In `src/main.js` ist die Zieladresse auch als `Mergelteichstraße 80, 44225 Dortmund` hinterlegt — gleiche Schnittstelle, anderer `name_sf`-Text.

**PDF (extern):** `J:\MY_PROJECTS\smartmedia24\MVG Aktuell\EFA_JSON_API_Training_EN_2.7.pdf` (MENTZ, EFA JSON API Training EN 2.7).

---

## 2. Zeigt die API Haltestellen in der Nähe? `type_sf` filtern?

**Quelle:** Abschnitte *StopFinder-Request* im oben genannten PDF (u. a. „Nearby Stops“, „Locality Search“, Filter).

### Nearby / Zuordnung

- StopFinder sucht **standardmäßig** nach nahegelegenen Haltestellen (abschaltbar mit `doNotSearchForStops_sf=1`).
- Bei **Adressen oder POIs** sind nahe Haltestellen im Array `**assignedStops`** beschrieben (Standard max. ca. **10** Einträge).
- JSON-Treffer haben u. a. `**type`**: `stop`, `poi`, `address`, `street`, `locality` sowie `**isBest**`, `**matchQuality**`, `**id**`, `**coord**`.

### `type_sf`

- Laut PDF: `**type_sf=any**` (Freitext / Location Server) oder `**type_sf=coord**` (Koordinate in `name_sf` als `lon:lat:WGS84[dd.ddddd]` optional mit `:Freitext`).
- `**type_sf**` ist **kein** Ersatz für „nur Haltestellen“; Feinfilter für Objekttypen: `**anyObjFilter_sf`** (Bitmaske), z. B. `**2**` = Stops (PDF-Beispiel: Stuttgart Bad Cannstatt mit `anyObjFilter_sf=2`).

### Adresse → nur Stops in der Trefferliste

- `**anyObjFilter_sf=2**` kann die Suche auf Stop-Objekte begrenzen; für **reine Adresseingabe** kann das je nach Verbund/Konfiguration ungünstiger sein als `**type_sf=any`** und dann `**assignedStops**` am Adress-Treffer auszuwerten.

**Beispiel-URL mit Filter (zum Vergleich im Browser):**

```
https://www.westfalenfahrplan.de/nwl-efa/XML_STOPFINDER_REQUEST?coordOutputFormat=WGS84%5Bdd.ddddd%5D&language=de&locationInfoActive=1&locationServerActive=1&name_sf=Dortmund%2C%20Mergelteichstra%C3%9Fe%2080&nwlStopFinderMacro=1&outputFormat=rapidJSON&serverInfo=1&sl3plusStopFinderMacro=1&type_sf=any&anyObjFilter_sf=2&version=10.4.18.18
```

### Koordinaten / weiterführend

- Optional **zweistufig:** Adresse auflösen → Koordinate → erneuter StopFinder mit `**type_sf=coord`** (siehe PDF-Beispiele).
- Für geometrische Bereiche (Bounding Box) verweist das PDF-Inhaltsverzeichnis u. a. auf **Coord-Request** — separater Request-Typ; Verfügbarkeit am jeweiligen Endpoint prüfen.

---

## 3. Optimales Vorgehen, Tests, neues Projekt, Chat referenzieren

### Empfohlene Reihenfolge

1. `type_sf=any` + Adresse in `name_sf`, `locationServerActive=1`.
2. Antwort: `**assignedStops`** bei `address`/`poi` nutzen; zusätzlich `locations` nach `type === "stop"` filtern wenn sinnvoll.
3. Nur Stops in der **Such**-Trefferliste: `anyObjFilter_sf=2` testen, mit Adress-Workflow abgleichen.
4. Falls nötig: zweiter Schritt mit `type_sf=coord`.

### Testen

- Schnell: URLs im Browser.
- Gründlicher: eigenes Mini-Projekt (Node `fetch`/`axios` oder Vite); bei Browser-`fetch` von `localhost` auf fremde API **CORS** beachten (Proxy oder serverseitig).

### Chat in neuem Projekt „referenzieren“

- Kontext per `**@`** im neuen Chat (je nach Cursor-Version: vergangene Chats / Transkripte).
- Kurzbriefing oder **diese Datei** ins neue Repo kopieren oder verlinken.
- Optional: **Cursor Rules** unter `.cursor/rules/` mit den festgehaltenen API-Regeln.

---

## 4. Anfrage: Chatverlauf als MD speichern

Diese Datei erfüllt die Bitte, den Verlauf **als Markdown** im Projekt abzulegen.

**Pfad:** `docs/chat-verlauf-efa-stopfinder-api.md`