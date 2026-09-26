/**
 * vanilla.waves_elements — canvasloze grafische elementen bovenop de vanilla.waves-engine.
 *
 * Elk element is een renderer volgens het engine-contract:
 *   create(node, opts, helpers) → state, optioneel update(state, t) en destroy(state, node).
 * De engine (VanillaWaves.register/init/destroy uit vanilla.waves.min.js) bezit de ene
 * rAF-loop, de zichtbaarheid en reduced motion. Deze laag bezit enkel de mapping
 * "wavegetal → DOM". Richting is één kant op: elements → engine.
 *
 * Bron: de renderers komen ongewijzigd uit de lokale testcollectie (wel.js, waves-loader.js);
 * alleen de klassen gingen van wel- naar wv- en module-lokale helpers werden expliciet.
 */

const norm = (v) => (v < -1 ? 0 : v > 1 ? 1 : (v + 1) / 2);
const NS = "http://www.w3.org/2000/svg";
const pad = (v, n) => { v = String(Math.floor(v)); while (v.length < n) v = "0" + v; return v; };

function svg(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
}

const COMMON = ["seed", "speed", "group", "frequency", "shift", "shift-interval", "shift-duration", "decorative"];

function define(id, label, category, description, defaults, attributes, span) {
    return Object.freeze({
        id,
        label,
        category,
        description,
        defaults: Object.freeze({ ...defaults }),
        attributes: Object.freeze(Array.from(new Set([...COMMON, ...attributes]))),
        span: Object.freeze([...span]),
    });
}

/* ================================================================ RENDERERS == */

const SEG7 = ["abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg"];
const SEGLINE = { a: [3, 2, 9, 2], b: [9, 2, 9, 9.4], c: [9, 10.6, 9, 18], d: [3, 18, 9, 18], e: [3, 10.6, 3, 18], f: [3, 2, 3, 9.4], g: [3, 10, 9, 10] };
const HAZ = ["⚠", "☢", "☣", "⚡", "♻", "✦", "⬡", "⌖"];
const STAT = ["LINK", "SYNC", "CORE", "DATA", "PWR", "NET", "I/O", "AUX"];
const BOOTLINES = ["INIT CORE", "MOUNT FS", "LINK NET", "LOAD CFG", "SPIN DISK", "CHK SIG", "WARM CACHE", "READY"];
const KEYCH = "0123456789ABCDEF";
const SPECK = ["FREQ", "GAIN", "TEMP", "LOAD", "REV", "BIAS", "FLUX"];

export const RENDERERS = Object.freeze({
    loader: Object.freeze({
        create(node, o, h) {
            const grid = Math.max(2, Math.round(h.num(o.grid, 4)) || 4);
            const text = o.text || "LOADING";
            const sampler = h.makeSampler({
                shiftInterval: h.num(o.shiftInterval, 1),
                shiftDuration: h.num(o.shiftDuration, 3),
            });
            const wrap = h.el("div", "wv-loader");
            wrap.style.setProperty("--wv-loader-grid", grid);
            const cells = [];
            for (let i = 0; i < grid * grid; i++) cells.push(wrap.appendChild(h.el("span")));
            node.appendChild(wrap);
            return { cells, chars: new Array(grid * grid).fill(""), grid, text, sampler };
        },
        update(s, t) {
            const len = s.text.length;
            let i = 0;
            for (let r = 0; r < s.grid; r++) {
                for (let c = 0; c < s.grid; c++, i++) {
                    const v = s.sampler.sample(c * 0.5 + t, t + r * 0.9);
                    const idx = Math.min(len - 1, Math.max(0, Math.floor(((v + 1) / 2) * len)));
                    const ch = s.text[idx];
                    if (ch !== s.chars[i]) {
                        s.chars[i] = ch;
                        s.cells[i].textContent = ch;
                    }
                }
            }
        },
    }),
    barcode: Object.freeze({
        create(node, o, h) {
            const n = h.num(o.bars, 42);
            const sampler = h.makeSampler({ shift: false });
            const wrap = h.el("div", "wv-barcode");
            for (let i = 0; i < n; i++) {
                const bar = h.el("i");
                const w = 1 + Math.round(h.norm(sampler.sample(i * 0.37, 0)) * 3);
                bar.style.flex = "0 0 " + w + "px";
                if (i % 2) bar.style.background = "transparent";
                wrap.appendChild(bar);
            }
            node.appendChild(wrap);
            if (o.scan !== undefined) {
                const scan = h.el("b", "wv-barcode__scan");
                wrap.appendChild(scan);
                return { scan, sampler };
            }
            return { scan: null };
        },
        update(s, t) {
            if (!s.scan) return;
            s.scan.style.left = norm(s.sampler.sample(t, t)) * 100 + "%";
        },
    }),
    bars: Object.freeze({
        create(node, o, h) {
            const n = h.num(o.bars, 16);
            const sampler = h.makeSampler();
            const wrap = h.el("div", "wv-bars");
            const bars = [];
            for (let i = 0; i < n; i++) bars.push(wrap.appendChild(h.el("i")));
            node.appendChild(wrap);
            return { bars, sampler, n };
        },
        update(s, t) {
            for (let i = 0; i < s.n; i++) {
                const v = 0.12 + norm(s.sampler.sample(i * 0.55, t)) * 0.88;
                s.bars[i].style.transform = "scaleY(" + v.toFixed(3) + ")";
            }
        },
    }),
    wave: Object.freeze({
        create(node, o, h) {
            const n = h.num(o.points, 64);
            const sampler = h.makeSampler();
            const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svgEl.setAttribute("viewBox", "0 0 100 30");
            svgEl.setAttribute("preserveAspectRatio", "none");
            svgEl.setAttribute("class", "wv-wave");
            const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            svgEl.appendChild(line);
            node.appendChild(svgEl);
            return { line, sampler, n };
        },
        update(s, t) {
            const n = s.n, step = 100 / (n - 1);
            let pts = "";
            for (let i = 0; i < n; i++) {
                const v = s.sampler.sample(i * 0.30 - t, t);
                const y = 15 - Math.max(-1, Math.min(1, v)) * 13;
                pts += (i * step).toFixed(1) + "," + y.toFixed(1) + " ";
            }
            s.line.setAttribute("points", pts);
        }
    }),
    matrix: Object.freeze({
        create(node, o, h) {
            const g = Math.max(3, h.num(o.grid, 9));
            const sampler = h.makeSampler();
            node.style.setProperty("--wv-mx", g);
            const wrap = h.el("div", "wv-matrix");
            const dots = [];
            for (let i = 0; i < g * g; i++) { const d = h.el("i"); wrap.appendChild(d); dots.push(d); }
            node.appendChild(wrap);
            if (o.live === undefined) {
                let i = 0;
                for (let r = 0; r < g; r++)
                    for (let c = 0; c < g; c++, i++) {
                        const on = sampler.sample(c * 0.7, r * 0.7) > 0;
                        dots[i].style.opacity = on ? 1 : 0.08;
                    }
            }
            return { dots, sampler, g, prev: new Array(g * g).fill(-1), live: o.live !== undefined };
        },
        update(s, t) {
            if (!s.live) return;
            const time = t * 0.6;
            let i = 0;
            for (let r = 0; r < s.g; r++)
                for (let c = 0; c < s.g; c++, i++) {
                    const v = s.sampler.sample(c * 0.7 + time, time + r * 0.7) > 0 ? 1 : 0;
                    if (v !== s.prev[i]) { s.prev[i] = v; s.dots[i].style.opacity = v ? 1 : 0.08; }
                }
        },
    }),
    dither: Object.freeze({
        create(node, o, h) {
            const g = Math.max(3, h.num(o.grid, 6));
            const sampler = h.makeSampler();
            node.style.setProperty("--wv-mx", g);
            const wrap = h.el("div", "wv-dither");
            const cells = [];
            for (let i = 0; i < g * g; i++) { const sp = h.el("span"); wrap.appendChild(sp); cells.push(sp); }
            node.appendChild(wrap);
            return { cells, sampler, g, text: o.text || " ·:+*oO#@", prev: new Array(g * g).fill("") };
        },
        update(s, t) {
            const len = s.text.length;
            let i = 0;
            for (let r = 0; r < s.g; r++)
                for (let c = 0; c < s.g; c++, i++) {
                    const v = s.sampler.sample(c * 0.6 + t, t + r * 0.6);
                    let idx = Math.floor(norm(v) * len);
                    if (idx >= len) idx = len - 1;
                    const ch = s.text[idx];
                    if (ch !== s.prev[i]) { s.prev[i] = ch; s.cells[i].textContent = ch; }
                }
        }
    }),
    readout: Object.freeze({
        create(node, o, h) {
            const m = h.num(o.len, 8);
            const sampler = h.makeSampler();
            node.classList.add("wv-readout");
            const cells = [];
            for (let i = 0; i < m; i++) { const sp = h.el("span"); node.appendChild(sp); cells.push(sp); }
            return { cells, sampler, m, text: o.text || "0123456789ABCDEF", prev: new Array(m).fill("") };
        },
        update(s, t) {
            const len = s.text.length;
            for (let i = 0; i < s.m; i++) {
                const v = s.sampler.sample(i * 0.7, t + i * 0.13);
                let idx = Math.floor(norm(v) * len);
                if (idx >= len) idx = len - 1;
                const ch = s.text[idx];
                if (ch !== s.prev[i]) { s.prev[i] = ch; s.cells[i].textContent = ch; }
            }
        }
    }),
    reticle: Object.freeze({
        create(node, o, h) {
            const sampler = h.makeSampler();
            node.innerHTML =
                '<svg viewBox="0 0 48 48" class="wv-reticle">' +
                '<g class="wv-reticle__spin">' +
                '<circle cx="24" cy="24" r="20" fill="none"/>' +
                '<circle cx="24" cy="24" r="13" fill="none"/>' +
                '<path d="M24 1V14M24 34V47M1 24H14M34 24H47"/>' +
                '<path d="M24 18l3 6-3 6-3-6z"/></g></svg>';
            return { g: node.querySelector(".wv-reticle__spin"), sampler };
        },
        update(s, t) {
            const a = s.sampler.sample(t, t) * 180;
            s.g.setAttribute("transform", "rotate(" + a.toFixed(1) + " 24 24)");
        }
    }),
    checks: Object.freeze({
        create(node, o, h) {
            const g = Math.max(2, h.num(o.grid, 6));
            const sampler = h.makeSampler();
            node.style.setProperty("--wv-mx", g);
            const wrap = h.el("div", "wv-checks");
            wrap.setAttribute("aria-hidden", "true");
            node.appendChild(wrap);
            const boxes = [];
            for (let i = 0; i < g * g; i++) {
                const b = h.el("input");
                b.type = "checkbox"; b.tabIndex = -1;
                wrap.appendChild(b); boxes.push(b);
            }
            return { boxes, g, sampler, prev: new Array(g * g).fill(null) };
        },
        update(s, t) {
            let i = 0;
            for (let r = 0; r < s.g; r++)
                for (let c = 0; c < s.g; c++, i++) {
                    const on = s.sampler.sample(c * 0.6 + t, t + r * 0.6) > 0;
                    if (on !== s.prev[i]) { s.prev[i] = on; s.boxes[i].checked = on; }
                }
        }
    }),
    sliders: Object.freeze({
        create(node, o, h) {
            const n = h.num(o.rows, 6);
            const sampler = h.makeSampler();
            const wrap = h.el("div", "wv-sliders");
            wrap.setAttribute("aria-hidden", "true");
            node.appendChild(wrap);
            const inputs = [];
            for (let i = 0; i < n; i++) {
                const r = h.el("input");
                r.type = "range"; r.min = 0; r.max = 1000; r.value = 500; r.tabIndex = -1;
                wrap.appendChild(r); inputs.push(r);
            }
            return { inputs, n, sampler };
        },
        update(s, t) {
            for (let i = 0; i < s.n; i++)
                s.inputs[i].value = Math.round(norm(s.sampler.sample(i * 0.7, t + i * 0.2)) * 1000);
        }
    }),
    levels: Object.freeze({
        create(node, o, h) {
            const n = h.num(o.rows, 7);
            const sampler = h.makeSampler();
            const wrap = h.el("div", "wv-levels");
            wrap.setAttribute("aria-hidden", "true");
            node.appendChild(wrap);
            const bars = [];
            for (let i = 0; i < n; i++) {
                const p = h.el("progress");
                p.max = 1000; p.value = 500;
                wrap.appendChild(p); bars.push(p);
            }
            return { bars, n, sampler };
        },
        update(s, t) {
            for (let i = 0; i < s.n; i++)
                s.bars[i].value = Math.round(norm(s.sampler.sample(i * 0.5, t)) * 1000);
        }
    }),
    radios: Object.freeze({
        create(node, o, h) {
            const rows = h.num(o.rows, 4);
            const cols = h.num(o.cols, 7);
            const sampler = h.makeSampler();
            const seed = Number(o.seed);
            const wrap = h.el("div", "wv-radios");
            wrap.setAttribute("aria-hidden", "true");
            node.appendChild(wrap);
            const groups = [];
            for (let r = 0; r < rows; r++) {
                const row = h.el("div", "wv-radios__row");
                const radios = [];
                for (let c = 0; c < cols; c++) {
                    const inp = h.el("input");
                    inp.type = "radio"; inp.name = "wvr-" + seed + "-" + r; inp.tabIndex = -1;
                    row.appendChild(inp); radios.push(inp);
                }
                wrap.appendChild(row);
                groups.push({ radios, prev: -1 });
            }
            return { groups, rows, cols, sampler };
        },
        update(s, t) {
            for (let r = 0; r < s.rows; r++) {
                let idx = Math.floor(norm(s.sampler.sample(t + r * 0.8, t)) * s.cols);
                if (idx >= s.cols) idx = s.cols - 1;
                const g = s.groups[r];
                if (idx !== g.prev) { g.prev = idx; g.radios[idx].checked = true; }
            }
        }
    }),
    ticker: Object.freeze({
        create(node, o, h) {
            const txt = (o.text || "SYS-READY · NODE-44 · SIG OK · LINK 99 · ").toUpperCase();
            const wrap = h.el("div", "wv-ticker"), inner = h.el("div", "wv-ticker__t");
            inner.textContent = txt + txt;
            wrap.appendChild(inner); node.appendChild(wrap);
            return { inner, sampler: h.makeSampler(), x: 0, w: 0 };
        },
        update(s, t) {
            if (!s.w) s.w = s.inner.scrollWidth / 2 || 1;
            s.x -= 0.6 + norm(s.sampler.sample(t, t)) * 1.6;
            if (s.x <= -s.w) s.x += s.w;
            s.inner.style.transform = "translateX(" + s.x.toFixed(1) + "px)";
        }
    }),
    scramble: Object.freeze({
        create(node, o, h) {
            const target = (o.text || "DECRYPTING").toUpperCase();
            node.classList.add("wv-scramble");
            const cells = [];
            for (let i = 0; i < target.length; i++) { const sp = h.el("span"); node.appendChild(sp); cells.push(sp); }
            return { cells, target, sampler: h.makeSampler(), cs: o.charset || "ABCDEF0123456789#%&/?*▮" };
        },
        update(s, t) {
            const reveal = Math.floor(norm(s.sampler.sample(t, t)) * (s.target.length + 1));
            for (let i = 0; i < s.target.length; i++) {
                let ch;
                if (i < reveal) ch = s.target[i];
                else { let k = Math.floor(norm(s.sampler.sample(i * 4.1 + t * 11, t)) * s.cs.length); if (k >= s.cs.length) k = s.cs.length - 1; ch = s.cs[k]; }
                if (s.cells[i].textContent !== ch) s.cells[i].textContent = ch;
            }
        }
    }),
    counter: Object.freeze({
        create(node, o, h) {
            const n = h.num(o.len, 6);
            node.classList.add("wv-counter");
            const cols = [];
            for (let i = 0; i < n; i++) {
                const col = h.el("div", "wv-counter__col"), strip = h.el("div", "wv-counter__strip");
                for (let d = 0; d < 10; d++) { const sp = h.el("span"); sp.textContent = d; strip.appendChild(sp); }
                col.appendChild(strip); node.appendChild(col); cols.push(strip);
            }
            return { cols, n, sampler: h.makeSampler(), prev: new Array(n).fill(-1) };
        },
        update(s, t) {
            const val = Math.floor(norm(s.sampler.sample(t, t)) * Math.pow(10, s.n));
            for (let i = 0; i < s.n; i++) {
                const d = Math.floor(val / Math.pow(10, s.n - 1 - i)) % 10;
                if (d !== s.prev[i]) { s.prev[i] = d; s.cols[i].style.transform = "translateY(-" + (d * 10) + "%)"; }
            }
        }
    }),
    rgbsplit: Object.freeze({
        create(node, o, h) {
            const txt = (o.text || "SIGNAL").toUpperCase();
            node.classList.add("wv-rgbsplit");
            const mk = (c) => { const sp = h.el("span", "wv-rgbsplit__" + c); sp.textContent = txt; node.appendChild(sp); return sp; };
            return { r: mk("r"), g: mk("g"), b: mk("b"), sampler: h.makeSampler() };
        },
        update(s, t) {
            const d = norm(s.sampler.sample(t, t)) * 6;
            s.r.style.transform = "translate(" + d.toFixed(1) + "px,0)";
            s.b.style.transform = "translate(" + (-d).toFixed(1) + "px,0)";
        }
    }),
    segment: Object.freeze({
        create(node, o, h) {
            const n = h.num(o.len, 4);
            node.classList.add("wv-segment");
            const digits = [];
            for (let i = 0; i < n; i++) {
                const s = svg("svg", { viewBox: "0 0 12 20", class: "wv-seg" }), segs = {};
                for (const k in SEGLINE) { const L = SEGLINE[k]; const ln = svg("line", { x1: L[0], y1: L[1], x2: L[2], y2: L[3] }); s.appendChild(ln); segs[k] = ln; }
                node.appendChild(s); digits.push(segs);
            }
            return { digits, n, sampler: h.makeSampler(), prev: new Array(n).fill(-1) };
        },
        update(s, t) {
            const val = Math.floor(norm(s.sampler.sample(t, t)) * Math.pow(10, s.n));
            for (let i = 0; i < s.n; i++) {
                const d = Math.floor(val / Math.pow(10, s.n - 1 - i)) % 10;
                if (d === s.prev[i]) continue;
                s.prev[i] = d;
                const on = SEG7[d], segs = s.digits[i];
                for (const k in segs) segs[k].style.opacity = on.indexOf(k) >= 0 ? 1 : 0.1;
            }
        }
    }),
    loadbar: Object.freeze({
        create(node, o, h) {
            node.classList.add("wv-loadbar");
            const track = h.el("div", "wv-loadbar__track"), fill = h.el("div", "wv-loadbar__fill");
            track.appendChild(fill);
            const pct = h.el("div", "wv-loadbar__pct"); pct.textContent = "00%";
            node.appendChild(track); node.appendChild(pct);
            return { fill, pct, sampler: h.makeSampler(), prev: -1 };
        },
        update(s, t) {
            const p = norm(s.sampler.sample(t, t));
            s.fill.style.width = (p * 100).toFixed(1) + "%";
            const pc = Math.floor(p * 100);
            if (pc !== s.prev) { s.prev = pc; s.pct.textContent = pad(pc, 2) + "%"; }
        }
    }),
    gauge: Object.freeze({
        create(node, o, h) {
            node.classList.add("wv-gauge");
            const s = svg("svg", { viewBox: "0 0 60 38", class: "wv-gauge__svg" });
            s.appendChild(svg("path", { d: "M6 34 A24 24 0 0 1 54 34", class: "wv-gauge__arc" }));
            for (let i = 0; i <= 4; i++) { const a = Math.PI - (i / 4) * Math.PI; s.appendChild(svg("line", { x1: 30 + Math.cos(a) * 22, y1: 34 - Math.sin(a) * 22, x2: 30 + Math.cos(a) * 26, y2: 34 - Math.sin(a) * 26, class: "wv-gauge__tick" })); }
            const needle = svg("line", { x1: 30, y1: 34, x2: 30, y2: 12, class: "wv-gauge__needle" });
            s.appendChild(needle); s.appendChild(svg("circle", { cx: 30, cy: 34, r: 2.5, class: "wv-gauge__hub" }));
            node.appendChild(s);
            return { needle, sampler: h.makeSampler() };
        },
        update(s, t) { s.needle.setAttribute("transform", "rotate(" + (-90 + norm(s.sampler.sample(t, t)) * 180).toFixed(1) + " 30 34)"); }
    }),
    waterfall: Object.freeze({
        create(node, o, h) {
            const w = h.num(o.cols, 16), ht = h.num(o.rows, 10);
            node.style.setProperty("--wv-wf", w);
            const wrap = h.el("div", "wv-waterfall"), cells = [];
            for (let i = 0; i < w * ht; i++) { const c = h.el("i"); wrap.appendChild(c); cells.push(c); }
            node.appendChild(wrap);
            return { cells, w, h: ht, sampler: h.makeSampler(), prev: new Array(w * ht).fill(-1) };
        },
        update(s, t) {
            let i = 0;
            for (let r = 0; r < s.h; r++)
                for (let c = 0; c < s.w; c++, i++) {
                    const v = Math.round(norm(s.sampler.sample(c * 0.5, t * 1.3 - r * 0.28)) * 4);
                    if (v !== s.prev[i]) { s.prev[i] = v; s.cells[i].style.opacity = (0.08 + v / 4 * 0.92).toFixed(2); }
                }
        }
    }),
    statusdot: Object.freeze({
        create(node, o, h) {
            const n = h.num(o.rows, 4);
            node.classList.add("wv-statusdot");
            const rows = [];
            for (let i = 0; i < n; i++) {
                const row = h.el("div", "wv-statusdot__row");
                const dot = h.el("i", "wv-statusdot__dot"), lab = h.el("span"), st = h.el("b");
                lab.textContent = STAT[i % STAT.length];
                row.appendChild(dot); row.appendChild(lab); row.appendChild(st);
                node.appendChild(row); rows.push({ dot, st, prev: "" });
            }
            return { rows, n, sampler: h.makeSampler() };
        },
        update(s, t) {
            for (let i = 0; i < s.n; i++) {
                const v = s.sampler.sample(i * 1.7 + t, t);
                const state = v > 0.35 ? "OK" : v < -0.45 ? "ERR" : "STBY", r = s.rows[i];
                if (state !== r.prev) { r.prev = state; r.st.textContent = state; }
                r.dot.style.opacity = norm(s.sampler.sample(i * 9.3 + t * 6, t)) > 0.5 ? 1 : 0.15;
            }
        }
    }),
    scan: Object.freeze({
        create(node, o, h) {
            node.classList.add("wv-scan");
            if (o.text) { const lab = h.el("span", "wv-scan__lab"); lab.textContent = o.text.toUpperCase(); node.appendChild(lab); }
            const bar = h.el("b", "wv-scan__bar"); node.appendChild(bar);
            return { bar, sampler: h.makeSampler() };
        },
        update(s, t) { s.bar.style.top = (norm(s.sampler.sample(t, t)) * 100).toFixed(1) + "%"; }
    }),
    crop: Object.freeze({
        create(node, o, h) {
            node.classList.add("wv-crop");
            const marks = [];
            for (let i = 0; i < 4; i++) { const m = h.el("i", "wv-crop__m wv-crop__m" + i); node.appendChild(m); marks.push(m); }
            if (o.text) { const lab = h.el("span", "wv-crop__lab"); lab.textContent = o.text.toUpperCase(); node.appendChild(lab); }
            return { marks, sampler: h.makeSampler() };
        },
        update(s, t) {
            const op = (0.45 + norm(s.sampler.sample(t, t)) * 0.55).toFixed(2);
            for (const m of s.marks) m.style.opacity = op;
        }
    }),
    spectable: Object.freeze({
        create(node, o, h) {
            const n = h.num(o.rows, 4);
            node.classList.add("wv-spectable");
            const rows = [];
            for (let i = 0; i < n; i++) {
                const row = h.el("div", "wv-spectable__row");
                const k = h.el("span"); k.textContent = SPECK[i % SPECK.length];
                const lead = h.el("i", "wv-spectable__lead"), v = h.el("b");
                row.appendChild(k); row.appendChild(lead); row.appendChild(v);
                node.appendChild(row); rows.push({ v, prev: -1 });
            }
            return { rows, n, sampler: h.makeSampler() };
        },
        update(s, t) {
            for (let i = 0; i < s.n; i++) {
                const val = Math.floor(norm(s.sampler.sample(i * 1.3, t)) * 1000);
                if (val !== s.rows[i].prev) { s.rows[i].prev = val; s.rows[i].v.textContent = pad(val, 3); }
            }
        }
    }),
    arrows: Object.freeze({
        create(node, o, h) {
            const n = h.num(o.len, 6);
            node.classList.add("wv-arrows");
            const arr = [];
            for (let i = 0; i < n; i++) { const a = h.el("i"); a.textContent = "▸"; node.appendChild(a); arr.push(a); }
            return { arr, n, sampler: h.makeSampler() };
        },
        update(s, t) {
            const head = Math.floor(norm(s.sampler.sample(t, t)) * s.n);
            for (let i = 0; i < s.n; i++) s.arr[i].style.opacity = (i === head || i === head - 1) ? 1 : 0.22;
        }
    }),
    dimension: Object.freeze({
        create(node, o, h) {
            node.classList.add("wv-dimension");
            const val = h.el("div", "wv-dimension__val"); val.textContent = "000.0";
            const line = h.el("div", "wv-dimension__line");
            line.innerHTML = '<i></i><span class="wv-dimension__bar"></span><i></i>';
            node.appendChild(val); node.appendChild(line);
            return { val, sampler: h.makeSampler(), prev: "" };
        },
        update(s, t) {
            const v = (norm(s.sampler.sample(t, t)) * 200).toFixed(1);
            if (v !== s.prev) { s.prev = v; s.val.textContent = v; }
        }
    }),
    nodes: Object.freeze({
        create(node, o, h) {
            const n = h.num(o.nodes, 6), s = svg("svg", { viewBox: "0 0 100 60", class: "wv-nodes", preserveAspectRatio: "none" }), pts = [];
            for (let i = 0; i < n; i++) pts.push([8 + (i / (n - 1)) * 84, 30 + (i % 2 ? -16 : 16) * (0.4 + (i % 3) * 0.3)]);
            const edges = [];
            for (let i = 0; i < n - 1; i++) { const ln = svg("line", { x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1], class: "wv-nodes__edge" }); s.appendChild(ln); edges.push(ln); }
            for (let i = 0; i < n; i++) s.appendChild(svg("circle", { cx: pts[i][0], cy: pts[i][1], r: 3, class: "wv-nodes__node" }));
            node.appendChild(s);
            return { edges, sampler: h.makeSampler() };
        },
        update(s, t) {
            for (let i = 0; i < s.edges.length; i++) s.edges[i].style.opacity = (0.12 + norm(s.sampler.sample(i * 0.8 + t * 2, t)) * 0.88).toFixed(2);
        }
    }),
    sigil: Object.freeze({
        create(node, o, h) {
            const k = h.num(o.points, 7), s = svg("svg", { viewBox: "0 0 60 60", class: "wv-sigil" }), poly = svg("polygon", {});
            s.appendChild(poly);
            s.appendChild(svg("circle", { cx: 30, cy: 30, r: 27, class: "wv-sigil__ring" }));
            node.appendChild(s);
            return { poly, k, sampler: h.makeSampler() };
        },
        update(s, t) {
            let p = "";
            for (let i = 0; i < s.k; i++) {
                const a = (i / s.k) * Math.PI * 2, r = 10 + norm(s.sampler.sample(i * 0.9 + t, t)) * 16;
                p += (30 + Math.cos(a) * r).toFixed(1) + "," + (30 + Math.sin(a) * r).toFixed(1) + " ";
            }
            s.poly.setAttribute("points", p);
        }
    }),
    hazard: Object.freeze({
        create(node, o, h) {
            node.classList.add("wv-hazard");
            const ic = h.el("span", "wv-hazard__ic"), lab = h.el("small");
            node.appendChild(ic); node.appendChild(lab);
            return { ic, lab, sampler: h.makeSampler(), prev: -1 };
        },
        update(s, t) {
            let i = Math.floor(norm(s.sampler.sample(t, t)) * HAZ.length);
            if (i >= HAZ.length) i = HAZ.length - 1;
            if (i !== s.prev) { s.prev = i; s.ic.textContent = HAZ[i]; s.lab.textContent = "TYPE-" + pad(i, 2); }
        }
    }),
    globe: Object.freeze({
        create(node, o, h) {
            const R = 26, s = svg("svg", { viewBox: "0 0 60 60", class: "wv-globe" });
            s.appendChild(svg("circle", { cx: 30, cy: 30, r: R, class: "wv-globe__o" }));
            for (let i = -2; i <= 2; i++) { const half = Math.sqrt(Math.max(0, R * R - (i * 9) * (i * 9))); s.appendChild(svg("line", { x1: 30 - half, y1: 30 + i * 9, x2: 30 + half, y2: 30 + i * 9, class: "wv-globe__lat" })); }
            const lon = [];
            for (let i = 0; i < 5; i++) { const e = svg("ellipse", { cx: 30, cy: 30, rx: R, ry: R, class: "wv-globe__lon" }); s.appendChild(e); lon.push(e); }
            node.appendChild(s);
            return { lon, R, sampler: h.makeSampler() };
        },
        update(s, t) {
            const ph = t * 1.2;
            for (let i = 0; i < s.lon.length; i++) s.lon[i].setAttribute("rx", (Math.abs(Math.cos(ph + (i / s.lon.length) * Math.PI)) * s.R).toFixed(1));
        }
    }),
    boot: Object.freeze({
        create(node, o, h) {
            const n = Math.min(BOOTLINES.length, h.num(o.rows, 6)), sampler = h.makeSampler();
            node.classList.add("wv-boot");
            const rows = [], order = [];
            for (let i = 0; i < n; i++) order.push(i);
            order.sort((a, b) => sampler.sample(a * 3.1, 0) - sampler.sample(b * 3.1, 0));
            for (let i = 0; i < n; i++) { const r = h.el("div", "wv-boot__row"); r.innerHTML = '<i></i><span>' + BOOTLINES[i] + '</span><b></b>'; node.appendChild(r); rows.push(r); }
            const done = h.el("div", "wv-boot__done"); done.textContent = "● ONLINE"; node.appendChild(done);
            return { rows, order, done, n, prevReveal: -1, cycle: 6 };
        },
        update(s, t) {
            const reveal = Math.floor(((t % s.cycle) / s.cycle) * (s.n + 1));
            if (reveal === s.prevReveal) return;
            s.prevReveal = reveal;
            for (let i = 0; i < s.n; i++) s.rows[s.order[i]].classList.toggle("on", i < reveal);
            s.done.classList.toggle("on", reveal > s.n);
        }
    }),
    keypad: Object.freeze({
        create(node, o, h) {
            const g = Math.max(2, h.num(o.grid, 4));
            node.style.setProperty("--wv-mx", g);
            const wrap = h.el("div", "wv-keypad"), keys = [];
            for (let i = 0; i < g * g; i++) { const k = h.el("b"); k.textContent = KEYCH[i % KEYCH.length]; wrap.appendChild(k); keys.push(k); }
            node.appendChild(wrap);
            return { keys, g, sampler: h.makeSampler(), prev: new Array(g * g).fill(-1) };
        },
        update(s, t) {
            let i = 0;
            for (let r = 0; r < s.g; r++)
                for (let c = 0; c < s.g; c++, i++) {
                    const on = s.sampler.sample(c * 0.7 + t, t + r * 0.7) > 0.25 ? 1 : 0;
                    if (on !== s.prev[i]) { s.prev[i] = on; s.keys[i].classList.toggle("on", !!on); }
                }
        }
    }),
});

/* ================================================================ CATALOGUS == */

export const ELEMENTS = Object.freeze([
    define("loader", "tekst-loader", "tekst", "Tekstraster waarvan elke letter door de wave gekozen wordt.",
        { seed: "13", grid: "4", text: "LOADING" }, ["grid", "text"], [1, 1]),
    define("barcode", "barcode", "signaal", "Bevroren wave als unieke streepcode, optioneel met scanlijn.",
        { seed: "13", bars: "48", scan: true }, ["bars", "scan"], [2, 1]),
    define("bars", "bars", "signaal", "Equalizerbalken waarvan de hoogte rechtstreeks door de wave wordt gestuurd.",
        { seed: "7", bars: "20" }, ["bars"], [1, 1]),
    define("wave", "wave scope", "signaal", "Scrollende oscilloscooplijn in een lichtgewicht SVG.",
        { seed: "5", points: "80", group: "gentle" }, ["points"], [2, 1]),
    define("matrix", "matrix", "signaal", "Datamatrix die wavewaarden omzet naar aan- en uitgeschakelde cellen.",
        { seed: "44", grid: "12", live: true }, ["grid", "live"], [1, 1]),
    define("dither", "dither", "signaal", "Tekendichtheidsveld dat waarden omzet naar een oplopende tekenset.",
        { seed: "8", grid: "7", text: " ·:+*oO#@" }, ["grid", "text"], [1, 1]),
    define("readout", "readout", "tekst", "Flikkerend serienummer of LCD-uitlezing uit een gekozen tekenset.",
        { seed: "61", len: "10", text: "0123456789ABCDEF" }, ["len", "text"], [1, 1]),
    define("reticle", "reticle", "technisch", "Registratiemerk met wave-gestuurde rotatie.",
        { seed: "91" }, [], [1, 1]),
    define("checks", "checkbox dance", "besturing", "Raster van native checkboxes dat per cel door de wave wordt geschakeld.",
        { seed: "13", grid: "8" }, ["grid"], [1, 1]),
    define("sliders", "sliders", "besturing", "Native range-sliders waarvan de duimen samen met de wave bewegen.",
        { seed: "21", rows: "9" }, ["rows"], [1, 2]),
    define("levels", "levels", "besturing", "Native progress-elementen als compacte VU-meters.",
        { seed: "34", rows: "9" }, ["rows"], [1, 2]),
    define("radios", "radio scanner", "besturing", "Native radioknoppen waarin een selectie per rij scant.",
        { seed: "5", rows: "5", cols: "9" }, ["rows", "cols"], [2, 1]),
    define("ticker", "ticker", "tekst", "Lopende live-data waarvan de snelheid door de wave wordt gemoduleerd.",
        { seed: "3", text: "SYS-READY · NODE-44 · SIG OK · FLUX 0.42 · " }, ["text"], [2, 1]),
    define("scramble", "scramble", "tekst", "Tekens worden stapsgewijs onthuld alsof een signaal wordt ontsleuteld.",
        { seed: "7", text: "DECRYPTING" }, ["text"], [2, 1]),
    define("counter", "counter", "tekst", "Odometerachtig serienummer in een vaste lengte.",
        { seed: "21", len: "6" }, ["len"], [1, 1]),
    define("rgbsplit", "rgb split", "tekst", "Chromatische verschuiving waarvan de offset door de wave wordt bepaald.",
        { seed: "5", text: "SIGNAL" }, ["text"], [1, 1]),
    define("segment", "segment", "tekst", "Compacte 7-segmentuitlezing met een wave-gestuurd getal.",
        { seed: "34", len: "4" }, ["len"], [1, 1]),
    define("loadbar", "loadbar", "monitoring", "Gelabelde voortgangsbalk met een live percentage.",
        { seed: "8" }, [], [1, 1]),
    define("gauge", "gauge", "monitoring", "Analoge naaldmeter die de actuele wavewaarde toont.",
        { seed: "44" }, [], [1, 1]),
    define("waterfall", "waterfall", "monitoring", "Scrollend spectrogram opgebouwd uit een compact DOM-raster.",
        { seed: "55", cols: "14", rows: "14" }, ["cols", "rows"], [1, 1]),
    define("statusdot", "status dots", "monitoring", "Knipperende statuslichten met een leesbare systeemstaat.",
        { seed: "61", rows: "5" }, ["rows"], [1, 1]),
    define("scan", "scan", "monitoring", "CRT-scanlijnen met een bewegende scanbalk en vrij label.",
        { seed: "73", text: "SCAN" }, ["text"], [1, 2]),
    define("crop", "crop marks", "technisch", "Drukwerkachtige snijtekens met een subtiele puls.",
        { seed: "12", text: "A1" }, ["text"], [1, 1]),
    define("spectable", "spec table", "technisch", "Specificatietabel met dotted leaders en tellende waarden.",
        { seed: "2", rows: "5" }, ["rows"], [1, 1]),
    define("arrows", "arrows", "technisch", "Richtingpijlen met een pulserende kop.",
        { seed: "28", len: "7" }, ["len"], [1, 1]),
    define("dimension", "dimension", "technisch", "Maatlijn die een veranderende meetwaarde presenteert.",
        { seed: "17" }, [], [1, 1]),
    define("nodes", "nodes", "technisch", "Nodegraph waarin een wavepuls langs de verbindingen loopt.",
        { seed: "91", nodes: "7" }, ["nodes"], [2, 1]),
    define("sigil", "sigil", "systeem", "Morphende SVG-glyph opgebouwd uit een beperkt aantal punten.",
        { seed: "80", points: "7" }, ["points"], [1, 1]),
    define("hazard", "hazard", "systeem", "Cyclische set compacte waarschuwingsiconen.",
        { seed: "6" }, [], [1, 1]),
    define("globe", "globe", "systeem", "Draaiende wireframe-globe als systeemindicator.",
        { seed: "9" }, [], [1, 1]),
    define("boot", "boot sequence", "systeem", "Korte opstartreeks die eindigt in een ONLINE-status.",
        { seed: "11", rows: "7" }, ["rows"], [1, 1]),
    define("keypad", "keypad", "besturing", "Knoppenraster dat in een wavepatroon oplicht.",
        { seed: "100", grid: "4" }, ["grid"], [1, 1]),
]);

export function getElement(id) {
    return ELEMENTS.find((entry) => entry.id === id) || null;
}

/**
 * Registreer alle renderers op een vanilla.waves-engine (standaard de globale uit de bundle).
 * Idempotent: opnieuw registreren vervangt dezelfde definitie.
 */
export function registerElements(engine = globalThis.VanillaWaves) {
    if (!engine || typeof engine.register !== "function") {
        throw new TypeError(
            "vanilla.waves_elements: geen engine met register(). Laad vanilla.waves.min.js " +
            "(bundle met DOM-engine) vóór deze module; waves-core.mjs bevat de engine niet.",
        );
    }
    for (const [name, renderer] of Object.entries(RENDERERS)) engine.register(name, renderer);
    return engine;
}
