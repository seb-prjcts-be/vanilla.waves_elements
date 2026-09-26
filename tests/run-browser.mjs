// Draait tests/browser.html in echte headless Chrome (geen virtuele tijd: rAF en
// ResizeObserver lopen zoals in een zichtbaar venster) tegen de Apache-route.
//   node tests/run-browser.mjs [pagina]
// Hergebruikt het CDP-harnas van blocks.system, enkel lezend geïmporteerd.
import { startBrowserHarness } from "../../blocks.system/tests/support/browser-harness.mjs";

const page = process.argv[2] || "tests/browser.html";
const url = `http://localhost/vanilla.waves_elements/${page}`;
const harness = await startBrowserHarness(new URL("../", import.meta.url).pathname.slice(1), { width: 1200, height: 900 });
let exitCode = 1;
try {
    await harness.protocol.send("Page.navigate", { url });
    const started = Date.now();
    let title = "";
    while (Date.now() - started < 30000) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const { result } = await harness.protocol.send("Runtime.evaluate", { expression: "document.title" });
        title = result.value || "";
        if (/^(PASS|FAIL|DONE)/.test(title)) break;
    }
    const { result } = await harness.protocol.send("Runtime.evaluate", {
        expression: "document.querySelector('#log')?.textContent || ''",
    });
    console.log(result.value.trimEnd());
    console.log(title || "TIMEOUT");
    exitCode = title.startsWith("PASS") || title === "DONE" ? 0 : 1;
} finally {
    await harness.close();
}
process.exit(exitCode);
