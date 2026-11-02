/**
 * //// Neoffice — added file (no upstream equivalent). The runner's sound when dishes come up ready is a setting of the till (NeoResto lot 1, Daniel, 01.11): POS Settings, "Kitchen alerts", read for the restaurant of
 * //// the screen through get_restaurant_settings (a pass tablet has no till). The default is the beep this screen has always made, at the volume it always had; the shared alert-sound player plays it once somebody has touched
 * //// the page, and the bar says so until then.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const player = vi.hoisted(() => ({ play: null, locked: null }))
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: true, tillRestaurant: "The Bistro", fetchRestaurantSettings: async () => {} }))

vi.hoisted(() => {
	globalThis.__ = (text) => text
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

const { default: Runner } = await import("../Runner.vue")

const SETTINGS = "pos_next.api.restaurant.get_restaurant_settings"
const RUNNER_ORDERS = "pos_next.api.restaurant.get_runner_orders"
const TABLES = "pos_next.api.restaurant.get_tables"

const ready = (name, count) => ({
	name,
	area: "r1",
	restaurant_table: `table-${name}`,
	table_display_name: `T-${name}`,
	kds_status: "Preparing",
	creation: "2026-11-01 12:00:00",
	modified: "2026-11-01 12:00:00",
	items: Array.from({ length: count }, (_, index) => ({
		name: `${name}-${index}`,
		item_name: "Dish",
		qty: 1,
		kds_status: "Ready",
		preparation_station: "kit",
		station_name: "Kitchen",
		station_color: "#D68A59",
	})),
})
let ORDERS = []
let ALERTS = null
function serve() {
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method === SETTINGS) return { restaurant: "The Bistro", kitchen_alerts: ALERTS }
		if (method === TABLES) return { areas: [{ name: "r1", area_name: "Room 1" }], tables: [], stations: [] }
		if (method === RUNNER_ORDERS) return ORDERS
		return []
	})
}
const Card = { props: ["card", "viewMode"], template: '<div class="card">{{ card.title }}</div>' }
let opened = []
async function open() {
	const wrapper = mount(Runner, { global: { stubs: { RunnerOrderCard: Card }, mocks: { __: globalThis.__ } } })
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
const refresh = async (wrapper) => {
	await wrapper.get('[data-test="refresh"]').trigger("click")
	await flushPromises()
}

beforeEach(() => {
	localStorage.clear()
	opened = []
	ORDERS = [ready("A", 1)]
	ALERTS = null
	serve()
	player.play.mockClear()
	player.locked.value = true
	window.history.replaceState({}, "", "/pos/runner")
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
})

describe("the runner's sound for dishes that come up ready", () => {
	it("is the beep at the medium volume when the till says nothing", async () => {
		const wrapper = await open()
		ORDERS = [ready("A", 1), ready("B", 1)]
		await refresh(wrapper)

		expect(player.play).toHaveBeenCalledTimes(1)
		expect(player.play).toHaveBeenCalledWith("beep", "medium")
	})

	it("is the sound and the volume the till chose for the runner", async () => {
		ALERTS = { popup: true, popup_seconds: 30, next_course_sound: "bell", runner_sound: "chime", volume: "high" }
		const wrapper = await open()
		ORDERS = [ready("A", 1), ready("B", 1)]
		await refresh(wrapper)

		expect(player.play).toHaveBeenCalledWith("chime", "high")
	})

	it("is asked for the restaurant of the screen", async () => {
		window.history.replaceState({}, "", "/pos/runner?restaurant=The%20Other")
		await open()

		const reads = call.mock.calls.filter(([method]) => method === SETTINGS)
		expect(reads.some(([, params]) => params.restaurant === "The Other")).toBe(true)
	})

	it("is not played when no dish is new: the first reading, and the same reading again, are silent", async () => {
		const wrapper = await open()
		await refresh(wrapper)

		expect(player.play).not.toHaveBeenCalled()
	})
})

describe("the chip « touch the screen to enable the sound » on the runner", () => {
	it("shows while the page has not been touched and the runner has a sound", async () => {
		const wrapper = await open()

		expect(wrapper.find('[data-test="sound-unlock"]').exists()).toBe(true)
		player.locked.value = false
		await flushPromises()
		expect(wrapper.find('[data-test="sound-unlock"]').exists()).toBe(false)
	})

	it("is not there when the runner's sound is none", async () => {
		ALERTS = { runner_sound: "none" }
		const wrapper = await open()

		expect(wrapper.find('[data-test="sound-unlock"]').exists()).toBe(false)
	})
})
