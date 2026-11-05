/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen's ticket and the pass's card name the GROUP of the table they are for (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): one card per group, titled « Table 5.2 »
 * //// with the name given to the group beside it (« · Dupont ») once the table has several groups, and « Table 5 » as ever while it has one (a group paid and gone no longer counts). The name wears the grey of the covers
 * //// line beside it, with the dark rule they wear.
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
	Button: { template: "<button @click=\"$emit('click')\"><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue")
const { default: RunnerOrderCard } = await import("../RunnerOrderCard.vue")

const dish = (name) => ({
	name: `ROW-${name}`,
	item_code: `ITEM-${name}`,
	item_name: name,
	qty: 1,
	kds_status: "Pending",
	kds_batch: 1,
	preparation_station: "kit",
	station_name: "Kitchen",
	station_color: "#D68A59",
	service_family: "Main",
	service_color: "",
})

let opened = []
function kitchen(order = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: {
			order: {
				name: "SINV-NOTES",
				restaurant_table: "T5",
				table_display_name: "Table 5",
				ticket_no: 7,
				ticket_digits: 4,
				kds_status: "Preparing",
				creation: "2026-10-30 12:00:00",
				modified: "2026-10-30 12:05:00",
				items: [dish("Steak")],
				...order,
			},
			stations: [{ name: "kit", station_name: "Kitchen", color: "#D68A59" }],
			courseOrder: false,
		},
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
function pass(card = {}) {
	const wrapper = mount(RunnerOrderCard, {
		props: {
			card: {
				key: "SINV-NOTES",
				title: "Table 5",
				subtitle: "#SINV-NOTES",
				invoiceName: "SINV-NOTES",
				creation: "2026-10-30 12:00:00",
				modified: "2026-10-30 12:00:00",
				roomName: "Salle 1",
				ticketNo: "0014",
				items: [dish("Steak")],
				stationGroups: [],
				...card,
			},
			viewMode: "table",
			showStation: false,
		},
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const title = (wrapper) => wrapper.get('[data-test="ticket-title"]').text()
const noteName = (wrapper) => wrapper.find('[data-test="ticket-note-name"]')

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(new Date(2026, 9, 30, 12, 30, 0))
	opened = []
	call.mockClear()
	window.innerWidth = 1280
	window.innerHeight = 800
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("the kitchen's ticket of a table with several groups", () => {
	it("is titled « Table 5.2 » with the group's name beside it", () => {
		const wrapper = kitchen({ note: 2, note_name: "Dupont", notes_count: 2 })

		expect(title(wrapper)).toBe("Table 5.2")
		expect(noteName(wrapper).text()).toBe("· Dupont")
		const reference = wrapper.get('[data-test="ticket-ref"]')
		const names = [...reference.element.children].map((child) => child.dataset.test)
		expect(names.indexOf("ticket-title")).toBeLessThan(names.indexOf("ticket-note-name"))
	})

	it("is titled « Table 5.1 » for the first group, whatever the other says", () => {
		expect(title(kitchen({ note: 1, note_name: null, notes_count: 3 }))).toBe("Table 5.1")
	})

	it("has no name beside the title for a group with none", () => {
		const wrapper = kitchen({ note: 2, note_name: null, notes_count: 2 })

		expect(title(wrapper)).toBe("Table 5.2")
		expect(noteName(wrapper).exists()).toBe(false)
	})

	it("wears the grey of the covers line, with its dark rule", () => {
		const wrapper = kitchen({ note: 2, note_name: "Dupont", notes_count: 2, covers: 3 })

		expect(noteName(wrapper).classes()).toEqual(
			expect.arrayContaining(["text-gray-600", "dark:[&&]:!text-gray-300", "whitespace-nowrap"]),
		)
		expect(wrapper.get('[data-test="ticket-covers"]').classes()).toEqual(
			expect.arrayContaining(["text-gray-600", "dark:[&&]:!text-gray-300"]),
		)
		expect(wrapper.get('[data-test="ticket-title"]').classes()).toContain("dark:text-white")
	})

	it("keeps the people seated beside the group", () => {
		const wrapper = kitchen({ note: 2, note_name: "Dupont", notes_count: 2, covers: 3 })

		expect(wrapper.get('[data-test="ticket-covers"]').text()).toContain("3 guests")
	})
})

describe("the kitchen's ticket of a table with one group", () => {
	it("is titled « Table 5 » as ever", () => {
		const wrapper = kitchen({ note: 1, note_name: "Dupont", notes_count: 1 })

		expect(title(wrapper)).toBe("Table 5")
		expect(noteName(wrapper).exists()).toBe(false)
	})

	it("is titled as ever for an order that says nothing of groups", () => {
		const wrapper = kitchen()

		expect(title(wrapper)).toBe("Table 5")
		expect(noteName(wrapper).exists()).toBe(false)
	})

	it("is titled as ever by the table's code when it has no label", () => {
		expect(title(kitchen({ table_display_name: null }))).toBe("T5")
	})
})

describe("a takeaway's ticket", () => {
	it("says « Takeaway » whatever group fields it carries", () => {
		const wrapper = kitchen({ is_takeaway: 1, takeaway_number: "T-12", note: 2, note_name: "Dupont", notes_count: 2 })

		expect(title(wrapper)).toBe("Takeaway")
		expect(noteName(wrapper).exists()).toBe(false)
	})
})

describe("the pass's card", () => {
	it("is titled « Table 5.2 » with the group's name beside it, as the page gives it", () => {
		const wrapper = pass({ title: "Table 5.2", noteName: "Dupont" })

		expect(title(wrapper)).toBe("Table 5.2")
		expect(noteName(wrapper).text()).toBe("· Dupont")
		expect(noteName(wrapper).classes()).toEqual(expect.arrayContaining(["text-gray-600", "dark:[&&]:!text-gray-300"]))
	})

	it("has no name beside the title for a group with none, or a table with one group", () => {
		expect(noteName(pass({ title: "Table 5", noteName: "" })).exists()).toBe(false)
		expect(noteName(pass({ title: "Table 5" })).exists()).toBe(false)
	})

	it("says « Takeaway » for a takeaway", () => {
		const wrapper = pass({ takeaway: true, noteName: "Dupont" })

		expect(title(wrapper)).toBe("Takeaway")
		expect(noteName(wrapper).exists()).toBe(false)
	})
})
