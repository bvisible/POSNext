/**
 * //// Neoffice — added file (no upstream equivalent). After the last service its card stays on the till, and any
 * //// other card is fetched from a « ⋯ » (NeoRestau lot 1, task 25). The server keeps the last service's card on the
 * //// till and says which service it is; the store keeps what the cashier opened by hand: it joins the row marked as
 * //// such, stays on THIS till until the next service begins or until it is closed, and is fetched from the server one
 * //// card at a time (the till does not hold a copy of every card).
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/stores/posSettings", async () => {
	const { reactive } = await import("vue")
	const tillSettings = reactive({ enable_restaurant_mode: 1 })
	return {
		tillSettings,
		usePOSSettingsStore: () => ({ settings: tillSettings }),
	}
})
vi.mock("@/utils/offline/db", () => {
	const table = () => ({
		clear: vi.fn(),
		bulkPut: vi.fn(),
		put: vi.fn(),
		toArray: vi.fn(() => []),
	})
	return {
		db: {
			restaurant_areas: table(),
			restaurant_tables: table(),
			transaction: (...args) => args[args.length - 1](),
		},
	}
})
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))

globalThis.__ = (s) => s

const { tillSettings } = await import("@/stores/posSettings")
const { useRestaurantStore } = await import("../restaurant")

const API = "pos_next.api.restaurant."
const FRIDAYS_SERVICE = {
	key: "2026-10-23T09:00:00",
	after_hours: true,
	label: "Lunch",
}
const SATURDAYS_SERVICE = {
	key: "2026-10-24T09:00:00",
	after_hours: false,
	label: null,
}

const LUNCH = {
	name: "Lunch",
	card_name: "Lunch",
	is_permanent: 0,
	restaurant: "The Bistro",
	items: [],
}
const PERMANENT = {
	name: "Permanent items",
	card_name: "Permanent items",
	is_permanent: 1,
	restaurant: "The Bistro",
	items: [],
}
const SATURDAY = {
	name: "Saturday",
	card_name: "Saturday",
	description: "Saturday menu",
	image: null,
}
const SUNDAY = {
	name: "Sunday",
	card_name: "Sunday",
	description: null,
	image: null,
}
const SATURDAY_WITH_ITEMS = {
	name: "Saturday",
	card_name: "Saturday",
	is_permanent: 0,
	restaurant: "The Bistro",
	items: [{ item_type: "Item", item: "ITEM-1", item_name: "Pasta", price: 18 }],
}

// What the server answers; each test overrides what it is about
let answers
function answerWith(overrides = {}) {
	answers = {
		get_restaurant_status: {
			is_open: false,
			current_slot: null,
			service: FRIDAYS_SERVICE,
		},
		get_active_cards: [LUNCH, PERMANENT],
		get_other_cards: [SATURDAY, SUNDAY],
		open_card_outside_hours: SATURDAY_WITH_ITEMS,
		...overrides,
	}
	call.mockImplementation(async (method) => {
		const name = method.replace(API, "")
		if (name in answers) return answers[name]
		if (name === "get_tables") return { areas: [], tables: [], stations: [] }
		if (name === "get_restaurant_settings")
			return { opening_hours: [], is_open: true, current_slot: null }
		if (name === "get_station_items_map") return { items: {}, groups: {} }
		return []
	})
}

const calls = (name) =>
	call.mock.calls
		.filter(([method]) => method === `${API}${name}`)
		.map(([, params]) => params)

async function aTillAtTheEndOfFridaysService() {
	const store = useRestaurantStore()
	await store.fetchRestaurantStatus()
	await store.fetchActiveCards()
	return store
}

describe("the store knows which service the cards on the till are of", () => {
	let store
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		call.mockReset()
		answerWith()
		tillSettings.restaurant = "The Bistro"
		store = useRestaurantStore()
	})

	it("keeps the service the status tells, as the key, the after-hours flag and the label", async () => {
		await store.fetchRestaurantStatus()

		expect(store.cardService).toEqual({
			key: "2026-10-23T09:00:00",
			afterHours: true,
			label: "Lunch",
		})
	})

	it("has no service while the status is silent about it, and does not fail", async () => {
		answerWith({ get_restaurant_status: { is_open: true, current_slot: null } })

		await store.fetchRestaurantStatus()

		expect(store.cardService).toEqual({
			key: null,
			afterHours: false,
			label: null,
		})
	})

	it("refreshes the cards when the next service begins, and not before", async () => {
		await store.fetchRestaurantStatus()
		expect(calls("get_active_cards")).toHaveLength(0)

		await store.fetchRestaurantStatus()
		expect(calls("get_active_cards")).toHaveLength(0)

		answerWith({
			get_restaurant_status: {
				is_open: true,
				current_slot: "Saturday",
				service: SATURDAYS_SERVICE,
			},
		})
		await store.fetchRestaurantStatus()
		expect(calls("get_active_cards")).toHaveLength(1)
	})

	it("refreshes the cards when the next service begins even if the slot carries the same label", async () => {
		const dinner = (key) => ({
			get_restaurant_status: {
				is_open: true,
				current_slot: "Dinner",
				service: { key, after_hours: false, label: null },
			},
		})
		answerWith(dinner("2026-10-23T18:00:00"))
		await store.fetchRestaurantStatus()
		answerWith(dinner("2026-10-24T18:00:00"))

		await store.fetchRestaurantStatus()

		expect(calls("get_active_cards")).toHaveLength(1)
	})

	it("refreshes the cards when the last slot of the service ends, as the line above the cards comes up", async () => {
		answerWith({
			get_restaurant_status: {
				is_open: true,
				current_slot: "Lunch",
				service: {
					key: "2026-10-23T09:00:00",
					after_hours: false,
					label: null,
				},
			},
		})
		await store.fetchRestaurantStatus()
		answerWith()
		await store.fetchRestaurantStatus()

		expect(calls("get_active_cards")).toHaveLength(1)
		expect(store.cardService.afterHours).toBe(true)
	})
})

describe("the other cards the hours hide", () => {
	let store
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		call.mockReset()
		answerWith()
		tillSettings.restaurant = "The Bistro"
		store = useRestaurantStore()
	})

	it("asks the server for them, for the till's restaurant, whenever it asks for the active cards", async () => {
		await store.fetchActiveCards()

		expect(calls("get_active_cards")).toEqual([{ restaurant: "The Bistro" }])
		expect(calls("get_other_cards")).toEqual([{ restaurant: "The Bistro" }])
		expect(store.hiddenCards.map((card) => card.name)).toEqual([
			"Saturday",
			"Sunday",
		])
		expect(store.pickableCards.map((card) => card.name)).toEqual([
			"Saturday",
			"Sunday",
		])
	})

	it("offers nothing when the server fails to list them, and the cards stay", async () => {
		call.mockImplementation(async (method) => {
			if (method === `${API}get_other_cards`) throw new Error("offline")
			if (method === `${API}get_active_cards`) return [LUNCH, PERMANENT]
			return []
		})

		await store.fetchActiveCards()

		expect(store.pickableCards).toEqual([])
		expect(store.activeCards.map((card) => card.name)).toEqual([
			"Lunch",
			"Permanent items",
		])
	})

	it("holds no copy of their items", async () => {
		await store.fetchActiveCards()

		expect(store.hiddenCards.every((card) => card.items === undefined)).toBe(
			true,
		)
	})
})

describe("a card opened by hand", () => {
	let store
	beforeEach(async () => {
		localStorage.clear()
		setActivePinia(createPinia())
		call.mockReset()
		answerWith()
		tillSettings.restaurant = "The Bistro"
		store = await aTillAtTheEndOfFridaysService()
	})
	afterEach(() => localStorage.clear())

	it("is asked of the server by name, with the grant and the restaurant", async () => {
		await store.openCardByHand(SATURDAY, "a-grant")

		expect(calls("open_card_outside_hours")).toEqual([
			{
				card_name: "Saturday",
				authorization_token: "a-grant",
				restaurant: "The Bistro",
			},
		])
	})

	it("is asked with no grant where no rule asks a PIN", async () => {
		await store.openCardByHand(SATURDAY, null)

		const [params] = calls("open_card_outside_hours")
		expect(params.card_name).toBe("Saturday")
		expect(params.authorization_token || null).toBeNull()
	})

	it("joins the row, marked, after the cards of the hours and before the permanent card", async () => {
		await store.openCardByHand(SATURDAY, null)

		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Lunch",
			"Saturday",
			"Permanent items",
		])
		expect(
			store.shownCards.map((card) => Boolean(card.opened_by_hand)),
		).toEqual([false, true, false])
		// With its items, as the till sells from them
		expect(store.shownCards[1].items).toEqual(SATURDAY_WITH_ITEMS.items)
	})

	it("is no longer offered by the « ⋯ », the others still are", async () => {
		await store.openCardByHand(SATURDAY, null)

		expect(store.pickableCards.map((card) => card.name)).toEqual(["Sunday"])
	})

	it("tells which card was opened, as often as one is", async () => {
		await store.openCardByHand(SATURDAY, null)
		const first = store.lastOpenedCard

		await store.closeCardOpenedByHand("Saturday")
		await store.openCardByHand(SATURDAY, null)

		expect(first).toEqual({ name: "Saturday" })
		expect(store.lastOpenedCard).toEqual({ name: "Saturday" })
		expect(store.lastOpenedCard).not.toBe(first)
	})

	it("is closed from the row, and the « ⋯ » offers it again", async () => {
		await store.openCardByHand(SATURDAY, null)

		store.closeCardOpenedByHand("Saturday")

		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Lunch",
			"Permanent items",
		])
		expect(store.pickableCards.map((card) => card.name)).toEqual([
			"Saturday",
			"Sunday",
		])
	})

	it("is opened once, whatever the number of times it is picked", async () => {
		await store.openCardByHand(SATURDAY, null)
		await store.openCardByHand(SATURDAY, null)

		expect(
			store.shownCards.filter((card) => card.name === "Saturday"),
		).toHaveLength(1)
	})

	it("is not added when the hours show it already", async () => {
		answerWith({ get_active_cards: [LUNCH, SATURDAY_WITH_ITEMS, PERMANENT] })
		await store.fetchActiveCards()

		await store.openCardByHand(SATURDAY, null)

		expect(
			store.shownCards.filter((card) => card.name === "Saturday"),
		).toHaveLength(1)
		expect(
			store.shownCards.find((card) => card.name === "Saturday").opened_by_hand,
		).toBeFalsy()
	})

	it("stays when the cards are fetched again within the same service", async () => {
		await store.openCardByHand(SATURDAY, null)

		await store.fetchActiveCards()
		await store.fetchRestaurantStatus()

		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Lunch",
			"Saturday",
			"Permanent items",
		])
	})

	it("drops when the next service begins, and the hours decide again", async () => {
		await store.openCardByHand(SATURDAY, null)

		answerWith({
			get_restaurant_status: {
				is_open: true,
				current_slot: "Saturday",
				service: SATURDAYS_SERVICE,
			},
			get_active_cards: [SATURDAY_WITH_ITEMS, PERMANENT],
			get_other_cards: [LUNCH],
		})
		await store.fetchRestaurantStatus()

		expect(store.openedCards).toEqual([])
		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Saturday",
			"Permanent items",
		])
		expect(store.shownCards.some((card) => card.opened_by_hand)).toBe(false)
		expect(localStorage.getItem("pos_next_opened_cards")).toBeNull()
	})

	it("is not shown for another restaurant than the one of the till", async () => {
		await store.openCardByHand(SATURDAY, null)

		tillSettings.restaurant = "The Bar"

		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Lunch",
			"Permanent items",
		])
	})

	it("opens nothing when the server refuses the card, and says why", async () => {
		call.mockImplementation(async (method) => {
			if (method === `${API}open_card_outside_hours`)
				throw new Error("Open a card outside its hours requires authorization")
			return []
		})

		await expect(store.openCardByHand(SATURDAY, null)).rejects.toThrow(
			"requires authorization",
		)

		expect(store.openedCards).toEqual([])
	})
})

describe("a card opened by hand stays on THIS till", () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		call.mockReset()
		answerWith()
		tillSettings.restaurant = "The Bistro"
	})
	afterEach(() => localStorage.clear())

	it("through a reload of the page, while the same service lasts", async () => {
		const store = await aTillAtTheEndOfFridaysService()
		await store.openCardByHand(SATURDAY, null)

		// The page is loaded again: a new store, the status not yet read
		setActivePinia(createPinia())
		const reloaded = useRestaurantStore()
		expect(reloaded.shownCards.some((card) => card.name === "Saturday")).toBe(
			false,
		)

		await reloaded.fetchRestaurantStatus()
		await reloaded.fetchActiveCards()

		expect(reloaded.shownCards.map((card) => card.name)).toEqual([
			"Lunch",
			"Saturday",
			"Permanent items",
		])
		expect(
			reloaded.shownCards.find((card) => card.name === "Saturday")
				.opened_by_hand,
		).toBe(true)
	})

	it("but not into the next service", async () => {
		const store = await aTillAtTheEndOfFridaysService()
		await store.openCardByHand(SATURDAY, null)

		setActivePinia(createPinia())
		answerWith({
			get_restaurant_status: {
				is_open: true,
				current_slot: "Saturday",
				service: SATURDAYS_SERVICE,
			},
			get_active_cards: [SATURDAY_WITH_ITEMS, PERMANENT],
		})
		const reloaded = useRestaurantStore()
		await reloaded.fetchRestaurantStatus()
		await reloaded.fetchActiveCards()

		expect(reloaded.openedCards).toEqual([])
		expect(reloaded.shownCards.map((card) => card.name)).toEqual([
			"Saturday",
			"Permanent items",
		])
	})

	it("and a browser that refuses its storage changes nothing", async () => {
		const store = await aTillAtTheEndOfFridaysService()
		const blocked = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation(() => {
				throw new Error("blocked")
			})

		await store.openCardByHand(SATURDAY, null)

		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Lunch",
			"Saturday",
			"Permanent items",
		])
		blocked.mockRestore()
	})
})
