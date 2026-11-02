/**
 * //// Neoffice — added file (no upstream equivalent). Opening a table in the till: the way tapping it in the list does it, and the way a notice of a guest's order does it (NeoResto lot 1, Daniel, 01.11: « regarde
 * //// comment la caisse sommelier reçoit l'info »). The server's order of the table is read FIRST (the cart stays in front of the waiter meanwhile), then the cart is cleared and rebuilt in one go: the table, the lines
 * //// with their units, family and « offered » flag, the draft, the customer. The floor's list and the notices both go through this one function, so that they cannot open a table in two different ways.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const answer = vi.hoisted(() => ({ value: null, fail: false, calls: [] }))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({})),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		answer.calls.push([method, args])
		if (answer.fail) throw new Error("offline")
		return answer.value
	}),
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till" }) }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }))

const { useOpenTable } = await import("../useOpenTable")
const { usePOSCartStore } = await import("@/stores/posCart")

const TABLE = { name: "t1", table_name: "T1", status: "Occupied" }
const ORDER = {
	name: "SINV-0001",
	customer: null,
	kds_status: "Pending",
	paid_amount: 12,
	tip_total: 3,
	items: [
		{ item_code: "wine", item_name: "Wine", qty: 2, rate: 29, uom: "Unit", stock_uom: "Unit", conversion_factor: 1, item_uoms: [], kds_status: "Pending", service_family: "Drink" },
		{ item_code: "soup", item_name: "Soup", qty: 1, rate: 12, uom: "Unit", kds_status: "Waiting", service_family: "Starter" },
	],
}

let cart
beforeEach(() => {
	setActivePinia(createPinia())
	cart = usePOSCartStore()
	answer.value = structuredClone(ORDER)
	answer.fail = false
	answer.calls = []
})

describe("opening a table", () => {
	it("asks the server for the order of the table at the till's profile", async () => {
		await useOpenTable().openTable(TABLE)

		expect(answer.calls).toEqual([["pos_next.api.restaurant.open_table", { table_name: "t1", pos_profile: "Till" }]])
	})

	it("puts the table and the lines of its order in the cart, each with its status and its family", async () => {
		const opened = await useOpenTable().openTable(TABLE)

		expect(opened).toBe(true)
		expect(cart.restaurantTable).toMatchObject({ name: "t1" })
		expect(cart.invoiceItems.map((line) => [line.item_code, line.quantity, line.kds_status, line.service_family])).toEqual([
			["wine", 2, "Pending", "Drink"],
			["soup", 1, "Waiting", "Starter"],
		])
	})

	it("takes the draft, the kitchen status, what the guest paid, and says nothing is unsent", async () => {
		await useOpenTable().openTable(TABLE)

		expect(cart.currentDraftId).toBe("SINV-0001")
		expect(cart.kdsStatus).toBe("Pending")
		expect(cart.guestPaidAmount).toBe(12)
		expect(cart.guestTipAmount).toBe(3)
		expect(cart.hasUnsentChanges).toBe(false)
	})

	it("replaces what the cart held: the table opened is the only one in front of the waiter", async () => {
		await useOpenTable().openTable({ name: "t9", table_name: "T9", status: "Occupied" })
		answer.value = { ...structuredClone(ORDER), name: "SINV-0002", items: [ORDER.items[1]] }

		await useOpenTable().openTable(TABLE)

		expect(cart.restaurantTable).toMatchObject({ name: "t1" })
		expect(cart.invoiceItems.map((line) => line.item_code)).toEqual(["soup"])
	})

	it("opens a table that has no order yet with an empty cart", async () => {
		answer.value = {}

		const opened = await useOpenTable().openTable(TABLE)

		expect(opened).toBe(true)
		expect(cart.restaurantTable).toMatchObject({ name: "t1" })
		expect(cart.invoiceItems).toEqual([])
	})

	it("leaves the cart as it was when the order cannot be read, and says so", async () => {
		await useOpenTable().openTable({ name: "t9", table_name: "T9", status: "Occupied" })
		answer.fail = true
		const log = vi.spyOn(console, "error").mockImplementation(() => {})

		const opened = await useOpenTable().openTable(TABLE)

		expect(opened).toBe(false)
		expect(cart.restaurantTable).toMatchObject({ name: "t9" })
		log.mockRestore()
	})
})
