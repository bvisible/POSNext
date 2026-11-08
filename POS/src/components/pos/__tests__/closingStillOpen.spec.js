/**
 * //// Neoffice — added file (no upstream equivalent). The « Still open » block of the shift closing and the notice of the sign-out dialogs (NeoResto lot 1,
 * //// the product owner, 08.11.2026): the orders still open on tables, which the closing does not count, and the tickets held on the device, which signing
 * //// out erases. They inform and block nothing; a restaurant-less till asks the server for nothing.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const world = vi.hoisted(() => ({
	enabled: true,
	profile: "Caisse",
	orders: [],
	drafts: [],
	calls: [],
	failNext: false,
}))

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		world.calls.push({ method, args })
		if (world.failNext) {
			world.failNext = false
			throw new Error("down")
		}
		return { orders: world.orders }
	}),
}))
vi.mock("@/utils/draftManager", () => ({ getAllDrafts: vi.fn(async () => world.drafts) }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({
		get profileName() {
			return world.profile
		},
	}),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({
		get isEnabled() {
			return world.enabled
		},
		ofTheRestaurant: () => ({ restaurant: "Brasserie" }),
	}),
}))
vi.mock("@/composables/useFormatters", () => ({
	useFormatters: () => ({ formatCurrency: (value) => `CHF ${Number(value).toFixed(2)}` }),
}))

import ClosingStillOpen from "../ClosingStillOpen.vue"
import HeldTicketsNotice from "../HeldTicketsNotice.vue"

const order = (extra = {}) => ({
	name: "SINV-1",
	label: "T1",
	idle_minutes: 50,
	grand_total: 42,
	holds_money: false,
	consumed: false,
	served: false,
	...extra,
})
const cart = (extra = {}) => ({ draft_id: 1, items: [{ item_code: "A" }], pos_profile: "Caisse", ...extra })

const show = async (props = {}) => {
	const wrapper = mount(ClosingStillOpen, { props, global: { mocks: { __ } } })
	await flushPromises()
	return wrapper
}

beforeEach(() => {
	Object.assign(world, { enabled: true, profile: "Caisse", orders: [], drafts: [], calls: [], failNext: false })
})

describe("the block of the closing", () => {
	it("shows nothing when nothing is open and nothing is held", async () => {
		const wrapper = await show()

		expect(wrapper.find('[data-test="closing-still-open"]').exists()).toBe(false)
	})

	it("asks the server for the restaurant's open orders, with the till's profile and restaurant", async () => {
		await show()

		expect(world.calls).toEqual([
			{ method: "pos_next.api.restaurant.get_open_orders", args: { pos_profile: "Caisse", restaurant: "Brasserie" } },
		])
	})

	it("lists each open order with its total, how long it has been quiet and what it holds", async () => {
		world.orders = [
			order({ name: "A", label: "T1", grand_total: 42, idle_minutes: 50 }),
			order({ name: "B", label: "T2.1", grand_total: 18, consumed: true, served: true, idle_minutes: 125 }),
		]

		const wrapper = await show()
		const rows = wrapper.findAll('[data-test="still-open-order"]')

		expect(rows).toHaveLength(2)
		expect(rows[0].text()).toContain("T1")
		expect(rows[0].text()).toContain("Quiet for 50 min")
		expect(rows[0].text()).toContain("Nothing served")
		expect(rows[0].text()).toContain("CHF 42.00")
		expect(rows[1].text()).toContain("T2.1")
		expect(rows[1].text()).toContain("Quiet for 2 h 05")
		expect(rows[1].text()).toContain("All served")
	})

	it("says how many orders are open and for how much, none of it in the closing's figures", async () => {
		world.orders = [order({ name: "A", grand_total: 42 }), order({ name: "B", grand_total: 18 })]

		const wrapper = await show()
		const line = wrapper.get('[data-test="still-open-line"]').text()

		expect(line).toContain("2 orders are still open: they are not in the figures of this closing")
		expect(line).toContain("CHF 60.00")
	})

	it("flags money posted on a draft in the danger tone", async () => {
		world.orders = [order({ holds_money: true })]

		const wrapper = await show()
		const badge = wrapper.get('[data-badge="money"]')

		expect(badge.text()).toBe("Money posted")
		expect(badge.classes()).toContain("bg-red-100")
	})

	it("tells how many held tickets signing out will erase, and not those of another profile or empty ones", async () => {
		world.drafts = [cart({ draft_id: 1 }), cart({ draft_id: 2 }), cart({ draft_id: 3, pos_profile: "Bar" }), cart({ draft_id: 4, items: [] })]

		const wrapper = await show()

		expect(wrapper.get('[data-test="still-open-held"]').text()).toBe("2 held tickets on this device will be erased when you sign out")
	})

	it("shows held tickets alone when no order is open", async () => {
		world.drafts = [cart()]

		const wrapper = await show()

		expect(wrapper.find('[data-test="still-open-line"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="still-open-held"]').exists()).toBe(true)
	})

	it("hints at an order paid in cash and never cashed in when the cash is over and orders are open", async () => {
		world.orders = [order()]

		const over = await show({ cashIsOver: true })
		const not = await show({ cashIsOver: false })

		expect(over.find('[data-test="still-open-cash-hint"]').exists()).toBe(true)
		expect(not.find('[data-test="still-open-cash-hint"]').exists()).toBe(false)
	})

	it("does not hint when the cash is over and nothing is open", async () => {
		const wrapper = await show({ cashIsOver: true })

		expect(wrapper.find('[data-test="closing-still-open"]').exists()).toBe(false)
	})

	it("asks the server for nothing at a till with no restaurant, and still counts the held tickets", async () => {
		world.enabled = false
		world.drafts = [cart()]

		const wrapper = await show()

		expect(world.calls).toEqual([])
		expect(wrapper.find('[data-test="still-open-orders"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="still-open-held"]').exists()).toBe(true)
	})

	it("says it could not read the open orders, and reads again on request", async () => {
		world.failNext = true
		world.orders = [order()]

		const wrapper = await show()
		expect(wrapper.get('[data-test="still-open-failed"]').text()).toContain("The open orders could not be read.")
		expect(wrapper.find('[data-test="still-open-order"]').exists()).toBe(false)

		await wrapper.get('[data-test="still-open-failed"] button').trigger("click")
		await flushPromises()

		expect(wrapper.find('[data-test="still-open-failed"]').exists()).toBe(false)
		expect(wrapper.findAll('[data-test="still-open-order"]')).toHaveLength(1)
	})

	it("reads again each time the closing opens", async () => {
		const wrapper = await show({ active: false })
		expect(world.calls).toHaveLength(0)

		world.orders = [order()]
		await wrapper.setProps({ active: true })
		await flushPromises()

		expect(world.calls).toHaveLength(1)
		expect(wrapper.findAll('[data-test="still-open-order"]')).toHaveLength(1)
	})
})

describe("the notice of the sign-out dialogs", () => {
	const notice = async () => {
		const wrapper = mount(HeldTicketsNotice, { global: { mocks: { __ } } })
		await flushPromises()
		return wrapper
	}

	it("says how many tickets held on the device will be erased", async () => {
		world.drafts = [cart({ draft_id: 1 }), cart({ draft_id: 2 }), cart({ draft_id: 3 })]

		const wrapper = await notice()

		expect(wrapper.get('[data-test="held-tickets-notice"]').text()).toBe("3 held tickets on this device will be erased when you sign out")
	})

	it("uses the singular for one", async () => {
		world.drafts = [cart()]

		expect((await notice()).text()).toBe("1 held ticket on this device will be erased when you sign out")
	})

	it("says nothing when nothing is held", async () => {
		world.drafts = [cart({ items: [] })]

		expect((await notice()).find('[data-test="held-tickets-notice"]').exists()).toBe(false)
	})
})
