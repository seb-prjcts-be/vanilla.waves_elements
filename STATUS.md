# STATUS

## Volgende stap
- Een echte consument koppelen (bv. lucasgent_clone_blocks) via `registerWaveElements(system)` en daar kijken of de catalogusformaten en accenten kloppen.

## Blokkades
- Geen release-tag: bewust, project is nog in ontwikkeling; jsDelivr-gebruik wacht op een versiekeuze.

## Bevindingen (niet uit code af te lezen)
- Richting gekozen door Seb (26/9): **formaten** — ware grootte, opbouw per blockformaat via `vulling01(x, y)`. Schalen (0,5–3,9×) vernietigde lijnbreedte en microtekst en is nu alleen nog opt-in (`fill: "scale"`).
- Een broncel (88px) laat in een blocks.system-block 56 × 34 px binnenruimte over; een rij van 70px-cellen slechts 16px — daar laat de brug het block groeien of weigert ze (`past niet`).
- Tekst die pas in de eerste engine-frame verschijnt (hazard-label, scramble-tekens) of van glyph wisselt, gaf wisselende resultaten; opgelost met vaste cellen en ruimtereservering, niet met ruimere drempels.
- Labels waarvan het vak niet met de letter meegroeit (dimension, scan, crop) mogen niet automatisch gepast worden: dat krimpt bij elke aanroep. Ze krijgen `--wv-label-font` uit vulling01.
- blocks.system `fitHeight()` roept altijd `drag.stop()`: de brug refit alleen bij ≥1px inhoudswijziging en nooit tijdens een sleep.
- Bron-renderer barcode: stap 0,37 op een golf met periode 62,8 → bijna alle staven 3px. Niet stil aangepast.
- Grenzen: segment- en gauge-naald houden hun 2px-lijn ook groot; vaste-verhouding-elementen blijven boven ~6×4 gecentreerd met lege randen; papierrand rond accentkaarten en zwarte blocks.system-titelbalk.
- Testrunner: `~/AppData/Local/nvm/v24.18.0/node.exe tests/run-browser.mjs <pagina>` (Node ≥ 22). Niet `chrome --virtual-time-budget`: daar lopen ResizeObserver en rAF niet normaal.

## Gedaan
- 26/9: `3e5df3a`, `e3cf437` gepubliceerd (CLAUDE-006/007). Daarna formaten als standaard: vulling.mjs, gemeten binnenmaat, resize-volging, groeiregel, accenten en bronstijl; tests native 19, schalen 22, vulling 384 per celmaat (70/88/120) en 768 tot 6×4.
