/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen ticket separates the courses and tints the categories (NeoResto lot 1, Daniel's
 * //// request of 01.11: « comment on fait pour séparer entrée, plat, dessert » on the tickets, a thin dashed rule with a small label, and « une couleur très
 * //// pastel mais parlante, configurable dans les catégories, pas obligatoire »). Inside each send the dishes still to cook are drawn in sections in the
 * //// order of the meal (Drink, Starter, Main, Dessert); the finished dishes stay at the end of the send under no label; a ticket none of whose dishes
 * //// carries a family is drawn exactly as it always was; a dish whose category has a colour has a pale tint behind its row, which never hides the
 * //// highlight of the dish whose status menu is open.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: false }))

vi.hoisted(() => {
	// The app's `__`: indexed placeholders; the context is not looked at here
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

const COLORS = {
	Drink: "#CFE8FF",
	Starter: "#D8F0D0",
	Main: "#FFE9C7",
	Dessert: "#F7D9E6",
}

let opened = []
let counter = 0
const nextId = () => {
	counter += 1
	return counter
}
/** A dish of a send, at a status, of a family (and the colour of its category when asked). */
const dish = (name, family, extra = {}) => ({
	item_code: `ITEM-${nextId()}-${name}`,
	item_name: name,
	qty: 1,
	kds_status: "Pending",
	kds_batch: 1,
	preparation_station: "kit",
	service_family: family,
	service_color: "",
	...extra,
})
const painted = (name, family, extra = {}) =>
	dish(name, family, { service_color: COLORS[family], ...extra })

function show(items, props = {}, order = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: {
			order: {
				name: "SINV-SECTIONS",
				restaurant_table: "T1",
				table_display_name: "T1",
				kds_status: "Preparing",
				creation: "2026-10-30 12:00:00",
				modified: "2026-10-30 12:05:00",
				items,
				...order,
			},
			stations: [{ name: "kit", station_name: "Kitchen", color: "#D68A59" }],
			// the sections are read here apart from the order of the meal (kdsCourseOrder.spec.js reads that)
			courseOrder: false,
			...props,
		},
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}

const sections = (wrapper) => wrapper.findAll('[data-test="ticket-section"]')
// the label alone: a section that can be pressed also says how many dishes it takes
const sectionNames = (wrapper) =>
	sections(wrapper).map((section) => section.get("span").text())
// The dish's own name: without the pills the card writes before it (station, state, units sent)
const nameOf = (element) => {
	const copy = element.cloneNode(true)
	for (const pill of copy.querySelectorAll(
		'[data-test="ticket-station-tag"], [data-test="ticket-line-state"], [data-test="ticket-line-sent"]',
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
	window.innerWidth = 1280
	window.innerHeight = 800
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("the sections of a send", () => {
	const meal = () => [
		dish("Tart", "Dessert"),
		dish("Steak", "Main"),
		dish("Soup", "Starter"),
		dish("Cola", "Drink"),
	]

	it("come in the order of the meal, each under its label, whatever the order the dishes were saved in", () => {
		const wrapper = show(meal())

		expect(sectionNames(wrapper)).toEqual([
			"Drinks",
			"Starters",
			"Mains",
			"Desserts",
		])
		expect(dishNames(wrapper)).toEqual(["Cola", "Soup", "Steak", "Tart"])
	})

	it("write the label small, in capitals, muted and spaced, like the « Coming Next » label", () => {
		const label = sections(show(meal()))[0].get("span")

		expect(label.classes()).toEqual(
			expect.arrayContaining(["uppercase", "font-bold", "tracking-wider"]),
		)
		expect(label.classes().join(" ")).toMatch(/text-\[length:var\(--kds-fs-ref/)
	})

	it("draw a thin dashed rule after the label, in the style of the « Send N » separator", () => {
		const rule = sections(show(meal()))[0].get("span[aria-hidden='true']")

		expect(rule.classes()).toEqual(
			expect.arrayContaining(["flex-1", "border-t", "border-dashed"]),
		)
	})

	it("stand INSIDE the wrapper of the first dish of their section, above it", () => {
		const wrapper = show(meal())

		const soup = wrapperOf(rowOf(wrapper, "Soup"))
		expect(soup.firstElementChild.getAttribute("data-test")).toBe(
			"ticket-section",
		)
		expect(soup.firstElementChild.textContent).toContain("Starters")
		// Not above the dishes that follow in the same section
		const second = show([dish("Soup", "Starter"), dish("Salad", "Starter")])
		expect(sectionNames(second)).toEqual(["Starters"])
		expect(
			wrapperOf(rowOf(second, "Salad")).querySelector(
				'[data-test="ticket-section"]',
			),
		).toBeNull()
	})

	it("keep the dishes of a section in the order they were saved in", () => {
		const wrapper = show([
			dish("Penne", "Main"),
			dish("Soup", "Starter"),
			dish("Steak", "Main"),
			dish("Salad", "Starter"),
		])

		expect(dishNames(wrapper)).toEqual(["Soup", "Salad", "Penne", "Steak"])
	})

	it("leave out the family nothing belongs to", () => {
		const wrapper = show([dish("Soup", "Starter"), dish("Tart", "Dessert")])

		expect(sectionNames(wrapper)).toEqual(["Starters", "Desserts"])
	})

	it("belong to each send: a second send has its own sections, under its « Send 2 » separator", () => {
		const wrapper = show([
			dish("Soup", "Starter", { kds_status: "Delivered" }),
			dish("Steak", "Main", { kds_batch: 2 }),
			dish("Tart", "Dessert", { kds_batch: 2 }),
			dish("Cola", "Drink", { kds_batch: 2 }),
		])

		expect(sectionNames(wrapper)).toEqual(["Drinks", "Mains", "Desserts"])
		const text = wrapper.get('[data-test="ticket-body"]').text()
		expect(text.indexOf("Send 2")).toBeGreaterThan(text.indexOf("Soup"))
		expect(text.indexOf("Send 2")).toBeLessThan(text.indexOf("Drinks"))
	})

	it("keep the finished dishes of a course that has a dish to cook, or of no course, at the end of their send, struck through, under no label", () => {
		// (a course all done folds into one line instead: kdsCourseOrder.spec.js)
		const wrapper = show([
			dish("Soup", "Starter", { kds_status: "Delivered" }),
			dish("Salad", "Starter"),
			dish("Steak", "Main"),
			dish("Gum", "", { kds_status: "Delivered" }),
		])

		expect(sectionNames(wrapper)).toEqual(["Starters", "Mains"])
		expect(dishNames(wrapper).slice(-2)).toEqual(["Soup", "Gum"])
		for (const name of ["Soup", "Gum"]) {
			const row = rowOf(wrapper, name)
			expect(row.classes()).toContain("line-through")
			expect(
				wrapperOf(row).querySelector('[data-test="ticket-section"]'),
			).toBeNull()
		}
	})

	it("put a dish whose family is unknown at the top of the send under no label, as every dish was before", () => {
		const wrapper = show([
			dish("Tart", "Dessert"),
			dish("Gum", ""),
			dish("Cheese", "Cheese"),
			dish("Soup", "Starter"),
		])

		expect(dishNames(wrapper)).toEqual(["Gum", "Cheese", "Soup", "Tart"])
		expect(sectionNames(wrapper)).toEqual(["Starters", "Desserts"])
		expect(
			wrapperOf(rowOf(wrapper, "Gum")).querySelector(
				'[data-test="ticket-section"]',
			),
		).toBeNull()
	})

	it("do not touch the preview of what is coming next", () => {
		const wrapper = show([
			dish("Soup", "Starter"),
			dish("Steak", "Main", { kds_status: "Waiting" }),
		])

		expect(sectionNames(wrapper)).toEqual(["Starters"])
		expect(wrapper.text()).toContain("Coming Next")
	})

	it("keep the status menu on the dish that was tapped, though the sections moved the dishes", async () => {
		const wrapper = show(meal())

		await rowOf(wrapper, "Tart").trigger("click")

		expect(wrapper.get('[data-test="ticket-line-menu-dish"]').text()).toContain(
			"Tart",
		)
		await rowOf(wrapper, "Cola").trigger("click")
		expect(wrapper.get('[data-test="ticket-line-menu-dish"]').text()).toContain(
			"Cola",
		)
	})

	it("keep a label with its first dish in the full-screen columns", () => {
		const wrapper = show(meal(), { fullscreen: true })

		const header = sections(wrapper)[0]
		expect(header.classes()).toEqual(
			expect.arrayContaining(["break-inside-avoid", "break-after-avoid"]),
		)
		expect(
			wrapperOf(rowOf(wrapper, "Cola")).classList.contains(
				"break-inside-avoid",
			),
		).toBe(true)
	})
})

describe("a ticket none of whose dishes carries a family", () => {
	const lines = (family) => [
		{ ...dish("Soup", family), kds_batch: 1 },
		{ ...dish("Steak", family), kds_batch: 1 },
		{ ...dish("Cola", family), kds_batch: 1, kds_status: "Delivered" },
		{ ...dish("Tart", family), kds_batch: 2 },
	]
	const bare = (items) =>
		items.map((item) => {
			// The shape an older server answered in: neither key at all
			const { service_family: _family, service_color: _color, ...older } = item
			return older
		})

	it("has no label at all", () => {
		const wrapper = show(lines(""))

		expect(sections(wrapper)).toHaveLength(0)
		expect(dishNames(wrapper)).toEqual(["Soup", "Steak", "Cola", "Tart"])
	})

	it("is drawn exactly as the ticket of a server that does not send a family: the same HTML", () => {
		const withFields = show(lines("")).html()
		const without = show(bare(lines(""))).html()

		expect(withFields).toBe(without)
	})

	it("keeps the faint rule between its dishes, and the finished dish at the end of its send", () => {
		const wrapper = show(lines(""))

		const wrappers = rows(wrapper).map(wrapperOf)
		expect(wrappers.map((el) => el.classList.contains("border-t"))).toEqual([
			false,
			true,
			true,
			false,
		])
		expect(rowOf(wrapper, "Cola").classes()).toContain("line-through")
	})

	it("has no tint on any row", () => {
		const wrapper = show(lines(""))

		for (const row of rows(wrapper)) {
			expect(row.attributes("style")).toBeUndefined()
			expect(row.classes().join(" ")).not.toContain("service-tint")
		}
	})
})

describe("the tint of a category", () => {
	it("is a pale shade of its colour behind the dish's row: a variable on the row and the class that reads it", () => {
		const wrapper = show([painted("Soup", "Starter"), painted("Steak", "Main")])

		const row = rowOf(wrapper, "Soup")
		expect(row.element.style.getPropertyValue("--service-tint")).toBe(
			"rgba(216, 240, 208, 0.16)",
		)
		expect(row.classes()).toContain("bg-[color:var(--service-tint)]")
		expect(
			rowOf(wrapper, "Steak").element.style.getPropertyValue("--service-tint"),
		).toBe("rgba(255, 233, 199, 0.16)")
	})

	it("is on the row of every dish of the category, and each category has its own", () => {
		const wrapper = show([
			painted("Soup", "Starter"),
			painted("Salad", "Starter"),
			painted("Tart", "Dessert"),
		])

		const tints = rows(wrapper).map((row) =>
			row.element.style.getPropertyValue("--service-tint"),
		)
		expect(tints[0]).toBe(tints[1])
		expect(tints[2]).not.toBe(tints[0])
	})

	it("is not there for a dish whose category has no colour: no style, no class", () => {
		const wrapper = show([painted("Soup", "Starter"), dish("Steak", "Main")])

		const row = rowOf(wrapper, "Steak")
		expect(row.attributes("style")).toBeUndefined()
		expect(row.classes().join(" ")).not.toContain("service-tint")
	})

	it("is never made of a value that is not a strict #RRGGBB: nothing is put in the style", () => {
		const bad = [
			"red",
			"#FFF",
			"#12345",
			"#CFE8FF;background:url(x)",
			"#CFE8FF\n",
			"rgb(1, 2, 3)",
			'#CFE8FF"><script>',
			null,
			42,
		]
		for (const color of bad) {
			const wrapper = show([dish("Soup", "Starter", { service_color: color })])
			const row = rowOf(wrapper, "Soup")

			expect(row.attributes("style"), JSON.stringify(color)).toBeUndefined()
			expect(row.classes().join(" ")).not.toContain("service-tint")
		}
	})

	it("is on the row of a finished dish too, which fades with its row", () => {
		const row = rowOf(
			show([
				painted("Soup", "Starter", { kds_status: "Delivered" }),
				painted("Salad", "Starter"),
			]),
			"Soup",
		)

		expect(row.element.style.getPropertyValue("--service-tint")).not.toBe("")
		expect(row.classes()).toContain("opacity-40")
	})

	it("keeps the pressed state of the row: the class that tints sits with the pressed-state classes, which are written after it", () => {
		const row = rowOf(show([painted("Soup", "Starter")]), "Soup")

		expect(row.classes()).toEqual(
			expect.arrayContaining(["active:bg-gray-100", "dark:active:bg-gray-700"]),
		)
	})

	it("never replaces the highlight of the dish whose status menu is open: the heavy ink ring and the white stay, the tint steps aside, and comes back when the menu closes", async () => {
		const wrapper = show([painted("Soup", "Starter"), painted("Steak", "Main")])
		const soup = () => rowOf(wrapper, "Soup")

		await soup().trigger("click")

		expect(soup().attributes("data-selected")).toBe("true")
		expect(soup().classes()).toEqual(
			expect.arrayContaining([
				"bg-white",
				"ring-[3px]",
				"ring-inset",
				"ring-[#141414]",
				"dark:ring-white",
			]),
		)
		expect(soup().classes()).not.toContain("bg-[color:var(--service-tint)]")
		expect(soup().element.style.getPropertyValue("--service-tint")).toBe("")
		// The other dish keeps its tint
		expect(rowOf(wrapper, "Steak").classes()).toContain(
			"bg-[color:var(--service-tint)]",
		)

		document.body.click()
		await nextTick()

		expect(soup().attributes("data-selected")).toBeUndefined()
		expect(soup().classes()).toContain("bg-[color:var(--service-tint)]")
		expect(soup().element.style.getPropertyValue("--service-tint")).toBe(
			"rgba(216, 240, 208, 0.16)",
		)
	})
})
