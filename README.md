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

await waves.add("barcode", { seed: 21 });         // block + inhoud + standaard-span
await waves.add("gauge", {}, { span: [2, 2] });
</script>
```

Laad `vanilla.waves.min.js` (de bundle mét DOM-engine); `waves-core.mjs` bevat de engine niet.

### Slim vullen

- **In een block** — elk element staat in een vulframe dat zijn tekening meet en die gecentreerd
  zo groot mogelijk in het block legt. Het schaalt mee bij een andere span of venstergrootte, zonder scrollbalk.
- **In het raster** — `packOrder(items, columns)` vult steeds de eerste vrije cel met het
  eerstvolgende passende item, zodat een `flow-grid` zo weinig mogelijk gaten krijgt. Voor de
  meegeleverde catalogus (veel 1×1-elementen) zijn dat er geen boven de laatste rij; voor willekeurige
  spans is dat niet gegarandeerd. Items breder dan het raster worden geweigerd.

  ```js
  for (const entry of packOrder(waves.elements, 6)) await waves.add(entry.id);
  ```

### API

| | |
|---|---|
| `registerWaveElements(system, { engine?, adapter?, prefix? })` | Registreert adapter `wave-element` en definities `wv-<id>`. Geeft `{ add, elements, size }`. |
| `waves.add(id, settings?, addOptions?)` | Maakt een block, mount het element, zet de standaard-span. `addOptions.span`: `[c, r]` of `false`. |
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
```

De browsertest verwacht deze map naast `blocks.system` op `http://localhost/`.

## Licentie

MIT — zie [LICENSE](LICENSE).
