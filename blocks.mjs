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

export const VANILLA_WAVES_URL = "https://cdn.jsdelivr.net/gh/seb-prjcts-be/vanilla.waves@v0.3.1/vanilla.waves.min.js";

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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
}

function settingsToHtml(settings) {
    return settingEntries(settings)
        .map(([key, value]) => (value === true ? ` data-${key}` : ` data-${key}="${escapeAttribute(value)}"`))
        .join("");
}

const MARGIN = 0.9;   // inktvlek vult 90% van het frame

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
    } = options;
    if (!system || typeof system.registerAdapter !== "function" || typeof system.register !== "function") {
        throw new TypeError("registerWaveElements(system): verwacht een blocks.system-instantie.");
    }
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
            frame.className = "wv-element";
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
     * @param {object} addOptions opties voor system.add(); span: [c, r] of false
     */
    async function add(id, settings = {}, addOptions = {}) {
        const name = id.startsWith(prefix) ? id.slice(prefix.length) : id;
        const entry = getElement(name);
        if (!entry) throw new Error(`Onbekend wave-element: ${id}`);
        const { span = entry.span, ...rest } = addOptions;
        if (span !== false && !validSpan(span)) throw new TypeError(`Ongeldige span voor ${id}: ${span}`);
        const block = system.add("", { title: entry.label, ...rest });
        bindField();
        try {
            if (span && system.layout !== "free") block.span(span[0], span[1]);
            await system.mount(prefix + name, block.content, settings);
        } catch (error) {
            if (block.element.isConnected) block.remove();
            throw error;
        }
        if (!block.element.isConnected) {
            // Tijdens de mount verwijderd: inhoud meteen vrijgeven, anders lekt de engine-entry.
            system.unmount(block.content);
            throw new Error(`Block ${block.id} verdween tijdens het mounten.`);
        }
        mounted.set(block.id, { block, host: block.content });
        return block;
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
