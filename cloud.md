# vanilla.waves_elements

## Missie
De herbruikbare, **canvasloze grafische elementen** bovenop `vanilla.waves`: loaders,
native DOM-controls en micrographic-renderers. De "elements"-laag — wat je in een pagina
dropt, niet de motor. Elk element registreert zich op de engine en deelt diens rAF-loop.
Tweede rol: **inhoudsdienst voor `blocks.system`** — blocks bezit raster/slepen/dock,
deze laag levert enkel de inhoud.

## Boom
- (dependency) → vanilla.waves `vanilla.waves.min.js` (bundle mét DOM-engine; `waves-core.mjs` heeft géén engine)
- `elements.mjs`  → `RENDERERS` (engine-contract create/update), `ELEMENTS` (catalogus met standaard-span), `registerElements(engine?)`
- `elements.css`  → stijl per element, prefix `wv-`, thema via `--wv-ink` / `--wv-paper`
- `blocks.mjs`    → brug `registerWaveElements(system, {engine?, adapter?, prefix?})` → `{ add(id, settings, addOptions) }`, plus `packOrder(items, columns)`
- `index.html`    → demo: alle elementen als blocks (http://localhost/vanilla.waves_elements/)
- `tests/contract.mjs` → node-contract (duck-typed, geen browser)
- `tests/browser.html` + `tests/run-browser.mjs` → echte blocks.system + echte engine in headless Chrome, realtime via CDP

## Regels
- Elk element registreert via `VanillaWaves.register(naam, {create, update})`. **Geen eigen rAF-loop, geen eigen IO** — dat zit in de engine.
- Dependency-richting **één kant op**: elements → engine; brug → elements. `elements.mjs` kent blocks niet, `blocks.mjs` importeert blocks.system niet (systeem wordt meegegeven).
- **Drie projecten blijven ongewijzigd**: blocks.system (adapter-register is de hele koppeling), vanilla.waves (engine ongewijzigd, v0.3.1), buiilding_blocks_elements (bron + testcollectie, alleen lezen).
- Renderer-bodies komen **verbatim** uit `wel.js`/`waves-loader.js`; enkel `wel-`→`wv-` en module-helpers expliciet. Pariteit met de engine is bewezen (zelfde helpers, dt, seed-hash, IO-marge).
- Dragables/snap-grid/venster-dock **niet** hier: dat ís blocks.system (omkeerbaar sluiten = dock).
- p5-sketches (`ribbons`, `ghost-orbit`) **niet** hier: p5 breekt de regel "vanilla.waves als enige runtime-dependency". Die blijven een lokale adapter in buiilding_blocks_elements.
- Bekende grens: `block.describe()`/kopiëren serialiseert live DOM; gebruik `system.snippet("wv-<id>")` voor een herbruikbare `data-wv`-marker.

## Vullen (Seb koos op 26/9: formaten = standaard)
- **fill "native" (ware grootte)**: element 1:1 in bronkaartstijl (--wv-line 1px, Courier 9px caps, #14140f op #efeee8, accenten), block volgt inhoudshoogte via fitHeight, breedte minstens broncel 88px en nooit onder min-content (behalve bewust afkappende elementen zoals ticker). Demo ?fill=native.
- **vast formaat + vulling01(x, y)** (vulling.mjs): tel-elementen krijgen aantallen, display-tekst een gepaste echte lettergrootte (fitDisplayFont, --wv-fit), vormen groeien via cqw/cqh met non-scaling-stroke. MIN_SPAN voor statusdot/boot/scramble. Meetopstelling tests/vulling.html: elk element × elk formaat. Les: tekst die pas in de eerste engine-frame verschijnt of van glyph wisselt (hazard, scramble) → vaste cellen/ruimte reserveren, anders meet de passing verkeerd.
- **fill "scale"** (opt-in; was de eerste gepubliceerde standaard): hieronder. Nadeel gemeten: schaal 0,5–3,9× vernietigt lijnbreedte en microtekst.
- **In het block**: de brug zet elk element in een vulframe (`.wv-element`), meet de inktvlek (de kinderen; de host zelf alleen als hij een rand/achtergrond tekent) en centreert en schaalt die met één transform tot 90% van het frame, max. 8×. Een ResizeObserver volgt span- en vensterwijzigingen. Nooit een scrollbalk.
- **In het raster**: flow-grid plaatst bewust zonder `dense` (blocks.system README). `packOrder(items, columns)` kiest daarom een volgorde waarin de spans zonder gaten sluiten; enkel de laatste rij mag open blijven.

## Checks
- `node tests/contract.mjs`
- `~/AppData/Local/nvm/v24.18.0/node.exe tests/run-browser.mjs tests/vulling.html` (en `?max=6x4`, `?id=<element>&detail`)
- `~/AppData/Local/nvm/v24.18.0/node.exe tests/run-browser.mjs tests/native.html` (ware grootte) en `tests/standalone.html` (README-voorbeeld)
- `~/AppData/Local/nvm/v24.18.0/node.exe tests/run-browser.mjs` — Node ≥ 22 nodig voor WebSocket; de Node 18 op PATH faalt.
- **Niet** `chrome --virtual-time-budget`: in virtuele tijd vuurt ResizeObserver maar één keer (vals rood op herschalen). De Browser-pane en een Chrome-tab op de achtergrond zijn `hidden`: daar draaien rAF en ResizeObserver niet.

## Notities
- 2026-06-29: consolidatiebron = `building_blocks_elements` (wel.js, waves-loader.js hebben elk een engine-kopie) → dedupliceren naar vanilla.waves-engine + deze elements.
- 2026-06-29: eerste echte klant van een element = prjcts.be thumbnail-loader.
- 2026-09-26: opgezet als blocks.system-inhoudsdienst; brug dicht zelf het gat dat `block.remove()` geen adapter-unmount aanroept (luistert naar `blocks:change` type remove).
- 2026-09-26: weerlegronde op de brug vond 6 randgevallen (half block bij span-fout, `wv`-setting kaapt type, lek bij remove tijdens mount, twee systemen op één veld, halve registratie, fout voorbeeld); allemaal gedicht, de eerste drie met browsertest.
