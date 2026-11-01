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
const { nextRelease } = await import("@/utils/serviceFamilies")

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

//// Neoffice — where the kitchen prepares ahead (NeoRestau lot 1, the service rhythm, Daniel, 01.11): « Commander la suite » does not release anything, the course is already at the kitchen. It CALLS it: one atomic call of
//// the server, no second send of the order. A restaurant called by the room keeps releasing, byte for byte as above.
describe("calling the next course where the kitchen prepares ahead", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		setGroupFamilies({ Wine: "Drink", Soups: "Starter", Pasta: "Main", Cakes: "Dessert" })
		cart = usePOSCartStore()
		cart.setRestaurantTable({ name: "T1" })
		cart.addItem(dish("RED", "Wine", { kds_status: "Pending" }))
		cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
		cart.addItem(dish("PENNE", "Pasta", { kds_status: "Pending", kds_ahead: 1 }))
		cart.addItem(dish("STEAK", "Pasta", { kds_status: "Pending", kds_ahead: 1 }))
		cart.addItem(dish("TART", "Cakes", { kds_status: "Pending", kds_ahead: 1 }))
		cart.$patch({ currentDraftId: "SINV-0001" })
	})
	afterEach(() => setGroupFamilies({}))

	const CALL = "pos_next.api.restaurant.call_next_course"
	const PLAN = "pos_next.api.service_families.plan_kitchen_send"
	/** A server that answers the plan and the call: what the lines were asked, and what the call stamped. */
	function server({ next, held, called = 2, at = "2026-11-01 19:00:00.000000", rhythm = "Prepared ahead" }) {
		return vi.fn(async (method) => {
			if (method === PLAN) return { rhythm, next, held, plan: [] }
			if (method === CALL) return { status: "success", called, family: next.family, called_at: at }
			throw new Error(`unexpected call ${method}`)
		})
	}

	it("tells the server which lines were sent ahead and not called, and nothing more for the lines of the ordinary way", async () => {
		const call = server({ next: { family: "Main", indexes: [2, 3] }, held: [2, 3, 4] })

		await orderHeldLines({ which: "next", cartStore: cart, call, send: vi.fn(async () => true) })

		expect(JSON.parse(call.mock.calls[0][1].lines)).toEqual([
			{ service_family: "Drink", kds_status: "Pending" },
			{ service_family: "Starter", kds_status: "Pending" },
			{ service_family: "Main", kds_status: "Pending", kds_ahead: 1, kds_called_at: "" },
			{ service_family: "Main", kds_status: "Pending", kds_ahead: 1, kds_called_at: "" },
			{ service_family: "Dessert", kds_status: "Pending", kds_ahead: 1, kds_called_at: "" },
		])
	})

	it("calls the next course by its family with the order's name, and sends the order no second time", async () => {
		const call = server({ next: { family: "Main", indexes: [2, 3] }, held: [2, 3, 4] })
		const send = vi.fn(async () => true)

		const result = await orderHeldLines({ which: "next", cartStore: cart, call, send })

		expect(call).toHaveBeenCalledWith(CALL, { invoice: "SINV-0001", family: "Main" })
		expect(send).not.toHaveBeenCalled()
		expect(result).toEqual({ sent: 0, called: 2, family: "Main" })
	})

	it("calls every course at once for a table in a hurry, in one call", async () => {
		const call = server({ next: { family: "Main", indexes: [2, 3] }, held: [2, 3, 4], called: 3 })

		const result = await orderHeldLines({ which: "all", cartStore: cart, call, send: vi.fn(async () => true) })

		expect(call).toHaveBeenCalledWith(CALL, { invoice: "SINV-0001", everything: 1 })
		expect(call.mock.calls.filter(([method]) => method === CALL)).toHaveLength(1)
		expect(result.called).toBe(3)
	})

	it("marks the lines called in the cart with the time the server gave, so that the button names the following course", async () => {
		const call = server({ next: { family: "Main", indexes: [2, 3] }, held: [2, 3, 4] })

		await orderHeldLines({ which: "next", cartStore: cart, call, send: vi.fn(async () => true) })

		expect(cart.invoiceItems.map((line) => line.kds_called_at || null)).toEqual([
			null,
			null,
			"2026-11-01 19:00:00.000000",
			"2026-11-01 19:00:00.000000",
			null,
		])
		expect(nextRelease(cart.invoiceItems, "Prepared ahead")).toEqual({ family: "Dessert", indexes: [4] })
	})

	it("leaves the cart as it was when the server calls nothing (another waiter was first)", async () => {
		const call = server({ next: { family: "Main", indexes: [2, 3] }, held: [2, 3, 4], called: 0, at: null })
		const finish = vi.fn()

		const result = await orderHeldLines({ which: "next", cartStore: cart, call, send: vi.fn(async () => true), finish })

		expect(result.called).toBeUndefined()
		expect(cart.invoiceItems.every((line) => !line.kds_called_at)).toBe(true)
		expect(finish).not.toHaveBeenCalled()
	})

	it("lets the page finish once the call is made", async () => {
		const call = server({ next: { family: "Main", indexes: [2, 3] }, held: [2, 3, 4] })
		const finish = vi.fn()

		await orderHeldLines({ which: "next", cartStore: cart, call, send: vi.fn(async () => true), finish })

		expect(finish).toHaveBeenCalledTimes(1)
	})

	it("lets an error of the server reach the page, with the cart untouched", async () => {
		const call = vi.fn(async (method) => {
			if (method === PLAN) return { next: { family: "Main", indexes: [2, 3] }, held: [2, 3, 4], plan: [] }
			throw new Error("offline")
		})

		await expect(orderHeldLines({ which: "next", cartStore: cart, call, send: vi.fn(async () => true) })).rejects.toThrow("offline")
		expect(cart.invoiceItems.every((line) => !line.kds_called_at)).toBe(true)
	})

	it("says it failed, and calls nothing, when the order was never saved (no name to call for)", async () => {
		cart.$patch({ currentDraftId: null })
		const call = server({ next: { family: "Main", indexes: [2, 3] }, held: [2, 3, 4] })

		const result = await orderHeldLines({ which: "next", cartStore: cart, call, send: vi.fn(async () => true) })

		expect(result).toEqual({ sent: 0, failed: true })
		expect(call.mock.calls.some(([method]) => method === CALL)).toBe(false)
	})

	it("calls the lines sent ahead and releases the lines held by hand in the same gesture, each in its own way", async () => {
		cart.invoiceItems[3].kds_status = "Waiting"
		cart.invoiceItems[3].kds_ahead = 0
		const call = server({ next: { family: "Main", indexes: [2, 3] }, held: [2, 3, 4], called: 1 })
		const seen = []

		const result = await orderHeldLines({
			which: "next",
			cartStore: cart,
			call,
			send: async () => {
				seen.push(cart.invoiceItems.map((line) => line.kds_status))
				return true
			},
		})

		expect(call).toHaveBeenCalledWith(CALL, { invoice: "SINV-0001", family: "Main" })
		expect(seen).toEqual([["Pending", "Pending", "Pending", "Pending", "Pending"]])
		expect(result).toEqual({ sent: 1, called: 1, family: "Main" })
	})
})

