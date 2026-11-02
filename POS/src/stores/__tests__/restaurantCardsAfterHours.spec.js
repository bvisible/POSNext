/**
 * //// Neoffice — added file (no upstream equivalent). A card the opening hours keep off the till can be fetched from a
 * //// « ⋯ » (NeoResto lot 1, task 25, as the product owner amended it on 31.10.2026): the hours show a card during its
 * //// slots only, and between the services nothing of it shows by itself. The store keeps what the cashier opened by
 * //// hand: it joins the row marked as such and stays on THIS till, through a reload, until it is closed or the shift
 * //// closes; it is fetched from the server one card at a time (the till does not hold a copy of every card).
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

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
const THE_SHIFT = "POS-OPE-2026-00001"
const ANOTHER_SHIFT = "POS-OPE-2026-00002"

// The shift the till works in, as POSSale.vue tells the store of it (null: it closes)
async function tellTheShift(store, name) {
	store.setTillShift(name)
	await nextTick()
}

const LUNCH = {
	name: "Lunch",
	card_name: "Lunch",
	is_permanent: 0,
	restaurant: "The Bistro",
	items: [],
}
const LUNCH_PICK = {
	name: "Lunch",
	card_name: "Lunch",
	description: null,
	image: null,
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
const SUNDAY_WITH_ITEMS = {
	name: "Sunday",
	card_name: "Sunday",
	is_permanent: 0,
	restaurant: "The Bistro",
	items: [],
}

// What the server answers; each test overrides what it is about
let answers
function answerWith(overrides = {}) {
	answers = {
		get_restaurant_status: {
			is_open: false,
			current_slot: null,
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

async function aTillBetweenTwoServices() {
	const store = useRestaurantStore()
	await tellTheShift(store, THE_SHIFT)
	await store.fetchRestaurantStatus()
	await store.fetchActiveCards()
	return store
}

describe("the cards on the till follow the hours", () => {
	let store
	beforeEach(async () => {
		localStorage.clear()
		setActivePinia(createPinia())
		call.mockReset()
		answerWith()
		tillSettings.restaurant = "The Bistro"
		store = useRestaurantStore()
		await tellTheShift(store, THE_SHIFT)
	})

	it("refreshes the cards when the slot that ends takes its card with it", async () => {
		answerWith({
			get_restaurant_status: { is_open: true, current_slot: "Lunch" },
			get_active_cards: [LUNCH, PERMANENT],
		})
		await store.fetchRestaurantStatus()
		await store.fetchActiveCards()
		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Lunch",
			"Permanent items",
		])
		calls("get_active_cards").length = 0

		// 14:01: the lunch slot is over, nothing of the hours shows by itself
		answerWith({
			get_restaurant_status: { is_open: false, current_slot: null },
			get_active_cards: [PERMANENT],
			get_other_cards: [LUNCH],
		})
		const before = calls("get_active_cards").length
		await store.fetchRestaurantStatus()

		expect(calls("get_active_cards").length).toBe(before + 1)
		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Permanent items",
		])
		expect(store.pickableCards.map((card) => card.name)).toEqual(["Lunch"])
	})

	it("refreshes the cards when the next slot begins, and not while the slot is the same", async () => {
		answerWith({
			get_restaurant_status: { is_open: false, current_slot: null },
			get_active_cards: [PERMANENT],
		})
		await store.fetchRestaurantStatus()
		await store.fetchRestaurantStatus()
		expect(calls("get_active_cards")).toHaveLength(0)

		answerWith({
			get_restaurant_status: { is_open: true, current_slot: "Dinner" },
			get_active_cards: [SATURDAY_WITH_ITEMS, PERMANENT],
		})
		await store.fetchRestaurantStatus()
		expect(calls("get_active_cards")).toHaveLength(1)
		await store.fetchRestaurantStatus()
		expect(calls("get_active_cards")).toHaveLength(1)
	})

	it("shows the permanent card whatever the hours say, last", async () => {
		answerWith({ get_active_cards: [PERMANENT] })
		await store.fetchActiveCards()
		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Permanent items",
		])

		answerWith({ get_active_cards: [PERMANENT, LUNCH] })
		await store.fetchActiveCards()
		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Lunch",
			"Permanent items",
		])
	})

	it("ignores a status that still carries a service, and does not fail", async () => {
		answerWith({
			get_restaurant_status: {
				is_open: true,
				current_slot: null,
				service: { key: "x", after_hours: true, label: "Lunch" },
			},
		})

		await store.fetchRestaurantStatus()

		expect(store.cardService).toBeUndefined()
		expect(store.restaurantStatus.isOpen).toBe(true)
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
		store = await aTillBetweenTwoServices()
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
		expect(localStorage.getItem("pos_next_opened_cards")).toBeNull()
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

	it("survives the minute poll, even when the poll finds the slot has changed", async () => {
		await store.openCardByHand(SATURDAY, null)

		// The poll, once as before, then with a new slot that has the cards refreshed
		await store.fetchRestaurantStatus()
		answerWith({
			get_restaurant_status: { is_open: true, current_slot: "Dinner" },
			get_active_cards: [SUNDAY_WITH_ITEMS, PERMANENT],
			get_other_cards: [LUNCH_PICK, SATURDAY],
		})
		await store.fetchRestaurantStatus()

		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Sunday",
			"Saturday",
			"Permanent items",
		])
		expect(
			store.shownCards.find((card) => card.name === "Saturday").opened_by_hand,
		).toBe(true)
	})

	it("stays when the cards are fetched again, by the poll or by an update of a card", async () => {
		await store.openCardByHand(SATURDAY, null)

		await store.fetchActiveCards()
		await store.fetchRestaurantStatus()

		expect(store.shownCards.map((card) => card.name)).toEqual([
			"Lunch",
			"Saturday",
			"Permanent items",
		])
	})

	it("goes when the shift closes, and the hours decide again", async () => {
		await store.openCardByHand(SATURDAY, null)
		expect(localStorage.getItem("pos_next_opened_cards")).not.toBeNull()

		await tellTheShift(store, null)

		expect(store.openedCards).toEqual([])
		expect(store.shownCards.some((card) => card.opened_by_hand)).toBe(false)
		expect(localStorage.getItem("pos_next_opened_cards")).toBeNull()
	})

	it("goes when another shift is opened on this till", async () => {
		await store.openCardByHand(SATURDAY, null)

		await tellTheShift(store, ANOTHER_SHIFT)

		expect(store.openedCards).toEqual([])
		expect(localStorage.getItem("pos_next_opened_cards")).toBeNull()
	})

	it("is kept while the shift is read again and is the same", async () => {
		await store.openCardByHand(SATURDAY, null)

		await tellTheShift(store, THE_SHIFT)

		expect(store.openedCards.map((card) => card.name)).toEqual(["Saturday"])
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

	it("through a reload of the page, while the shift lasts", async () => {
		const store = await aTillBetweenTwoServices()
		await store.openCardByHand(SATURDAY, null)

		// The page is loaded again: the old store is gone, a new one, the shift read again from the server
		store.$dispose()
		setActivePinia(createPinia())
		const reloaded = useRestaurantStore()
		// Until the till knows its shift, nothing is shown and nothing is dropped
		expect(reloaded.shownCards.some((card) => card.name === "Saturday")).toBe(
			false,
		)
		expect(localStorage.getItem("pos_next_opened_cards")).not.toBeNull()

		await tellTheShift(reloaded, THE_SHIFT)
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

	it("and a reload that finds the shift still open shows it as soon as the till has said which", async () => {
		const store = await aTillBetweenTwoServices()
		await store.openCardByHand(SATURDAY, null)

		store.$dispose()
		setActivePinia(createPinia())
		const reloaded = useRestaurantStore()
		await tellTheShift(reloaded, THE_SHIFT)

		expect(reloaded.shownCards.map((card) => card.name)).toEqual(["Saturday"])
	})

	it("but not into another shift", async () => {
		const store = await aTillBetweenTwoServices()
		await store.openCardByHand(SATURDAY, null)

		// The shift closed, from another window, and another was opened before this page was loaded again
		store.$dispose()
		setActivePinia(createPinia())
		const reloaded = useRestaurantStore()
		await tellTheShift(reloaded, ANOTHER_SHIFT)
		await reloaded.fetchRestaurantStatus()
		await reloaded.fetchActiveCards()

		expect(reloaded.openedCards).toEqual([])
		expect(reloaded.shownCards.map((card) => card.name)).toEqual([
			"Lunch",
			"Permanent items",
		])
		expect(localStorage.getItem("pos_next_opened_cards")).toBeNull()
	})

	it("and a browser that refuses its storage changes nothing", async () => {
		const store = await aTillBetweenTwoServices()
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
