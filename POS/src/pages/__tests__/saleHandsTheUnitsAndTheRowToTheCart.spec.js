/**
 * //// Neoffice — added file (no upstream equivalent). What the sale page and the cart hand to the cart store (NeoRestau lot
 * //// 1, task 22, fix round 1). The units of a menu course item, of the rows of an offline invoice taken back and of a card
 * //// entry reach the cart line through functions a spec calls; nothing else would notice the page building the line
 * //// without them. The same for the row of a line: the stepper, the typed quantity, the removal, the unit dropdown and the
 * //// edit dialog of a line say WHICH line they mean, not only its item and its unit, now that a table's cart holds the
 * //// same dish twice (the line the kitchen has, the line that waits). The two files are far too big to mount, so the spec
 * //// reads their source. Fix round 2 adds the bindings of the sale page's template, which carry those emits to the store, and
 * //// the line a price typed for a dish goes to.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const read = (file) => readFileSync(path.resolve(__dirname, file), "utf8")
const page = read("../POSSale.vue")
const cart = read("../../components/sale/InvoiceCart.vue")
const store = read("../../stores/posCart.js")

/** The text of a function of a source: from its name to the brace that closes it. */
function bodyOf(source, name) {
	const start = source.search(new RegExp(`function ${name}\\(`))
	expect(start, `function ${name} is in the source`).toBeGreaterThanOrEqual(0)
	const open = source.indexOf("{", source.indexOf(")", start))
	let depth = 0
	for (let i = open; i < source.length; i++) {
		if (source[i] === "{") depth++
		else if (source[i] === "}" && --depth === 0)
			return source.slice(start, i + 1)
	}
	throw new Error(`function ${name} does not end`)
}

describe("the sale page hands the units to the cart", () => {
	it("makes the line of a card entry with cardItemToCartItem", () => {
		expect(bodyOf(page, "handleCardItemClick")).toMatch(
			/cardItemToCartItem\(cardItem\)/,
		)
	})

	it("makes the line of a menu course item with menuItemToCartItem, for each item", () => {
		const body = bodyOf(page, "handleMenuConfirmed")

		expect(body).toMatch(/for \(const menuItem of menuItems\)/)
		expect(body).toMatch(
			/cartStore\.addItem\(menuItemToCartItem\(menuItem\), 1\)/,
		)
	})

	it("completes the rows of an offline invoice with the units the till keeps, before it adds them", () => {
		const body = bodyOf(page, "handleEditOfflineInvoice")

		const completed = body.search(
			/withKnownUnits\(invoiceData\.items, getItemWithPrice\)/,
		)
		const added = body.search(/cartStore\.addItem\(/)
		expect(completed).toBeGreaterThanOrEqual(0)
		expect(added).toBeGreaterThan(completed)
		expect(body).toMatch(/for \(const item of rows\)/)
	})

	it("hands the row the cart edited to the store, a second time too", () => {
		expect(bodyOf(page, "handleEditItem")).toMatch(
			/updateItemDetails\(updatedItem\.item_code, updatedItem, null, row\)/,
		)
	})
})

// The cart's events reach the store through the bindings of the sale page's template, and the row rides last on each of
// them. A change of a binding would drop the row without a single store spec noticing (fix round 2).
describe("the sale page's template binds the cart's events to the store, row included", () => {
	it("binds the quantity, the unit and the edit dialog of a line", () => {
		expect(page).toMatch(/@update-quantity="cartStore\.updateItemQuantity"/)
		expect(page).toMatch(/@update-uom="cartStore\.changeItemUOM"/)
		expect(page).toMatch(/@edit-item="handleEditItem"/)
	})

	it("binds the removal of a line to the row the cart hands over, as the first argument", () => {
		expect(page).toMatch(
			/@remove-item="\s*\(itemCode, uom\) => cartStore\.removeItem\(itemCode, uom\)\s*"/,
		)
	})

	it("has the store take the row as the fourth argument, where the events put it", () => {
		expect(store).toMatch(
			/function updateItemQuantity\(itemCode, quantity, uom = null, row = null\)/,
		)
		expect(store).toMatch(
			/async function changeItemUOM\(itemCode, newUom, currentUom = null, row = null\)/,
		)
		expect(store).toMatch(
			/async function updateItemDetails\(itemCode, updates, currentUom = null, row = null\)/,
		)
	})

	it("hands the same object to the store and to the parent for the edit dialog's change, so the store can tell it was applied", () => {
		const body = bodyOf(cart, "handleUpdateItem")

		const toStore = body.search(/updateItemDetails\(updatedItem\.item_code, updatedItem,/)
		const toParent = body.search(/emit\("edit-item", updatedItem,/)
		expect(toStore).toBeGreaterThanOrEqual(0)
		expect(toParent).toBeGreaterThan(toStore)
	})

	it("prices the line a price was typed for by the cart line the dialog was opened on, not by the last line of that dish", () => {
		const body = bodyOf(page, "handlePriceConfirmed")

		expect(body).toMatch(/cartLineOf\(cartStore\.invoiceItems, item\)/)
		expect(body).not.toMatch(/invoiceItems\.findLast/)
	})
})

describe("the cart hands the line it means to the store", () => {
	it("asks for a quantity by row: the stepper, the typed quantity and the rounding", () => {
		expect(bodyOf(cart, "setQuantityOf")).toMatch(
			/emit\("update-quantity", item\.item_code, quantity, item\.uom, cartRowOf\(item\)\)/,
		)
		// The typed quantity is read by applyTypedQuantity: at once for a line that waits, when the field is left for a sent one
		for (const name of [
			"incrementQuantity",
			"decrementQuantity",
			"applyTypedQuantity",
			"handleQuantityBlur",
		]) {
			expect(bodyOf(cart, name), name).toMatch(/setQuantityOf\(item, /)
		}
		expect(bodyOf(cart, "updateQuantity")).toMatch(/applyTypedQuantity\(item, value\)/)
		expect(bodyOf(cart, "handleQuantityBlur")).toMatch(/applyTypedQuantity\(item, typed\)/)
	})

	it("asks for a removal by row, wherever a quantity drops to nothing", () => {
		expect(bodyOf(cart, "removeRowOf")).toMatch(
			/emit\("remove-item", cartRowOf\(item\)\)/,
		)
		for (const name of [
			"decrementQuantity",
			"applyTypedQuantity",
			"handleQuantityBlur",
		]) {
			expect(bodyOf(cart, name), name).toMatch(/removeRowOf\(item\)/)
		}
	})

	it("never asks for either by item and unit alone any more", () => {
		expect(cart).not.toMatch(
			/emit\("update-quantity", item\.item_code, [A-Za-z]+, item\.uom\)/,
		)
		expect(cart).not.toMatch(/emit\("remove-item", item\.item_code/)
	})

	it("changes the unit of the line whose dropdown was opened, by row", () => {
		const body = bodyOf(cart, "selectUom")

		expect(body).toMatch(
			/changeItemUOM\(item\.item_code, newUom, currentUom, cartRowOf\(item\)\)/,
		)
		expect(body).toMatch(
			/emit\("update-uom", item\.item_code, newUom, currentUom, cartRowOf\(item\)\)/,
		)
	})

	it("applies the edit dialog's update to the line that was opened, by row", () => {
		expect(bodyOf(cart, "openEditDialog")).toMatch(
			/editedRow = cartRowOf\(item\)/,
		)
		const body = bodyOf(cart, "handleUpdateItem")

		expect(body).toMatch(
			/updateItemDetails\(updatedItem\.item_code, updatedItem, originalUom, editedRow\)/,
		)
		expect(body).toMatch(/emit\("edit-item", updatedItem, editedRow\)/)
	})
})
