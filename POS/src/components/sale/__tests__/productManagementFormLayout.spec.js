/**
 * //// Neoffice — added file (no upstream equivalent). The product management form (NeoResto lot 1; product owner, 05.11.2026: « l'image du
 * //// produit, on peut faire ça beaucoup plus petit […] on n'arrive pas à avoir la totalité de l'information »): the picture is a thumbnail in the
 * //// second column, after the fields, and an item keeps the group it already sits in, even a group node.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const form = readFileSync(path.resolve(__dirname, "../ProductManagement.vue"), "utf8")

describe("the picture of a product", () => {
	it("is a narrow second column and the fields take the width", () => {
		const grid = form.match(/class="grid items-start gap-8 ([^"]+)"/)?.[1] || ""
		expect(grid).toContain("xl:grid-cols-[minmax(0,1fr)_minmax(200px,240px)]")
		expect(grid).toContain("min-[1536px]:grid-cols-[minmax(0,1fr)_minmax(220px,260px)]")
		// Upstream gave 1fr to the first column, where the picture stood
		expect(grid).not.toContain("minmax(300px,380px)")
	})

	it("stands after the fields from xl, and is 180 px wide above the picture's own column", () => {
		const aside = form.match(/<aside\s+class="([^"]+)"/)?.[1] || ""
		expect(aside).toContain("xl:order-last")
		expect(aside).toContain("max-w-[180px]")
		expect(aside).not.toContain("xl:order-none")
		expect(aside).not.toContain("max-w-[320px]")
	})
})

describe("the group of a product", () => {
	it("is offered even when it is a group node, so that the field is never empty for an item that has one", () => {
		const block = form.slice(form.indexOf("const rawItemGroupOptions"), form.indexOf("const itemGroupOptions"))
		expect(block).toContain("const current = form.value.item_group")
		expect(block).toMatch(/options\.unshift\(\{ label: current, value: current \}\)/)
		// The leaf groups are still the ones listed
		expect(block).toContain(".filter((g) => !Number(g.is_group || 0))")
	})
})
