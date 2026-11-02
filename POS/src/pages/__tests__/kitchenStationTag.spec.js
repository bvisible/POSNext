/**
 * //// Neoffice — added file (no upstream equivalent). The station's tag appears on the kitchen screen's dishes only in the view of ALL the
 * //// stations (NeoResto lot 1, task 38a-1, ruling 110): a screen opened on one station, or a station chosen in the filter, does not draw it.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	tillRestaurant: "The Bistro",
	runnerEnabled: false,
}))

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})
vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/socket", () => ({ initSocket: () => null }))

const { default: KDS } = await import("../KDS.vue")

const STATIONS = [
	{ name: "kit", station_name: "Cuisine", color: "#D68A59", use_runner: 0 },
	{ name: "bar", station_name: "Bar", color: "#2C4FA8", use_runner: 0 },
]
const ORDER = {
	name: "A",
	area: "",
	restaurant_table: "t1",
	table_display_name: "T1",
	kds_status: "Pending",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	items: [
		{
			item_code: "SOUP",
			item_name: "Soupe",
			qty: 1,
			kds_status: "Pending",
			preparation_station: "kit",
			station_name: "Cuisine",
		},
		{
			item_code: "BEER",
			item_name: "Bière",
			qty: 1,
			kds_status: "Pending",
			preparation_station: "bar",
			station_name: "Bar",
		},
	],
}

function serve() {
	call.mockReset()
	call.mockImplementation(async (method, params = {}) => {
		if (method.endsWith("get_preparation_stations")) return STATIONS
		if (method.endsWith("get_tables"))
			return { areas: [], tables: [], stations: [] }
		if (method.endsWith("get_kds_orders")) {
			if (!params.station) return [ORDER]
			return [
				{
					...ORDER,
					items: ORDER.items.filter(
						(item) => item.preparation_station === params.station,
					),
				},
			]
		}
		return []
	})
}

let opened = []
async function open(search = "") {
	window.history.replaceState({}, "", `/pos/kds${search}`)
	const wrapper = mount(KDS, {
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
beforeEach(() => {
	opened = []
	localStorage.clear()
	serve()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
})
const tags = (wrapper) =>
	wrapper.findAll('[data-test="ticket-station-tag"]').map((tag) => tag.text())

describe("the station's tag on the kitchen screen", () => {
	it("is on each dish when every station is shown", async () => {
		const wrapper = await open()

		expect(tags(wrapper)).toEqual(["CUI", "BAR"])
	})

	it("is not drawn on a screen opened on one station", async () => {
		const wrapper = await open("?station=kit")

		expect(wrapper.text()).toContain("Soupe")
		expect(tags(wrapper)).toEqual([])
	})

	it("goes when a station is chosen in the filter, and comes back when it is taken back", async () => {
		const wrapper = await open()
		const chip = wrapper
			.findAll('[data-test="stations"] button')
			.find((button) => button.text().startsWith("Cuisine"))

		await chip.trigger("click")
		await flushPromises()
		expect(tags(wrapper)).toEqual([])

		await chip.trigger("click")
		await flushPromises()
		expect(tags(wrapper)).toEqual(["CUI", "BAR"])
	})
})
