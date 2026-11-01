/**
 * //// Neoffice — added file (no upstream equivalent). The ticket of a table that has just ordered its next course (NeoRestau lot 1, Daniel, 01.11): the kitchen screen highlights it for a few seconds and scrolls it into
 * //// view, so the card carries the name of its order (`data-order`, what the screen finds it by) and a signal ring while it is the one in question. The ring goes with the highlight and changes nothing else of the card.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text) => text
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

		it("is not offered on a ticket that is not to start: a ticket being cooked has no « To do » to choose", () => {
			const cooking = { ...order, items: [{ ...order.items[0], kds_status: "Preparing" }] }

			expect(todo(show({ order: cooking, highlighted: true })).exists()).toBe(false)
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
