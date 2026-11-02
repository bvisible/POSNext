/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen and runner screens on a PHONE (NeoResto lot 1, smoke-test fix). At 390 px the kitchen page
 * //// was 657 px wide and the runner's 797 px (measured in a browser): « To deliver », the size of the text, the theme, the refresh, the way back and the
 * //// runner's display modes were off the screen, the page scrolled sideways, and the full-screen ticket, a fixed panel, was stretched past the screen with
 * //// its × and its main button (a page wider than the phone widens the layout viewport of a mobile browser). Below 768 px the top bar is now three lines
 * //// (the title; the screens; the actions) that wrap, every control is at least 40 px high, and the page root never widens the page; from 768 px the bar is the
 * //// line it was. A jsdom has no layout, so here the classes that carry it are pinned (and compiled in pages/__tests__/
 * //// serviceScreensStylesheet.spec.js, where `max-md:` is checked to be the complement of `md:`); a browser measured the widths and the heights (this fix's browser harness).
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	tillRestaurant: "The Bistro",
	runnerEnabled: true,
	fetchRestaurantSettings: async () => {},
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
const { default: Runner } = await import("../Runner.vue")
const { default: ServiceTopBar } = await import(
	"@/components/restaurant/ServiceTopBar.vue"
)
const { default: SegmentedControl } = await import(
	"@/components/restaurant/SegmentedControl.vue"
)
const { default: ThemeButton } = await import(
	"@/components/restaurant/ThemeButton.vue"
)
const { default: RoomStationFilterLine } = await import(
	"@/components/restaurant/RoomStationFilterLine.vue"
)

const AREAS = [
	{ name: "r1", area_name: "Room 1" },
	{ name: "r2", area_name: "Room 2" },
]
const STATIONS = [
	{
		name: "bar",
		station_name: "Bar",
		color: "#4A6B8F",
		restaurant: "The Bistro",
		use_runner: 1,
	},
	{
		name: "kit",
		station_name: "Cuisine",
		color: "#F55D1A",
		restaurant: "The Bistro",
		use_runner: 1,
	},
]
function serve() {
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method.endsWith("get_preparation_stations")) return STATIONS
		if (method.endsWith("get_tables"))
			return { areas: AREAS, tables: [], stations: [] }
		return []
	})
}

let mounted = []
const keep = (wrapper) => {
	mounted.push(wrapper)
	return wrapper
}
beforeEach(() => {
	serve()
	document.cookie = "system_user=yes"
	localStorage.clear()
})
afterEach(() => {
	for (const wrapper of mounted) wrapper.unmount()
	mounted = []
	document.body.innerHTML = ""
})

async function page(Screen, address) {
	window.history.replaceState({}, "", address)
	const wrapper = keep(
		mount(Screen, {
			global: {
				stubs: { KDSOrderCard: true, RunnerOrderCard: true },
				mocks: { __: globalThis.__, $router: { push: vi.fn() } },
			},
			attachTo: document.body,
		}),
	)
	await flushPromises()
	return wrapper
}
const bar = (props = {}, slots = {}) =>
	keep(
		mount(ServiceTopBar, {
			props: { title: "Bar", count: "3 orders", ...props },
			slots,
			global: { mocks: { __: globalThis.__ } },
		}),
	)

describe("the top bar below 768 px: three lines that wrap, and a line from 768 px", () => {
	it("row 1 wraps below 768 px and keeps its 48 px line from 768 px", () => {
		const row = bar().get('[data-test="top-bar-row1"]')

		expect(row.classes()).toEqual(
			expect.arrayContaining([
				// Below 768 px: as tall as its lines, wrapping
				"max-md:h-auto",
				"max-md:flex-wrap",
				"max-md:gap-y-1",
				"max-md:py-1.5",
				// From 768 px, and the 1024 px step, as they were
				"flex",
				"h-12",
				"items-center",
				"gap-2",
				"pl-3.5",
				"pr-2.5",
				"max-[1024px]:gap-1.5",
				"max-[1024px]:pr-1.5",
			]),
		)
	})

	it("the title takes the first line alone below 768 px, and is what it was from 768 px", () => {
		const title = bar().get('[data-test="page-title"]')

		expect(title.classes()).toEqual(
			expect.arrayContaining([
				"max-md:w-full",
				"max-md:h-9",
				"max-md:items-center",
				"flex",
				"min-w-0",
				"flex-shrink",
				"items-baseline",
				"whitespace-nowrap",
			]),
		)
	})

	it("the screens (the switch, the display modes) are a line of their own below 768 px, and `contents` from 768 px: they take no part in the desk's line", () => {
		const wrapper = bar(
			{},
			{
				switch: '<div data-test="s-switch">switch</div>',
				view: '<div data-test="s-view">view</div>',
			},
		)

		const screens = wrapper.get('[data-test="top-bar-screens"]')
		expect(screens.classes()).toEqual(
			expect.arrayContaining([
				"md:contents",
				"max-md:flex",
				"max-md:w-full",
				"max-md:flex-wrap",
				"max-md:gap-1.5",
				// A screen with no switch (a tablet paired for its screen) leaves no empty line
				"max-md:empty:hidden",
			]),
		)
		// What a page hands to its slots is inside it, in the order it was
		expect([...screens.element.children].map((el) => el.dataset.test)).toEqual([
			"s-switch",
			"s-view",
		])
	})

	it("the actions are one line below 768 px that wraps instead of overflowing, and `contents` from 768 px", () => {
		const wrapper = bar(
			{},
			{
				chip: '<button data-test="chip">chip</button>',
				theme: '<button data-test="the-theme">theme</button>',
			},
		)

		const actions = wrapper.get('[data-test="top-bar-actions"]')
		expect(actions.classes()).toEqual(
			expect.arrayContaining([
				"md:contents",
				"max-md:flex",
				"max-md:w-full",
				"max-md:flex-wrap",
				"max-md:justify-end",
				"max-md:items-center",
				"max-md:gap-1.5",
			]),
		)
		// Everything the row held before is still in the bar, the chip first, then « show completed », the size of the text, the theme, the refresh, the way back
		const order = [...actions.element.querySelectorAll("button, label")].map(
			(el) => el.dataset.test,
		)
		expect(order).toEqual([
			"chip",
			"completed-toggle",
			"text-size",
			"the-theme",
			"refresh",
			"back-to-pos",
		])
	})

	it("the buttons of the bar are 44 px from 768 px and 40 px below, the touch minimum", () => {
		const wrapper = bar(
			{ deskSession: true },
			{ theme: '<button data-test="the-theme">theme</button>' },
		)

		for (const test of ["text-size", "refresh", "back-to-pos"])
			expect(wrapper.get(`[data-test="${test}"]`).classes(), test).toEqual(
				expect.arrayContaining(["h-11", "w-11", "max-md:h-10", "max-md:w-10"]),
			)
		const toggle = wrapper.get('[data-test="completed-toggle"]')
		expect(toggle.classes()).toEqual(
			expect.arrayContaining(["h-11", "max-md:h-10"]),
		)
		expect(toggle.get('[data-test="completed-eye"]').classes()).toEqual(
			expect.arrayContaining(["h-11", "w-11", "max-md:h-10", "max-md:w-10"]),
		)
	})

	it("the theme button is 44 px from 768 px and 40 px below", () => {
		const wrapper = keep(
			mount(ThemeButton, { global: { mocks: { __: globalThis.__ } } }),
		)

		expect(wrapper.get('[data-test="theme-button"]').classes()).toEqual(
			expect.arrayContaining(["h-11", "w-11", "max-md:h-10", "max-md:w-10"]),
		)
	})

	it("the switch between the screens and the display modes are 40 px high below 768 px, and 38 px and 32 px from 768 px", () => {
		const options = [
			{ id: "a", label: "A" },
			{ id: "b", label: "B" },
		]
		const regular = keep(
			mount(SegmentedControl, {
				props: { options, modelValue: "a", name: "screen" },
			}),
		)
		for (const button of regular.findAll("button"))
			expect(button.classes()).toEqual(
				expect.arrayContaining(["h-[38px]", "max-md:h-10"]),
			)
		const small = keep(
			mount(SegmentedControl, {
				props: { options, modelValue: "a", name: "view", small: true },
			}),
		)
		for (const button of small.findAll("button"))
			expect(button.classes()).toEqual(
				expect.arrayContaining(["h-8", "max-md:h-10"]),
			)
	})

	it("the chips of the filter line are 40 px high and a little narrower below 768 px, 32 px and px-4 from 768 px; the stations start at the left and take a row of their own", () => {
		const wrapper = keep(
			mount(RoomStationFilterLine, {
				props: {
					rooms: [{ name: "r1", label: "Room 1" }],
					stations: [{ name: "bar", label: "Bar", color: "#4A6B8F" }],
				},
				global: { mocks: { __: globalThis.__ } },
			}),
		)

		for (const chip of wrapper.findAll("button"))
			expect(chip.classes(), chip.text()).toEqual(
				expect.arrayContaining(["h-8", "px-4", "max-md:h-10", "max-md:px-3"]),
			)
		expect(wrapper.get('[data-test="stations"]').classes()).toEqual(
			expect.arrayContaining([
				"ml-auto",
				"justify-end",
				"max-md:ml-0",
				"max-md:w-full",
				"max-md:justify-start",
			]),
		)
	})
})

describe("the pages' roots never widen a phone's page", () => {
	it.each([
		["kitchen", KDS, "/pos/kds", "kitchen-screen"],
		["runner", Runner, "/pos/runner", "runner-screen"],
	])(
		"the %s root clips sideways below 768 px and keeps every class it had",
		async (_name, Screen, address, test) => {
			const wrapper = await page(Screen, address)

			const root = wrapper.get(`[data-test="${test}"]`)
			expect(root.classes()).toEqual(
				expect.arrayContaining([
					"max-md:overflow-x-hidden",
					"flex",
					"flex-col",
					"h-screen",
					"supports-[height:100dvh]:h-dvh",
					"bg-gray-100",
					"dark:bg-gray-900",
				]),
			)
		},
	)

	it.each([
		["kitchen", KDS, "/pos/kds"],
		["runner", Runner, "/pos/runner"],
	])(
		"the %s bar keeps all its controls inside the header, wherever it wraps",
		async (_name, Screen, address) => {
			const wrapper = await page(Screen, address)

			const header = wrapper.get('[data-test="top-bar"]')
			for (const test of [
				"page-title",
				"top-bar-screens",
				"top-bar-actions",
				"completed-toggle",
				"text-size",
				"theme-button",
				"refresh",
				"back-to-pos",
			])
				expect(header.find(`[data-test="${test}"]`).exists(), test).toBe(true)
			// The runner's display modes are on the screens' line, with the switch
			if (address.includes("runner"))
				expect(
					header
						.get('[data-test="top-bar-screens"]')
						.find('[data-test="view-switch"]')
						.exists(),
				).toBe(true)
		},
	)
})
