/**
 * //// Neoffice — added file (no upstream equivalent). Rooms, tables, stations, cards, menus, reservations and
 * //// tips belong to a restaurant, and a till works for one restaurant: the store asks the server for the
 * //// restaurant the till's settings name, and shows a room, a table or a station by its label (a new one is
 * //// named by a hash, which is no text for a waiter to read). Until the till's settings name a restaurant the
 * //// server picks it, so every call works without.
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
	const table = () => ({ clear: vi.fn(), bulkPut: vi.fn(), put: vi.fn(), toArray: vi.fn(() => []) })
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

const A_HASH = "k3x9q2m7ab"
const ANOTHER_HASH = "p0z8c1v5de"
const THE_FLOOR = {
	areas: [{ name: A_HASH, area_name: "Room 1" }],
	tables: [{ name: ANOTHER_HASH, table_name: "T1", area: A_HASH, area_name: "Room 1" }],
	stations: [{ name: "h4sh0f4stn", station_name: "Kitchen", area: A_HASH }],
}

function answerWith(answers = {}) {
	call.mockImplementation(async (method) => {
		if (method in answers) return answers[method]
		if (method.endsWith("get_tables")) return THE_FLOOR
		if (method.endsWith("get_restaurant_settings"))
			return { opening_hours: [], is_open: true, current_slot: null }
		if (method.endsWith("get_station_items_map")) return { items: {}, groups: {} }
		return []
	})
}

describe("the restaurant store asks for the restaurant of the till", () => {
	let store
	beforeEach(() => {
		setActivePinia(createPinia())
		call.mockReset()
		answerWith()
		tillSettings.restaurant = undefined
		tillSettings.restaurant_name = undefined
		store = useRestaurantStore()
	})

	it("names the till's restaurant in every read of the floor, the stations, the cards and the menus", async () => {
		tillSettings.restaurant = "The Bistro"

		await store.fetchFromNetwork()

		for (const method of [
			"get_tables",
			"get_station_items_map",
			"get_active_menus",
			"get_active_cards",
		]) {
			expect(call, method).toHaveBeenCalledWith(
				`pos_next.api.restaurant.${method}`,
				{ restaurant: "The Bistro" },
			)
		}
	})

	it("names no restaurant while the till does not, and lets the server pick", async () => {
		await store.fetchFromNetwork()

		expect(call).toHaveBeenCalledWith("pos_next.api.restaurant.get_tables", {
			restaurant: undefined,
		})
	})

	it("creates a room in the till's restaurant", async () => {
		tillSettings.restaurant = "The Bistro"

		await store.createArea("Terrace")

		expect(call).toHaveBeenCalledWith("pos_next.api.restaurant.create_area", {
			area_name: "Terrace",
			restaurant: "The Bistro",
		})
	})

	it("reads the status and the takeaway orders of the till's restaurant", async () => {
		tillSettings.restaurant = "The Bistro"

		await store.fetchRestaurantStatus()
		await store.fetchTakeawayOrders()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.get_restaurant_status",
			{ restaurant: "The Bistro" },
		)
		const takeaway = call.mock.calls.find(
			([method]) => method === "pos_next.api.restaurant.get_takeaway_orders",
		)
		expect(takeaway[1].restaurant).toBe("The Bistro")
	})

	it("hands the restaurant to a page that is not a till", () => {
		tillSettings.restaurant = "The Bistro"
		expect(store.ofTheRestaurant()).toEqual({ restaurant: "The Bistro" })
		tillSettings.restaurant = ""
		expect(store.ofTheRestaurant()).toEqual({ restaurant: undefined })
	})

	it("reads the settings of the restaurant a kitchen or pass tablet names, before the till's", async () => {
		tillSettings.restaurant = "The Bistro"

		await store.fetchRestaurantSettings("The Bar")

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.get_restaurant_settings",
			{ restaurant: "The Bar" },
		)
	})

	it("shows the takeaway lane when the till's own setting, as the server reads it, is on", async () => {
		answerWith({
			"pos_next.api.restaurant.get_restaurant_settings": {
				restaurant: "The Bistro",
				opening_hours: [],
				is_open: true,
				enable_takeaway: true,
				takeaway_card: "Takeaway menu",
			},
		})
		await store.fetchRestaurantSettings()
		expect(store.takeawayEnabled).toBe(true)
		expect(store.takeawayCard).toBe("Takeaway menu")

		answerWith({
			"pos_next.api.restaurant.get_restaurant_settings": {
				restaurant: "The Bistro",
				opening_hours: [],
				is_open: true,
				enable_takeaway: false,
				takeaway_card: null,
			},
		})
		await store.fetchRestaurantSettings()
		expect(store.takeawayEnabled).toBe(false)
	})

	it("tells the label of the restaurant the till works for", () => {
		tillSettings.restaurant_name = "The Bistro"
		expect(store.restaurantName).toBe("The Bistro")
		tillSettings.restaurant_name = undefined
		expect(store.restaurantName).toBe("")
	})
})

describe("a room, a table and a station are shown by their label", () => {
	let store
	beforeEach(async () => {
		setActivePinia(createPinia())
		call.mockReset()
		answerWith()
		store = useRestaurantStore()
		await store.fetchFromNetwork()
	})

	it("gives the label of a room, a table and a station named by a hash", () => {
		expect(store.areaLabel(A_HASH)).toBe("Room 1")
		expect(store.tableLabel(ANOTHER_HASH)).toBe("T1")
		expect(store.stationLabel("h4sh0f4stn")).toBe("Kitchen")
	})

	it("finds the label of a station through the item and group maps as well", async () => {
		answerWith({
			"pos_next.api.restaurant.get_tables": { areas: [], tables: [], stations: [] },
			"pos_next.api.restaurant.get_station_items_map": {
				items: { SOUP: { station: "st-a", station_name: "Kitchen", color: "#111" } },
				groups: { Drinks: { station: "st-b", station_name: "Bar", color: "#222" } },
			},
		})
		await store.fetchFromNetwork()

		expect(store.stationLabel("st-a")).toBe("Kitchen")
		expect(store.stationLabel("st-b")).toBe("Bar")
	})

	it("names the table of a new guest order by its label in the alert", async () => {
		const handlers = {}
		const showAlert = vi.fn()
		window.frappe = {
			realtime: { on: (event, handler) => (handlers[event] = handler) },
			show_alert: showAlert,
		}
		try {
			store.startStatusPolling()
			handlers.guest_order_submitted({ table: ANOTHER_HASH })

			expect(showAlert.mock.calls[0][0].message).toBe("New guest order for table T1")
		} finally {
			store.stopStatusPolling()
			delete window.frappe
		}
	})

	it("falls back on the name of a record it knows nothing of, and on nothing for nothing", () => {
		expect(store.stationLabel("a-station-nobody-listed")).toBe("a-station-nobody-listed")
		expect(store.tableLabel("T-legacy")).toBe("T-legacy")
		expect(store.areaLabel("Main Hall")).toBe("Main Hall")
		expect(store.stationLabel("")).toBe("")
		expect(store.tableLabel(null)).toBe("")
		expect(store.areaLabel(undefined)).toBe("")
	})
})

describe("a till answers the guest alerts of its own restaurant only", () => {
	let store
	let handlers
	let showAlert
	let updates
	const onUpdate = (event) => updates.push(event.detail)

	beforeEach(async () => {
		setActivePinia(createPinia())
		call.mockReset()
		answerWith()
		tillSettings.restaurant = "The Bistro"
		store = useRestaurantStore()
		await store.fetchFromNetwork()
		handlers = {}
		updates = []
		showAlert = vi.fn()
		window.frappe = {
			realtime: { on: (event, handler) => (handlers[event] = handler) },
			show_alert: showAlert,
		}
		window.addEventListener("pos:guest-order-update", onUpdate)
		store.startStatusPolling()
	})

	afterEach(() => {
		store.stopStatusPolling()
		window.removeEventListener("pos:guest-order-update", onUpdate)
		delete window.frappe
		tillSettings.restaurant = undefined
	})

	it("shows the alert of a guest order at a table of its restaurant, by the label of the table", () => {
		handlers.guest_order_submitted({ restaurant: "The Bistro", table: ANOTHER_HASH })

		expect(showAlert).toHaveBeenCalledTimes(1)
		expect(showAlert.mock.calls[0][0].message).toBe("New guest order for table T1")
		expect(updates).toHaveLength(1)
	})

	it("ignores the alert of a guest order at a table of another restaurant", () => {
		handlers.guest_order_submitted({ restaurant: "The Bar", table: "x0y1z2w3vu" })

		expect(showAlert).not.toHaveBeenCalled()
		expect(updates).toEqual([])
	})

	it("ignores a payment received at a table of another restaurant, and passes on the one of its own", () => {
		handlers.guest_payment_received({ restaurant: "The Bar", table: "x0y1z2w3vu" })
		expect(updates).toEqual([])

		handlers.guest_payment_received({ restaurant: "The Bistro", table: ANOTHER_HASH })
		expect(updates).toEqual([{ restaurant: "The Bistro", table: ANOTHER_HASH }])
	})

	it("answers as it always did to an alert that names no restaurant", () => {
		handlers.guest_order_submitted({ table: ANOTHER_HASH })

		expect(showAlert).toHaveBeenCalledTimes(1)
	})

	it("answers every alert while its settings do not name its restaurant yet", () => {
		tillSettings.restaurant = undefined

		handlers.guest_order_submitted({ restaurant: "The Bar", table: "x0y1z2w3vu" })

		expect(showAlert).toHaveBeenCalledTimes(1)
	})
})
