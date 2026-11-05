/**
 * //// Neoffice — added file (no upstream equivalent). On a phone, leaving the order of a table brings the waiter back to the tables (NeoResto lot 1; product owner, 05.11.2026: « je valide, j'envoie en
 * //// cuisine, il ne revient pas sur l'écran de base, il reste planté sur le panier »).
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest"
import { effectScope, nextTick, reactive, ref } from "vue"
import { hasLeftTheOrder, useReturnToTables } from "../useReturnToTables"

function open({ phone = true, table = { name: "T5" }, takeaway = false } = {}) {
	const cart = reactive({ restaurantTable: table, isTakeaway: takeaway })
	const ui = { setMobileTab: vi.fn() }
	const scope = effectScope()
	scope.run(() => useReturnToTables({ cart, ui, isPhone: ref(phone) }))
	return { cart, ui, scope }
}

describe("the rule", () => {
	it("says the order was left only from an order to none", () => {
		expect(hasLeftTheOrder(true, false)).toBe(true)
		expect(hasLeftTheOrder(false, false)).toBe(false)
		expect(hasLeftTheOrder(true, true)).toBe(false)
		expect(hasLeftTheOrder(false, true)).toBe(false)
	})
})

describe("a phone", () => {
	it("goes back to the card tab, where the tables are, once the table is gone (the order sent)", async () => {
		const { cart, ui, scope } = open()

		cart.restaurantTable = null
		await nextTick()
		await nextTick()

		expect(ui.setMobileTab).toHaveBeenCalledWith("items")
		expect(ui.setMobileTab).toHaveBeenCalledTimes(1)
		scope.stop()
	})

	it("does the same when a takeaway order is left", async () => {
		const { cart, ui, scope } = open({ table: null, takeaway: true })

		cart.isTakeaway = false
		await nextTick()
		await nextTick()

		expect(ui.setMobileTab).toHaveBeenCalledWith("items")
		scope.stop()
	})

	it("stays where it is while a table is still open, or when another table replaces it in the same breath", async () => {
		const { cart, ui, scope } = open()

		cart.restaurantTable = { name: "T5" } // another group of the same table
		await nextTick()
		cart.restaurantTable = null
		cart.restaurantTable = { name: "T6" }
		await nextTick()
		await nextTick()

		expect(ui.setMobileTab).not.toHaveBeenCalled()
		scope.stop()
	})

	it("does nothing when no order was open to begin with", async () => {
		const { cart, ui, scope } = open({ table: null })

		cart.restaurantTable = null
		await nextTick()

		expect(ui.setMobileTab).not.toHaveBeenCalled()
		scope.stop()
	})
})

describe("a tablet or a computer", () => {
	it("is never moved: it draws the floor in the same pane", async () => {
		const { cart, ui, scope } = open({ phone: false })

		cart.restaurantTable = null
		await nextTick()
		await nextTick()

		expect(ui.setMobileTab).not.toHaveBeenCalled()
		scope.stop()
	})
})
