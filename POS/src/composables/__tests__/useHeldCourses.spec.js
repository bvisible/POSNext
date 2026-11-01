/**
 * //// Neoffice — added file (no upstream equivalent). « Commander la suite » and « Tout commander » (NeoRestau lot 1, service
 * //// families): the waiter's gesture that releases what the table's order holds back. The server says WHICH lines (the same
 * //// rule that held them), the till marks them and sends the order; each release is a send of its own. If the send fails the
 * //// lines are held again, so that the cart never shows as sent what the kitchen has not got.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
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

const { usePOSCartStore } = await import("@/stores/posCart")
const { setGroupFamilies } = await import("@/utils/serviceFamilies")
const { orderHeldLines } = await import("../useHeldCourses")

const dish = (code, group, more = {}) => ({
	item_code: code,
	item_name: code,
	item_group: group,
	rate: 10,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	item_uoms: [],
	...more,
})

// The server's answer to plan_kitchen_send, computed by the real rule on the real python side: here, the same table
const serverAnswering = (answer) => vi.fn(async () => answer)

describe("ordering what the table's order holds back", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		setGroupFamilies({
			Wine: "Drink",
			Soups: "Starter",
			Pasta: "Main",
			Cakes: "Dessert",
		})
		cart = usePOSCartStore()
		cart.setRestaurantTable({ name: "T1" })
		cart.addItem(dish("RED", "Wine", { kds_status: "Pending" }))
		cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
		cart.addItem(dish("PENNE", "Pasta", { kds_status: "Waiting" }))
		cart.addItem(dish("STEAK", "Pasta", { kds_status: "Waiting" }))
		cart.addItem(dish("TART", "Cakes", { kds_status: "Waiting" }))
	})
	afterEach(() => setGroupFamilies({}))

	const statuses = () => cart.invoiceItems.map((line) => line.kds_status)

	it("asks the server which lines, with the lines of the cart as they are and the kind of order", async () => {
		const call = serverAnswering({
			next: { family: "Main", indexes: [2, 3] },
			held: [2, 3, 4],
			plan: [],
		})

		await orderHeldLines({
			which: "next",
			cartStore: cart,
			call,
			send: async () => true,
		})

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.service_families.plan_kitchen_send",
			{
				lines: JSON.stringify([
					{ service_family: "Drink", kds_status: "Pending" },
					{ service_family: "Starter", kds_status: "Pending" },
					{ service_family: "Main", kds_status: "Waiting" },
					{ service_family: "Main", kds_status: "Waiting" },
					{ service_family: "Dessert", kds_status: "Waiting" },
				]),
				restaurant_table: "T1",
				is_takeaway: 0,
			},
		)
	})

	it("sends the next course: the lines the server names, and no other", async () => {
		const call = serverAnswering({
			next: { family: "Main", indexes: [2, 3] },
			held: [2, 3, 4],
			plan: [],
		})
		const seen = []

		const result = await orderHeldLines({
			which: "next",
			cartStore: cart,
			call,
			send: async () => {
				seen.push(statuses())
				return true
			},
		})

		expect(seen).toEqual([
			["Pending", "Pending", "Pending", "Pending", "Waiting"],
		])
		expect(result).toEqual({ sent: 2, family: "Main" })
		expect(statuses()).toEqual([
			"Pending",
			"Pending",
			"Pending",
			"Pending",
			"Waiting",
		])
	})

	it("sends everything held, for a table in a hurry", async () => {
		const call = serverAnswering({
			next: { family: "Main", indexes: [2, 3] },
			held: [2, 3, 4],
			plan: [],
		})

		const result = await orderHeldLines({
			which: "all",
			cartStore: cart,
			call,
			send: async () => true,
		})

		expect(result.sent).toBe(3)
		expect(statuses()).toEqual([
			"Pending",
			"Pending",
			"Pending",
			"Pending",
			"Pending",
		])
	})

	it("is one send per release: the order is sent once for the next course, and again for the one after", async () => {
		const send = vi.fn(async () => true)
		const first = serverAnswering({
			next: { family: "Main", indexes: [2, 3] },
			held: [2, 3, 4],
			plan: [],
		})
		const second = serverAnswering({
			next: { family: "Dessert", indexes: [4] },
			held: [4],
			plan: [],
		})

		await orderHeldLines({ which: "next", cartStore: cart, call: first, send })
		await orderHeldLines({ which: "next", cartStore: cart, call: second, send })

		expect(send).toHaveBeenCalledTimes(2)
		expect(statuses()).toEqual([
			"Pending",
			"Pending",
			"Pending",
			"Pending",
			"Pending",
		])
	})

	it("sends nothing when nothing is held", async () => {
		const send = vi.fn(async () => true)
		const call = serverAnswering({
			next: { family: "", indexes: [] },
			held: [],
			plan: [],
		})

		const result = await orderHeldLines({
			which: "next",
			cartStore: cart,
			call,
			send,
		})

		expect(result).toEqual({ sent: 0 })
		expect(send).not.toHaveBeenCalled()
	})

	it("holds the lines again when the order could not be sent", async () => {
		const call = serverAnswering({
			next: { family: "Main", indexes: [2, 3] },
			held: [2, 3, 4],
			plan: [],
		})

		const result = await orderHeldLines({
			which: "next",
			cartStore: cart,
			call,
			send: async () => false,
		})

		expect(result).toEqual({ sent: 0, failed: true })
		expect(statuses()).toEqual([
			"Pending",
			"Pending",
			"Waiting",
			"Waiting",
			"Waiting",
		])
	})

	it("lets the page give each released line its station before it is sent", async () => {
		const call = serverAnswering({
			next: { family: "Main", indexes: [2, 3] },
			held: [2, 3, 4],
			plan: [],
		})
		const prepared = []

		await orderHeldLines({
			which: "next",
			cartStore: cart,
			call,
			prepare: (row) => prepared.push(row.item_code),
			send: async () => true,
		})

		expect(prepared).toEqual(["PENNE", "STEAK"])
	})

	it("says it is a takeaway to the server when it is one", async () => {
		cart.isTakeaway = true
		const call = serverAnswering({
			next: { family: "", indexes: [] },
			held: [],
			plan: [],
		})

		await orderHeldLines({
			which: "next",
			cartStore: cart,
			call,
			send: async () => true,
		})

		expect(call.mock.calls[0][1].is_takeaway).toBe(1)
	})

	it("lets an error of the server reach the page, with the cart untouched", async () => {
		const call = vi.fn(async () => {
			throw new Error("offline")
		})

		await expect(
			orderHeldLines({
				which: "next",
				cartStore: cart,
				call,
				send: async () => true,
			}),
		).rejects.toThrow("offline")
		expect(statuses()).toEqual([
			"Pending",
			"Pending",
			"Waiting",
			"Waiting",
			"Waiting",
		])
	})
})
