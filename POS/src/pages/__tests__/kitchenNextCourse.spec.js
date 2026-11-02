/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen screen when the next course is ordered (NeoResto lot 1, Daniel, 01.11: « quand on commande la suite il doit y avoir un popup à la cuisine, et aussi un son
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
const { latestSendAt } = await import("@/utils/courseTimer")

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
// the course before is done (at the pass): the dessert called can be started. A starter still being cooked would hold it, greyed, and the ticket would not blink (the order of the meal)
const starters = (name, extra) => order(name, [dish("Ready", STARTERS, "Starter")], extra)
const withDesserts = (name, extra) =>
	order(name, [dish("Ready", STARTERS, "Starter"), dish("Pending", DESSERTS, "Dessert")], extra)

let ORDERS = []
let ALERTS = { popup: true, next_course_sound: "bell", runner_sound: "beep", volume: "medium" }
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

// The card's two choices while it blinks (KDSOrderCard): « To do » says which ticket was seen
const Ticket = {
	props: ["order", "highlighted"],
	emits: ["acknowledge"],
	template:
		'<div class="ticket" :data-name="order.name" :data-highlighted="highlighted ? \'yes\' : \'no\'">{{ order.name }}<button v-if="highlighted" data-test="ticket-todo" @click="$emit(\'acknowledge\', order.name)">To do</button></div>',
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
const highlighted = (wrapper) => wrapper.findAll(".ticket").filter((el) => el.attributes("data-highlighted") === "yes").map((el) => el.attributes("data-name"))

beforeEach(() => {
	localStorage.clear()
	opened = []
	ORDERS = []
	ALERTS = { popup: true, next_course_sound: "bell", runner_sound: "beep", volume: "medium" }
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
	it("rings, and makes the ticket flash, when a ticket already on the screen gets the next course", async () => {
		ORDERS = [starters("A"), starters("B")]
		const wrapper = await open()
		expect(highlighted(wrapper)).toEqual([])

		ORDERS = [withDesserts("A"), starters("B")]
		await readAgain(wrapper)

		expect(player.play).toHaveBeenCalledTimes(1)
		expect(player.play).toHaveBeenCalledWith("bell", "medium")
		expect(highlighted(wrapper)).toEqual(["A"])
	})

	it("draws no banner at all (Daniel, 01.11: the ticket is the alert)", async () => {
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)

		expect(wrapper.find('[data-test="next-course-notices"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="next-course-notice"]').exists()).toBe(false)
	})

	it("says nothing on the first reading of the screen, nor for a ticket that was not there", async () => {
		ORDERS = [withDesserts("A")]
		const wrapper = await open()
		expect(highlighted(wrapper)).toEqual([])

		ORDERS = [withDesserts("A"), withDesserts("NEW")]
		await readAgain(wrapper)

		expect(highlighted(wrapper)).toEqual([])
		expect(player.play).not.toHaveBeenCalled()
	})

	it("says it once however often the screen reads the same send", async () => {
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)
		await readAgain(wrapper)
		await readAgain(wrapper)

		expect(highlighted(wrapper)).toEqual(["A"])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("stops the flash when the ticket's « To do » is pressed, and the ticket stays", async () => {
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)
		expect(highlighted(wrapper)).toEqual(["A"])

		await wrapper.get('[data-test="ticket-todo"]').trigger("click")

		expect(highlighted(wrapper)).toEqual([])
		expect(wrapper.findAll(".ticket").map((el) => el.attributes("data-name"))).toContain("A")
		// read again, the same send is not told again
		await readAgain(wrapper)
		expect(highlighted(wrapper)).toEqual([])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("flashes until the cook takes the dishes up, however long it takes (Daniel, 01.11)", async () => {
		ORDERS = [starters("A")]
		const wrapper = await open()
		vi.useFakeTimers()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)
		await vi.advanceTimersByTimeAsync(10 * 60_000)

		expect(highlighted(wrapper)).toEqual(["A"])

		ORDERS = [order("A", [dish("Preparing", STARTERS, "Starter"), dish("Preparing", DESSERTS, "Dessert")])]
		await readAgain(wrapper)

		expect(highlighted(wrapper)).toEqual([])
	})

	it("stands the tickets that blink FIRST in their band, in the order they were called, and counts them in the band's header (Daniel, 01.11)", async () => {
		ORDERS = [starters("A"), starters("B"), starters("C"), starters("D")]
		const wrapper = await open()
		const inBand = () => wrapper.findAll('[data-test="band-production"] .ticket').map((el) => el.attributes("data-name"))
		expect(inBand()).toEqual(["A", "B", "C", "D"])

		ORDERS = [starters("A"), starters("B"), withDesserts("C"), starters("D")]
		await readAgain(wrapper)
		expect(inBand()).toEqual(["C", "A", "B", "D"])

		ORDERS = [starters("A"), withDesserts("B", {}), withDesserts("C"), starters("D")]
		await readAgain(wrapper)
		expect(inBand()).toEqual(["C", "B", "A", "D"])
		expect(wrapper.get('[data-test="band-production"] [data-test="band-blinking"]').text()).toBe("2 to take")

		// one left to do goes back to its place of arrival: by the time its course left (C's dessert came after the starters of A and D)
		await wrapper.get('.ticket[data-name="C"] [data-test="ticket-todo"]').trigger("click")
		expect(inBand()).toEqual(["B", "A", "D", "C"])
	})

	it("flashes every table that has ordered and been left, not only the newest", async () => {
		ORDERS = [starters("A"), starters("B")]
		const wrapper = await open()
		ORDERS = [withDesserts("A"), starters("B")]
		await readAgain(wrapper)
		ORDERS = [withDesserts("A"), withDesserts("B")]
		await readAgain(wrapper)

		expect(highlighted(wrapper).sort()).toEqual(["A", "B"])
		expect(player.play).toHaveBeenCalledTimes(2)

		await wrapper.get('.ticket[data-name="A"] [data-test="ticket-todo"]').trigger("click")
		expect(highlighted(wrapper)).toEqual(["B"])
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

	it("flashes nothing with the popup off, and still rings", async () => {
		ALERTS = { ...ALERTS, popup: false }
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)

		expect(highlighted(wrapper)).toEqual([])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("rings nothing for the sound none, and flashes the ticket", async () => {
		ALERTS = { ...ALERTS, next_course_sound: "none" }
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)

		expect(player.play).not.toHaveBeenCalled()
		expect(highlighted(wrapper)).toEqual(["A"])
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
		expect(highlighted(wrapper)).toEqual(["A"])
	})

	it("asks for the settings of the restaurant of the screen", async () => {
		await open("?restaurant=The%20Other")

		const read = call.mock.calls.find(([method]) => method === SETTINGS)
		expect(read[1].restaurant).toBe("The Other")
	})
})

describe("the stations and the rooms the screen shows", () => {
	it("tells the kitchen's screen of the kitchen's dessert, and the bar's of nothing it was not sent", async () => {
		ORDERS = [order("A", [dish("Ready", STARTERS, "Starter", "kit"), dish("Preparing", STARTERS, "Drink", "bar")])]
		const bar = await open("?station=bar")
		ORDERS = [order("A", [dish("Ready", STARTERS, "Starter", "kit"), dish("Preparing", STARTERS, "Drink", "bar"), dish("Pending", DESSERTS, "Dessert", "kit")])]
		await readAgain(bar)
		expect(highlighted(bar)).toEqual([])
		expect(player.play).not.toHaveBeenCalled()
	})

	it("tells the screen of the station that was sent the dessert", async () => {
		ORDERS = [order("A", [dish("Ready", STARTERS, "Starter", "kit")])]
		const kitchen = await open("?station=kit")
		ORDERS = [order("A", [dish("Ready", STARTERS, "Starter", "kit"), dish("Pending", DESSERTS, "Dessert", "kit")])]
		await readAgain(kitchen)

		expect(highlighted(kitchen)).toEqual(["A"])
	})

	it("takes the first reading of a newly chosen station as a baseline: what was ordered while the cook looked at the bar is not announced when he comes back to all stations", async () => {
		ORDERS = [order("A", [dish("Ready", STARTERS, "Starter", "kit"), dish("Preparing", STARTERS, "Drink", "bar")])]
		const wrapper = await open()
		const choose = async (label) => {
			const chip = wrapper.findAll('[data-test="stations"] button').find((button) => button.text().replace(/\s+/g, " ").startsWith(label))
			await chip.trigger("click")
			await flushPromises()
		}

		await choose("Bar")
		// The kitchen's dessert is ordered while the screen shows the bar: the bar's reading sees nothing of it
		ORDERS = [order("A", [dish("Ready", STARTERS, "Starter", "kit"), dish("Preparing", STARTERS, "Drink", "bar"), dish("Pending", DESSERTS, "Dessert", "kit")])]
		await readAgain(wrapper)
		await choose("Bar")

		expect(highlighted(wrapper)).toEqual([])
		expect(player.play).not.toHaveBeenCalled()
	})

	it("does not announce a table of a room the screen does not show", async () => {
		localStorage.setItem("pos_kds_area", "r1")
		ORDERS = [starters("A", { area: "r2" })]
		const wrapper = await open()
		ORDERS = [withDesserts("A", { area: "r2" })]
		await readAgain(wrapper)

		expect(highlighted(wrapper)).toEqual([])
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

//// Neoffice — a kitchen may have several tablets (Daniel, 01.11: « évidemment, on peut avoir imaginé plusieurs tablettes en cuisine »): the « To do » of one tablet is told to the server with the key of the call, the reading carries
//// it back, and the other tablets that show the same station stop blinking
describe("the kitchen with several tablets", () => {
	const SEEN = "pos_next.api.kitchen_events.acknowledge_kitchen_call"
	const keyOf = (name) => `${name}|${latestSendAt(withDesserts(name).items)}`
	const asked = () => call.mock.calls.filter(([method]) => method === SEEN)

	async function blinking() {
		ORDERS = [starters("A")]
		const wrapper = await open()
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)
		expect(highlighted(wrapper)).toEqual(["A"])
		return wrapper
	}

	it("tells the server which call was taken up when « To do » is pressed", async () => {
		const wrapper = await blinking()

		await wrapper.get('[data-test="ticket-todo"]').trigger("click")
		await flushPromises()

		expect(asked()).toHaveLength(1)
		expect(asked()[0][1]).toEqual({ invoice: "A", call: keyOf("A"), station: undefined })
	})

	it("names the station the screen is opened on: another station's screen is not told", async () => {
		ORDERS = [starters("A")]
		const wrapper = await open("?station=kit")
		ORDERS = [withDesserts("A")]
		await readAgain(wrapper)

		await wrapper.get('[data-test="ticket-todo"]').trigger("click")
		await flushPromises()

		expect(asked()[0][1]).toMatchObject({ invoice: "A", station: "kit" })
	})

	it("stops blinking when a reading says another screen took that call up, without telling the server again", async () => {
		const wrapper = await blinking()

		ORDERS = [withDesserts("A", { call_seen: keyOf("A") })]
		await readAgain(wrapper)

		expect(highlighted(wrapper)).toEqual([])
		expect(asked()).toHaveLength(0)
		expect(wrapper.findAll(".ticket").map((el) => el.attributes("data-name"))).toContain("A")
	})

	it("keeps blinking when what was taken up is an older call of the table", async () => {
		const wrapper = await blinking()

		ORDERS = [withDesserts("A", { call_seen: "A|1" })]
		await readAgain(wrapper)

		expect(highlighted(wrapper)).toEqual(["A"])
	})

	it("stops blinking here all the same when the server cannot be reached", async () => {
		const wrapper = await blinking()
		const served = call.getMockImplementation()
		call.mockImplementation(async (method, params) => {
			if (method === SEEN) throw new Error("offline")
			return served(method, params)
		})

		await wrapper.get('[data-test="ticket-todo"]').trigger("click")
		await flushPromises()

		expect(highlighted(wrapper)).toEqual([])
	})
})
