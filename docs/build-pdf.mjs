// Builds docs/assumptions.pdf (the brief's template order): assumptions, trigger,
// routing, design note, next steps. Usage: node docs/build-pdf.mjs
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "@playwright/test"

const docs = new URL(".", import.meta.url).pathname
const css = `body{font:11px/1.45 system-ui,sans-serif;max-width:none;margin:0;color:#1c1917}
h1{font-size:18px}h2{font-size:14px;margin-top:18px;border-bottom:1px solid #d6d3d1;break-after:avoid}h3{font-size:12px}
table{border-collapse:collapse;font-size:9.5px}td,th{border:1px solid #d6d3d1;padding:4px;vertical-align:top}
th{background:#f5f5f4}.mermaid{break-inside:avoid;margin:8px 0}.mermaid svg{max-width:100%;height:auto}code{font-size:9.5px}pre{background:#f5f5f4;padding:6px;font-size:9px;white-space:pre-wrap}`
const dir = mkdtempSync(join(tmpdir(), "assumptions-"))
writeFileSync(join(dir, "style.css"), css)
const html = join(dir, "assumptions.html")
execFileSync("pandoc", [
  ...["assumptions.md", "design-note.md", "next-steps.md"].map((file) => join(docs, file)),
  "--standalone",
  "--embed-resources",
  "--css",
  join(dir, "style.css"),
  "-o",
  html,
])
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`file://${html}`)
// Render the design note's Mermaid diagram (pandoc leaves it as a code block).
await page.addScriptTag({ url: "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" })
await page.evaluate(async () => {
  for (const block of document.querySelectorAll("pre.mermaid")) {
    const div = document.createElement("div")
    div.className = "mermaid"
    div.textContent = block.textContent
    block.replaceWith(div)
  }
  // @ts-expect-error mermaid is a global from the script tag
  mermaid.initialize({ startOnLoad: false, theme: "neutral" })
  // @ts-expect-error see above
  await mermaid.run({ querySelector: "div.mermaid" }).catch((error) => {
    throw new Error(`mermaid: ${error?.message ?? JSON.stringify(error)}`)
  })
})
await page.pdf({
  path: join(docs, "assumptions.pdf"),
  format: "A4",
  margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
})
await browser.close()
