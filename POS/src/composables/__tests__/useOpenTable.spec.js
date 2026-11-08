/**
 * //// Neoffice — added file (no upstream equivalent). Opening a table in the till: the way tapping it in the list does it, and the way a notice of a guest's order does it (NeoResto lot 1, Daniel, 01.11: « regarde
 * //// comment la caisse sommelier reçoit l'info »). The server's order of the table is read FIRST (the cart stays in front of the waiter meanwhile), then the cart is cleared and rebuilt in one go: the table, the lines
 * //// with their units, family and « offered » flag, the draft, the customer. The floor's list and the notices both go through this one function, so that they cannot open a table in two different ways.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const answer = vi.hoisted(() => ({ value: null, fail: false, calls: [] }))
//// Neoffice — the restaurant's setting that makes a table opened empty ask how many people are seated (NeoResto lot 1, covers)
const restaurant = vi.hoisted(() => ({ askCoversOnOpen: true, broken: false }))

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
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({
		get askCoversOnOpen() {
			if (restaurant.broken) throw new Error("settings unavailable")
			return restaurant.askCoversOnOpen
		},
	}),
}))
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
	restaurant.askCoversOnOpen = true
	restaurant.broken = false
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

	//// Neoffice — the customer of the table by his name, as a customer the till picked is (neoffice-maintenance#2163: the header showed
	//// no name on a table opened again)
	it("names the customer of the table by his name", async () => {
		answer.value = { ...structuredClone(ORDER), customer: "CUST-0007", customer_name: "Marie Dupont" }

		await useOpenTable().openTable(TABLE)

		expect(cart.customer).toMatchObject({ name: "CUST-0007", customer_name: "Marie Dupont" })
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

//// Neoffice — the people seated at the table (NeoResto lot 1, covers): a table opened empty asks how many, whoever opened it; a table that has an order comes back with the number it holds
describe("opening a table and the people seated at it", () => {
	const EMPTY = { is_new: true }

	it("asks how many people are seated when the table has no order yet and the restaurant asks it", async () => {
		answer.value = EMPTY

		const opened = await useOpenTable().openTable(TABLE)

		expect(opened).toBe(true)
		expect(cart.coversAsk).toBe("open")
		expect(cart.restaurantCovers).toBeNull()
	})

	it("does not ask at a table of direct service (a bar, a counter): nobody is seated there", async () => {
		answer.value = EMPTY

		const opened = await useOpenTable().openTable({ ...TABLE, direct_service: 1 })

		expect(opened).toBe(true)
		expect(cart.coversAsk).toBeNull()
	})

	it("asks for a table whose answer carries no order name, even without the flag", async () => {
		answer.value = {}

		await useOpenTable().openTable(TABLE)

		expect(cart.coversAsk).toBe("open")
	})

	it("does not ask when the restaurant switched the question off", async () => {
		answer.value = EMPTY
		restaurant.askCoversOnOpen = false

		const opened = await useOpenTable().openTable(TABLE)

		expect(opened).toBe(true)
		expect(cart.coversAsk).toBeNull()
	})

	it("does not ask when the table has an order: it comes back with its people", async () => {
		answer.value = { ...structuredClone(ORDER), is_new: false, covers: 3 }

		await useOpenTable().openTable(TABLE)

		expect(cart.coversAsk).toBeNull()
		expect(cart.restaurantCovers).toBe(3)
	})

	it("does not ask for an order whose people were never said: the header's pastille is there to say them", async () => {
		answer.value = { ...structuredClone(ORDER), is_new: false, covers: null }

		await useOpenTable().openTable(TABLE)

		expect(cart.coversAsk).toBeNull()
		expect(cart.restaurantCovers).toBeNull()
	})

	it("does not ask when the order does not say its people at all (a server that does not send them)", async () => {
		await useOpenTable().openTable(TABLE)

		expect(cart.coversAsk).toBeNull()
		expect(cart.restaurantCovers).toBeNull()
	})

	it("forgets the people of the table before it: the next one starts with none and asks", async () => {
		answer.value = { ...structuredClone(ORDER), covers: 4 }
		await useOpenTable().openTable({
			name: "t9",
			table_name: "T9",
			status: "Occupied",
		})
		expect(cart.restaurantCovers).toBe(4)
		answer.value = EMPTY

		await useOpenTable().openTable(TABLE)

		expect(cart.restaurantCovers).toBeNull()
		expect(cart.coversAsk).toBe("open")
	})

	it("asks again each time an empty table is opened", async () => {
		answer.value = EMPTY
		await useOpenTable().openTable(TABLE)
		cart.coversAsk = null

		await useOpenTable().openTable(TABLE)

		expect(cart.coversAsk).toBe("open")
	})

	it("never blocks ordering: the lines can be added while the question is open", async () => {
		answer.value = EMPTY
		await useOpenTable().openTable(TABLE)

		cart.addItem({
			item_code: "soup",
			item_name: "Soup",
			rate: 12,
			price_list_rate: 12,
			uom: "Unit",
			stock_uom: "Unit",
			conversion_factor: 1,
		})

		expect(cart.coversAsk).toBe("open")
		expect(cart.invoiceItems).toHaveLength(1)
	})

	it("still says the table was opened when the question cannot be asked", async () => {
		answer.value = EMPTY
		restaurant.broken = true
		const log = vi.spyOn(console, "error").mockImplementation(() => {})

		const opened = await useOpenTable().openTable(TABLE)

		expect(opened).toBe(true)
		expect(cart.restaurantTable).toMatchObject({ name: "t1" })
		expect(cart.coversAsk).toBeNull()
		log.mockRestore()
	})

	it("asks nothing, and keeps the cart, when the order cannot be read", async () => {
		await useOpenTable().openTable({
			name: "t9",
			table_name: "T9",
			status: "Occupied",
		})
		answer.fail = true
		const log = vi.spyOn(console, "error").mockImplementation(() => {})

		const opened = await useOpenTable().openTable(TABLE)

		expect(opened).toBe(false)
		expect(cart.coversAsk).toBeNull()
		log.mockRestore()
	})
})
