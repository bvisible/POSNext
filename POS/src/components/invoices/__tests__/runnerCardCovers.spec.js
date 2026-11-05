/**
 * //// Neoffice — added file (no upstream equivalent). The runner's card says what the kitchen's ticket says of the people at its table (NeoResto lot 1, covers): « Table 22 · 3 guests » (« 3 pers. » in French) in the
 * //// header's reference line, and the count after the label of each food course (« Mains 2/3 »), the server's over all the lines of the order. Both only in the view by table and only when the order has covers: a card of
 * //// a station gathers dishes of several tables, and a takeaway has no table. The ticket number and the timer stay on the card.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button @click=\"$emit('click')\"><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

const { default: RunnerOrderCard } = await import("../RunnerOrderCard.vue")

let counter = 0
const dish = (name, family, extra = {}) => {
	counter += 1
	return {
		name: `ROW-${counter}`,
		item_code: `ITEM-${name}`,
		item_name: name,
		qty: 1,
		preparation_station: "kit",
		station_name: "Kitchen",
		station_color: "#D68A59",
		service_family: family,
		service_color: "",
		...extra,
	}
}
const MEAL = () => [
	dish("Cola", "Drink"),
	dish("Soup", "Starter"),
	dish("Steak", "Main"),
	dish("Tart", "Dessert"),
]
const COUNTS = { Starter: 3, Main: 2, Dessert: 4, Drink: 6 }

const card = (items, extra = {}) => ({
	key: "SINV-0042",
	title: "Table 22",
	subtitle: "#SINV-0042",
	invoiceName: "SINV-0042",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	roomName: "Salle 1",
	ticketNo: "0014",
	items,
	stationGroups: [],
	...extra,
})

let opened = []
function show(items, cardExtra = {}, props = {}) {
	const wrapper = mount(RunnerOrderCard, {
		props: {
			card: card(items, cardExtra),
			viewMode: "table",
			showStation: false,
			...props,
		},
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}

const covers = (wrapper) => wrapper.find('[data-test="ticket-covers"]')
const sections = (wrapper) => wrapper.findAll('[data-test="ticket-section"]')
const sectionNamed = (wrapper, family) =>
	sections(wrapper).find(
		(section) => section.attributes("data-family") === family,
	)
const tallyOf = (wrapper, family) =>
	sectionNamed(wrapper, family).find('[data-test="ticket-section-tally"]')
const textOf = (element) => element.text().replace(/\s+/g, " ").trim()

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(new Date(2026, 9, 30, 12, 30, 0))
	opened = []
	counter = 0
	call.mockClear()
	window.innerWidth = 1280
	window.innerHeight = 800
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("the people seated at the table, on the runner's card", () => {
	it("are written beside the table's name, with a people icon", () => {
		const wrapper = show(MEAL(), { covers: 3 })

		expect(textOf(covers(wrapper))).toBe("3 guests")
		expect(covers(wrapper).find("svg").exists()).toBe(true)
		const reference = wrapper.get('[data-test="ticket-ref"]').element
		const names = [...reference.children].map((child) => child.dataset.test)
		expect(names.indexOf("ticket-title")).toBeLessThan(
			names.indexOf("ticket-covers"),
		)
		expect(names.indexOf("ticket-covers")).toBeLessThan(
			names.indexOf("ticket-number"),
		)
	})

	it("say « 1 guest » for one", () => {
		expect(textOf(covers(show(MEAL(), { covers: 1 })))).toBe("1 guest")
	})

	it("are not written while the order has no number", () => {
		for (const value of [null, undefined, 0])
			expect(
				covers(show(MEAL(), { covers: value })).exists(),
				String(value),
			).toBe(false)
		expect(covers(show(MEAL())).exists()).toBe(false)
	})

	it("are not written on a takeaway", () => {
		expect(covers(show(MEAL(), { covers: 3, takeaway: true })).exists()).toBe(
			false,
		)
	})

	it("are not written on a station's card: it gathers the dishes of several tables", () => {
		const wrapper = show(
			MEAL(),
			{
				covers: 3,
				tableGroups: [
					{ tableName: "Table 22", invoiceName: "SINV-0042", items: MEAL() },
				],
			},
			{ viewMode: "station" },
		)

		expect(covers(wrapper).exists()).toBe(false)
	})

	it("leave the ticket number and the timer where they were, on the card", () => {
		const wrapper = show(MEAL(), { covers: 12 })

		const header = wrapper.get('[data-test="ticket-header"]').element
		expect(
			header.contains(wrapper.get('[data-test="ticket-number"]').element),
		).toBe(true)
		expect(
			header.contains(wrapper.get('[data-test="ticket-timer"]').element),
		).toBe(true)
		expect(wrapper.get('[data-test="ticket-number"]').text()).toBe("0014")
		expect(wrapper.get('[data-test="ticket-ref"]').classes()).toEqual(
			expect.arrayContaining(["flex-wrap", "min-w-0"]),
		)
		expect(covers(wrapper).classes()).toContain("whitespace-nowrap")
	})
})

describe("the count of each course on the runner's card", () => {
	it("is written after the label of a food course, against the people seated, as the server counted it", () => {
		const wrapper = show(MEAL(), { covers: 3, familyCounts: COUNTS })

		expect(textOf(sectionNamed(wrapper, "Starter"))).toContain("Starters 3/3")
		expect(textOf(sectionNamed(wrapper, "Main"))).toContain("Mains 2/3")
		expect(textOf(sectionNamed(wrapper, "Dessert"))).toContain(
			"Desserts 4/3 +1",
		)
	})

	it("says the state by its colour and a mark, as the kitchen's ticket does", () => {
		const wrapper = show(MEAL(), { covers: 3, familyCounts: COUNTS })

		expect(tallyOf(wrapper, "Main").attributes("data-state")).toBe("short")
		expect(tallyOf(wrapper, "Main").classes().join(" ")).toContain("#92610C")
		expect(tallyOf(wrapper, "Starter").attributes("data-state")).toBe("done")
		expect(
			tallyOf(wrapper, "Starter")
				.find('[data-test="ticket-section-tally-check"]')
				.exists(),
		).toBe(true)
		expect(tallyOf(wrapper, "Dessert").attributes("data-state")).toBe("over")
	})

	it("is never written for a drink", () => {
		const wrapper = show(MEAL(), { covers: 3, familyCounts: COUNTS })

		expect(
			sectionNamed(wrapper, "Drink")
				.find('[data-test="ticket-section-tally"]')
				.exists(),
		).toBe(false)
	})

	it("is not written while the order has no covers, and the labels stay as they were", () => {
		const wrapper = show(MEAL(), { covers: null, familyCounts: COUNTS })

		expect(wrapper.findAll('[data-test="ticket-section-tally"]')).toHaveLength(
			0,
		)
		expect(sections(wrapper).map((section) => section.text())).toEqual([
			"Drinks",
			"Starters",
			"Mains",
			"Desserts",
		])
	})

	it("is not written for a course the server did not count, nor when it counted none", () => {
		expect(
			show(MEAL(), { covers: 3, familyCounts: { Main: 2 } }).findAll(
				'[data-test="ticket-section-tally"]',
			),
		).toHaveLength(1)
		expect(
			show(MEAL(), { covers: 3 }).findAll('[data-test="ticket-section-tally"]'),
		).toHaveLength(0)
		expect(
			show(MEAL(), { covers: 3, familyCounts: {} }).findAll(
				'[data-test="ticket-section-tally"]',
			),
		).toHaveLength(0)
	})

	it("counts the whole order, not only the dishes at the pass: one main is ready of the two ordered", () => {
		const wrapper = show([dish("Steak", "Main")], {
			covers: 3,
			familyCounts: { Main: 2 },
		})

		expect(textOf(sectionNamed(wrapper, "Main"))).toContain("Mains 2/3")
	})

	it("is not written in the view by station", () => {
		const wrapper = show(
			MEAL(),
			{
				covers: 3,
				familyCounts: COUNTS,
				tableGroups: [
					{ tableName: "Table 22", invoiceName: "SINV-0042", items: MEAL() },
				],
			},
			{ viewMode: "station" },
		)

		expect(wrapper.findAll('[data-test="ticket-section-tally"]')).toHaveLength(
			0,
		)
	})
})
