/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen ticket says how many people are seated at its table and how many portions of each course the order holds against them (NeoResto lot 1, covers): « Table 4 ·
 * //// 3 guests » (« 3 pers. » in French) in the header's reference line, and the count after the label of each food course (« Mains 2/3 »), counted by the SERVER over all the lines of the order. Both only when the order has
 * //// covers; a drink has no count; the ticket number and the timer stay on the card.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

let opened = []
let counter = 0
const dish = (name, family, extra = {}) => {
	counter += 1
	return {
		item_code: `ITEM-${counter}-${name}`,
		item_name: name,
		qty: 1,
		kds_status: "Pending",
		kds_batch: 1,
		preparation_station: "kit",
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

function show(items, order = {}, props = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: {
			order: {
				name: "SINV-COVERS",
				restaurant_table: "T4",
				table_display_name: "Table 4",
				ticket_no: 7,
				ticket_digits: 4,
				kds_status: "Preparing",
				creation: "2026-10-30 12:00:00",
				modified: "2026-10-30 12:05:00",
				items,
				...order,
			},
			stations: [{ name: "kit", station_name: "Kitchen", color: "#D68A59" }],
			courseOrder: false,
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

describe("the people seated at the table, on the kitchen ticket", () => {
	it("are written beside the table's name, with a people icon", () => {
		const wrapper = show(MEAL(), { covers: 3 })

		expect(covers(wrapper).exists()).toBe(true)
		expect(textOf(covers(wrapper))).toBe("3 guests")
		expect(covers(wrapper).find("svg").exists()).toBe(true)
		const reference = wrapper.get('[data-test="ticket-ref"]')
		expect(reference.element.contains(covers(wrapper).element)).toBe(true)
		const names = [...reference.element.children].map(
			(child) => child.dataset.test,
		)
		expect(names.indexOf("ticket-title")).toBeLessThan(
			names.indexOf("ticket-covers"),
		)
	})

	it("say « 1 guest » for one", () => {
		expect(textOf(covers(show(MEAL(), { covers: 1 })))).toBe("1 guest")
	})

	it("are not written while the order has no number, whatever its value", () => {
		for (const value of [null, undefined, 0, "", 100]) {
			const wrapper = show(MEAL(), { covers: value })
			expect(covers(wrapper).exists(), String(value)).toBe(false)
		}
	})

	it("are not written on a takeaway: it has no table", () => {
		const wrapper = show(MEAL(), {
			covers: 3,
			is_takeaway: 1,
			takeaway_number: "T-12",
		})

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
		expect(wrapper.get('[data-test="ticket-number"]').text()).toBe("0007")
		// the line they share wraps instead of pushing them out, and the covers never break in two
		expect(wrapper.get('[data-test="ticket-ref"]').classes()).toEqual(
			expect.arrayContaining(["flex-wrap", "min-w-0"]),
		)
		expect(covers(wrapper).classes()).toContain("whitespace-nowrap")
	})

	it("show a ticket with no number exactly as it was", () => {
		const wrapper = show(MEAL(), {})

		expect(wrapper.get('[data-test="ticket-title"]').text()).toBe("Table 4")
		expect(
			[...wrapper.get('[data-test="ticket-ref"]').element.children].map(
				(child) => child.dataset.test,
			),
		).toEqual(["ticket-title", "ticket-number"])
	})
})

describe("the count of each course on the kitchen ticket", () => {
	it("is written after the label of a food course, against the people seated, as the server counted it", () => {
		const wrapper = show(MEAL(), { covers: 3, family_counts: COUNTS })

		expect(textOf(sectionNamed(wrapper, "Starter"))).toContain("Starters 3/3")
		expect(textOf(sectionNamed(wrapper, "Main"))).toContain("Mains 2/3")
		expect(textOf(sectionNamed(wrapper, "Dessert"))).toContain(
			"Desserts 4/3 +1",
		)
	})

	it("says the state of the course by its colour AND a mark: amber short, green with a check done, a plus over", () => {
		const wrapper = show(MEAL(), { covers: 3, family_counts: COUNTS })

		expect(tallyOf(wrapper, "Main").attributes("data-state")).toBe("short")
		expect(tallyOf(wrapper, "Main").classes().join(" ")).toContain("#92610C")
		expect(tallyOf(wrapper, "Starter").attributes("data-state")).toBe("done")
		expect(tallyOf(wrapper, "Starter").classes().join(" ")).toContain("#11663A")
		expect(
			tallyOf(wrapper, "Starter")
				.find('[data-test="ticket-section-tally-check"]')
				.exists(),
		).toBe(true)
		expect(tallyOf(wrapper, "Dessert").attributes("data-state")).toBe("over")
		expect(tallyOf(wrapper, "Dessert").classes().join(" ")).toContain("#9C2920")
		expect(textOf(tallyOf(wrapper, "Dessert"))).toBe("4/3 +1")
	})

	it("is never written for a drink", () => {
		const wrapper = show(MEAL(), { covers: 3, family_counts: COUNTS })

		expect(sectionNamed(wrapper, "Drink").exists()).toBe(true)
		expect(
			sectionNamed(wrapper, "Drink")
				.find('[data-test="ticket-section-tally"]')
				.exists(),
		).toBe(false)
	})

	it("is not written while the order has no covers, even if the server counted the courses", () => {
		const wrapper = show(MEAL(), { covers: null, family_counts: COUNTS })

		expect(wrapper.findAll('[data-test="ticket-section-tally"]')).toHaveLength(
			0,
		)
		expect(
			sections(wrapper).map((section) => section.get("span").text()),
		).toEqual(["Drinks", "Starters", "Mains", "Desserts"])
	})

	it("is not written for a course the server did not count, rather than a wrong 0", () => {
		const wrapper = show(MEAL(), { covers: 3, family_counts: { Main: 2 } })

		expect(wrapper.findAll('[data-test="ticket-section-tally"]')).toHaveLength(
			1,
		)
		expect(tallyOf(wrapper, "Main").exists()).toBe(true)
		expect(tallyOf(wrapper, "Starter").exists()).toBe(false)
	})

	it("is not written when the server sends no counts at all (an older server)", () => {
		const wrapper = show(MEAL(), { covers: 3 })

		expect(wrapper.findAll('[data-test="ticket-section-tally"]')).toHaveLength(
			0,
		)
		expect(covers(wrapper).exists()).toBe(true)
	})

	it("counts the whole order, not only the dishes this ticket shows: a station's ticket shows one main of the two ordered", () => {
		const wrapper = show([dish("Steak", "Main")], {
			covers: 3,
			family_counts: { Main: 2 },
		})

		expect(textOf(sectionNamed(wrapper, "Main"))).toContain("Mains 2/3")
	})

	it("keeps the label first: the section's name is still the first word of its header", () => {
		const wrapper = show(MEAL(), { covers: 3, family_counts: COUNTS })

		expect(
			sections(wrapper).map((section) => section.get("span").text()),
		).toEqual(["Drinks", "Starters", "Mains", "Desserts"])
	})

	it("is written in the panel opened full screen as on the card", () => {
		const wrapper = show(
			MEAL(),
			{ covers: 3, family_counts: COUNTS },
			{ fullscreen: true },
		)

		expect(textOf(covers(wrapper))).toBe("3 guests")
		expect(textOf(sectionNamed(wrapper, "Main"))).toContain("Mains 2/3")
	})
})
