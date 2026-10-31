/**
 * //// Neoffice — added file (no upstream equivalent). What the sale page and the cart hand to the cart store (NeoRestau lot
 * //// 1, task 22, fix round 1). The units of a menu course item, of the rows of an offline invoice taken back and of a card
 * //// entry reach the cart line through functions a spec calls; nothing else would notice the page building the line
 * //// without them. The same for the row of a line: the stepper, the typed quantity, the removal, the unit dropdown and the
 * //// edit dialog of a line say WHICH line they mean, not only its item and its unit, now that a table's cart holds the
 * //// same dish twice (the line the kitchen has, the line that waits). The two files are far too big to mount, so the spec
 * //// reads their source.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const read = (file) => readFileSync(path.resolve(__dirname, file), "utf8")
const page = read("../POSSale.vue")
const cart = read("../../components/sale/InvoiceCart.vue")

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

describe("the cart hands the line it means to the store", () => {
	it("asks for a quantity by row: the stepper, the typed quantity and the rounding", () => {
		expect(bodyOf(cart, "setQuantityOf")).toMatch(
			/emit\("update-quantity", item\.item_code, quantity, item\.uom, cartRowOf\(item\)\)/,
		)
		for (const name of [
			"incrementQuantity",
			"decrementQuantity",
			"updateQuantity",
			"handleQuantityBlur",
		]) {
			expect(bodyOf(cart, name), name).toMatch(/setQuantityOf\(item, /)
		}
	})

	it("asks for a removal by row, wherever a quantity drops to nothing", () => {
		expect(bodyOf(cart, "removeRowOf")).toMatch(
			/emit\("remove-item", cartRowOf\(item\)\)/,
		)
		for (const name of [
			"decrementQuantity",
			"updateQuantity",
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
