/**
 * //// Neoffice — added file (no upstream equivalent). « How many people? » (NeoResto lot 1, covers): the question a table opened empty asks by itself, the one the header's pastille asks, and their answers. Confirming
 * //// keeps the number in the cart; when the order already exists on the server it is saved there too (`set_table_covers`), and a refusal keeps the previous number and the question open. Without a saved order the number
 * //// just lives in the cart until the first « Valider » saves it. « Later » and « Cancel » leave the number as it was. The question is the cart's, so clearing the cart closes it.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => ({
	calls: [],
	answer: null,
	fail: false,
	toasts: [],
	gate: null,
}))
const restaurant = vi.hoisted(() => ({ askCoversOnOpen: true }))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({})),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		server.calls.push([method, args])
		// A test can hold the answer back to act while the server is "thinking"
		if (server.gate) await server.gate
		if (server.fail) throw new Error("offline")
		return server.answer ?? { covers: args.covers }
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showError: (message) => server.toasts.push(message),
		showSuccess: vi.fn(),
		showWarning: vi.fn(),
	}),
}))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurant }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))

const { useCovers } = await import("../useCovers")
const { usePOSCartStore } = await import("@/stores/posCart")

const SET = "pos_next.api.restaurant.set_table_covers"

let cart
let covers
beforeEach(() => {
	setActivePinia(createPinia())
	cart = usePOSCartStore()
	covers = useCovers()
	server.calls = []
	server.answer = null
	server.fail = false
	server.toasts = []
	server.gate = null
	restaurant.askCoversOnOpen = true
	vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("the question « How many people? »", () => {
	it("is not open until it is asked", () => {
		expect(covers.asking.value).toBe(false)
		expect(covers.mode.value).toBeNull()
	})

	it("opens from the header in the « change » mode", () => {
		covers.ask("change")

		expect(covers.asking.value).toBe(true)
		expect(covers.mode.value).toBe("change")
	})

	it("opens in the « open » mode when it is asked by itself", () => {
		covers.ask("open")

		expect(covers.mode.value).toBe("open")
	})

	it("is the header's by default, and any other mode is the header's too", () => {
		covers.ask()
		expect(covers.mode.value).toBe("change")

		covers.ask("whatever")
		expect(covers.mode.value).toBe("change")
	})

	it("closes with the cart: a question can never stay open over a table that is gone", async () => {
		cart.setRestaurantTable({ name: "T1" })
		covers.ask("open")

		await cart.clearCart()

		expect(covers.asking.value).toBe(false)
	})

	it("is the same question for every user of the composable (the page's dialog and the opening of a table)", () => {
		useCovers().ask("open")

		expect(covers.asking.value).toBe(true)
	})
})

describe("the question a table opened empty asks by itself", () => {
	beforeEach(() => {
		cart.setRestaurantTable({ name: "T1", capacity: 4 })
	})

	it("is asked when the restaurant asks it and nobody said the number", () => {
		expect(covers.askOnOpen()).toBe(true)

		expect(covers.asking.value).toBe(true)
		expect(covers.mode.value).toBe("open")
	})

	it("is not asked when the restaurant switched it off", () => {
		restaurant.askCoversOnOpen = false

		expect(covers.askOnOpen()).toBe(false)
		expect(covers.asking.value).toBe(false)
	})

	it("is not asked when the number is already set", () => {
		cart.setRestaurantCovers(3)

		expect(covers.askOnOpen()).toBe(false)
		expect(covers.asking.value).toBe(false)
	})

	it("is not asked for a takeaway: it has no table to seat people at", () => {
		cart.isTakeaway = true

		expect(covers.askOnOpen()).toBe(false)
		expect(covers.asking.value).toBe(false)
	})

	it("is not asked when no table is open", async () => {
		await cart.clearCart()

		expect(covers.askOnOpen()).toBe(false)
	})
})

describe("confirming the number", () => {
	it("keeps the number in the cart and closes, without calling the server when the order is not saved yet", async () => {
		cart.setRestaurantTable({ name: "T1" })
		covers.ask("open")

		const kept = await covers.confirm(3)

		expect(kept).toBe(true)
		expect(cart.restaurantCovers).toBe(3)
		expect(covers.asking.value).toBe(false)
		expect(server.calls).toEqual([])
	})

	it("saves the number on the order too when it has a saved draft", async () => {
		cart.setRestaurantTable({ name: "T1" })
		cart.$patch({ currentDraftId: "SINV-0001" })
		covers.ask("change")

		const kept = await covers.confirm(5)

		expect(kept).toBe(true)
		expect(server.calls).toEqual([[SET, { invoice: "SINV-0001", covers: 5 }]])
		expect(cart.restaurantCovers).toBe(5)
		expect(covers.asking.value).toBe(false)
	})

	it("keeps what the server answers as the number", async () => {
		cart.$patch({ currentDraftId: "SINV-0001" })
		server.answer = { covers: 6 }

		await covers.confirm(5)

		expect(cart.restaurantCovers).toBe(6)
	})

	it("takes a number written as text", async () => {
		await covers.confirm("4")

		expect(cart.restaurantCovers).toBe(4)
	})

	it("refuses a number that is no number of people, and calls nothing", async () => {
		cart.$patch({ currentDraftId: "SINV-0001" })
		covers.ask("change")

		for (const value of [0, 100, 2.5, "", null, "x"]) {
			expect(await covers.confirm(value), String(value)).toBe(false)
		}

		expect(server.calls).toEqual([])
		expect(cart.restaurantCovers).toBeNull()
		expect(covers.asking.value).toBe(true)
	})

	it("keeps the previous number, the question open, and tells the waiter when the server refuses", async () => {
		cart.setRestaurantTable({ name: "T1" })
		cart.$patch({ currentDraftId: "SINV-0001" })
		cart.setRestaurantCovers(2)
		covers.ask("change")
		server.fail = true

		const kept = await covers.confirm(5)

		expect(kept).toBe(false)
		expect(cart.restaurantCovers).toBe(2)
		expect(covers.asking.value).toBe(true)
		expect(server.toasts).toEqual(["Failed to save the number of people"])
		expect(covers.busy.value).toBe(false)
	})

	it("is busy while the server answers, and a second confirm waits for it", async () => {
		cart.$patch({ currentDraftId: "SINV-0001" })
		let release
		server.gate = new Promise((resolve) => {
			release = resolve
		})

		const first = covers.confirm(3)
		expect(covers.busy.value).toBe(true)
		const second = await covers.confirm(4)
		release()
		await first

		expect(second).toBe(false)
		expect(server.calls).toHaveLength(1)
		expect(cart.restaurantCovers).toBe(3)
		expect(covers.busy.value).toBe(false)
	})

	it("drops the answer when the table was left while the server answered", async () => {
		cart.setRestaurantTable({ name: "T1" })
		cart.$patch({ currentDraftId: "SINV-0001" })
		let release
		server.gate = new Promise((resolve) => {
			release = resolve
		})

		const pending = covers.confirm(4)
		// The waiter leaves the table and opens another one before the answer comes
		cart.$patch({ currentDraftId: null })
		cart.setRestaurantTable({ name: "T2" })
		release()
		const kept = await pending

		expect(kept).toBe(false)
		expect(cart.restaurantCovers).toBeNull()
		expect(covers.busy.value).toBe(false)
	})
})

describe("« Later » and « Cancel »", () => {
	it("leave the number unset and close the question: ordering is never blocked", () => {
		cart.setRestaurantTable({ name: "T1" })
		covers.ask("open")

		covers.later()

		expect(covers.asking.value).toBe(false)
		expect(cart.restaurantCovers).toBeNull()
		expect(server.calls).toEqual([])
	})

	it("leave the number as it was when asked from the header", () => {
		cart.setRestaurantCovers(3)
		covers.ask("change")

		covers.cancel()

		expect(covers.asking.value).toBe(false)
		expect(cart.restaurantCovers).toBe(3)
		expect(server.calls).toEqual([])
	})
})

describe("the counter of the order's header", () => {
	// addItem takes the quantity apart from the item
	const dish = (family) => ({
		item_code: `${family}-DISH`,
		item_name: family,
		service_family: family,
		rate: 10,
	})

	it("has no chip while nobody is counted", () => {
		cart.addItem(dish("Main"), 2)

		expect(covers.chips.value).toEqual([])
	})

	it("counts the lines of the cart against the people seated", () => {
		cart.setRestaurantCovers(3)
		cart.addItem(dish("Starter"), 3)
		cart.addItem(dish("Main"), 2)

		expect(
			covers.chips.value.map((chip) => [
				chip.family,
				chip.count,
				chip.covers,
				chip.state,
			]),
		).toEqual([
			["Starter", 3, 3, "done"],
			["Main", 2, 3, "short"],
		])
	})
})
