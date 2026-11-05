/**
 * //// Neoffice — added file (no upstream equivalent). The ticket of a table that has just ordered its next course (NeoResto lot 1, Daniel, 01.11): the kitchen screen highlights it for a few seconds and scrolls it into
 * //// view, so the card carries the name of its order (`data-order`, what the screen finds it by) and a signal ring while it is the one in question. The ring goes with the highlight and changes nothing else of the card.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text)
})
vi.mock("frappe-ui", () => ({
	createResource: vi.fn(),
	Button: { template: "<button><slot /></button>" },
}))
vi.mock("@/utils/offline/translationCache", () => ({ translationCache: {} }))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => ({ status: "success" })) }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ runnerEnabled: true }),
}))

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue")

const order = {
	name: "SINV-NEXT-1",
	restaurant_table: "T1",
	table_display_name: "T1",
	kds_status: "Preparing",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:05:00",
	items: [{ item_code: "ITEM-1", item_name: "Dish 1", qty: 1, kds_status: "Pending", kds_batch: 1, preparation_station: "kit" }],
}
let opened = []
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	opened = []
})
function show(props = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: { order, showStationBadge: false, ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const card = (wrapper) => wrapper.get('[data-test="ticket"]')

describe("the ticket of a table that ordered its next course", () => {
	it("carries the name of its order, which is how the screen finds it to scroll to it", () => {
		expect(card(show()).attributes("data-order")).toBe("SINV-NEXT-1")
	})

	it("wears the signal's ring while it is highlighted, and not otherwise", async () => {
		const wrapper = show()
		expect(card(wrapper).attributes("data-highlighted")).toBeUndefined()
		expect(card(wrapper).classes().join(" ")).not.toContain("ring-[#F55D1A]")

		await wrapper.setProps({ highlighted: true })

		expect(card(wrapper).attributes("data-highlighted")).toBe("true")
		expect(card(wrapper).classes().join(" ")).toContain("ring-[#F55D1A]")

		await wrapper.setProps({ highlighted: false })
		expect(card(wrapper).attributes("data-highlighted")).toBeUndefined()
	})

	it("BLINKS while it is highlighted: the ring is not a still frame, the cook sees it from across the pass (Daniel, 01.11)", async () => {
		const wrapper = show()
		expect(card(wrapper).classes()).not.toContain("kds-ticket-flash")

		await wrapper.setProps({ highlighted: true })
		expect(card(wrapper).classes()).toContain("kds-ticket-flash")

		await wrapper.setProps({ highlighted: false })
		expect(card(wrapper).classes()).not.toContain("kds-ticket-flash")
	})

	// Daniel, 01.11: « quand il clignote on a les 2 choix directement » — to do (seen, it stays in the band without blinking) or start cooking (it goes to preparation)
	describe("the two choices it carries while it blinks", () => {
		const todo = (wrapper) => wrapper.find('[data-test="ticket-todo"]')

		it("offers « To do » beside « Start cooking » while it blinks, and nothing more otherwise", async () => {
			const wrapper = show()
			expect(todo(wrapper).exists()).toBe(false)

			await wrapper.setProps({ highlighted: true })

			expect(todo(wrapper).exists()).toBe(true)
			expect(todo(wrapper).text()).toBe("To do")
			expect(wrapper.findAll('[data-test="ticket-main"]')).toHaveLength(1)
			expect(wrapper.get('[data-test="ticket-main"]').text()).toBe("Start cooking")
		})

		it("says which ticket was seen when « To do » is pressed", async () => {
			const wrapper = show({ highlighted: true })

			await todo(wrapper).trigger("click")

			expect(wrapper.emitted("acknowledge")).toEqual([["SINV-NEXT-1"]])
		})

		it("is offered on a blinking ticket whatever its main button says: a ticket being cooked that blinks can be left to do too (Daniel, 01.11: nothing else stopped it)", () => {
			const cooking = { ...order, items: [{ ...order.items[0], kds_status: "Preparing" }, { ...order.items[0], item_code: "ITEM-2", kds_status: "Pending", kds_batch: 2 }] }
			const wrapper = show({ order: cooking, highlighted: true })

			expect(todo(wrapper).exists()).toBe(true)
			expect(wrapper.get('[data-test="ticket-main"]').text()).not.toBe("Start cooking")
		})

		it("is not offered in the panel opened full screen", () => {
			expect(todo(show({ fullscreen: true, highlighted: true })).exists()).toBe(false)
		})
	})

	it("keeps its look otherwise: the ring is added, nothing is taken away", async () => {
		const wrapper = show()
		const plain = card(wrapper).classes().filter((name) => !name.startsWith("ring"))
		await wrapper.setProps({ highlighted: true })

		for (const name of plain) expect(card(wrapper).classes()).toContain(name)
	})

	it("is not highlighted in the panel opened full screen, which is the same ticket drawn bigger", () => {
		const wrapper = show({ fullscreen: true, highlighted: true })

		expect(wrapper.get('[data-test="ticket-panel"]').attributes("data-highlighted")).toBeUndefined()
	})
})

describe("the ticket that flashes for an addition (Daniel, 05.11: « en cuisine, ils ne savent pas qu'on a rajouté cette information sur leur ticket »)", () => {
	const added = [
		{ name: "Tartare de saumon", qty: 1 },
		{ name: "Soupe du jour", qty: 2 },
	]
	const strip = (wrapper) => wrapper.find('[data-test="ticket-added"]')

	it("tells what was added, in one line under the header, while it flashes", () => {
		const wrapper = show({ highlighted: true, addedLines: added })

		expect(strip(wrapper).exists()).toBe(true)
		// A white disc with a « + » stands before the words
		expect(strip(wrapper).text()).toBe("+Added: 1× Tartare de saumon, 2× Soupe du jour")
		expect(strip(wrapper).findAll("span").at(-1).text()).toBe("Added: 1× Tartare de saumon, 2× Soupe du jour")
		// Between the header and the buttons, outside the dishes that scroll
		const html = wrapper.html()
		expect(html.indexOf('data-test="ticket-header"')).toBeLessThan(html.indexOf('data-test="ticket-added"'))
		expect(html.indexOf('data-test="ticket-added"')).toBeLessThan(html.indexOf('data-test="ticket-actions"'))
		expect(strip(wrapper).attributes("role")).toBe("status")
	})

	it("says nothing when the ticket does not flash, when nothing was added, or in the full-screen view", () => {
		expect(strip(show({ highlighted: false, addedLines: added })).exists()).toBe(false)
		expect(strip(show({ highlighted: true, addedLines: [] })).exists()).toBe(false)
		expect(strip(show({ highlighted: true })).exists()).toBe(false)
		expect(strip(show({ fullscreen: true, highlighted: true, addedLines: added })).exists()).toBe(false)
	})

	it("is SOLID RED with white text, like the banner that takes a « Ready » back: an addition is a change to a ticket the cook may be preparing already (Daniel, 05.11: « on a dit qu'on mettait en rouge »)", () => {
		const classes = strip(show({ highlighted: true, addedLines: added })).classes()

		expect(classes).toContain("bg-[#C1372C]")
		expect(classes).toContain("text-white")
		expect(classes).toContain("font-extrabold")
		expect(classes).not.toContain("bg-[#FFEAE2]")
	})

	it("blinks its ring in red too, where a next course blinks in the signal's orange", () => {
		const addition = show({ highlighted: true, addedLines: added })
		const nextCourse = show({ highlighted: true })

		expect(card(addition).classes().join(" ")).toContain("ring-[#C1372C]")
		expect(card(addition).classes().join(" ")).toContain("kds-ticket-flash-added")
		expect(card(addition).classes().join(" ")).not.toContain("ring-[#F55D1A]")
		expect(card(nextCourse).classes().join(" ")).toContain("ring-[#F55D1A]")
		expect(card(nextCourse).classes().join(" ")).not.toContain("kds-ticket-flash-added")
	})

	it("offers « Seen » to take it up, where a next course offers « To do »", () => {
		const addition = show({ highlighted: true, addedLines: added })
		const nextCourse = show({ highlighted: true })

		expect(addition.get('[data-test="ticket-todo"]').text()).toBe("Seen")
		expect(nextCourse.get('[data-test="ticket-todo"]').text()).not.toBe("Seen")
	})

	it("wraps its buttons, the main one on a line of its own, so that « Start » is not cut in a narrow column", () => {
		const flashing = show({ highlighted: true, addedLines: added })
		const still = show()

		expect(flashing.get('[data-test="ticket-actions"]').classes()).toContain("flex-wrap")
		expect(flashing.get('[data-test="ticket-main"]').classes()).toContain("basis-full")
		expect(still.get('[data-test="ticket-actions"]').classes()).not.toContain("flex-wrap")
		expect(still.get('[data-test="ticket-main"]').classes()).not.toContain("basis-full")
	})
})
