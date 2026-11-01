/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen screen of a restaurant that prepares ahead (NeoRestau lot 1, the service rhythm, Daniel, 01.11: « Oui, les deux modes »). The later courses are on the
 * //// tickets from « Valider », marked ahead, so the next course is not SENT, it is CALLED: the popup and the sound go off on the call (the room stamps `kds_called_at`), not when a course merely arrives. The restaurant's
 * //// rhythm is read with the kitchen alerts, handed to the tickets, and turns the device's « follow the order of the meal » off.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { inject, ref } from "vue"
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

const { SERVICE_RHYTHM_KEY } = await import("@/utils/serviceRhythm")
const STARTERS = "2026-11-01 12:00:00.000000"
const CALL = "2026-11-01 12:50:00.000000"
const TABLES = "pos_next.api.restaurant.get_tables"
const STATIONS_READ = "pos_next.api.restaurant.get_preparation_stations"
const KDS_ORDERS = "pos_next.api.restaurant.get_kds_orders"
const SETTINGS = "pos_next.api.restaurant.get_restaurant_settings"
const STATIONS = [{ name: "kit", station_name: "Kitchen", color: "#D68A59", use_runner: 0 }]
const AREAS = [{ name: "r1", area_name: "Room 1" }]

const dish = (status, family, extra = {}) => ({
	name: `${status}-${family}`,
	item_name: family,
	qty: 1,
	kds_status: status,
	kds_sent_at: STARTERS,
	kds_batch: 1,
	service_family: family,
	preparation_station: "kit",
	station_name: "kit",
	...extra,
})
const meal = (name, calledAt = null) => ({
	name,
	area: "r1",
	restaurant_table: `table-${name}`,
	table_display_name: `T-${name}`,
	kds_status: "Pending",
	creation: "2026-11-01 11:00:00.000000",
	modified: "2026-11-01 12:05:00.000000",
	items: [
		dish("Preparing", "Starter"),
		dish("Pending", "Main", { kds_ahead: 1, kds_called_at: calledAt }),
		dish("Pending", "Dessert", { kds_ahead: 1, kds_called_at: null }),
	],
})

let ORDERS = []
let RHYTHM = "Prepared ahead"
function serve() {
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method === STATIONS_READ) return STATIONS
		if (method === TABLES) return { areas: AREAS, tables: [], stations: [] }
		if (method === SETTINGS)
			return {
				restaurant: "The Bistro",
				service_rhythm: RHYTHM,
				kitchen_alerts: { popup: true, popup_seconds: 30, next_course_sound: "bell", runner_sound: "beep", volume: "medium" },
			}
		if (method === KDS_ORDERS) return ORDERS
		return []
	})
}

// A ticket that says the rhythm it was handed, as the real card reads it
const Ticket = {
	props: ["order", "highlighted"],
	setup() {
		const rhythm = inject(SERVICE_RHYTHM_KEY, ref("none"))
		return { rhythm }
	},
	template: '<div class="ticket" :data-name="order.name" :data-rhythm="rhythm" :data-highlighted="highlighted ? \'yes\' : \'no\'">{{ order.name }}</div>',
}
let opened = []
async function open() {
	window.history.replaceState({}, "", "/pos/kds")
	const wrapper = mount(KDS, { attachTo: document.body, global: { stubs: { KDSOrderCard: Ticket }, mocks: { __: globalThis.__ } } })
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
const readAgain = async (wrapper) => {
	await wrapper.get('[data-test="refresh"]').trigger("click")
	await flushPromises()
}
const flashing = (wrapper) => wrapper.findAll(".ticket").filter((el) => el.attributes("data-highlighted") === "yes").map((el) => el.attributes("data-name"))

beforeEach(() => {
	localStorage.clear()
	opened = []
	ORDERS = []
	RHYTHM = "Prepared ahead"
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

describe("the kitchen of a restaurant that prepares ahead", () => {
	it("hands the restaurant's rhythm to its tickets", async () => {
		ORDERS = [meal("A")]
		const wrapper = await open()

		expect(wrapper.get(".ticket").attributes("data-rhythm")).toBe("Prepared ahead")
	})

	it("hands the room's call to its tickets in a restaurant that is called by the room", async () => {
		RHYTHM = "Called by the room"
		ORDERS = [meal("A")]
		const wrapper = await open()

		expect(wrapper.get(".ticket").attributes("data-rhythm")).toBe("Called by the room")
	})

	it("tells nothing when a course merely arrives ahead or is started: the alert goes off on the CALL", async () => {
		ORDERS = [meal("A")]
		const wrapper = await open()

		ORDERS = [{ ...meal("A"), items: [...meal("A").items, dish("Pending", "Dessert", { name: "late", kds_ahead: 1, kds_called_at: null, kds_sent_at: "2026-11-01 12:30:00.000000" })] }]
		await readAgain(wrapper)

		expect(flashing(wrapper)).toEqual([])
		expect(player.play).not.toHaveBeenCalled()
	})

	it("rings, and makes the ticket flash, when the room calls the course", async () => {
		ORDERS = [meal("A"), meal("B")]
		const wrapper = await open()

		ORDERS = [meal("A", CALL), meal("B")]
		await readAgain(wrapper)

		expect(player.play).toHaveBeenCalledTimes(1)
		expect(player.play).toHaveBeenCalledWith("bell", "medium")
		expect(flashing(wrapper)).toEqual(["A"])
	})

	it("offers the device's « follow the order of the meal » only where the room calls the courses", async () => {
		ORDERS = [meal("A")]
		const ahead = await open()
		await ahead.get('[data-test="awake-settings"]').trigger("click")
		expect(ahead.find('[data-test="course-order"]').exists()).toBe(false)
		ahead.unmount()
		opened = []

		RHYTHM = "Called by the room"
		const room = await open()
		await room.get('[data-test="awake-settings"]').trigger("click")
		expect(room.find('[data-test="course-order"]').exists()).toBe(true)
	})
})
