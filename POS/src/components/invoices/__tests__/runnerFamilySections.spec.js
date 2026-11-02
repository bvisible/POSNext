/**
 * //// Neoffice — added file (no upstream equivalent). The runner's card separates the courses and tints the categories as the kitchen's ticket does (NeoResto
 * //// lot 1, Daniel's request of 01.11): the dishes at the pass are drawn in sections in the order of the meal (Drink, Starter, Main, Dessert), each under a small
 * //// label with a thin dashed rule; a dish whose family is unknown stands loose at the top; a card none of whose dishes carries a family is drawn exactly as it
 * //// always was; a dish whose category has a colour has a pale tint behind its row, and only a strict `#RRGGBB` is ever put in a style. The same in the view by
 * //// table and in the view by station (where each table has its own group of dishes).
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

const COLORS = {
	Drink: "#CFE8FF",
	Starter: "#D8F0D0",
	Main: "#FFE9C7",
	Dessert: "#F7D9E6",
}

let counter = 0
const nextId = () => {
	counter += 1
	return counter
}
const dish = (name, family, extra = {}) => ({
	name: `ROW-${nextId()}`,
	item_code: `ITEM-${name}`,
	item_name: name,
	qty: 1,
	preparation_station: "kit",
	station_name: "Kitchen",
	station_color: "#D68A59",
	service_family: family,
	service_color: "",
	...extra,
})
const painted = (name, family, extra = {}) =>
	dish(name, family, { service_color: COLORS[family], ...extra })

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
function show(items, props = {}, cardExtra = {}) {
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
const sections = (wrapper) => wrapper.findAll('[data-test="ticket-section"]')
const sectionNames = (wrapper) =>
	sections(wrapper).map((section) => section.text())
const nameOf = (element) => {
	const copy = element.cloneNode(true)
	for (const pill of copy.querySelectorAll(
		'[data-test="ticket-qty-of"], [data-test="ticket-station-code"]',
	))
		pill.remove()
	return copy.textContent.trim()
}
const dishNames = (wrapper) =>
	wrapper
		.findAll('[data-test="ticket-dish-name"]')
		.map((name) => nameOf(name.element))
const rows = (wrapper) => wrapper.findAll('[data-test="ticket-line"]')
const rowOf = (wrapper, name) =>
	rows(wrapper).find(
		(row) => nameOf(row.get('[data-test="ticket-dish-name"]').element) === name,
	)
const wrapperOf = (row) => row.element.closest("[data-ticket-line]")

beforeEach(() => {
	// A fixed clock: two tickets drawn a moment apart carry the same timers
	vi.useFakeTimers()
	vi.setSystemTime(new Date(2026, 9, 30, 12, 30, 0))
	opened = []
	counter = 0
	call.mockClear()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("the sections of the runner's card, by table", () => {
	const meal = () => [
		dish("Tart", "Dessert"),
		dish("Steak", "Main"),
		dish("Soup", "Starter"),
		dish("Cola", "Drink"),
	]

	it("come in the order of the meal, each under its label", () => {
		const wrapper = show(meal())

		expect(sectionNames(wrapper)).toEqual([
			"Drinks",
			"Starters",
			"Mains",
			"Desserts",
		])
		expect(dishNames(wrapper)).toEqual(["Cola", "Soup", "Steak", "Tart"])
	})

	it("are the kitchen's: the same label, the same dashed rule, drawn inside the wrapper of the first dish of the section", () => {
		const wrapper = show(meal())

		const label = sections(wrapper)[1]
		expect(label.get("span").classes()).toEqual(
			expect.arrayContaining(["uppercase", "font-bold", "tracking-wider"]),
		)
		expect(label.get("span[aria-hidden='true']").classes()).toEqual(
			expect.arrayContaining(["flex-1", "border-t", "border-dashed"]),
		)
		expect(wrapperOf(rowOf(wrapper, "Soup")).firstElementChild).toBe(
			label.element,
		)
	})

	it("keep the dishes of a section in the order the server gave them", () => {
		const wrapper = show([
			dish("Penne", "Main"),
			dish("Soup", "Starter"),
			dish("Steak", "Main"),
			dish("Salad", "Starter"),
		])

		expect(dishNames(wrapper)).toEqual(["Soup", "Salad", "Penne", "Steak"])
	})

	it("put a dish whose family is unknown at the top, under no label", () => {
		const wrapper = show([
			dish("Tart", "Dessert"),
			dish("Gum", ""),
			dish("Soup", "Starter"),
		])

		expect(dishNames(wrapper)).toEqual(["Gum", "Soup", "Tart"])
		expect(sectionNames(wrapper)).toEqual(["Starters", "Desserts"])
	})

	it("draw a faint rule between two dishes of a section, and none under a label", () => {
		const wrapper = show([
			dish("Soup", "Starter"),
			dish("Salad", "Starter"),
			dish("Tart", "Dessert"),
		])

		expect(
			rows(wrapper).map((row) => wrapperOf(row).classList.contains("border-t")),
		).toEqual([false, true, false])
	})

	it("keep a label with its first dish in the full-screen columns", () => {
		const wrapper = show(meal(), { fullscreen: true })

		expect(sections(wrapper)[0].classes()).toEqual(
			expect.arrayContaining(["break-inside-avoid", "break-after-avoid"]),
		)
	})

	it("leave the card's own list alone: a copy is drawn, the card's dishes are not changed", () => {
		const items = meal()
		const names = items.map((item) => item.item_name)

		show(items)

		expect(items.map((item) => item.item_name)).toEqual(names)
		expect(items.every((item) => !("_head" in item))).toBe(true)
	})
})

describe("the sections of the runner's card, by station", () => {
	it("cut each table's group of dishes into sections", () => {
		const first = [dish("Tart", "Dessert"), dish("Soup", "Starter")]
		const second = [dish("Steak", "Main"), dish("Cola", "Drink")]
		const wrapper = show(
			[...first, ...second],
			{ viewMode: "station" },
			{
				title: "Kitchen",
				tableGroups: [
					{ tableName: "T1", invoiceName: "SINV-1", items: first },
					{ tableName: "T2", invoiceName: "SINV-2", items: second },
				],
			},
		)

		const groups = wrapper.findAll('[data-test="ticket-group"]')
		expect(groups).toHaveLength(2)
		expect(
			groups[0].findAll('[data-test="ticket-section"]').map((s) => s.text()),
		).toEqual(["Starters", "Desserts"])
		expect(
			groups[1].findAll('[data-test="ticket-section"]').map((s) => s.text()),
		).toEqual(["Drinks", "Mains"])
		expect(dishNames(wrapper)).toEqual(["Soup", "Tart", "Cola", "Steak"])
	})
})

describe("a card none of whose dishes carries a family", () => {
	const lines = (family) => [
		dish("Soup", family),
		dish("Steak", family),
		dish("Cola", family),
	]
	const bare = (items) =>
		items.map((item) => {
			// The shape an older server answered in: neither key at all
			const { service_family: _family, service_color: _color, ...older } = item
			return older
		})

	it("has no label and keeps the order it was given in", () => {
		const wrapper = show(lines(""))

		expect(sections(wrapper)).toHaveLength(0)
		expect(dishNames(wrapper)).toEqual(["Soup", "Steak", "Cola"])
	})

	it("is drawn exactly as the card of a server that does not send a family: the same HTML", () => {
		const items = lines("")
		const withFields = show(items).html()
		counter = 0
		const without = show(bare(lines(""))).html()

		expect(withFields).toBe(without)
	})

	it("keeps the faint rule above every dish but the first, and no tint", () => {
		const wrapper = show(lines(""))

		expect(
			rows(wrapper).map((row) => wrapperOf(row).classList.contains("border-t")),
		).toEqual([false, true, true])
		for (const row of rows(wrapper)) {
			expect(row.attributes("style")).toBeUndefined()
			expect(row.classes().join(" ")).not.toContain("service-tint")
		}
	})
})

describe("the tint of a category on the runner's card", () => {
	it("is a pale shade of the category's colour behind the dish's row, in both views", () => {
		const wrapper = show([painted("Soup", "Starter"), dish("Steak", "Main")])

		const row = rowOf(wrapper, "Soup")
		expect(row.element.style.getPropertyValue("--service-tint")).toBe(
			"rgba(216, 240, 208, 0.16)",
		)
		expect(row.classes()).toContain("bg-[color:var(--service-tint)]")
		expect(rowOf(wrapper, "Steak").attributes("style")).toBeUndefined()

		const items = [painted("Soup", "Starter")]
		const byStation = show(
			items,
			{ viewMode: "station" },
			{
				tableGroups: [{ tableName: "T1", invoiceName: "SINV-1", items }],
			},
		)
		expect(
			rowOf(byStation, "Soup").element.style.getPropertyValue("--service-tint"),
		).toBe("rgba(216, 240, 208, 0.16)")
	})

	it("is never made of a value that is not a strict #RRGGBB", () => {
		for (const color of [
			"red",
			"#FFF",
			"#CFE8FF;background:url(x)",
			"#CFE8FF\n",
			"rgb(1, 2, 3)",
			null,
			42,
		]) {
			const wrapper = show([dish("Soup", "Starter", { service_color: color })])
			const row = rowOf(wrapper, "Soup")

			expect(row.attributes("style"), JSON.stringify(color)).toBeUndefined()
			expect(row.classes().join(" ")).not.toContain("service-tint")
		}
	})

	it("keeps the pressed state classes of the row", () => {
		const row = rowOf(show([painted("Soup", "Starter")]), "Soup")

		expect(row.classes()).toContain("bg-[color:var(--service-tint)]")
		// The runner's row has no pressed state of its own (a dish has no tap here): nothing to hide
		expect(row.classes()).not.toContain("active:bg-gray-100")
	})
})
