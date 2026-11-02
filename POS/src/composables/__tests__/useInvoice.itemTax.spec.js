/**
 * //// Neoffice — added file (no upstream equivalent). The till computes the VAT item by item (NeoResto lot 1, task 11).
 * //// An item's tax comes from the till's tax rows where each row's rate is replaced by the item's own rate for that
 * //// row's account when its VAT map has one (ERPNext's rule for item_tax_rate); the cart takes the takeaway map while it
 * //// is a takeaway order; the tax rows are summed per account. The screen then says what the invoice says: in
 * //// Switzerland a dish to take away pays 2.6 %, a beer 8.1 % on site and to take away.
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

// The items the till has cached for offline use (IndexedDB), by item code
const cache = vi.hoisted(() => ({ items: new Map() }))

vi.mock("frappe-ui", () => ({
	createResource: () => ({ submit: vi.fn(), fetch: vi.fn(), reload: vi.fn(), data: null }),
	call: vi.fn(),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => true,
	getCachedItem: vi.fn(async (itemCode) => cache.items.get(itemCode)),
}))
vi.mock("@/stores/serialNumber", () => ({
	useSerialNumberStore: () => ({ returnSerials: vi.fn() }),
}))

const { useInvoice } = await import("../useInvoice")

// The Swiss layout item by item: one row per VAT account at rate 0, the price including the tax
const ITEM_WISE_ROWS = [
	{ account_head: "VAT 8.1", description: "VAT 8.1 %", charge_type: "On Net Total", rate: 0, included_in_print_rate: 1 },
	{ account_head: "VAT 2.6", description: "VAT 2.6 %", charge_type: "On Net Total", rate: 0, included_in_print_rate: 1 },
]
// What the server sends with each item (pos_next.api.items): its map for the till's own category, and for takeaway
const ON_SITE = JSON.stringify({ "VAT 8.1": 8.1, "VAT 2.6": 0 })
const TAKEAWAY = JSON.stringify({ "VAT 8.1": 0, "VAT 2.6": 2.6 })

const line = (itemCode, price, maps = {}) => ({
	item_code: itemCode,
	item_name: itemCode,
	rate: price,
	price_list_rate: price,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
	...maps,
})
// A dish: 2.6 % to take away. A beer: alcohol keeps its 8.1 % to take away, the server sends it its usual map twice.
const food = (price) => line("PASTA", price, { item_tax_rate: ON_SITE, takeaway_item_tax_rate: TAKEAWAY })
const beer = (price) => line("BEER", price, { item_tax_rate: ON_SITE, takeaway_item_tax_rate: ON_SITE })

function till({ rows = ITEM_WISE_ROWS, inclusive = true } = {}) {
	const inv = useInvoice()
	inv.taxRules.value = rows
	inv.setTaxInclusive(inclusive)
	return inv
}

describe("the till computes the VAT item by item", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		cache.items.clear()
	})

	it("taxes an item at its own rate, not the till's sum", () => {
		const inv = till()
		inv.addItem(food(10.81))
		// 10.81 holds 10.00 and 8.1 % of it, though the till's rows say 0
		expect(inv.invoiceItems.value[0].tax_amount).toBe(0.81)
		expect(inv.totalTax.value).toBe(0.81)
		expect(inv.grandTotal.value).toBe(10.81)
	})

	it("switches to the takeaway rates when the cart is a takeaway order", () => {
		const inv = till()
		inv.isTakeaway.value = true
		inv.addItem(food(10.26))
		expect(inv.totalTax.value).toBe(0.26)
		expect(inv.grandTotal.value).toBe(10.26)
	})

	it("taxes the lines already in the cart again when the order turns to take away, and back", () => {
		const inv = till()
		inv.addItem(food(10.81))
		inv.isTakeaway.value = true
		// The price includes the tax and does not move: only its VAT share does (10.81 / 1.026 = 10.54)
		expect(inv.totalTax.value).toBe(0.27)
		expect(inv.grandTotal.value).toBe(10.81)
		inv.isTakeaway.value = false
		expect(inv.totalTax.value).toBe(0.81)
	})

	it("keeps the till's rates for an item without a map", () => {
		const inv = till({
			rows: [{ account_head: "VAT 8.1", charge_type: "On Net Total", rate: 8.1, included_in_print_rate: 1 }],
		})
		inv.addItem(line("ANY", 10.81))
		expect(inv.totalTax.value).toBe(0.81)
		// A map naming none of the till's accounts leaves the till's rate as well (ERPNext's rule)
		inv.addItem(line("OTHER", 10.81, { item_tax_rate: "{}" }))
		expect(inv.totalTax.value).toBe(1.62)
	})

	it("sums the tax rows per account for a mixed cart", () => {
		const inv = till()
		inv.isTakeaway.value = true
		inv.addItem(food(10.26))
		inv.addItem(beer(10.81))
		expect(inv.taxesByAccount.value).toEqual([
			{ account_head: "VAT 8.1", description: "VAT 8.1 %", tax_amount: 0.81 },
			{ account_head: "VAT 2.6", description: "VAT 2.6 %", tax_amount: 0.26 },
		])
		expect(inv.totalTax.value).toBe(1.07)
	})

	it("adds the item's own rate on top of a price without tax, so the total follows it", () => {
		const inv = till({ inclusive: false })
		inv.isTakeaway.value = true
		inv.addItem(food(10))
		expect(inv.totalTax.value).toBe(0.26)
		expect(inv.grandTotal.value).toBe(10.26)
	})

	it("keeps the usual rates of a takeaway order at a till without a takeaway rule", () => {
		// The server sends no takeaway map (null) where the till's restaurant names no takeaway category
		const inv = till()
		inv.isTakeaway.value = true
		inv.addItem(line("PASTA", 10.81, { item_tax_rate: ON_SITE, takeaway_item_tax_rate: null }))
		expect(inv.totalTax.value).toBe(0.81)
	})

	it("leaves out a tax ERPNext marks not applicable to the item", () => {
		// The till's row would charge 8.1 %: the item's map says the tax does not apply to it
		const inv = till({
			rows: [{ account_head: "VAT 8.1", charge_type: "On Net Total", rate: 8.1, included_in_print_rate: 1 }],
		})
		inv.addItem(line("VOUCHER", 10.81, { item_tax_rate: JSON.stringify({ "VAT 8.1": "N/A" }) }))
		expect(inv.totalTax.value).toBe(0)
	})

	it("takes the maps a line comes without from the item cache", async () => {
		// A dish added from the restaurant's card carries no map; the catalogue the till cached has both
		cache.items.set("PASTA", { item_code: "PASTA", item_tax_rate: ON_SITE, takeaway_item_tax_rate: TAKEAWAY })
		const inv = till()
		inv.isTakeaway.value = true
		inv.addItem(line("PASTA", 10.26))
		await vi.waitFor(() => expect(inv.totalTax.value).toBe(0.26))
		expect(inv.invoiceItems.value[0].takeaway_item_tax_rate).toBe(TAKEAWAY)
		// A guest's order reloaded from the server comes without maps too
		inv.replaceAllItems([{ item_code: "PASTA", item_name: "Pasta", rate: 10.26, qty: 2 }])
		await vi.waitFor(() => expect(inv.totalTax.value).toBe(0.52))
	})
})
