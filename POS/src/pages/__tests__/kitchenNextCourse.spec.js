/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen screen when the next course is ordered (NeoRestau lot 1, Daniel, 01.11: « quand on commande la suite il doit y avoir un popup à la cuisine, et aussi un son
 * //// pour aviser »). The screen reads its orders every 15 seconds and on each `kds_update`; a ticket ALREADY on the screen that gets a newer send makes a notice under the bar (« T-12 — the next course is ordered:
 * //// Desserts »), rings the sound the till chose and highlights the ticket. What it does follows the till's settings, which a kitchen tablet reads through get_restaurant_settings. (the French words are pinned in utils/__tests__/kitchenAlertsFrench.spec.js).
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const player = vi.hoisted(() => ({ play: null, locked: null }))
const restaurantStore = vi.hoisted(() => ({ tillRestaurant: "The Bistro", runnerEnabled: true }))

vi.hoisted(() => {
	globalThis.__ = (text, replace) => (replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text)
})
vi.mock("frappe-ui", () => ({ Button: { template: "<button><slot /></button>" } }))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurantStore }))
vi.mock("@/socket", () => ({ initSocket: () => null }))
vi.mock("@/utils/alertSoundPlayer", async () => {
	const { ref } = await import("vue")
	player.play = vi.fn(() => true)
	player.locked = ref(true)
	return {
		playAlertSound: player.play,
		alertSoundsLocked: player.locked,
		alertSoundsSupported: () => true,
		listenForFirstTouch: vi.fn(),
		unlockAlertSounds: vi.fn(async () => true),
	}
})

const { default: KDS } = await import("../KDS.vue")

const STARTERS = "2026-11-01 12:00:00.000000"
const DESSERTS = "2026-11-01 13:30:00.000000"
const TABLES = "pos_next.api.restaurant.get_tables"
const STATIONS_READ = "pos_next.api.restaurant.get_preparation_stations"
const KDS_ORDERS = "pos_next.api.restaurant.get_kds_orders"
const SETTINGS = "pos_next.api.restaurant.get_restaurant_settings"
const STATIONS = [
	{ name: "bar", station_name: "Bar", color: "#2C4FA8", use_runner: 0 },
	{ name: "kit", station_name: "Kitchen", color: "#D68A59", use_runner: 0 },
]
const AREAS = [{ name: "r1", area_name: "Room 1" }, { name: "r2", area_name: "Room 2" }]

const dish = (status, sentAt, family, station = "kit") => ({
	name: `${status}-${sentAt}-${family}-${station}`,
	item_name: "Dish",
	qty: 1,
	kds_status: status,
	kds_sent_at: sentAt,
	kds_batch: 1,
	service_family: family,
	preparation_station: station,
	station_name: station,
})
function order(name, items, extra = {}) {
	return {
		name,
		area: "r1",
		restaurant_table: `table-${name}`,
		table_display_name: `T-${name}`,
		kds_status: "Pending",
		creation: "2026-11-01 11:00:00.000000",
		modified: "2026-11-01 12:05:00.000000",
		items,
		...extra,
	}
}
const starters = (name, extra) => order(name, [dish("Preparing", STARTERS, "Starter")], extra)
const withDesserts = (name, extra) =>
	order(name, [dish("Preparing", STARTERS, "Starter"), dish("Pending", DESSERTS, "Dessert")], extra)

let ORDERS = []
let ALERTS = { popup: true, popup_seconds: 30, next_course_sound: "bell", runner_sound: "beep", volume: "medium" }
function serve() {
	call.mockReset()
	call.mockImplementation(async (method, params = {}) => {
		if (method === STATIONS_READ) return STATIONS
		if (method === TABLES) return { areas: AREAS, tables: [], stations: [] }
		if (method === SETTINGS) return { restaurant: "The Bistro", kitchen_alerts: ALERTS }
		if (method === KDS_ORDERS) {
			if (!params.station) return ORDERS
			return ORDERS.map((o) => ({ ...o, items: o.items.filter((i) => i.preparation_station === params.station) })).filter(
				(o) => o.items.length,
			)
		}
		return []
	})
}

const Ticket = {
	props: ["order", "highlighted"],
	template: '<div class="ticket" :data-name="order.name" :data-highlighted="highlighted ? \'yes\' : \'no\'">{{ order.name }}</div>',
}
let opened = []
async function open(search = "") {
	window.history.replaceState({}, "", `/pos/kds${search}`)
	const wrapper = mount(KDS, { attachTo: document.body, global: { stubs: { KDSOrderCard: Ticket }, mocks: { __: globalThis.__ } } })
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
const readAgain = async (wrapper) => {
	await wrapper.get('[data-test="refresh"]').trigger("click")
	await flushPromises()
}
const notices = (wrapper) => wrapper.findAll('[data-test="next-course-notice"]')
const highlighted = (wrapper) => wrapper.findAll(".ticket").filter((el) => el.attributes("data-highlighted") === "yes").map((el) => el.attributes("data-name"))

beforeEach(() => {
	localStorage.clear()
	opened = []
	ORDERS = []
	ALERTS = { popup: true, popup_seconds: 30, next_course_sound: "bell", runner_sound: "beep", volume: "medium" }
	serve()
	player.play.mockClear()
	player.locked.value = true
	window.matchMedia = vi.fn(() => ({ matches: false, media: "", addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	window.matchMedia = undefined
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("the kitchen when the next course of a table is ordered", () => {
	it("tells it under the bar, with a sound, and highlights the ticket", async () => {
		ORDERS = [starters("A"), starters("B")]
		const wrapper = await open()
		expect(notices(wrapper)).toHaveLength(0)

		ORDERS = [withDesserts("A"), starters("B")]
		await readAgain(wrapper)

		expect(notices(wrapper)).toHaveLength(1)
		expect(notices(wrapper)[0].text()).toContain("T-A — the next course is ordered: Desserts")
		expect(player.play).toHaveBeenCalledTimes(1)
		expect(player.play).toHaveBeenCalledWith("bell", "medium")
		expect(highlighted(wrapper)).toEqual(["A"])
	})

	it("stands in the page's column between the bar and the tickets, never over a ticket", async () => {
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)

		const column = [...wrapper.get('[data-test="kitchen-screen"]').element.children].map((el) => el.dataset.test)
		expect(column.indexOf("top-bar")).toBeLessThan(column.indexOf("next-course-notices"))
		expect(column.indexOf("next-course-notices")).toBeLessThan(column.indexOf("ticket-area"))
		expect(wrapper.get('[data-test="next-course-notices"]').classes()).not.toContain("fixed")
		expect(wrapper.get('[data-test="next-course-notices"]').classes()).not.toContain("absolute")
	})

	it("says nothing on the first reading of the screen, nor for a ticket that was not there", async () => {
		ORDERS = [withDesserts("A")]
		const wrapper = await open()
		expect(notices(wrapper)).toHaveLength(0)

		ORDERS = [withDesserts("A"), withDesserts("NEW")]
		await readAgain(wrapper)

		expect(notices(wrapper)).toHaveLength(0)
		expect(player.play).not.toHaveBeenCalled()
	})

	it("says it once however often the screen reads the same send", async () => {
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)
		await readAgain(wrapper)
		await readAgain(wrapper)

		expect(notices(wrapper)).toHaveLength(1)
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("is dismissed by its button, and the ticket stays", async () => {
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)

		await wrapper.get('[data-test="notice-dismiss"]').trigger("click")

		expect(notices(wrapper)).toHaveLength(0)
		expect(wrapper.findAll(".ticket").map((el) => el.attributes("data-name"))).toContain("A")
	})

	it("goes by itself after the seconds the till set", async () => {
		ALERTS = { ...ALERTS, popup_seconds: 5 }
		ORDERS = [starters("A")]
		const wrapper = await open()
		vi.useFakeTimers()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)
		expect(notices(wrapper)).toHaveLength(1)

		await vi.advanceTimersByTimeAsync(5000)

		expect(notices(wrapper)).toHaveLength(0)
	})
})

describe("what the till's settings change", () => {
	it("plays the sound and the volume the till chose", async () => {
		ALERTS = { ...ALERTS, next_course_sound: "gong", volume: "high" }
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)

		expect(player.play).toHaveBeenCalledWith("gong", "high")
	})

	it("shows no notice and highlights nothing with the popup off, and still rings", async () => {
		ALERTS = { ...ALERTS, popup: false }
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)

		expect(notices(wrapper)).toHaveLength(0)
		expect(highlighted(wrapper)).toEqual([])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("rings nothing for the sound none, and shows the notice", async () => {
		ALERTS = { ...ALERTS, next_course_sound: "none" }
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)

		expect(player.play).not.toHaveBeenCalled()
		expect(notices(wrapper)).toHaveLength(1)
	})

	it("works with the defaults when the server knows nothing of the settings", async () => {
		call.mockImplementation(async (method, params = {}) => {
			if (method === SETTINGS) throw new Error("not permitted")
			if (method === STATIONS_READ) return STATIONS
			if (method === TABLES) return { areas: AREAS, tables: [], stations: [] }
			return method === KDS_ORDERS ? ORDERS : []
		})
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)

		expect(player.play).toHaveBeenCalledWith("bell", "medium")
		expect(notices(wrapper)).toHaveLength(1)
	})

	it("asks for the settings of the restaurant of the screen", async () => {
		await open("?restaurant=The%20Other")

		const read = call.mock.calls.find(([method]) => method === SETTINGS)
		expect(read[1].restaurant).toBe("The Other")
	})
})

describe("the stations and the rooms the screen shows", () => {
	it("tells the kitchen's screen of the kitchen's dessert, and the bar's of nothing it was not sent", async () => {
		ORDERS = [order("A", [dish("Preparing", STARTERS, "Starter", "kit"), dish("Preparing", STARTERS, "Drink", "bar")])]
		const bar = await open("?station=bar")
		ORDERS = [order("A", [dish("Preparing", STARTERS, "Starter", "kit"), dish("Preparing", STARTERS, "Drink", "bar"), dish("Pending", DESSERTS, "Dessert", "kit")])]
		await readAgain(bar)
		expect(notices(bar)).toHaveLength(0)
		expect(player.play).not.toHaveBeenCalled()
	})

	it("tells the screen of the station that was sent the dessert", async () => {
		ORDERS = [order("A", [dish("Preparing", STARTERS, "Starter", "kit")])]
		const kitchen = await open("?station=kit")
		ORDERS = [order("A", [dish("Preparing", STARTERS, "Starter", "kit"), dish("Pending", DESSERTS, "Dessert", "kit")])]
		await readAgain(kitchen)

		expect(notices(kitchen)).toHaveLength(1)
	})

	it("does not announce a table of a room the screen does not show", async () => {
		localStorage.setItem("pos_kds_area", "r1")
		ORDERS = [starters("A", { area: "r2" })]
		const wrapper = await open()
		ORDERS = [withDesserts("A", { area: "r2" })]
		await readAgain(wrapper)

		expect(notices(wrapper)).toHaveLength(0)
		expect(player.play).not.toHaveBeenCalled()
	})
})

describe("the chip « touch the screen to enable the sound »", () => {
	it("shows in the bar while a sound is on and the page has not been touched", async () => {
		const wrapper = await open()

		expect(wrapper.find('[data-test="sound-unlock"]').exists()).toBe(true)
		player.locked.value = false
		await flushPromises()
		expect(wrapper.find('[data-test="sound-unlock"]').exists()).toBe(false)
	})

	it("is not there when the till's sound for the next course is none", async () => {
		ALERTS = { ...ALERTS, next_course_sound: "none" }
		const wrapper = await open()

		expect(wrapper.find('[data-test="sound-unlock"]').exists()).toBe(false)
	})
})
