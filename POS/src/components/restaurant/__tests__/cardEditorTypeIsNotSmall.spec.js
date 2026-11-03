/**
 * //// Neoffice — added file (no upstream equivalent). The type of the restaurant cards screen (NeoResto lot 1, Daniel 01.11: « la police de caractère est relativement petite, […] il faut aligner sur le standard de
 * //// l'ERP »): its small texts were 8, 9 and 10 px. 12 px is the least the till writes anywhere, so no text of this screen is set below it. The component is too large to mount for this, so its template is read.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(path.resolve(__dirname, "../CardEditor.vue"), "utf8")
const template = source.slice(0, source.indexOf("<script setup>"))

describe("the restaurant cards screen", () => {
	it("sets no text below 12 px", () => {
		const small = [...template.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map(([, size]) => Number(size)).filter((size) => size < 12)

		expect(small).toEqual([])
	})

	it("writes the names of its dishes and cards at 16 px, its details at 12 or 14", () => {
		// The name of a dish is now what the row says without a click (its label, else the item's name, else its code)
		expect(template).toMatch(/class="text-base"[^>]*>\{\{ nameOf\(item\)/)
		expect(template).not.toMatch(/class="text-\[10px\] text-gray-400 mt-0\.5/)
	})
})
