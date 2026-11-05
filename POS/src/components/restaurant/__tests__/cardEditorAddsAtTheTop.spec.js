/**
 * //// Neoffice — added file (no upstream equivalent). The card editor's buttons that add a category, a sub-category or a dish are at the top,
 * //// with « Save », and stay there while the rows scroll (NeoResto lot 1, product owner, 05.11.2026: « les boutons qui sont tout au fond,
 * //// catégorie, sous-catégorie, article. Il faut les mettre en haut, parce qu'on ne sait pas, autrement, qu'on peut créer un article […]
 * //// c'est absurde que ce soit en bas »).
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const editor = readFileSync(path.resolve(__dirname, "../CardEditor.vue"), "utf8")
const at = (needle) => {
	const index = editor.indexOf(needle)
	expect(index, `${needle} is in the card editor`).toBeGreaterThan(-1)
	return index
}

describe("the card editor's add buttons", () => {
	it("are three, one per kind of row", () => {
		for (const mark of ["data-add-category", "data-add-subcategory", "data-add-item"]) {
			expect(editor.split(mark).length - 1, mark).toBe(1)
		}
		expect(editor).toMatch(/data-add-category[^>]*>|@click="openCategoryDialog\(false\)"/)
	})

	it("come before the rows, in the header with « Save »", () => {
		const save = at('@click="saveCard"')
		const toolbar = at("data-card-toolbar")
		const scroller = at("flex-1 min-h-0 overflow-y-auto")
		const firstRow = at("data-card-row")
		expect(save).toBeLessThan(toolbar)
		expect(toolbar).toBeLessThan(scroller)
		expect(scroller).toBeLessThan(firstRow)
	})

	it("are not repeated under the rows", () => {
		const afterRows = editor.slice(at("data-card-row"))
		expect(afterRows).not.toContain("data-add-category")
		expect(afterRows).not.toContain("data-add-subcategory")
		expect(afterRows).not.toContain("showItemSearchDialog = true")
	})

	it("stay in view: only the rows scroll, not the pane that holds the header", () => {
		// The pane is a column that clips; the scroller is the rows' own wrapper
		expect(editor).toMatch(/flex-1 min-w-0 flex flex-col border rounded-xl overflow-hidden/)
		expect(editor).not.toMatch(/flex-1 border rounded-xl p-4 overflow-y-auto/)
	})
})
