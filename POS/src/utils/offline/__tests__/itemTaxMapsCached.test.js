/**
 * //// Neoffice — added file (no upstream equivalent). The offline item cache keeps each item's two VAT maps
 * //// (NeoResto lot 1, task 11): `item_tax_rate`, for the till's own tax category, and `takeaway_item_tax_rate`, for a
 * //// takeaway order. A till offline taxes its cart with them, and a line added without them (a dish from the
 * //// restaurant's card) reads them back from this cache (useInvoice).
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const itemStore = vi.hoisted(() => new Map())

vi.mock("frappe-ui", () => ({ call: vi.fn(), createResource: vi.fn() }))
vi.mock("../db", () => ({
	db: {
		items: {
			get: vi.fn(async (itemCode) => itemStore.get(itemCode)),
			bulkGet: vi.fn(async (codes) => codes.map((code) => itemStore.get(code))),
			bulkPut: vi.fn(async (rows) => {
				for (const row of rows) itemStore.set(row.item_code, { ...row })
			}),
		},
		item_prices: { bulkPut: vi.fn() },
		transaction: vi.fn(async (_mode, _table, fn) => fn()),
	},
	getSetting: vi.fn(),
	setSetting: vi.fn(),
}))

const { cacheItems } = await import("../items")
const { getCachedItem } = await import("../cache")

describe("the offline item cache", () => {
	beforeEach(() => itemStore.clear())

	it("keeps both VAT maps of an item, and gives them back", async () => {
		const onSite = JSON.stringify({ "VAT 8.1": 8.1, "VAT 2.6": 0 })
		const takeaway = JSON.stringify({ "VAT 8.1": 0, "VAT 2.6": 2.6 })
		await cacheItems([
			{ item_code: "PASTA", item_name: "Pasta", rate: 10.81, item_tax_rate: onSite, takeaway_item_tax_rate: takeaway },
			// A till without a takeaway rule is sent no takeaway map
			{ item_code: "BREAD", item_name: "Bread", rate: 3.5, item_tax_rate: "{}", takeaway_item_tax_rate: null },
		])

		expect(await getCachedItem("PASTA")).toMatchObject({ item_tax_rate: onSite, takeaway_item_tax_rate: takeaway })
		expect(await getCachedItem("BREAD")).toMatchObject({ item_tax_rate: "{}", takeaway_item_tax_rate: null })
	})
})
