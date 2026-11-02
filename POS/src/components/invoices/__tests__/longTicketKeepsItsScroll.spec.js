/**
 * //// Neoffice — added file (no upstream equivalent). A ticket that is long but NOT wide keeps its scroll (NeoResto lot 1, task 38a-3, ruling 107 layer 3): the body of the card scrolls inside it, with the
 * //// fade and the « +N lines » strip at its foot, and the strip is the way into the full-screen ticket. The cook can also be at the END of the scroll, with nothing left to count: the card still scrolls,
 * //// so it still has a small « View all » on its strip, and the full-screen ticket is still one tap away. A card whose dishes all fit has no strip at all. jsdom has no layout engine: the boxes of the
 * //// elements are given by hand.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

vi.mock("frappe-ui", () => ({
	Button: {
		emits: ["click"],
		template: "<button @click=\"$emit('click')\"><slot /></button>",
	},
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ runnerEnabled: false }),
}))

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue")
const { default: RunnerOrderCard } = await import("../RunnerOrderCard.vue")
const { WIDE_TICKET_LINES } = await import("@/utils/wideTicket")

const kitchenOrder = (count) => ({
	name: "SINV-LONG",
	restaurant_table: "T1",
	table_display_name: "Table 1",
	kds_status: "Preparing",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:05:00",
	items: Array.from({ length: count }, (_, index) => ({
		item_code: `ITEM-${index}`,
		item_name: `Dish ${index + 1}`,
		qty: 1,
		kds_status: "Preparing",
		kds_batch: 1,
		preparation_station: "kit",
	})),
})
const runnerCard = (count) => ({
	key: "SINV-0042",
	title: "Table 22",
	invoiceName: "SINV-0042",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	items: Array.from({ length: count }, (_, index) => ({
		name: `row-${index}`,
		item_code: `ITEM-${index}`,
		item_name: `Dish ${index + 1}`,
		qty: 1,
		kds_status: "Ready",
		preparation_station: "kit",
		station_name: "Cuisine",
		station_color: "#F55D1A",
	})),
	stationGroups: [],
})

const rect = (left, top, width, height) => ({
	left,
	top,
	width,
	height,
	right: left + width,
	bottom: top + height,
	x: left,
	y: top,
	toJSON() {},
})
/** The body shows `viewport` px of its dishes of 48 px, scrolled by `state.scrolled` px. */
function layout(viewport) {
	const state = { scrolled: 0 }
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		function box() {
			if (this.matches?.('[data-test="ticket-body"]'))
				return rect(0, 0, 300, viewport)
			if (this.matches?.("[data-ticket-line]")) {
				const body = this.closest('[data-test="ticket-body"]')
				const all = [...body.querySelectorAll("[data-ticket-line]")]
				return rect(0, all.indexOf(this) * 48 - state.scrolled, 300, 48)
			}
			return rect(0, 0, 0, 0)
		},
	)
	return state
}

let opened = []
function show(component, props) {
	const wrapper = mount(component, {
		props,
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const kitchen = (count) =>
	show(KDSOrderCard, { order: kitchenOrder(count), stations: [] })
const runner = (count) =>
	show(RunnerOrderCard, { card: runnerCard(count), viewMode: "table" })
const panel = () => document.body.querySelector('[data-test="ticket-panel"]')

beforeEach(() => {
	opened = []
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
	document.body.innerHTML = ""
})

describe("a ticket that is long but not wide", () => {
	it("keeps its scroll inside the card: the body scrolls, the head and the main button stay where they are", async () => {
		layout(200)
		// 12 dishes: not wide, and 8 of them out of sight in a card 200 px high
		const wrapper = kitchen(WIDE_TICKET_LINES)
		await nextTick()

		const body = wrapper.get('[data-test="ticket-body"]')
		expect(body.classes()).toContain("overflow-y-auto")
		expect(wrapper.get('[data-test="ticket-header"]').classes()).toContain(
			"flex-shrink-0",
		)
		expect(wrapper.get('[data-test="ticket-actions"]').classes()).toContain(
			"flex-shrink-0",
		)
		expect(
			body.element.contains(
				wrapper.get('[data-test="ticket-actions"]').element,
			),
		).toBe(false)
	})

	it("says how many dishes are out of sight in a strip under the dishes, with a fade over their foot", async () => {
		layout(200)
		const wrapper = kitchen(WIDE_TICKET_LINES)
		await nextTick()

		// 200 px = 4 dishes of 48 px and 8 px of the fifth: 12 - 4 = 8 are not whole in view
		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+8 lines")
		expect(wrapper.find('[data-test="ticket-more-fade"]').exists()).toBe(true)
		expect(wrapper.get('[data-test="ticket-more-strip"]').element.tagName).toBe(
			"BUTTON",
		)
	})

	it("opens the full-screen ticket from that strip", async () => {
		layout(200)
		const wrapper = kitchen(WIDE_TICKET_LINES)
		await nextTick()

		await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()

		expect(panel()).not.toBeNull()
		expect(panel().querySelectorAll('[data-test="ticket-line"]')).toHaveLength(
			WIDE_TICKET_LINES,
		)
	})

	it("has the same on the runner's card", async () => {
		layout(200)
		const wrapper = runner(WIDE_TICKET_LINES)
		await nextTick()

		expect(wrapper.get('[data-test="ticket-body"]').classes()).toContain(
			"overflow-y-auto",
		)
		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+8 lines")
		await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()
		expect(panel()).not.toBeNull()
	})
})

describe("a wide ticket that is still too long", () => {
	it("scrolls too, and has its strip: the wide card is no way round the end of the card", async () => {
		layout(300)
		const wrapper = kitchen(24)
		await nextTick()

		expect(wrapper.get('[data-test="ticket-body"]').classes()).toContain(
			"overflow-y-auto",
		)
		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+18 lines")
	})
})

describe("« View » on a card that scrolls", () => {
	it("is on the strip, beside the count, while dishes are out of sight", async () => {
		layout(200)
		const wrapper = kitchen(20)
		await nextTick()

		const strip = wrapper.get('[data-test="ticket-more-strip"]')
		expect(strip.get('[data-test="ticket-view-all"]').text()).toBe("View")
		expect(strip.find('[data-test="ticket-more"]').exists()).toBe(true)
	})

	it("is still there when the cook has scrolled to the END and nothing is left to count: the card scrolls, the ticket opens from it", async () => {
		const state = layout(200)
		const wrapper = kitchen(20)
		await nextTick()

		// The last dish is in view: 20 dishes of 48 px, 200 px seen
		state.scrolled = 20 * 48 - 200
		await wrapper.get('[data-test="ticket-body"]').trigger("scroll")

		expect(wrapper.find('[data-test="ticket-more"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="ticket-more-fade"]').exists()).toBe(false)
		const strip = wrapper.get('[data-test="ticket-more-strip"]')
		expect(strip.get('[data-test="ticket-view-all"]').text()).toBe("View")

		await strip.trigger("click")
		await nextTick()
		expect(panel()).not.toBeNull()
	})

	it("opens the ticket from a tap on the words, as from the count", async () => {
		layout(200)
		const wrapper = kitchen(20)
		await nextTick()

		await wrapper.get('[data-test="ticket-view-all"]').trigger("click")
		await nextTick()

		expect(panel()).not.toBeNull()
	})

	it("is on the runner's card too, at the end of its scroll as well", async () => {
		const state = layout(200)
		const wrapper = runner(20)
		await nextTick()
		expect(wrapper.get('[data-test="ticket-view-all"]').text()).toBe("View")

		state.scrolled = 20 * 48 - 200
		await wrapper.get('[data-test="ticket-body"]').trigger("scroll")

		expect(wrapper.find('[data-test="ticket-more"]').exists()).toBe(false)
		expect(wrapper.get('[data-test="ticket-view-all"]').text()).toBe("View")
		await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()
		expect(panel()).not.toBeNull()
	})

	it("on a card whose dishes all fit: the strip says « View » with no count, and there is no fade (kitchen test, 01.11)", async () => {
		layout(400)
		const kitchenCard = kitchen(5)
		const runnerCardWrapper = runner(5)
		await nextTick()

		for (const wrapper of [kitchenCard, runnerCardWrapper]) {
			expect(wrapper.find('[data-test="ticket-more-strip"]').exists()).toBe(true)
			expect(wrapper.find('[data-test="ticket-view-all"]').exists()).toBe(true)
			expect(wrapper.find('[data-test="ticket-more"]').exists()).toBe(false)
			expect(wrapper.find('[data-test="ticket-more-fade"]').exists()).toBe(
				false,
			)
		}
	})

	it("the count comes with the scroll: a card that gains dishes in a refresh gets « +N lines », one that loses them loses it; the strip stays (kitchen test, 01.11)", async () => {
		layout(200)
		const wrapper = kitchen(3)
		await nextTick()
		expect(wrapper.find('[data-test="ticket-more-strip"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="ticket-more"]').exists()).toBe(false)

		await wrapper.setProps({ order: kitchenOrder(9) })
		await nextTick()
		expect(wrapper.find('[data-test="ticket-view-all"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="ticket-more"]').exists()).toBe(true)

		await wrapper.setProps({ order: kitchenOrder(2) })
		await nextTick()
		expect(wrapper.find('[data-test="ticket-more-strip"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="ticket-more"]').exists()).toBe(false)
	})

	it("is not on the panel's own body: nothing is cut there, so nothing to view", async () => {
		layout(200)
		const wrapper = kitchen(20)
		await nextTick()
		await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()

		expect(panel().querySelector('[data-test="ticket-view-all"]')).toBeNull()
		expect(panel().querySelector('[data-test="ticket-more-strip"]')).toBeNull()
	})
})
