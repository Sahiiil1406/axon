import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createScopedViews } from "./scoped-views.mjs"

const [rulesFile, outputDirectory] = process.argv.slice(2)
if (!rulesFile || !outputDirectory) throw new Error("Usage: make-views.mjs <private rules JSON> <new private output directory>")
const views = createScopedViews(JSON.parse(readFileSync(rulesFile, "utf8")))
mkdirSync(outputDirectory, { mode: 0o700 })
for (const [index, view] of views.entries()) {
  writeFileSync(join(outputDirectory, `view-${index}.json`), JSON.stringify(view, null, 2) + "\n", { mode: 0o600, flag: "wx" })
}
console.log(JSON.stringify({ root: views[0].root, views: views.length }))
