/**
 * //// Neoffice — added file (no upstream equivalent). A line that has left for the kitchen never absorbs a new unit
 * //// (NeoRestau lot 1, task 22, fix round 1). The line of a table's order read back carries its unit and its kitchen
 * //// status; the card tap, the grid, the scanner and the « + » of the stepper all went through a lookup on the item
 * //// and its unit alone, so a second round of the same drink became « Wine x5 » on a line already « Pending »: the
 * //// extra unit was billed and never sent to the bar. A new unit leaves at once, on a line of its own that the
 * //// kitchen dialog offers; a line not sent yet (no status, or held back as « Waiting ») still takes it.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? `${s} ${args.join(" ")}` : s)
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showWarning: vi.fn(),
		showInfo: vi.fn(),
	}),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

const { usePOSCartStore } = await import("../posCart")
const { cardItemToCartItem } = await import("@/utils/cartLineUnits")

// A line of a table's order read back from the server, as the floor plan puts it in the cart
const SENT_WINE = {
	item_code: "wine",
	item_name: "Wine",
	rate: 29,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	item_uoms: [],
	kds_status: "Pending",
}
// The same wine as the card entry (get_active_cards), as the grid (get_items) and as the scanner give it
const WINE_ENTRY = {
	item_type: "Item",
	item: "wine",
	item_name: "Wine",
	price: 29,
	stock_uom: "Unit",
	item_uoms: [],
}
const WINE_IN_THE_GRID = {
	item_code: "wine",
	item_name: "Wine",
	rate: 29,
	price_list_rate: 29,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	item_uoms: [],
}

const wines = (cart) =>
	cart.invoiceItems.filter((line) => line.item_code === "wine")
const quantities = (cart) => wines(cart).map((line) => line.quantity)
const statuses = (cart) => wines(cart).map((line) => line.kds_status)

describe("a line that has left for the kitchen never absorbs a new unit", () => {
	let cart
	let sent
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		cart.addItem({ ...SENT_WINE }, 4)
		sent = cart.invoiceItems[0]
	})

	it("a card tap makes a line of its own and leaves the sent one at what the kitchen has", () => {
		cart.addItem(cardItemToCartItem(WINE_ENTRY), 1)

		expect(quantities(cart)).toEqual([4, 1])
		expect(statuses(cart)).toEqual(["Pending", ""])
		expect(cart.invoiceItems[0]).toBe(sent)
	})

	it("a tap on the grid does the same", () => {
		cart.addItem({ ...WINE_IN_THE_GRID }, 1)

		expect(quantities(cart)).toEqual([4, 1])
		expect(statuses(cart)).toEqual(["Pending", ""])
	})

	it("so does a scan, which adds without the stock check", () => {
		cart.addItem({ ...WINE_IN_THE_GRID }, 1, true, { warehouse: "Stores" })

		expect(quantities(cart)).toEqual([4, 1])
	})

	it("whatever the status the kitchen has put on it: Pending, Preparing, Ready or Delivered", () => {
		for (const status of ["Preparing", "Ready", "Delivered"]) {
			cart.invoiceItems.splice(0)
			cart.addItem({ ...SENT_WINE, kds_status: status }, 2)
			cart.addItem({ ...WINE_IN_THE_GRID }, 1)

			expect(quantities(cart)).toEqual([2, 1])
		}
	})

	it("the next taps go to the new line: one line is sent, one waits", () => {
		cart.addItem({ ...WINE_IN_THE_GRID }, 1)
		cart.addItem(cardItemToCartItem(WINE_ENTRY), 1)

		expect(quantities(cart)).toEqual([4, 2])
		expect(statuses(cart)).toEqual(["Pending", ""])
	})

	it("a line not sent yet still takes the new unit, whether it has no status or is held back", () => {
		for (const status of [undefined, "", "Waiting"]) {
			cart.invoiceItems.splice(0)
			cart.addItem({ ...SENT_WINE, kds_status: status }, 2)
			cart.addItem({ ...WINE_IN_THE_GRID }, 1)

			expect(quantities(cart)).toEqual([3])
		}
	})

	it("two rounds read back from the server stay two lines", () => {
		cart.addItem({ ...SENT_WINE }, 1)

		expect(quantities(cart)).toEqual([4, 1])
		expect(statuses(cart)).toEqual(["Pending", "Pending"])
	})

	describe("the + of the stepper and the typed quantity, which the cart hands over with the row they were made on", () => {
		it("a + on the sent line adds the unit on a new line, and the sent line stays", () => {
			cart.updateItemQuantity("wine", 5, "Unit", sent)

			expect(quantities(cart)).toEqual([4, 1])
			expect(statuses(cart)).toEqual(["Pending", ""])
			expect(cart.invoiceItems[0]).toBe(sent)
		})

		it("a second + on the new line raises the new line, not the sent one", () => {
			cart.updateItemQuantity("wine", 5, "Unit", sent)
			const added = cart.invoiceItems[1]

			cart.updateItemQuantity("wine", 2, "Unit", added)

			expect(quantities(cart)).toEqual([4, 2])
			expect(sent.quantity).toBe(4)
		})

		it("a quantity typed on the sent line above what it has adds the difference", () => {
			cart.updateItemQuantity("wine", 7, "Unit", sent)

			expect(quantities(cart)).toEqual([4, 3])
		})

		it("a + on the sent line goes to the line that waits when there is one", () => {
			cart.addItem({ ...WINE_IN_THE_GRID }, 1)

			cart.updateItemQuantity("wine", 5, "Unit", sent)

			expect(quantities(cart)).toEqual([4, 2])
		})

		it("a lower quantity on the sent line still lowers it", () => {
			cart.updateItemQuantity("wine", 3, "Unit", sent)

			expect(quantities(cart)).toEqual([3])
		})

		it("a + on a line not sent yet raises that line", () => {
			cart.invoiceItems.splice(0)
			cart.addItem({ ...SENT_WINE, kds_status: "" }, 2)

			cart.updateItemQuantity("wine", 3, "Unit", cart.invoiceItems[0])

			expect(quantities(cart)).toEqual([3])
		})

		it("without the row, the call keeps its old meaning: the first line of that item and unit", () => {
			cart.updateItemQuantity("wine", 5, "Unit")

			// The first line is the sent one: the unit goes on a line of its own
			expect(quantities(cart)).toEqual([4, 1])
		})

		it("the new line of a dish with options carries the same options and price", () => {
			cart.invoiceItems.splice(0)
			cart.addItem(
				{
					...SENT_WINE,
					rate: 31,
					posa_item_modifiers:
						'[{"group":"Size","options":[{"name":"Large","price_adjustment":2}]}]',
					_modifiers_applied: 2,
				},
				1,
			)
			const steak = cart.invoiceItems[0]

			cart.updateItemQuantity("wine", 2, "Unit", steak)

			const [first, extra] = cart.invoiceItems
			expect(first.quantity).toBe(1)
			expect(extra).toMatchObject({
				quantity: 1,
				kds_status: "",
				rate: 31,
				posa_item_modifiers: steak.posa_item_modifiers,
				_modifiers_applied: 2,
			})
		})
	})

	describe("the details dialog of a line, which hands over the row it edited", () => {
		it("a quantity raised on the sent line goes on a line of its own, and its other changes still reach the sent line", async () => {
			await cart.updateItemDetails(
				"wine",
				{ ...sent, quantity: 6, discount_percentage: 10 },
				"Unit",
				sent,
			)

			expect(quantities(cart)).toEqual([4, 2])
			expect(statuses(cart)).toEqual(["Pending", ""])
			expect(sent.discount_percentage).toBe(10)
		})

		it("a lower quantity still lowers the sent line", async () => {
			await cart.updateItemDetails(
				"wine",
				{ ...sent, quantity: 3 },
				"Unit",
				sent,
			)

			expect(quantities(cart)).toEqual([3])
		})

		it("the update of the line that waits does not touch the sent line, which comes first", async () => {
			cart.addItem({ ...WINE_IN_THE_GRID }, 1)
			const waiting = cart.invoiceItems[1]

			await cart.updateItemDetails(
				"wine",
				{ ...waiting, quantity: 3 },
				"Unit",
				waiting,
			)

			expect(quantities(cart)).toEqual([4, 3])
		})

		it("the same update applied a second time, as the cart does for its parent, changes no other line", async () => {
			cart.addItem({ ...WINE_IN_THE_GRID }, 1)
			const waiting = cart.invoiceItems[1]
			const update = { ...waiting, quantity: 3 }

			await cart.updateItemDetails("wine", update, "Unit", waiting)
			await cart.updateItemDetails("wine", update, null, waiting)

			expect(quantities(cart)).toEqual([4, 3])
		})

		it("the unit dropdown of the line that waits changes the unit of that line", async () => {
			cart.invoiceItems.splice(0)
			const by = (uom, kds_status) => ({
				...WINE_IN_THE_GRID,
				uom,
				conversion_factor: uom === "Case" ? 6 : 1,
				item_uoms: [{ uom: "Case", conversion_factor: 6 }],
				kds_status,
			})
			cart.addItem(by("Unit", "Pending"), 2)
			cart.addItem(by("Unit", ""), 1)
			const [sentLine, waiting] = cart.invoiceItems

			await cart.changeItemUOM("wine", "Case", "Unit", waiting)
			// The cart's parent asks a second time, with the same row: nothing more happens
			await cart.changeItemUOM("wine", "Case", "Unit", waiting)

			expect(sentLine.uom).toBe("Unit")
			expect(waiting.uom).toBe("Case")
		})
	})

	describe("the unit of a line changes", () => {
		// The same wine, by the unit and by the case of six
		const by = (uom, quantity, kds_status) => ({
			...WINE_IN_THE_GRID,
			uom,
			conversion_factor: uom === "Case" ? 6 : 1,
			item_uoms: [{ uom: "Case", conversion_factor: 6 }],
			kds_status,
			quantity,
		})
		const linesOf = (cart) =>
			wines(cart).map((line) => [line.uom, line.quantity, line.kds_status])

		beforeEach(() => {
			cart.invoiceItems.splice(0)
		})

		it("a line that waits is not merged into a case line that has been sent", async () => {
			cart.addItem(by("Unit", 1, ""), 1)
			cart.addItem(by("Case", 2, "Pending"), 2)

			await cart.changeItemUOM("wine", "Case", "Unit")

			expect(linesOf(cart)).toEqual([
				["Case", 1, ""],
				["Case", 2, "Pending"],
			])
		})

		it("a sent line is not merged into a case line that waits", async () => {
			cart.addItem(by("Unit", 1, "Pending"), 1)
			cart.addItem(by("Case", 2, ""), 2)

			await cart.changeItemUOM("wine", "Case", "Unit")

			expect(linesOf(cart)).toEqual([
				["Case", 1, "Pending"],
				["Case", 2, ""],
			])
		})

		it("two lines that wait are still merged into one", async () => {
			cart.addItem(by("Unit", 1, ""), 1)
			cart.addItem(by("Case", 2, ""), 2)

			await cart.changeItemUOM("wine", "Case", "Unit")

			expect(linesOf(cart)).toEqual([["Case", 3, ""]])
		})
	})
})
