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
// The toasts the cart shows, kept so a spec can tell that none was an error
const toast = vi.hoisted(() => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showWarning: vi.fn(),
	showInfo: vi.fn(),
}))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))
// A till that enforces stock validation, for the specs that need one
const till = vi.hoisted(() => ({ enforcesStock: false }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({
		shouldEnforceStockValidation: () => till.enforcesStock,
	}),
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
		till.enforcesStock = false
		toast.showError.mockClear()
		toast.showWarning.mockClear()
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

	// ------------------------------------------------------------------------------------------------------------------
	// Fix round 2
	// ------------------------------------------------------------------------------------------------------------------

	describe("the details dialog applied twice: once by the cart, once by its parent (fix round 2)", () => {
		it("a quantity raised on the SENT line adds its units once, not twice", async () => {
			const update = { ...sent, quantity: 5 }

			// What InvoiceCart.handleUpdateItem does, then what POSSale.handleEditItem does with the same object
			await cart.updateItemDetails("wine", update, "Unit", sent)
			await cart.updateItemDetails("wine", update, null, sent)

			expect(quantities(cart)).toEqual([4, 1])
			expect(statuses(cart)).toEqual(["Pending", ""])
		})

		it("so the bill and the kitchen agree: 5 units billed, 4 sent and 1 to send", async () => {
			const update = { ...sent, quantity: 5 }

			await cart.updateItemDetails("wine", update, "Unit", sent)
			await cart.updateItemDetails("wine", update, null, sent)

			const billed = quantities(cart).reduce((a, b) => a + b, 0)
			const notSent = cart.invoiceItems.filter((line) => !line.kds_status)
			expect(billed).toBe(5)
			expect(notSent.map((line) => line.quantity)).toEqual([1])
		})

		it("another raise made later, with a new update, adds its own units: 3 more on the line that waits", async () => {
			await cart.updateItemDetails("wine", { ...sent, quantity: 5 }, "Unit", sent)
			await cart.updateItemDetails("wine", { ...sent, quantity: 7 }, "Unit", sent)

			expect(quantities(cart)).toEqual([4, 4])
		})

		it("a raise the stock check refused is not consumed: nothing was added, the next try is a try", async () => {
			till.enforcesStock = true
			const update = { ...sent, quantity: 5 }

			await cart.updateItemDetails("wine", update, "Unit", sent)
			expect(quantities(cart)).toEqual([4])

			till.enforcesStock = false
			await cart.updateItemDetails("wine", update, "Unit", sent)
			expect(quantities(cart)).toEqual([4, 1])
		})

		it("the second application does not raise the stock check against the units the first one added", async () => {
			sent.is_stock_item = 1
			sent.actual_qty = 5
			sent.original_stock = 5
			till.enforcesStock = true
			const update = { ...sent, quantity: 5 }

			await cart.updateItemDetails("wine", update, "Unit", sent)
			await cart.updateItemDetails("wine", update, null, sent)

			expect(quantities(cart)).toEqual([4, 1])
			expect(toast.showError).not.toHaveBeenCalled()
		})
	})

	describe("an incoming line that has been sent never merges into a line that waits (fix round 2)", () => {
		it("a sent line read back after a line that waits stays a line of its own", () => {
			cart.invoiceItems.splice(0)
			cart.addItem({ ...WINE_IN_THE_GRID }, 2)

			cart.addItem({ ...SENT_WINE }, 3)

			expect(quantities(cart)).toEqual([2, 3])
			expect(statuses(cart)).toEqual(["", "Pending"])
		})

		it("a line held back as Waiting is still no sent line: it merges as before", () => {
			cart.invoiceItems.splice(0)
			cart.addItem({ ...WINE_IN_THE_GRID }, 2)

			cart.addItem({ ...SENT_WINE, kds_status: "Waiting" }, 3)

			expect(quantities(cart)).toEqual([5])
		})
	})

	describe("the units added to a sent line carry its price and its discount (fix round 2)", () => {
		const extraLine = () => cart.invoiceItems[cart.invoiceItems.length - 1]

		it("a price set by hand: the new unit is billed at it, not at the list price", async () => {
			await cart.updateItemDetails(
				"wine",
				{ ...sent, rate: 25, is_rate_manually_edited: 1, original_rate: 29 },
				"Unit",
				sent,
			)
			expect(sent).toMatchObject({ rate: 25, price_list_rate: 29 })

			cart.updateItemQuantity("wine", 5, "Unit", sent)

			expect(quantities(cart)).toEqual([4, 1])
			expect(extraLine()).toMatchObject({
				rate: 25,
				amount: 25,
				is_rate_manually_edited: 1,
				original_rate: 29,
				kds_status: "",
			})
		})

		it("a discount in percent: the new unit has it", async () => {
			await cart.updateItemDetails(
				"wine",
				{ ...sent, discount_percentage: 10 },
				"Unit",
				sent,
			)

			cart.updateItemQuantity("wine", 5, "Unit", sent)

			expect(extraLine()).toMatchObject({ discount_percentage: 10, amount: 26.1 })
		})

		it("a discount in amount counts as the same rate of discount on the new unit", async () => {
			// 11.6 off 4 x 29 = 10 percent
			await cart.updateItemDetails(
				"wine",
				{ ...sent, discount_amount: 11.6, discount_percentage: 0 },
				"Unit",
				sent,
			)

			cart.updateItemQuantity("wine", 5, "Unit", sent)

			expect(extraLine().amount).toBe(26.1)
		})

		it("a typed quantity and the details dialog carry them too", async () => {
			await cart.updateItemDetails(
				"wine",
				{ ...sent, rate: 25, is_rate_manually_edited: 1, original_rate: 29 },
				"Unit",
				sent,
			)

			await cart.updateItemDetails("wine", { ...sent, quantity: 6 }, "Unit", sent)

			expect(extraLine()).toMatchObject({ quantity: 2, rate: 25, amount: 50 })
		})

		it("a line that waits with other terms is not the line the units go to", async () => {
			await cart.updateItemDetails(
				"wine",
				{ ...sent, rate: 25, is_rate_manually_edited: 1, original_rate: 29 },
				"Unit",
				sent,
			)
			cart.addItem({ ...WINE_IN_THE_GRID }, 1)

			cart.updateItemQuantity("wine", 5, "Unit", sent)

			expect(quantities(cart)).toEqual([4, 1, 1])
			expect(cart.invoiceItems.map((line) => line.rate)).toEqual([25, 29, 25])
		})

		it("a line that waits with the same terms takes the units", async () => {
			const byHand = { rate: 25, is_rate_manually_edited: 1, original_rate: 29 }
			await cart.updateItemDetails("wine", { ...sent, ...byHand }, "Unit", sent)
			cart.addItem({ ...WINE_IN_THE_GRID, ...byHand }, 1)
			const waiting = cart.invoiceItems[1]
			await cart.updateItemDetails("wine", { ...waiting, ...byHand }, "Unit", waiting)

			cart.updateItemQuantity("wine", 5, "Unit", sent)

			expect(quantities(cart)).toEqual([4, 2])
		})

		it("a plain sent line still gives a plain unit, merged into a plain line that waits", () => {
			cart.addItem({ ...WINE_IN_THE_GRID }, 1)

			cart.updateItemQuantity("wine", 5, "Unit", sent)

			expect(quantities(cart)).toEqual([4, 2])
		})
	})

	describe("a price typed for a dish that is already in the cart (fix round 2)", () => {
		const priced = (price) => ({
			...WINE_IN_THE_GRID,
			rate: price,
			price_list_rate: price,
			is_rate_manually_edited: 1,
			original_rate: 0,
		})

		it("a second dish at another price is a line of its own", () => {
			cart.invoiceItems.splice(0)
			cart.addItem(priced(30), 1)

			cart.addItem(priced(100), 1)

			expect(quantities(cart)).toEqual([1, 1])
			expect(cart.invoiceItems.map((line) => line.rate)).toEqual([30, 100])
		})

		it("a second dish at the same price is a unit more on that line", () => {
			cart.invoiceItems.splice(0)
			cart.addItem(priced(30), 1)

			cart.addItem(priced(30), 1)

			expect(quantities(cart)).toEqual([2])
		})

		it("the line that was priced keeps the price set by hand", () => {
			cart.invoiceItems.splice(0)
			cart.addItem(priced(30), 1)

			expect(cart.invoiceItems[0]).toMatchObject({
				rate: 30,
				is_rate_manually_edited: 1,
			})
		})
	})

	describe("the unit dropdown applied twice, once by the cart and once by its parent (fix round 2)", () => {
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

		it("a line that waits merged into a case line leaves the sent unit line alone the second time", async () => {
			cart.invoiceItems.splice(0)
			cart.addItem(by("Unit", 2, "Pending"), 2)
			cart.addItem(by("Unit", 1, ""), 1)
			cart.addItem(by("Case", 1, ""), 1)
			const [sentLine, waiting] = cart.invoiceItems

			await cart.changeItemUOM("wine", "Case", "Unit", waiting)
			// The parent asks again with the same row, which the first call has merged away
			await cart.changeItemUOM("wine", "Case", "Unit", waiting)

			expect(sentLine.uom).toBe("Unit")
			expect(linesOf(cart)).toEqual([
				["Unit", 2, "Pending"],
				["Case", 2, ""],
			])
		})

		it("a row that is no longer in the cart changes no other line", async () => {
			cart.invoiceItems.splice(0)
			cart.addItem(by("Unit", 2, "Pending"), 2)
			const gone = { item_code: "wine", uom: "Unit" }

			await cart.changeItemUOM("wine", "Case", "Unit", gone)

			expect(linesOf(cart)).toEqual([["Unit", 2, "Pending"]])
		})

		it("a call with no row keeps looking the line up by its item and unit", async () => {
			cart.invoiceItems.splice(0)
			cart.addItem(by("Unit", 1, ""), 1)

			await cart.changeItemUOM("wine", "Case", "Unit")

			expect(linesOf(cart)).toEqual([["Case", 1, ""]])
		})

		it("the details dialog of a merged-away row is not applied to another line, nor reported as an error", async () => {
			cart.invoiceItems.splice(0)
			cart.addItem(by("Unit", 2, "Pending"), 2)
			cart.addItem(by("Unit", 1, ""), 1)
			cart.addItem(by("Case", 1, ""), 1)
			const [sentLine, waiting] = cart.invoiceItems
			const update = { ...waiting, uom: "Case" }

			await cart.updateItemDetails("wine", update, "Unit", waiting)
			const second = await cart.updateItemDetails("wine", update, null, waiting)

			expect(second).toBe(false)
			expect(toast.showError).not.toHaveBeenCalled()
			expect(sentLine).toMatchObject({ uom: "Unit", quantity: 2 })
			expect(linesOf(cart)).toEqual([
				["Unit", 2, "Pending"],
				["Case", 2, ""],
			])
		})
	})

	describe("the + of a line born from a restaurant card on a till that enforces stock (fix round 2)", () => {
		it("is not refused for a dish that is not a stock item", () => {
			till.enforcesStock = true
			cart.invoiceItems.splice(0)
			cart.addItem(cardItemToCartItem({ ...WINE_ENTRY, is_stock_item: 0 }), 1)
			const line = cart.invoiceItems[0]

			cart.updateItemQuantity("wine", 2, "Unit", line)

			expect(line.quantity).toBe(2)
		})

		it("is still checked against the stock for a dish that is one", () => {
			till.enforcesStock = true
			cart.invoiceItems.splice(0)
			cart.addItem(cardItemToCartItem({ ...WINE_ENTRY, is_stock_item: 1 }), 1)
			const line = cart.invoiceItems[0]

			cart.updateItemQuantity("wine", 2, "Unit", line)

			expect(line.quantity).toBe(1)
		})
	})

	// ------------------------------------------------------------------------------------------------------------------
	// Fix round 3
	// ------------------------------------------------------------------------------------------------------------------

	describe("a row that the cart no longer holds says so (fix round 3)", () => {
		const STALE = /no longer in the cart/

		// The guest-order refresh replaces the cart while the details dialog is open: the row it was opened on is gone
		const goneRow = () => {
			const row = cart.invoiceItems[0]
			cart.invoiceItems.splice(0)
			cart.addItem({ ...SENT_WINE }, 4)
			return row
		}

		it("the update of the details dialog tells the cashier, once, although the cart and its parent both apply it", async () => {
			const row = goneRow()
			const update = { ...row, quantity: 5 }

			const first = await cart.updateItemDetails("wine", update, "Unit", row)
			const second = await cart.updateItemDetails("wine", update, null, row)

			expect([first, second]).toEqual([false, false])
			expect(toast.showWarning).toHaveBeenCalledTimes(1)
			expect(toast.showWarning.mock.calls[0][0]).toMatch(STALE)
			expect(toast.showError).not.toHaveBeenCalled()
			expect(quantities(cart)).toEqual([4])
		})

		it("a later update, made with a new object, is told again", async () => {
			const row = goneRow()

			await cart.updateItemDetails("wine", { ...row, quantity: 5 }, "Unit", row)
			await cart.updateItemDetails("wine", { ...row, quantity: 6 }, "Unit", row)

			expect(toast.showWarning).toHaveBeenCalledTimes(2)
		})

		it("a change that was applied and merged its row away is not reported by its second pass", async () => {
			cart.invoiceItems.splice(0)
			const by = (uom, quantity, kds_status) => ({
				...WINE_IN_THE_GRID,
				uom,
				conversion_factor: uom === "Case" ? 6 : 1,
				item_uoms: [{ uom: "Case", conversion_factor: 6 }],
				kds_status,
				quantity,
			})
			cart.addItem(by("Unit", 1, ""), 1)
			cart.addItem(by("Case", 1, ""), 1)
			const [waiting] = cart.invoiceItems
			const update = { ...waiting, uom: "Case" }

			await cart.updateItemDetails("wine", update, "Unit", waiting)
			await cart.updateItemDetails("wine", update, null, waiting)

			expect(toast.showWarning).not.toHaveBeenCalled()
		})

		it("a quantity asked for a row that is gone goes to no other line, and says so", () => {
			const row = goneRow()

			cart.updateItemQuantity("wine", 9, "Unit", row)

			expect(quantities(cart)).toEqual([4])
			expect(toast.showWarning).toHaveBeenCalledTimes(1)
			expect(toast.showWarning.mock.calls[0][0]).toMatch(STALE)
		})

		it("a quantity asked with no row still finds its line by item and unit, silently", () => {
			cart.updateItemQuantity("wine", 3, "Unit")

			expect(quantities(cart)).toEqual([3])
			expect(toast.showWarning).not.toHaveBeenCalled()
		})
	})

	describe("a recalled draft keeps the price set by hand (fix round 3)", () => {
		// A draft, a held ticket and an offline invoice come back through addItem with the flag their line was saved with
		const recalled = (extra = {}) => ({
			...WINE_IN_THE_GRID,
			rate: 25,
			price_list_rate: 29,
			is_rate_manually_edited: 1,
			original_rate: 29,
			...extra,
		})

		beforeEach(() => {
			cart.invoiceItems.splice(0)
		})

		it("bills the price set by hand, not the list price", () => {
			cart.addItem(recalled(), 2)

			expect(cart.invoiceItems[0]).toMatchObject({
				rate: 25,
				price_list_rate: 29,
				is_rate_manually_edited: 1,
				original_rate: 29,
				amount: 50,
			})
		})

		it("keeps the discount in percent the line was saved with", () => {
			cart.addItem(recalled({ discount_percentage: 10 }), 2)

			expect(cart.invoiceItems[0]).toMatchObject({ discount_percentage: 10, amount: 45 })
		})

		it("does not merge two recalled lines that were priced differently", () => {
			cart.addItem(recalled(), 1)
			cart.addItem(recalled({ rate: 27 }), 1)

			expect(cart.invoiceItems.map((line) => [line.rate, line.quantity])).toEqual([
				[25, 1],
				[27, 1],
			])
		})

		it("leaves a line saved without a hand-set price at the list price", () => {
			cart.addItem({ ...WINE_IN_THE_GRID, rate: 25, price_list_rate: 29 }, 1)

			expect(cart.invoiceItems[0]).toMatchObject({ rate: 29, amount: 29 })
			expect(cart.invoiceItems[0].is_rate_manually_edited).toBeUndefined()
		})
	})
})
