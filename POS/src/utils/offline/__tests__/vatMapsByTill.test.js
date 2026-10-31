/**
 * //// Neoffice — added file (no upstream equivalent). An item's VAT maps are the till's (NeoRestau lot 1, task 11): the
 * //// offline item cache is keyed by item code and shared by every till of a browser, so it keeps the maps by till, and
 * //// the cart takes only its own till's: a browser that switches tills never taxes a line with the other's.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const itemStore = vi.hoisted(() => new Map())

vi.mock("frappe-ui", () => ({
	call: vi.fn(),
	createResource: () => ({ submit: vi.fn(), fetch: vi.fn() }),
}))
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
vi.mock("@/utils/offline", () => ({
	isOffline: () => true,
	getCachedItem: vi.fn(async (itemCode) => itemStore.get(itemCode)),
}))
vi.mock("@/stores/serialNumber", () => ({
	useSerialNumberStore: () => ({ returnSerials: vi.fn() }),
}))

const { cacheItems } = await import("../items")
const { vatMapsFor, withVatMapsByTill } = await import("../vatMaps")
const { useInvoice } = await import("@/composables/useInvoice")

const RESTAURANT = {
	item_tax_rate: '{"VAT 8.1": 8.1, "VAT 2.6": 0}',
	takeaway_item_tax_rate: '{"VAT 8.1": 0, "VAT 2.6": 2.6}',
}
const COUNTER = {
	item_tax_rate: '{"VAT 8.1": 8.1, "VAT 2.6": 0}',
	takeaway_item_tax_rate: null,
}
// What the server sends each till for the same dish
const fromServer = (till, maps) => ({
	item_code: "PASTA",
	item_name: "Pasta",
	rate: 10.81,
	vat_maps_pos_profile: till,
	...maps,
})

describe("the VAT maps of an item are kept by till", () => {
	beforeEach(() => {
		itemStore.clear()
		setActivePinia(createPinia())
	})

	it("keeps every till's maps in the cache, the last till's on top", async () => {
		await cacheItems([fromServer("Restaurant till", RESTAURANT)])
		await cacheItems([fromServer("Counter till", COUNTER)])
		const cached = itemStore.get("PASTA")
		expect(cached.vat_maps).toEqual({
			"Restaurant till": RESTAURANT,
			"Counter till": COUNTER,
		})
		expect(vatMapsFor(cached, "Restaurant till")).toEqual(RESTAURANT)
		expect(vatMapsFor(cached, "Counter till")).toEqual(COUNTER)
		// A till the browser never loaded the item for has none: the line keeps the till's rows
		expect(vatMapsFor(cached, "Bar till")).toBeNull()
	})

	it("reads an item straight from the server as its till's", () => {
		expect(
			vatMapsFor(fromServer("Restaurant till", RESTAURANT), "Restaurant till"),
		).toEqual(RESTAURANT)
		expect(
			vatMapsFor(fromServer("Counter till", COUNTER), "Restaurant till"),
		).toBeNull()
		expect(withVatMapsByTill({ item_code: "X" }, undefined)).toEqual({})
	})

	it("never taxes a line with another till's maps", async () => {
		// The browser served the counter last: the cached row's own fields are the counter's
		await cacheItems([fromServer("Restaurant till", RESTAURANT)])
		await cacheItems([fromServer("Counter till", COUNTER)])
		const inv = useInvoice()
		inv.posProfile.value = "Restaurant till"
		inv.taxRules.value = [
			{ account_head: "VAT 8.1", charge_type: "On Net Total", rate: 0 },
			{ account_head: "VAT 2.6", charge_type: "On Net Total", rate: 0 },
		]
		inv.setTaxInclusive(true)
		inv.isTakeaway.value = true
		// The offline grid hands the cached row over
		inv.addItem({
			...itemStore.get("PASTA"),
			price_list_rate: 10.26,
			rate: 10.26,
			uom: "Nos",
			stock_uom: "Nos",
		})
		const line = inv.invoiceItems.value[0]
		expect(line.takeaway_item_tax_rate).toBe(RESTAURANT.takeaway_item_tax_rate)
		expect(inv.totalTax.value).toBe(0.26)
	})
})
