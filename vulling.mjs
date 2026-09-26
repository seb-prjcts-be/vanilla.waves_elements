/**
 * vulling01(x, y) — opbouw per blockformaat.
 *
 * Voor een block van x kolommen × y rijen (broncel 88px, tussenruimte 6px) geeft elke
 * functie terug hoe het element dat formaat vult op ware grootte — nooit door te schalen:
 *   - tel-elementen krijgen meer staven, cellen of regels (data-*-instellingen);
 *   - display-elementen (cijfers, koppen, iconen) krijgen een grotere letter via een
 *     CSS-variabele (`--wv-…`); microtekst blijft altijd 9px;
 *   - vorm-elementen (svg) groeien via container-eenheden in de CSS, met lijnen die
 *     1px blijven (vector-effect: non-scaling-stroke).
 * Puur: geen DOM, dus in node te testen. Een instelling die je zelf aan add() meegeeft,
 * wint altijd.
 */

export const CELL = 88;
export const GAP = 6;
const INSET_W = 32;           // gemeten: randen + content- en frame-padding
const INSET_H = 54;           // gemeten: idem + titelbalk van blocks.system

/** Beschikbare binnenmaat (px) van een native frame in een block van x × y cellen. */
export function innerSize(x, y) {
    return {
        width: x * CELL + (x - 1) * GAP - INSET_W,
        height: y * CELL + (y - 1) * GAP - INSET_H,
    };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Hoeveel eenheden van `unit` px (inclusief tussenruimte `gap`) passen in `px`. */
const count = (px, unit, gap = 0, lo = 1, hi = Infinity) => clamp(Math.floor((px + gap) / (unit + gap)), lo, hi);
const px = (v) => `${Math.round(v)}px`;

/**
 * Grootste lettergrootte (px) waarbij `chars` tekens van `charEm` breed, eventueel over
 * meerdere regels (lineEm hoog), in width × height passen.
 */
function fitText(chars, charEm, lineEm, width, height, lo, hi) {
    for (let f = hi; f > lo; f--) {
        const perLine = Math.max(1, Math.floor(width / (f * charEm)));
        if (Math.ceil(chars / perLine) * f * lineEm <= height) return f;
    }
    return lo;
}

/**
 * Elementen met een vaste verhouding (vorm of één regel display-tekst) vullen één as;
 * de andere volgt uit hun verhouding. Rekbare elementen vullen beide assen.
 */
export const ASPECT_BOUND = Object.freeze(new Set([
    "loader", "matrix", "dither", "readout", "reticle", "keypad", "counter", "segment", "rgbsplit",
    "scramble", "gauge", "checks", "sigil", "globe", "hazard", "arrows", "dimension",
]));

/** id → ({ width, height }) => instellingen. */
export const VULLING = Object.freeze({
    // n × n tekens; glyph blijft ~0,8 × cel, cel ~16px.
    loader: ({ width, height }) => ({ grid: String(count(Math.min(width, height), 16, 0, 2, 12)) }),

    // Staven 1–4px (gemiddeld ~3px met tussenruimte); hoogte vult via CSS.
    barcode: ({ width }) => ({ bars: String(count(width - 6, 3.3, 0, 8, 320)) }),
    bars: ({ width }) => ({ bars: String(count(width, 6, 2, 4, 96)) }),
    wave: ({ width }) => ({ points: String(count(width, 4, 0, 16, 320)) }),

    // Vierkante rasters: cel ~7px (matrix, gap 2), ~12px (dither, 11px tekens).
    matrix: ({ width, height }) => ({ grid: String(count(Math.min(width, height), 7, 2, 3, 32)) }),
    dither: ({ width, height }) => ({ grid: String(count(Math.min(width, height), 12, 0, 3, 24)) }),

    // Eén regel cijfers: letter volgt de hoogte, aantal volgt de breedte.
    readout: ({ width, height }) => {
        const font = clamp(Math.round(Math.min(height * 0.62, (width - 12 - 4 * 2) / (4 * 0.7))), 12, 120);   // minstens 4 cijfers
        return { len: String(count(width - 12, font * 0.7, 2, 2, 24)), "--wv-font": px(font) };
    },
    counter: ({ width, height }) => {
        const font = clamp(Math.round(Math.min((height - 4) / 1.15 * 0.85, (width / 3 - 8) / 0.6)), 12, 120);   // minstens 3 rollen
        return { len: String(count(width, font * 0.6 + 7, 1, 1, 16)), "--wv-font": px(font) };
    },
    segment: ({ width, height }) => {
        const h = clamp(Math.round(Math.min(height * 0.9, width * 42 / 26)), 20, 400);
        return { len: String(count(width, h * 26 / 42, 4, 1, 16)), "--wv-seg": px(h) };
    },
    arrows: ({ width, height }) => {
        const font = clamp(Math.round(Math.min(height * 0.78, (width - 2 * 3) / (3 * 0.58))), 12, 160);   // minstens 3 pijlen; ▸ ≈ 0,58em (gemeten)
        return { len: String(count(width, font * 0.58, 3, 2, 64)), "--wv-font": px(font) };
    },
    // Label-letters: het vak van deze elementen groeit niet mee met de letter, dus niet
    // automatisch passen (dat zou blijven krimpen) — --wv-label-font komt alleen hieruit.
    dimension: ({ width, height }) => ({ "--wv-label-font": px(clamp(Math.round(Math.min((height - 15) * 0.8, width / (5 * 0.62))), 12, 140)) }),

    // Display-tekst: zo groot als breedte en hoogte samen toelaten.
    rgbsplit: ({ width, height }) => ({ "--wv-font": px(clamp(Math.floor(Math.min(height / 1.6, (width - 12) / (6 * 0.54))), 10, 240)), "--wv-reserve": "12" }),   // één regel; ≈ 0,54em per letter (gemeten)
    scramble: ({ width, height }) => ({ "--wv-font": px(fitText(10, 0.7, 1.5, width, height * 0.5, 9, 160)), "--wv-fit": "0.82" }),   // letters klauteren
    // Icoon in een vast vak van 1,2em; naast het label (≈ 46px) of erboven (label onder het icoon).
    hazard: ({ width, height }) => {
        const side = Math.min(height * 0.9 / 1.2, (width - 50) / 1.2);
        const stacked = Math.min((height - 16) * 0.9 / 1.2, width * 0.95 / 1.2);
        return { "--wv-font": px(clamp(Math.floor(Math.max(side, stacked)), 12, 220)), "--wv-fit": "0.8" };   // glyphs wisselen van maat
    },
    ticker: ({ height }) => ({ "--wv-ticker-font": px(clamp(Math.round((height - 6) * 0.7), 11, 96)) }),

    // Balken en velden: vullen de hoogte via CSS; label volgt mee.
    loadbar: ({ height }) => ({ "--wv-track": px(clamp(height - 16, 12, 400)) }),
    scan: ({ height }) => ({ "--wv-label-font": px(clamp(Math.round(height * 0.25), 12, 96)) }),
    crop: ({ width, height }) => ({ "--wv-label-font": px(clamp(Math.min(height * 0.5, width / 3), 14, 160)) }),
    nodes: ({ width }) => ({ nodes: String(count(width, 40, 0, 3, 24)) }),

    // Formulierlijsten: meer regels of kolommen, vaste maat per regel.
    checks: ({ width, height }) => ({ grid: String(count(Math.min(width, height), 15, 4, 2, 24)) }),
    sliders: ({ height }) => ({ rows: String(count(height, 12, 6, 1, 48)) }),
    levels: ({ height }) => ({ rows: String(count(height, 8, 4, 1, 64)) }),
    radios: ({ width, height }) => ({ rows: String(count(height, 13, 5, 1, 24)), cols: String(count(width, 13, 4, 2, 48)) }),
    waterfall: ({ width, height }) => {
        const cols = count(width, 6, 1, 4, 96);
        const cell = (width - (cols - 1)) / cols;
        return { cols: String(cols), rows: String(count(height, cell, 1, 2, 96)) };
    },
    keypad: ({ width, height }) => ({ grid: String(count(Math.min(width, height), 20, 3, 2, 8)) }),

    // Vormen: geen aantallen; de svg vult via container-eenheden, lijnen blijven 1px.
    reticle: () => ({}),
    gauge: () => ({}),
    sigil: () => ({}),
    globe: () => ({}),

    // Microtekst 9px: meer regels.
    statusdot: ({ height }) => ({ rows: String(count(height, 11.25, 4, 1, 40)) }),
    spectable: ({ height }) => ({ rows: String(count(height, 11.25, 3, 1, 40)) }),
    boot: ({ height }) => ({ rows: String(count(height - 20, 11.25, 2, 1, 40)) }),
});

/** Kleinste zinvolle formaat [kolommen, rijen]: microtekst-regels zijn breder dan één cel. */
export const MIN_SPAN = Object.freeze({
    statusdot: Object.freeze([2, 1]),
    boot: Object.freeze([2, 1]),
    scramble: Object.freeze([2, 1]),   // 10 tekens op één regel; breken middenin een woord is lelijk
});

/**
 * Instellingen voor element `id` in een block van x × y cellen. Geef `size` (gemeten
 * binnenmaat in px) mee wanneer die bekend is — de brug doet dat altijd, zodat elke
 * kolommaat klopt; zonder `size` geldt de broncel (88px). Onbekend id: {}.
 */
export function vulling01(id, x, y, size) {
    const fn = VULLING[id];
    if (!fn) return {};
    const s = size && size.width > 0 && size.height > 0 ? size : innerSize(Math.max(1, x | 0), Math.max(1, y | 0));
    return fn(s);
}
