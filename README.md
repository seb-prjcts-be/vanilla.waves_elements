# vanilla.waves_elements

Canvasloze grafische elementen op de [vanilla.waves](https://github.com/seb-prjcts-be/vanilla.waves)-engine,
en een brug die ze als inhoud in [blocks.system](https://github.com/seb-prjcts-be/blocks.system) zet.

blocks.system bezit het raster, slepen en de dock; deze library levert enkel wat er ín een block staat:
barcodes, equalizers, oscilloscopen, gauges, tickers, tekst-loaders en ruim twintig andere micrographic-elementen.
Geen van beide libraries hoeft daarvoor aangepast te worden.

## Gebruik in blocks.system

```html
<link rel="stylesheet" href="blocks.system/blocks.system.css">
<link rel="stylesheet" href="vanilla.waves_elements/elements.css">
<div id="field" style="height: 480px"></div>

<script src="https://cdn.jsdelivr.net/gh/seb-prjcts-be/vanilla.waves@v0.3.1/vanilla.waves.min.js"></script>
<script type="module">
import { createBlocksSystem } from "./blocks.system/blocks.system.mjs";
import { registerWaveElements, packOrder } from "./vanilla.waves_elements/blocks.mjs";

const system = createBlocksSystem({ layout: "flow-grid" });
const waves = registerWaveElements(system);      // één adapter + een definitie per element
system.attach("#field").setGrid(6, 4);

await waves.add("barcode", { seed: 21 });         // block + inhoud in zijn catalogusformaat
await waves.add("gauge", {}, { span: [2, 2] });
</script>
```

Laad `vanilla.waves.min.js` (de bundle mét DOM-engine); `waves-core.mjs` bevat de engine niet.

### Vullen: elk formaat op ware grootte

Standaard tekent elk element **op ware grootte** in de kaartstijl van de bron (1px lijnen, Courier 9px hoofdletters, warme inkt op papier, optionele accentkaart) en bouwt het zich op voor **het formaat van zijn block** — zonder iets te schalen:

```js
const waves = registerWaveElements(system);
await waves.add("barcode");                      // catalogusformaat (2 × 1)
await waves.add("bars", {}, { span: [3, 1] });   // 3 kolommen × 1 rij: meer staven
await waves.add("readout", {}, { span: [1, 3] }); // hoog en smal: grotere cijfers, minder tekens
await waves.add("gauge", {}, { accent: "red" });  // accentkaart uit de bron
```

`vulling.mjs` bevat per element een pure functie `vulling01(x, y)` die voor x kolommen × y rijen de opbouw kiest:

- **tel-elementen** krijgen meer staven, cellen of regels (`bars`, `grid`, `rows`, `cols`, `len`);
- **display-tekst** (cijfers, koppen, iconen) krijgt een echte lettergrootte die na het mounten op de werkelijke inkt wordt gepast; microtekst blijft 9px;
- **vormen** (svg) groeien via container-eenheden, met lijnen die 1px blijven (`vector-effect: non-scaling-stroke`).

De brug meet de echte binnenmaat van het block, dus elke kolom- en rijmaat werkt, en volgt een latere resize (andere aantallen → opnieuw mounten, anders alleen de letter opnieuw passen). Het veld heeft een hoogte nodig.

Past een element op ware grootte niet in het gevraagde formaat — een rij van 70px-cellen laat maar 16px over — dan **groeit het block** met een rij of kolom tot het past; kan het raster niet groeien, dan weigert `add()` met `past niet`. Lijnen en microtekst worden nooit kleiner gemaakt. Enkele elementen hebben een vast minimum (`MIN_SPAN`: statusdot, boot en scramble minstens 2 kolommen). In `layout: "free"` bestaan geen formaten: de span wordt dan genegeerd.

Andere vulwijzen:

- `{ span: "auto" }` — kolommen uit de catalogus, de **hoogte volgt de inhoud** (`block.fitHeight()`; gebruik een fijne rijmaat). Zie `index.html?fill=native`.
- `registerWaveElements(system, { fill: "scale" })` — **schalen**: elk element wordt gecentreerd en geschaald tot het zijn block vult. Vult altijd, maar lijnen en tekst schalen mee. Zie `index.html?fill=scale`.

`tests/vulling.html` controleert elk element in elk formaat (`?max=6x4`) en bij elke celmaat (`?cell=70`, `88`, `120`) op afkappen, samendrukken, vulgraad, ware grootte (geen transform, microtekst 9px) en krimpen na een resize.

### Het raster vullen

`packOrder(items, columns)` vult steeds de eerste vrije cel met het eerstvolgende passende item, zodat een `flow-grid` zo weinig mogelijk gaten krijgt. Voor willekeurige spans is dat niet gegarandeerd; items breder dan het raster worden geweigerd.

```js
for (const entry of packOrder(waves.elements, 6)) await waves.add(entry.id);
```

### API

| | |
|---|---|
| `registerWaveElements(system, { engine?, adapter?, prefix?, fill? })` | Registreert adapter `wave-element` en definities `wv-<id>`. `fill`: `"native"` (standaard) of `"scale"`. Geeft `{ add, elements, size }`. |
| `waves.add(id, settings?, addOptions?)` | Maakt een block en mount het element in zijn formaat. `addOptions.span`: `[c, r]` (standaard het catalogusformaat), `"auto"` of `false`; `addOptions.accent`: een van `ACCENTS` (`invert`, `red`, `green`, `blue`, `cyan`, `magenta`, `yellow`). |
| `system.mount("wv-<id>", host, settings)` | Rechtstreeks mounten via het adapter-register van blocks.system. |
| `system.snippet("wv-<id>", settings)` | Herbruikbare `data-wv`-marker voor gebruik zonder blocks. |
| `packOrder(items, columns)` | Volgorde met zo weinig mogelijk gaten voor `flow-grid`. |

`settings` worden `data-*`-attributen (kebab-case): `seed`, `speed`, `group`, `frequency`, `shift`,
plus elementspecifieke opties uit `ELEMENTS[i].attributes`.

**Shift** staat standaard aan: de wave schuift na `shift-interval` in `shift-duration` naar een
volgende golfvorm uit dezelfde `group`. Zet hem uit met `{ shift: false }` — de brug schrijft dat als
`data-shift="false"`, de enige waarde waarop de engine shift uitzet. Andere booleaanse opties
(`scan`, `live`) werken op aanwezigheid: `false` laat het attribuut weg.

## Zonder blocks.system

```html
<div data-wv="gauge" data-seed="7"></div>
<script src="https://cdn.jsdelivr.net/gh/seb-prjcts-be/vanilla.waves@v0.3.1/vanilla.waves.min.js"></script>
<script type="module">
import { registerElements } from "./vanilla.waves_elements/elements.mjs";
registerElements();
VanillaWaves.init();
</script>
```

## Thema

Elementen tekenen in `--wv-ink` op `--wv-paper` (standaard `currentColor` op transparant), zodat ze
binnen blocks.system vanzelf de kleur van het block volgen. Een eigen kleur zet je op `.wv-element`
of dieper (bv. `.wv-element { --wv-ink: #f00 }`); hoger in de pagina wordt ze door het vulframe overschreven.

## Testen

```bash
node tests/contract.mjs         # catalogus, renderers, brug, laaggrenzen, packOrder
node tests/run-browser.mjs      # echte blocks.system + engine in headless Chrome (Node ≥ 22)
node tests/run-browser.mjs tests/standalone.html   # het voorbeeld zonder blocks.system
node tests/run-browser.mjs tests/native.html       # fill:"native": 1:1, bronstijl, hoogte volgt inhoud
node tests/run-browser.mjs tests/vulling.html      # elk element × elk formaat 1–4 × 1–3 (?max=6x4 voor meer)
```

De browsertest verwacht deze map naast `blocks.system` op `http://localhost/`.

## Licentie

MIT — zie [LICENSE](LICENSE).
