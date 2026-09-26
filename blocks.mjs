/**
 * Brug: vanilla.waves_elements als inhoudsdienst voor blocks.system.
 *
 * blocks.system bezit het raster, slepen, dock en menu; deze brug levert enkel inhoud.
 * Ze importeert blocks.system niet: je geeft een systeem mee (duck-typed), zodat de
 * core ongewijzigd blijft en niets over waves hoeft te weten.
 *
 *   import { createBlocksSystem } from ".../blocks.system/blocks.system.mjs";
 *   import { registerWaveElements } from ".../vanilla.waves_elements/blocks.mjs";
 *   const system = createBlocksSystem({ layout: "flow-grid" });
 *   const waves = registerWaveElements(system);      // adapter + definities
 *   system.attach("#field").setGrid(6, 4);            // veld heeft een hoogte nodig
 *   await waves.add("barcode", { seed: 21 });         // block + inhoud + standaard-span
 *
 * Slim vullen: elk element staat in een vulframe dat het block-inhoudsvak volgt. Het frame
 * meet de natuurlijke maat van het element en schaalt het (transform) tot het past —
 * kleine elementen groeien mee, grote krimpen, er ontstaat nooit een scrollbalk.
 *
 * Gaten in de core die de brug zelf dicht, zonder de core aan te passen:
 * - block.remove() roept geen adapter-unmount aan → de brug luistert naar
 *   blocks:change {type:"remove"} en ruimt de engine-entry op.
 * - block.describe() / kopiëren serialiseert live DOM → gebruik snippet() voor
 *   een herbruikbare data-wv-marker (bekende grens).
 */

import { ELEMENTS, getElement, registerElements } from "./elements.mjs";
import { MIN_SPAN, vulling01 } from "./vulling.mjs";

export const VANILLA_WAVES_URL = "https://cdn.jsdelivr.net/gh/seb-prjcts-be/vanilla.waves@v0.3.1/vanilla.waves.min.js";

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILLS = ["scale", "native"];
/** Celmaat en tussenruimte van het bronraster (micrographic-grid, dichtheid "normaal"). */
const SOURCE_CELL = 88;
const SOURCE_GAP = 6;
/** Padding van het native frame (7px rondom, elements.css). */
const FRAME_PAD = 14;
/** Kaartkleuren uit de bron (micrographic-grid). */
export const ACCENTS = Object.freeze(["invert", "red", "green", "blue", "cyan", "magenta", "yellow"]);
const RESERVED = new Set(["wv"]);
const MAX_SCALE = 8;   // DOM en SVG blijven scherp onder transform

function escapeAttribute(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

// De engine leest deze opties als de string "false" (shift: opts.shift === 'false');
// weglaten zou ze juist AAN laten. Andere booleans werken op aanwezigheid.
const FALSE_AS_STRING = new Set(["shift", "decorative"]);

function settingEntries(settings) {
    return Object.entries(settings)
        .filter(([key, value]) => !RESERVED.has(key) && ID.test(key) && value !== null && value !== undefined)
        .filter(([key, value]) => value !== false || FALSE_AS_STRING.has(key))
        .map(([key, value]) => [key, value === false ? "false" : value]);
}

function applySettings(node, settings) {
    for (const [key, value] of settingEntries(settings)) {
        node.setAttribute(`data-${key}`, value === true ? "" : String(value));
    }
    // CSS-variabelen uit vulling01 (bv. --wv-font): maat van display-letters en vormen.
    for (const [key, value] of Object.entries(settings)) {
        if (/^--wv-[a-z-]+$/.test(key) && value != null) node.style.setProperty(key, String(value));
    }
}

function settingsToHtml(settings) {
    return settingEntries(settings)
        .map(([key, value]) => (value === true ? ` data-${key}` : ` data-${key}="${escapeAttribute(value)}"`))
        .join("");
}

const MARGIN = 0.9;   // inktvlek vult 90% van het frame

/** Hoogte van de inhoud van een node: van de hoogste bovenkant tot de laagste onderkant van zijn kinderen. */
function contentHeight(node) {
    let top = Infinity, bottom = -Infinity;
    for (const child of node.children) {
        const box = child.getBoundingClientRect();
        if (!box.height) continue;
        top = Math.min(top, box.top);
        bottom = Math.max(bottom, box.bottom);
    }
    return top === Infinity ? node.getBoundingClientRect().height : bottom - top;
}

/**
 * Vast formaat, display-tekst: pas `--wv-font` aan tot de inktvlek zo groot mogelijk in het
 * frame past (95% van de beperkende as). Echte lettergrootte, geen transform — lijnen
 * blijven 1px. Tekst schaalt lineair mee, dus drie proportionele stappen volstaan.
 */
function fitDisplayFont(frame, node) {
    const start = parseFloat(node.style.getPropertyValue("--wv-font"));
    if (!start) return;
    const style = getComputedStyle(frame);
    const W = frame.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const H = frame.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (!(W > 0 && H > 0)) return;
    // Animerende tekst (wisselende glyphs, klauterende letters) krijgt ruimte via --wv-fit.
    const target = parseFloat(node.style.getPropertyValue("--wv-fit")) || 0.92;
    // Horizontale ruimte voor bewegende lagen die niet gemeten worden (rgbsplit ±6px).
    const reserve = parseFloat(node.style.getPropertyValue("--wv-reserve")) || 0;
    let font = start;
    for (let i = 0; i < 3; i++) {
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (const box of inkBoxes(node, true)) {
            if (!box.width && !box.height) continue;
            left = Math.min(left, box.left); right = Math.max(right, box.right);
            top = Math.min(top, box.top); bottom = Math.max(bottom, box.bottom);
        }
        if (left === Infinity) return;
        // target (standaard 92%) van elke as, horizontaal min de reserve.
        const ratio = Math.min(Math.min(W * target, W - reserve) / (right - left), (H * target) / (bottom - top));
        if (ratio >= 1 && ratio < 1.02) break;   // te groot wordt altijd verkleind
        font = Math.max(8, Math.floor(font * ratio));
        node.style.setProperty("--wv-font", `${font}px`);
    }
}

/**
 * Vakken die samen de inktvlek van een node vormen: de node zelf als hij tekent, anders
 * zijn kind-elementen, en bij alleen tekst (scramble) de tekst zelf via een Range.
 */
function inkBoxes(node, stillOnly = false) {
    if (paintsItself(node)) return [node.getBoundingClientRect()];
    // stillOnly: bewegende lagen (absoluut gepositioneerd, zoals de rgbsplit-kleuren) niet meten;
    // daarvoor houdt fitDisplayFont horizontaal ruimte vrij.
    const children = [...node.children];
    const still = stillOnly ? children.filter((child) => getComputedStyle(child).position !== "absolute") : children;
    if (still.length) return still.map((child) => child.getBoundingClientRect());
    const range = document.createRange();
    range.selectNodeContents(node);
    return [range.getBoundingClientRect()];
}

/** Wacht n animatieframes, maar nooit langer dan 150ms: in een verborgen tab komen er geen frames. */
const nextFrames = (n) => new Promise((resolve) => {
    const timer = setTimeout(resolve, 150);
    const step = () => (n-- <= 0 ? (clearTimeout(timer), resolve()) : requestAnimationFrame(step));
    step();
});

/**
 * Past de inhoud op ware grootte in het frame? Geeft "hoog" of "breed" terug als niet.
 * Te breed = de inkt of de min-content (waaronder letters geplet worden) is breder dan het
 * frame; bewust afkappende inhoud (overflow:hidden + nowrap, zoals de ticker) telt niet.
 */
function misfit(frame, node) {
    const style = getComputedStyle(frame);
    const f = frame.getBoundingClientRect();
    const box = {
        left: f.left + parseFloat(style.paddingLeft), right: f.right - parseFloat(style.paddingRight),
        top: f.top + parseFloat(style.paddingTop), bottom: f.bottom - parseFloat(style.paddingBottom),
    };
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const b of inkBoxes(node)) {
        if (!b.width && !b.height) continue;
        left = Math.min(left, b.left); right = Math.max(right, b.right);
        top = Math.min(top, b.top); bottom = Math.max(bottom, b.bottom);
    }
    if (left === Infinity) return null;
    if (top < box.top - 1 || bottom > box.bottom + 1 || frame.scrollHeight > frame.clientHeight + 1) return "hoog";
    const clipsByDesign = [...node.querySelectorAll("*")].some((el) => {
        const s = getComputedStyle(el);
        return s.overflow === "hidden" && s.whiteSpace === "nowrap";
    });
    if (left < box.left - 1 || right > box.right + 1) return "breed";
    if (!clipsByDesign) {
        node.style.width = "min-content";
        const minContent = node.getBoundingClientRect().width;
        node.style.width = "";
        if (minContent > box.right - box.left + 1) return "breed";
    }
    return null;
}

/** Tekent de host zelf (rand of achtergrond), dan hoort zijn hele vak bij de inktvlek. */
function paintsItself(node) {
    const style = getComputedStyle(node);
    const border = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(style[`border${side}Width`]) > 0);
    const fill = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
    return border || fill || style.backgroundImage !== "none";
}

/**
 * Meet de inktvlek van `node` (ongeschaald, in node-coördinaten) en zet één transform
 * die haar gecentreerd en zo groot mogelijk in `frame` legt. Normaal tellen enkel de
 * kinderen, zodat een klein svg'tje in een brede host echt groeit; een host die zelf
 * tekent (rand/achtergrond, zoals readout) telt als geheel.
 */
function fit(frame, node, state) {
    const W = frame.clientWidth;
    const H = frame.clientHeight;
    if (!W || !H) return;
    const s = state.scale;
    const nr = node.getBoundingClientRect();
    const own = paintsItself(node);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const box of own ? [nr] : [...node.children].map((child) => child.getBoundingClientRect())) {
        if (!box.width && !box.height) continue;
        left = Math.min(left, box.left);
        top = Math.min(top, box.top);
        right = Math.max(right, box.right);
        bottom = Math.max(bottom, box.bottom);
    }
    if (left === Infinity) return;
    const x = (left - nr.left) / s;
    const y = (top - nr.top) / s;
    const w = Math.max(1, (right - left) / s);
    const h = Math.max(1, (bottom - top) / s);
    const scale = Math.min((W * MARGIN) / w, (H * MARGIN) / h, MAX_SCALE);
    const tx = W / 2 - node.offsetLeft - scale * (x + w / 2);
    const ty = H / 2 - node.offsetTop - scale * (y + h / 2);
    node.style.transformOrigin = "0 0";
    node.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${scale.toFixed(4)})`;
    state.scale = scale;
}

/**
 * Slim vullen van het raster: een volgorde waarin flow-grid (grid-auto-flow: row, zonder
 * dense) geen gaten laat. Vult steeds de eerste vrije cel met het eerstvolgende item dat
 * daar past, zodat de catalogusvolgorde zo veel mogelijk blijft. blocks.system blijft zo
 * ongewijzigd: enkel de volgorde van add() verandert.
 * @param {Array<{span:[number,number]}>} items
 * @param {number} columns
 * @returns {Array} dezelfde items, herordend
 */
export function packOrder(items, columns) {
    if (!Number.isInteger(columns) || columns < 1) throw new TypeError(`Ongeldig aantal kolommen: ${columns}`);
    const wide = items.filter((item) => item.span[0] > columns);
    if (wide.length) throw new RangeError(`${wide.length} item(s) breder dan ${columns} kolommen`);
    const taken = new Set();
    const key = (x, y) => `${x},${y}`;
    const fits = (x, y, [w, h]) => {
        if (x + w > columns) return false;
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (taken.has(key(x + dx, y + dy))) return false;
        return true;
    };
    const remaining = [...items];
    const order = [];
    let cell = 0;
    while (remaining.length) {
        while (taken.has(key(cell % columns, Math.floor(cell / columns)))) cell++;
        const x = cell % columns;
        const y = Math.floor(cell / columns);
        const index = remaining.findIndex((item) => fits(x, y, item.span));
        if (index === -1) {
            taken.add(key(x, y));   // niets past hier: onvermijdelijk gat, de browser slaat het ook over
            continue;
        }
        const [item] = remaining.splice(index, 1);
        const [w, h] = item.span;
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) taken.add(key(x + dx, y + dy));
        order.push(item);
    }
    return order;
}

export function registerWaveElements(system, options = {}) {
    const {
        engine = globalThis.VanillaWaves,
        adapter: adapterId = "wave-element",
        prefix = "wv-",
        fill = "native",
        cell = SOURCE_CELL,
    } = options;
    if (!system || typeof system.registerAdapter !== "function" || typeof system.register !== "function") {
        throw new TypeError("registerWaveElements(system): verwacht een blocks.system-instantie.");
    }
    if (!FILLS.includes(fill)) throw new TypeError(`Ongeldige fill: ${fill} (kies ${FILLS.join(" of ")})`);
    const native = fill === "native";
    // Eerst alles valideren, dan pas registreren: een weigering laat niets half achter.
    if (!ID.test(adapterId)) throw new TypeError(`Ongeldig adapter-id: ${adapterId}`);
    if (!ID.test(`${prefix}x`)) throw new TypeError(`Ongeldige prefix: ${prefix}`);
    if (system.listAdapters?.().includes(adapterId)) throw new Error(`Adapter bestaat al: ${adapterId}`);
    const taken = ELEMENTS.map((entry) => prefix + entry.id).filter((id) => system.get?.(id));
    if (taken.length) throw new Error(`Blocks bestaan al: ${taken.join(", ")}`);
    registerElements(engine);

    const frames = new WeakMap();   // frame → { node, observer }

    system.registerAdapter(adapterId, {
        mount({ block, host, settings }) {
            const frame = document.createElement("div");
            frame.className = native ? "wv-element wv-element--native" : "wv-element";
            const node = document.createElement("div");
            applySettings(node, settings);
            node.setAttribute("data-wv", block.renderer);
            frame.appendChild(node);
            host.appendChild(frame);
            engine.init(node);
            if (!node.classList.contains("wv--ready")) {
                frame.remove();
                throw new Error(`Engine kon '${block.renderer}' niet starten.`);
            }
            if (native) {
                // 1:1: geen transform. De hoogte regelt add() via block.fitHeight().
                frames.set(frame, { node, observer: null });
                return frame;
            }
            const state = { scale: 1 };
            const refit = () => fit(frame, node, state);
            // Frame volgt het block (span, venster); node volgt de renderer. Een transform
            // verandert geen layoutmaat, dus dit kan niet in een lus schieten.
            const observer = typeof ResizeObserver === "function" ? new ResizeObserver(refit) : null;
            observer?.observe(frame);
            observer?.observe(node);
            // Ook de kinderen: een renderer die een glyph of tekst wisselt (hazard) verandert
            // van maat zonder dat node of frame dat doen.
            for (const child of node.children) observer?.observe(child);
            refit();
            frames.set(frame, { node, observer });
            return frame;
        },
        unmount({ node: frame }) {
            const entry = frames.get(frame);
            if (!entry) return;
            entry.observer?.disconnect();
            engine.destroy(entry.node);
            frames.delete(frame);
        },
        snippet({ block, settings }) {
            return `<div data-wv="${block.renderer}"${settingsToHtml(settings)}></div>\n\n` +
                `<script src="${VANILLA_WAVES_URL}"><\/script>\n` +
                `<script type="module">\n` +
                `import { registerElements } from "./vanilla.waves_elements/elements.mjs";\n` +
                `registerElements(); VanillaWaves.init();\n` +
                `<\/script>`;
        },
    });

    for (const entry of ELEMENTS) {
        system.register({
            id: prefix + entry.id,
            adapter: adapterId,
            renderer: entry.id,
            label: entry.label,
            medium: "html",
            category: entry.category,
            description: entry.description,
            defaults: entry.defaults,
            attributes: entry.attributes,
            span: entry.span,
            requires: ["VanillaWaves"],
        });
    }

    // block-id → { block, host } van inhoud die via add() is gemount.
    const mounted = new Map();
    let boundField = null;

    function release(id) {
        const record = mounted.get(id);
        if (!record) return;
        mounted.delete(id);
        record.observer?.disconnect();
        system.unmount(record.host);
    }

    function onChange(event) {
        const { type, ids = [] } = event.detail || {};
        if (type !== "remove") return;
        for (const id of ids) {
            // Alleen opruimen als het eigen block echt weg is (twee systemen kunnen ids delen).
            if (mounted.get(id)?.block.element.isConnected === false) release(id);
        }
    }

    function bindField() {
        const field = system.field;
        if (field === boundField) return;
        if (boundField) boundField.removeEventListener("blocks:change", onChange);
        if (field) field.addEventListener("blocks:change", onChange);
        boundField = field;
    }

    function validSpan(span) {
        return Array.isArray(span) && span.length === 2 && span.every((n) => Number.isInteger(n) && n > 0);
    }

    /**
     * Voeg één element toe als block: add() + mount() + standaard-span.
     * Faalt iets, dan wordt het block weer verwijderd: nooit een half block.
     * @param {string} id elementnaam ("barcode") of definitie-id ("wv-barcode")
     * @param {object} settings data-*-opties bovenop de defaults (kebab-case)
     * @param {object} addOptions opties voor system.add(); span: [c, r] (standaard het
     *   catalogusformaat), "auto" (hoogte volgt de inhoud) of false;
     *   accent: een van ACCENTS (kaartkleur uit de bron)
     */
    async function add(id, settings = {}, addOptions = {}) {
        const name = id.startsWith(prefix) ? id.slice(prefix.length) : id;
        const entry = getElement(name);
        if (!entry) throw new Error(`Onbekend wave-element: ${id}`);
        const { span: given, accent = "", ...rest } = addOptions;
        const free = system.layout === "free";         // free-layout kent geen spans
        // Drie wegen (native):
        //   - vast formaat (standaard): opgegeven span, anders het catalogusformaat — vulling01;
        //   - span: "auto": kolommen uit de catalogus, hoogte volgt de inhoud (fitHeight);
        //   - span: false of free-layout: geen formaat.
        // Schaalmodus: catalogusspan, inhoud geschaald.
        const autoHeight = given === "auto";
        const requested = autoHeight ? undefined : given ?? (native ? entry.span : undefined);
        const fixed = native && !free && requested !== undefined && requested !== false;
        const auto = native && !free && autoHeight;
        let span = autoHeight ? [entry.span[0], 1] : requested ?? entry.span;
        if (span !== false && !validSpan(span)) throw new TypeError(`Ongeldige span voor ${id}: ${span}`);
        // Vast formaat: nooit kleiner dan het minimumformaat — microtekst wordt niet geplet.
        const min = fixed ? MIN_SPAN[name] : null;
        if (min && (span[0] < min[0] || span[1] < min[1])) {
            span = [Math.max(span[0], min[0]), Math.max(span[1], min[1])];
            if (span[0] > system.columns) {
                throw new RangeError(`${name} heeft minstens ${min[0]} kolommen nodig; het raster heeft er ${system.columns}.`);
            }
        }
        if (accent && !ACCENTS.includes(accent)) throw new TypeError(`Onbekend accent: ${accent} (kies uit ${ACCENTS.join(", ")})`);
        // Een accent zet inkt én papier; alleen de native kaart tekent papier.
        if (accent && !native) throw new TypeError(`accent vereist fill: "native" (anders onzichtbare inkt op het blockpapier)`);
        const block = system.add("", { title: entry.label, ...rest });
        bindField();
        const record = { block, host: block.content, observer: null };
        let mountedOk = false;
        try {
            if (span && !free) block.span(span[0], span[1]);
            if (fixed) {
                await mountFixed(record, name, span, settings, accent);
                mountedOk = true;
            } else {
                await system.mount(prefix + name, block.content, settings);
                mountedOk = true;
                if (!block.element.isConnected) throw new Error(`Block ${block.id} verdween tijdens het mounten.`);
                const frame = block.content.querySelector(":scope > .wv-element");
                if (accent) frame.classList.add(`wv-accent--${accent}`);
                if (auto) {
                    widenToSourceCell(block, entry.span[0]);
                    record.observer = followContentHeight(block, frame.firstElementChild);
                    block.fitHeight();
                }
            }
        } catch (error) {
            // Nooit een half block: observer los, engine-entry vrij, block weg.
            record.observer?.disconnect();
            if (mountedOk || block.content.querySelector(":scope > .wv-element")) system.unmount(block.content);
            if (block.element.isConnected) block.remove();
            throw error;
        }
        mounted.set(block.id, record);
        return block;
    }

    /** Binnenmaat (px) die een native frame in dit block krijgt: content-box min framepadding. */
    function measureInner(block) {
        const content = block.content;
        const style = getComputedStyle(content);
        return {
            width: content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - FRAME_PAD,
            height: content.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - FRAME_PAD,
        };
    }

    /** Alleen de data-*-instellingen (aantallen) van een vulling, zonder CSS-variabelen. */
    function countsOf(fill) {
        return JSON.stringify(Object.entries(fill).filter(([key]) => !key.startsWith("--")));
    }

    /**
     * Vast formaat: opbouw uit vulling01 op de gemeten binnenmaat, display-letter gepast.
     * Verandert het block van maat (resize, venster, raster), dan volgt de opbouw: andere
     * aantallen → opnieuw mounten; alleen andere maten → CSS-variabelen en letter opnieuw.
     * Eigen instellingen winnen altijd.
     */
    async function mountFixed(record, name, span, settings, accent) {
        const { block } = record;
        let fill = vulling01(name, span[0], span[1], measureInner(block));
        let counts = countsOf(fill);
        const decorate = () => {
            const frame = block.content.querySelector(":scope > .wv-element");
            frame.classList.add("wv-element--vast");
            if (accent) frame.classList.add(`wv-accent--${accent}`);
            const node = frame.firstElementChild;
            fitDisplayFont(frame, node);
            // Veel renderers vullen hun tekst pas in de eerste engine-frame (hazard-label,
            // scramble-tekens): daarna nog eens passen.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (block.element.isConnected && frame.isConnected) fitDisplayFont(frame, node);
            }));
            return frame;
        };
        await system.mount(prefix + name, block.content, { ...fill, ...settings });
        if (!block.element.isConnected) throw new Error(`Block ${block.id} verdween tijdens het mounten.`);
        let frame = decorate();
        // Past het element op ware grootte niet in dit formaat (bv. een rij van 70px-cellen
        // laat 16px over), dan groeit het block met een rij of kolom — nooit krimpen van
        // lijnen of microtekst. Kan het raster niet groeien: duidelijk weigeren.
        for (let tries = 0; tries < 8; tries++) {
            await nextFrames(2);
            if (!block.element.isConnected) throw new Error(`Block ${block.id} verdween tijdens het mounten.`);
            const problem = misfit(frame, frame.firstElementChild);
            if (!problem) break;
            const grow = problem === "hoog" ? [span[0], span[1] + 1] : [span[0] + 1, span[1]];
            if (grow[0] > system.columns || grow[1] > system.rows) {
                throw new RangeError(`${name} past niet op ware grootte in ${span[0]}×${span[1]} (te ${problem}); het raster kan niet groeien.`);
            }
            span = grow;
            block.span(span[0], span[1]);
            fill = vulling01(name, span[0], span[1], measureInner(block));
            counts = countsOf(fill);
            await system.remount(prefix + name, block.content, { ...fill, ...settings });
            frame = decorate();
        }
        if (typeof ResizeObserver !== "function") return;
        let pending = 0;
        let busy = false;
        const follow = () => {
            if (pending) return;
            pending = requestAnimationFrame(async () => {
                pending = 0;
                if (busy || !block.element.isConnected) return;
                const size = measureInner(block);
                if (!(size.width > 0 && size.height > 0)) return;   // gedockt, geminimaliseerd, verborgen
                const next = vulling01(name, span[0], span[1], size);
                if (countsOf(next) !== counts) {
                    busy = true;
                    counts = countsOf(next);
                    fill = next;
                    record.observer.unobserve(frame);
                    await system.remount(prefix + name, block.content, { ...next, ...settings });
                    frame = decorate();
                    record.observer.observe(frame);
                    busy = false;
                } else {
                    const node = frame.firstElementChild;
                    for (const [key, value] of Object.entries(next)) {
                        if (key.startsWith("--wv-") && !(key in settings)) node.style.setProperty(key, String(value));
                    }
                    fitDisplayFont(frame, node);
                }
            });
        };
        record.observer = new ResizeObserver(follow);
        record.observer.observe(frame);
    }

    /**
     * Native: de catalogusspan is ontworpen op broncellen van `cell` px. Zijn de kolommen
     * smaller, dan krijgt het block kolommen bij tot die breedte past (of het raster op is).
     */
    function widenToSourceCell(block, columns) {
        const need = columns * cell + (columns - 1) * SOURCE_GAP;
        let c = columns;
        while (block.element.getBoundingClientRect().width < need - 0.5 && c < system.columns) {
            block.span(++c, 1);
        }
        // Daarna: nooit samendrukken. Min-content = de breedte waaronder het element
        // letters of vakjes zou pletten. Is die breder dan het hele veld, dan kapt het
        // element bewust af (ticker) en telt ze niet.
        const frame = block.content.querySelector(":scope > .wv-element");
        const node = frame.firstElementChild;
        node.style.width = "min-content";
        const minContent = node.getBoundingClientRect().width;
        node.style.width = "";
        const style = getComputedStyle(frame);
        const inner = () => frame.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (minContent > (system.field?.clientWidth || Infinity)) return;
        while (inner() < minContent - 0.5 && c < system.columns) block.span(++c, 1);
    }

    /**
     * Native: hoogte volgt de inhoud — ook bij fonts laden, smaller venster, undock of een
     * renderer die van maat wisselt. Observeert de kinderen (de node zelf is door
     * min-height minstens blockhoog en ziet krimpen niet). Eén meting per frame;
     * fitHeight verandert de kinderen niet, dus geen lus. Verborgen veld: overslaan.
     */
    function followContentHeight(block, node) {
        if (typeof ResizeObserver !== "function") return null;
        // blocks.system fitHeight() roept altijd drag.stop() aan (systeembreed). Daarom:
        // alleen refitten als de inhoudshoogte echt veranderde, en nooit tijdens een sleep.
        let pending = 0;
        let lastHeight = contentHeight(node);
        let waitingForDrop = false;
        const refit = () => {
            if (pending) return;
            pending = requestAnimationFrame(() => {
                pending = 0;
                if (!block.element.isConnected || !system.field?.clientHeight) return;
                if (system.field.hasAttribute("data-dragging")) {
                    if (!waitingForDrop) {
                        waitingForDrop = true;
                        addEventListener("pointerup", () => { waitingForDrop = false; refit(); }, { once: true });
                    }
                    return;
                }
                const height = contentHeight(node);
                if (Math.abs(height - lastHeight) < 1) return;
                lastHeight = height;
                try {
                    block.fitHeight();
                } catch (error) {
                    console.warn(`vanilla.waves_elements: fitHeight(${block.id}) mislukt`, error);
                }
            });
        };
        const observer = new ResizeObserver(refit);
        observer.observe(node);
        for (const child of node.children) observer.observe(child);
        return observer;
    }

    return Object.freeze({
        adapter: adapterId,
        prefix,
        elements: ELEMENTS,
        add,
        /** Aantal live gemounte elementen via add(); voor tests en opruimcontrole. */
        get size() { return mounted.size; },
    });
}
