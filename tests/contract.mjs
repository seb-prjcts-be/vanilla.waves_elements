// Contracttest voor vanilla.waves_elements — draait zonder browser (node tests/contract.mjs).
// Alles wat hier getest wordt, is duck-typed: geen echte engine, geen echt blocks.system.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ELEMENTS, RENDERERS, getElement, registerElements } from "../elements.mjs";
import { packOrder, registerWaveElements } from "../blocks.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

// 1. Catalogus: elk element heeft precies één renderer, en omgekeerd.
const ids = ELEMENTS.map((entry) => entry.id);
assert.equal(new Set(ids).size, ids.length, "element-id's zijn uniek");
assert.deepEqual([...ids].sort(), Object.keys(RENDERERS).sort(), "catalogus en renderers dekken elkaar");
for (const entry of ELEMENTS) {
    assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${entry.id}: geldig blocks-id`);
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.defaults), `${entry.id}: bevroren`);
    assert.ok(Array.isArray(entry.span) && entry.span.length === 2, `${entry.id}: standaard-span`);
    for (const key of Object.keys(entry.defaults)) {
        assert.ok(entry.attributes.includes(key), `${entry.id}: default '${key}' staat in attributes`);
    }
    const renderer = RENDERERS[entry.id];
    assert.equal(typeof renderer.create, "function", `${entry.id}: create()`);
}
assert.equal(getElement("barcode").id, "barcode");
assert.equal(getElement("bestaat-niet"), null);

// 2. registerElements zet elke renderer op de meegegeven engine, en is idempotent.
function fakeEngine() {
    const types = new Map();
    const calls = { init: [], destroy: [] };
    return {
        types, calls,
        register(name, def) { types.set(name, def); return this; },
        init(node) { calls.init.push(node); return this; },
        destroy(node) { calls.destroy.push(node); return this; },
    };
}
const engine = fakeEngine();
registerElements(engine);
registerElements(engine);
assert.deepEqual([...engine.types.keys()].sort(), [...ids].sort(), "alle renderers op de engine");
assert.throws(() => registerElements({}), /register/, "engine zonder register() weigert");

// 3. De brug naar blocks.system: registreert één adapter plus één definitie per element.
function fakeSystem() {
    const adapters = new Map();
    const blocks = new Map();
    return {
        adapters, blocks,
        registerAdapter(id, adapter) { adapters.set(id, adapter); return this; },
        register(definition) { blocks.set(definition.id, definition); return this; },
    };
}
const system = fakeSystem();
const bridge = registerWaveElements(system, { engine: fakeEngine() });
assert.ok(system.adapters.has("wave-element"), "adapter 'wave-element' geregistreerd");
const adapter = system.adapters.get("wave-element");
assert.equal(typeof adapter.mount, "function");
assert.equal(typeof adapter.unmount, "function");
assert.equal(typeof adapter.snippet, "function");
assert.deepEqual([...system.blocks.keys()].sort(), ids.map((id) => `wv-${id}`).sort(), "definities met prefix wv-");
const def = system.blocks.get("wv-barcode");
assert.equal(def.adapter, "wave-element");
assert.equal(def.renderer, "barcode");
assert.equal(def.medium, "html");
assert.equal(typeof bridge.add, "function", "brug biedt add(system-blockcontent)-helper");

// 4. Snippet is een data-wv-marker, geen geserialiseerde live DOM.
const snippet = adapter.snippet({ block: def, settings: { seed: "13", scan: true, bars: 48 } });
assert.match(snippet, /data-wv="barcode"/);
assert.match(snippet, /data-seed="13"/);
assert.match(snippet, / data-scan[ >]/);
assert.doesNotMatch(snippet, /<i\b/, "geen live kinderen in de snippet");

// 5. Laaggrenzen: de brug importeert blocks.system niet, de elementen kennen geen blocks.
assert.doesNotMatch(read("blocks.mjs"), /^import[^;]*blocks\.system/m, "brug importeert blocks.system niet");
assert.doesNotMatch(read("elements.mjs"), /blocks/i, "elementlaag kent blocks.system niet");
assert.doesNotMatch(read("elements.mjs"), /requestAnimationFrame|IntersectionObserver/, "geen eigen loop: die zit in de engine");

// 6. De drie bestaande projecten blijven ongemoeid: geen verwijzing naar bestanden erbinnen die we zouden wijzigen.
for (const file of ["elements.mjs", "blocks.mjs"]) {
    assert.doesNotMatch(read(file), /buiilding_blocks_elements/, `${file}: geen runtime-koppeling aan de testcollectie`);
}

// 7. packOrder: volgorde zodat CSS grid-auto-flow:row (zonder dense) geen gaten laat.
function simulate(items, columns) {
    // Sparse auto-placement zoals de browser: cursor schuift enkel vooruit.
    const taken = new Set();
    const free = (c, r, w, h) => {
        if (c + w > columns) return false;
        for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (taken.has(`${x},${y}`)) return false;
        return true;
    };
    let cursor = 0;
    let rows = 0;
    for (const { span: [w, h] } of items) {
        let pos = cursor;
        while (!free(pos % columns, Math.floor(pos / columns), w, h)) pos++;
        const c = pos % columns, r = Math.floor(pos / columns);
        for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) taken.add(`${x},${y}`);
        cursor = pos;
        rows = Math.max(rows, r + h);
    }
    let holes = 0;
    for (let y = 0; y < rows - 1; y++) for (let x = 0; x < columns; x++) if (!taken.has(`${x},${y}`)) holes++;
    return { rows, holes };
}
for (const columns of [4, 6, 8]) {
    const packed = packOrder(ELEMENTS, columns);
    assert.equal(packed.length, ELEMENTS.length, `packOrder(${columns}) behoudt alle elementen`);
    assert.deepEqual(new Set(packed), new Set(ELEMENTS), `packOrder(${columns}) is een permutatie`);
    const { holes } = simulate(packed, columns);
    assert.equal(holes, 0, `packOrder(${columns}): geen gaten boven de laatste rij`);
}
assert.ok(simulate(ELEMENTS, 8).holes > 0, "zonder packOrder ontstaan wel gaten (test is scherp)");

console.log(`contract ok — ${ELEMENTS.length} elementen, adapter 'wave-element'`);
