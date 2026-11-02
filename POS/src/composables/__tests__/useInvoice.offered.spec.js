/**
 * //// Neoffice — added file (no upstream equivalent). An offered row (NeoResto lot 1, task 24) survives every way the
 * //// cart is refilled: a table's draft opened from the floor plan or from the drafts (addItem, the loader adding the
 * //// row's flag and list price), a guest's order reloaded (replaceAllItems), a held cart (addItem with the stored row).
 * //// It stays a row of its own, at its list price, 100 % off; and it reaches the server flagged.
 */
import { createPinia, setActivePinia } from "pinia"
import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("frappe-ui", () => ({
	createResource: (options = {}) => ({
		submit: vi.fn(),
		fetch: vi.fn(),
		reload: vi.fn(),
		data: null,
		options,
	}),
	call: vi.fn(),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => true,
	getCachedItem: vi.fn(async () => null),
}))
vi.mock("@/stores/serialNumber", () => ({
	useSerialNumberStore: () => ({ returnSerials: vi.fn() }),
}))

const { useInvoice } = await import("../useInvoice")
const { offeredSourceFields } = await import("@/utils/offeredRows")

// A table's draft as the server holds it: two tiramisus paid, one offered (rate 0, its list price kept)
const SERVER_ROWS = [
	{
		item_code: "TIRAMISU",
		item_name: "Tiramisu",
		qty: 2,
		rate: 9.5,
		uom: "Nos",
		kds_status: "Pending",
	},
	{
		item_code: "TIRAMISU",
		item_name: "Tiramisu",
		qty: 1,
		rate: 0,
		price_list_rate: 9.5,
		uom: "Nos",
		kds_status: "Pending",
		posa_is_offered: 1,
	},
]

describe("an offered row comes back offered", () => {
	beforeEach(() => setActivePinia(createPinia()))

	it("from a table's draft opened at the till (the loader adds the row's flag and list price)", () => {
		const inv = useInvoice()
		for (const row of SERVER_ROWS) {
			// What FloorPlanEditor.selectTable / POSSale.handleLoadServerDraft hand to addItem
			inv.addItem(
				{
					item_code: row.item_code,
					item_name: row.item_name,
					rate: row.rate,
					uom: row.uom,
					kds_status: row.kds_status,
					...offeredSourceFields(row),
				},
				row.qty,
			)
		}
		expect(
			inv.invoiceItems.value.map((r) => [
				r.quantity,
				r.posa_is_offered || 0,
				r.price_list_rate,
				r.discount_percentage,
			]),
		).toEqual([
			[2, 0, 9.5, 0],
			[1, 1, 9.5, 100],
		])
		expect(inv.grandTotal.value).toBe(19)
	})

	it("from a guest's order reloaded (replaceAllItems)", () => {
		const inv = useInvoice()
		inv.replaceAllItems(SERVER_ROWS)
		expect(
			inv.invoiceItems.value.map((r) => [
				r.quantity,
				r.posa_is_offered || 0,
				r.price_list_rate,
				r.discount_percentage,
			]),
		).toEqual([
			[2, 0, 9.5, 0],
			[1, 1, 9.5, 100],
		])
		expect(inv.grandTotal.value).toBe(19)
	})

	it("from a held cart (the stored row as it was)", () => {
		const inv = useInvoice()
		inv.addItem(
			{
				item_code: "TIRAMISU",
				item_name: "Tiramisu",
				rate: 9.5,
				price_list_rate: 9.5,
				uom: "Nos",
			},
			2,
		)
		inv.addItem(
			{
				item_code: "TIRAMISU",
				item_name: "Tiramisu",
				rate: 9.5,
				price_list_rate: 9.5,
				uom: "Nos",
				posa_is_offered: 1,
				discount_percentage: 100,
			},
			1,
		)
		expect(inv.invoiceItems.value).toHaveLength(2)
		expect(inv.grandTotal.value).toBe(19)
	})

	it("a paid row a loader hands over keeps what it always had: no list price is added to it", () => {
		expect(offeredSourceFields(SERVER_ROWS[0])).toEqual({})
	})
})

describe("an offered row reaches the server flagged", () => {
	beforeEach(() => setActivePinia(createPinia()))

	it("in the invoice the till submits, at rate 0 and its list price", () => {
		const inv = useInvoice()
		inv.replaceAllItems(SERVER_ROWS)
		const sent = inv.formatItemsForSubmission(inv.invoiceItems.value)
		expect(
			sent.map((i) => [
				i.qty,
				i.posa_is_offered,
				i.rate,
				i.price_list_rate,
				i.discount_percentage,
			]),
		).toEqual([
			[2, 0, 9.5, 9.5, 0],
			[1, 1, 0, 9.5, 100],
		])
	})

	it("never in what the offers engine is asked", () => {
		const inv = useInvoice()
		const params = inv.applyOffersResource.options.makeParams({
			invoice_data: {
				pos_profile: "Till",
				items: [{ item_code: "A" }, { item_code: "B", posa_is_offered: 1 }],
			},
		})
		expect(
			JSON.parse(params.invoice_data).items.map((i) => i.item_code),
		).toEqual(["A"])
	})
})

describe("the loaders of a table's draft hand over the row's offer", () => {
	const source = (rel) => readFileSync(path.resolve(__dirname, rel), "utf8")

	it("the opening of a table (the floor plan's list and the notices of a guest's order go through it) and the server drafts add offeredSourceFields(item) to the line they add", () => {
		//// Neoffice — the floor plan's loader moved to composables/useOpenTable.js, which the floor plan calls (Daniel, 01.11)
		expect(source("../../composables/useOpenTable.js")).toMatch(
			/cartStore\.addItem\(\s*\{[\s\S]{0,1200}\.\.\.offeredSourceFields\(item\)/,
		)
		expect(source("../../components/pos/FloorPlanEditor.vue")).toMatch(/await openTable\(table\)/)
		expect(source("../../pages/POSSale.vue")).toMatch(
			/function handleLoadServerDraft[\s\S]{0,1600}\.\.\.offeredSourceFields\(item\)/,
		)
	})
})
