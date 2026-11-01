/**
 * //// Neoffice — added file (no upstream equivalent). The station's tag on a kitchen dish (NeoRestau lot 1, task 38a-1, ruling 110): in
 * //// the view of ALL the stations a small coloured label stands INLINE on the dish's own line, before its name, and takes no line of its
 * //// own (it was a pill under every dish, and "il faut vraiment optimiser les tickets"); in the view of one station it is not drawn at all
 * //// (the filter at the top says which station it is). A dish also says its own state on its line only when that is not the ticket's.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: false }))

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

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue")

const STATIONS = [
	{ name: "kit", station_name: "Cuisine", color: "#D68A59" },
	{ name: "bar", station_name: "Bar", color: "#2C4FA8" },
]
let opened = []
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	opened = []
})

const dish = (status, station, extra = {}) => ({
	item_code: `${station}-${status}-${extra.qty ?? 1}`,
	item_name: `${station} dish`,
	qty: 1,
	kds_status: status,
	kds_batch: 1,
	preparation_station: station,
	station_name: station === "kit" ? "Cuisine" : "Bar",
	...extra,
})
function show(items, props = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: {
			order: {
				name: "SINV-TAG",
				restaurant_table: "T1",
				table_display_name: "T1",
				kds_status: "Preparing",
				creation: "2026-10-30 12:00:00",
				modified: "2026-10-30 12:05:00",
				items,
			},
			stations: STATIONS,
			showStationBadge: true,
			...props,
		},
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const lines = (wrapper) => wrapper.findAll('[data-test="ticket-line"]')

describe("the station's tag, in the view of all the stations", () => {
	it("stands on the dish's own line, before its name: inside the element that holds the name", () => {
		const wrapper = show([dish("Pending", "kit")])

		const tag = wrapper.get('[data-test="ticket-station-tag"]')
		const name = wrapper.get('[data-test="ticket-dish-name"]')
		expect(name.element.contains(tag.element)).toBe(true)
		// Before the dish's name in reading order
		expect(name.text().startsWith("CUI")).toBe(true)
		expect(name.text().endsWith("kit dish")).toBe(true)
	})

	it("takes NO line of its own: a dish is one row of the grid, plus the options and remark it has", () => {
		const wrapper = show([dish("Pending", "kit"), dish("Pending", "bar")])

		for (const line of lines(wrapper)) {
			// The quantity and the name (with the tag inside it): two cells, nothing else
			expect(line.element.children).toHaveLength(2)
			expect(line.element.firstElementChild.getAttribute("data-test")).toBe(
				"ticket-qty",
			)
			expect(line.element.lastElementChild.getAttribute("data-test")).toBe(
				"ticket-dish-name",
			)
		}
	})

	it("is a small label: the first three letters of the station's name in capitals, the whole name as its title, the station's colour behind it", () => {
		const wrapper = show([dish("Pending", "kit"), dish("Pending", "bar")])

		const tags = wrapper.findAll('[data-test="ticket-station-tag"]')
		expect(tags.map((tag) => tag.text())).toEqual(["CUI", "BAR"])
		expect(tags.map((tag) => tag.attributes("title"))).toEqual([
			"Cuisine",
			"Bar",
		])
		expect(tags[0].element.style.backgroundColor).toBe("rgb(214, 138, 89)")
		expect(tags[1].element.style.backgroundColor).toBe("rgb(44, 79, 168)")
		// As small as the room chip, sized by the size chosen
		expect(tags[0].classes()).toContain("text-[length:var(--kds-fs-ref,11px)]")
	})

	it("keeps what the dark mode gave it (task 46): white on a dark station, ink on a light one", () => {
		const tags = show([dish("Pending", "kit"), dish("Pending", "bar")]).findAll(
			'[data-test="ticket-station-tag"]',
		)

		for (const tag of tags) {
			expect(tag.classes()).toContain("text-white")
			expect(tag.classes()).toContain("dark:text-[color:var(--station-ink)]")
		}
	})
})

describe("in the view of one station", () => {
	it("is not drawn: the screen's filter says it, and every dish gains the room", () => {
		const wrapper = show([dish("Pending", "kit"), dish("Pending", "bar")], {
			showStationBadge: false,
		})

		expect(wrapper.find('[data-test="ticket-station-tag"]').exists()).toBe(
			false,
		)
		expect(wrapper.text()).not.toMatch(/CUI|BAR/)
	})
})

describe("the state of a dish", () => {
	it("is written on its line only when it is not the ticket's own, so that a dish being prepared on a ticket in preparation says nothing", () => {
		// The ticket is in preparation (a dish is begun): the begun dish is silent, the others say where they are
		const wrapper = show(
			[
				dish("Preparing", "kit", { item_code: "A" }),
				dish("Pending", "kit", { item_code: "B" }),
				dish("Ready", "kit", { item_code: "C" }),
			],
			{ showStationBadge: false },
		)

		expect(
			wrapper
				.findAll('[data-test="ticket-line-state"]')
				.map((pill) => pill.text()),
		).toEqual(["Pending", "Ready"])
	})

	it("is never a wide pill beside the name that makes a long dish wrap: it is inline before the name, with the tag", () => {
		const wrapper = show([
			dish("Preparing", "kit"),
			dish("Pending", "kit", { item_code: "B" }),
		])

		const pill = wrapper.get('[data-test="ticket-line-state"]')
		expect(
			wrapper
				.findAll('[data-test="ticket-dish-name"]')[1]
				.element.contains(pill.element),
		).toBe(true)
		expect(pill.classes()).toContain("inline-block")
	})

	it("is a check mark and the struck-through name for a dish that is delivered: no pill, nothing to press", () => {
		const wrapper = show(
			[dish("Delivered", "kit", { item_code: "D" }), dish("Preparing", "kit")],
			{ showStationBadge: false },
		)

		// The finished dish comes after the dish to cook (kitchen test, 01.11)
		const delivered = lines(wrapper)[1]
		expect(delivered.find('[data-test="ticket-line-done"]').exists()).toBe(true)
		expect(delivered.find('[data-test="ticket-line-state"]').exists()).toBe(
			false,
		)
		expect(delivered.classes()).toContain("line-through")
	})
})

describe("the quantity of a dish", () => {
	it("is a number and a times sign in a column of its own, tinted when there are several so that it is seen from across the pass", () => {
		const wrapper = show(
			[
				dish("Pending", "kit", { qty: 3, item_code: "M" }),
				dish("Pending", "kit"),
			],
			{
				showStationBadge: false,
			},
		)

		const [several, single] = wrapper.findAll('[data-test="ticket-qty"]')
		expect(several.text()).toBe("3×")
		expect(several.classes()).toContain("bg-blue-100")
		expect(single.text()).toBe("1×")
		expect(single.classes()).not.toContain("bg-blue-100")
	})
})
