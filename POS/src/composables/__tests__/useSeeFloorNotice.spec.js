/**
 * //// Neoffice — added file (no upstream equivalent). « View table » on the notice of a guest's order (NeoResto lot 1, Daniel, 01.11: « regarde comment la caisse sommelier reçoit l'info »): it opens that table the way
 * //// tapping it in the list does (the same function, composables/useOpenTable), and a table the guest has paid goes where tapping a paid table goes (its payment summary, where the cashier decides what happens to it). The
 * //// notice is dismissed with the press. What the waiter has in front of him is never thrown away to show another table: an order in progress, not sent yet, keeps the screen and the waiter is told.
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { reactive } from "vue"

const fake = vi.hoisted(() => ({
	cart: null,
	restaurant: null,
	notices: { dismiss: null },
	open: null,
	warn: null,
}))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => fake.cart }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => fake.restaurant }))
vi.mock("@/stores/floorNotices", () => ({ useFloorNoticesStore: () => fake.notices }))
vi.mock("@/composables/useOpenTable", () => ({ useOpenTable: () => ({ openTable: fake.open }) }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showWarning: fake.warn }) }))

const { useSeeFloorNotice } = await import("../useSeeFloorNotice")

const T2 = { name: "t-2", table_name: "T2", status: "Occupied" }
const PAID = { name: "t-3", table_name: "T3", status: "Paid" }
const order = (table = "t-2", over = {}) => ({ key: `${table}|1`, kind: "order", table, items: [], count: 0, orders: 1, partial: false, ...over })

let onPaid
let onOpened
let see

beforeEach(() => {
	fake.cart = reactive({ restaurantTable: null, hasUnsentChanges: false })
	fake.restaurant = reactive({ tables: [T2, PAID], fetchFromNetwork: vi.fn(async () => {}) })
	fake.notices = { dismiss: vi.fn() }
	fake.open = vi.fn(async () => true)
	fake.warn = vi.fn()
	onPaid = vi.fn()
	onOpened = vi.fn()
	see = useSeeFloorNotice({ onPaid, onOpened }).see
})

describe("« View table » on a notice", () => {
	it("opens the table of the notice, the way a tap in the list does, and dismisses the notice", async () => {
		const done = await see(order("t-2"))

		expect(done).toBe(true)
		expect(fake.open).toHaveBeenCalledWith(T2)
		expect(onOpened).toHaveBeenCalledWith(T2)
		expect(fake.notices.dismiss).toHaveBeenCalledWith("t-2|1")
		expect(onPaid).not.toHaveBeenCalled()
	})

	it("opens a table of an order to validate the same way: the lines held for the waiter are in its order", async () => {
		await see(order("t-2", { kind: "pending" }))

		expect(fake.open).toHaveBeenCalledWith(T2)
	})

	it("opens the table where a guest paid only a part of the bill: it is still occupied", async () => {
		await see(order("t-2", { kind: "payment", partial: true }))

		expect(fake.open).toHaveBeenCalledWith(T2)
		expect(onPaid).not.toHaveBeenCalled()
	})

	it("opens the payment summary of a table the guest has paid, as tapping a paid table does, and does not open it", async () => {
		await see(order("t-2", { kind: "payment" }))

		expect(onPaid).toHaveBeenCalledWith(T2)
		expect(fake.open).not.toHaveBeenCalled()
		expect(fake.notices.dismiss).toHaveBeenCalledWith("t-2|1")
	})

	it("treats a table the list already shows as paid or being cleaned the same, whatever the notice says", async () => {
		await see(order("t-3"))

		expect(onPaid).toHaveBeenCalledWith(PAID)
		expect(fake.open).not.toHaveBeenCalled()
	})

	it("reads the floor again when it does not know the table (the page was reloaded at an open table)", async () => {
		fake.restaurant.tables = []
		fake.restaurant.fetchFromNetwork.mockImplementation(async () => {
			fake.restaurant.tables = [T2]
		})

		await see(order("t-2"))

		expect(fake.restaurant.fetchFromNetwork).toHaveBeenCalledTimes(1)
		expect(fake.open).toHaveBeenCalledWith(T2)
	})

	it("says so, and keeps the notice, when the table is nowhere on the floor", async () => {
		fake.restaurant.tables = []

		const done = await see(order("t-2"))

		expect(done).toBe(false)
		expect(fake.warn).toHaveBeenCalledWith("This table could not be found")
		expect(fake.notices.dismiss).not.toHaveBeenCalled()
		expect(fake.open).not.toHaveBeenCalled()
	})

	it("keeps the notice, and says so, when the table cannot be opened", async () => {
		fake.open.mockResolvedValue(false)

		const done = await see(order("t-2"))

		expect(done).toBe(false)
		expect(fake.warn).toHaveBeenCalledWith("This table could not be opened")
		expect(fake.notices.dismiss).not.toHaveBeenCalled()
		expect(onOpened).not.toHaveBeenCalled()
	})
})

describe("an order in progress is never thrown away", () => {
	it("keeps the screen, the notice and the order when the waiter has lines not sent yet at another table", async () => {
		fake.cart.restaurantTable = { name: "t-9" }
		fake.cart.hasUnsentChanges = true

		const done = await see(order("t-2"))

		expect(done).toBe(false)
		expect(fake.warn).toHaveBeenCalledWith("Send or finish the order in progress before opening another table")
		expect(fake.open).not.toHaveBeenCalled()
		expect(fake.notices.dismiss).not.toHaveBeenCalled()
	})

	it("opens the table when what is at another table has all been sent", async () => {
		fake.cart.restaurantTable = { name: "t-9" }
		fake.cart.hasUnsentChanges = false

		await see(order("t-2"))

		expect(fake.open).toHaveBeenCalledWith(T2)
	})

	it("only dismisses the notice of the table that is open already: nothing to open", async () => {
		fake.cart.restaurantTable = { name: "t-2" }
		fake.cart.hasUnsentChanges = true

		const done = await see(order("t-2"))

		expect(done).toBe(true)
		expect(fake.open).not.toHaveBeenCalled()
		expect(fake.notices.dismiss).toHaveBeenCalledWith("t-2|1")
	})
})
