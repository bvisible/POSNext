//// Neoffice — added file (no upstream equivalent). A vitest run leaves POS/components.d.ts as it found it.
//// frappe-ui's vite plugin (lucideIcons) creates unplugin-vue-components with its default `dts`, so every run
//// rewrote the committed declarations: the `//// Neoffice` markers of that file were erased, and each run left a modified
//// file in a tree other sessions commit from. The plugin's options cannot be reached from vite.config.js (and
//// building our own instance would copy frappe-ui's resolvers), so the file is put back once the run is over.
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DECLARATIONS = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"components.d.ts",
)
// The plugin writes the file at most every 500 ms, the last time after the last transform
const LAST_WRITE_MS = 1000

const read = () => readFile(DECLARATIONS, "utf8").catch(() => null)

export default async function keepComponentDeclarations() {
	const committed = await read()
	return async () => {
		if (committed === null) return
		await new Promise((resolve) => setTimeout(resolve, LAST_WRITE_MS))
		if ((await read()) !== committed) await writeFile(DECLARATIONS, committed)
	}
}
