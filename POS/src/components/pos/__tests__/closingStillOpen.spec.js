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
	loose: [],
	errors: [],
	calls: [],
	failNext: false,
}))

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		world.calls.push({ method, args })
		if (method.endsWith("get_loose_drafts")) return { drafts: world.loose }
		if (method.endsWith("delete_loose_draft")) {
			world.loose = world.loose.filter((draft) => draft.name !== args.invoice)
			return { deleted: args.invoice }
		}
		if (world.failNext) {
			world.failNext = false
			throw new Error("down")
		}
		return { orders: world.orders }
	}),
}))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showError: (text) => world.errors.push(text) }) }))
// The list of held tickets has its own spec: here it is a stub that shows what the block gave it
vi.mock("../HeldTicketsList.vue", () => ({
	default: {
		name: "HeldTicketsList",
		props: ["tickets", "formatMoney", "tableLabel"],
		emits: ["changed"],
		template: '<div data-test="held-list-stub" :data-count="tickets.length"></div>',
	},
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

// The settle dialog has its own spec: here it is a stub that shows what the block gave it
vi.mock("../SettleOrderDialog.vue", () => ({
	default: {
		name: "SettleOrderDialog",
		props: ["modelValue", "order", "formatMoney"],
		emits: ["update:modelValue", "settled"],
		template: '<div data-test="settle-stub" :data-open="String(modelValue)" :data-order="order && order.name"></div>',
	},
}))

import ClosingStillOpen from "../ClosingStillOpen.vue"
import HeldTicketsNotice from "../HeldTicketsNotice.vue"

const ALL_OPEN = {
	cashed: { available: true, why: null },
	tab: { available: true, why: null },
	offered: { available: true, why: null },
	loss: { available: false, why: "No loss mode" },
	cancelled: { available: true, why: null },
}
const NONE_OPEN = Object.fromEntries(Object.keys(ALL_OPEN).map((key) => [key, { available: false, why: "Money was already posted" }]))
const order = (extra = {}) => ({
	name: "SINV-1",
	label: "T1",
	idle_minutes: 50,
	grand_total: 42,
	holds_money: false,
	consumed: false,
	served: false,
	mine: true,
	owner: "Waiter",
	issues: ALL_OPEN,
	...extra,
})
const cart = (extra = {}) => ({ draft_id: 1, items: [{ item_code: "A" }], pos_profile: "Caisse", ...extra })

const show = async (props = {}) => {
	const wrapper = mount(ClosingStillOpen, { props, global: { mocks: { __ } } })
	await flushPromises()
	return wrapper
}

beforeEach(() => {
	Object.assign(world, { enabled: true, profile: "Caisse", orders: [], drafts: [], loose: [], errors: [], calls: [], failNext: false })
})

describe("the block of the closing", () => {
	it("shows nothing when nothing is open and nothing is held", async () => {
		const wrapper = await show()

		expect(wrapper.find('[data-test="closing-still-open"]').exists()).toBe(false)
	})

	it("asks the server for the restaurant's open orders, with the till's profile and restaurant", async () => {
		await show()

		expect(world.calls).toContainEqual({
			method: "pos_next.api.restaurant.get_open_orders",
			args: { pos_profile: "Caisse", restaurant: "Brasserie" },
		})
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

	it("tells how many held tickets wait on the device, and not those of another profile or empty ones", async () => {
		world.drafts = [cart({ draft_id: 1 }), cart({ draft_id: 2 }), cart({ draft_id: 3, pos_profile: "Bar" }), cart({ draft_id: 4, items: [] })]

		const wrapper = await show()

		expect(wrapper.get('[data-test="still-open-held"]').text()).toContain(
			"2 held tickets on this device stay here for your next session",
		)
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

		expect(world.calls.map((call) => call.method)).toEqual(["pos_next.api.invoices.get_loose_drafts"])
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

		expect(world.calls.map((call) => call.method)).toEqual([
			"pos_next.api.invoices.get_loose_drafts",
			"pos_next.api.restaurant.get_open_orders",
		])
		expect(wrapper.findAll('[data-test="still-open-order"]')).toHaveLength(1)
	})
})

describe("the held tickets, to look at and to delete by choice", () => {
	it("opens their list on request and closes it again", async () => {
		world.drafts = [cart({ draft_id: 1 }), cart({ draft_id: 2 })]
		const wrapper = await show()
		expect(wrapper.find('[data-test="held-list-stub"]').exists()).toBe(false)

		await wrapper.get('[data-test="held-tickets-toggle"]').trigger("click")
		expect(wrapper.get('[data-test="held-list-stub"]').attributes("data-count")).toBe("2")
		expect(wrapper.get('[data-test="held-tickets-toggle"]').text()).toBe("Hide them")

		await wrapper.get('[data-test="held-tickets-toggle"]').trigger("click")
		expect(wrapper.find('[data-test="held-list-stub"]').exists()).toBe(false)
	})

	it("reads the device again when the list says it changed", async () => {
		world.drafts = [cart({ draft_id: 1 }), cart({ draft_id: 2 })]
		const wrapper = await show()
		await wrapper.get('[data-test="held-tickets-toggle"]').trigger("click")

		world.drafts = [cart({ draft_id: 2 })]
		wrapper.getComponent({ name: "HeldTicketsList" }).vm.$emit("changed")
		await flushPromises()

		expect(wrapper.get('[data-test="held-list-stub"]').attributes("data-count")).toBe("1")
	})
})

describe("the drafts the till left on the server", () => {
	const draft = (extra = {}) => ({ name: "FA-1", customer: "walk-in", customer_name: "", grand_total: 25, lines: 2, ...extra })

	it("are listed with their lines and total, and counted", async () => {
		world.loose = [draft({ name: "FA-1" }), draft({ name: "FA-2", customer_name: "Madame Test", grand_total: 9 })]

		const wrapper = await show()

		expect(wrapper.get('[data-test="still-open-loose"]').text()).toContain("2 drafts of this till were never finished")
		const rows = wrapper.findAll('[data-test="loose-draft"]')
		expect(rows).toHaveLength(2)
		expect(rows[0].text()).toContain("2 lines")
		expect(rows[1].text()).toContain("Madame Test")
	})

	it("names a draft with no customer a draft, and counts one line in the singular", async () => {
		world.loose = [draft({ name: "FA-3", customer: "", customer_name: "", lines: 1 })]

		const wrapper = await show()

		const row = wrapper.get('[data-test="loose-draft"]').text()
		expect(row).toContain("Draft")
		expect(row).toContain("1 line")
		expect(row).not.toContain("1 lines")
	})

	it("make the block appear on their own, at a till with no restaurant", async () => {
		world.enabled = false
		world.loose = [draft()]

		const wrapper = await show()

		expect(wrapper.find('[data-test="closing-still-open"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="still-open-orders"]').exists()).toBe(false)
	})

	it("are deleted by a second tap on the same button, the first one asking", async () => {
		world.loose = [draft({ name: "FA-1" }), draft({ name: "FA-2" })]
		const wrapper = await show()
		const first = () => wrapper.findAll('[data-test="loose-draft-delete"]')[0]

		await first().trigger("click")
		expect(first().text()).toBe("Confirm: delete")
		expect(world.calls.some((call) => call.method.endsWith("delete_loose_draft"))).toBe(false)

		await first().trigger("click")
		await flushPromises()

		const deleting = world.calls.find((call) => call.method.endsWith("delete_loose_draft"))
		expect(deleting.args).toEqual({ invoice: "FA-1", pos_profile: "Caisse" })
		expect(wrapper.findAll('[data-test="loose-draft"]')).toHaveLength(1)
	})

	it("show nothing when the till left none", async () => {
		const wrapper = await show()

		expect(wrapper.find('[data-test="still-open-loose"]').exists()).toBe(false)
	})
})

describe("settling an order from the closing", () => {
	it("offers a Settle button on each order that can be settled", async () => {
		world.orders = [order({ name: "A" }), order({ name: "B" })]

		const wrapper = await show()

		expect(wrapper.findAll('[data-test="settle-order"]')).toHaveLength(2)
	})

	it("offers none on an order that holds money, and says to cash it from its table", async () => {
		world.orders = [order({ holds_money: true, issues: NONE_OPEN })]

		const wrapper = await show()

		expect(wrapper.find('[data-test="settle-order"]').exists()).toBe(false)
		expect(wrapper.get('[data-test="open-at-its-table"]').text()).toBe("Cash it from its table")
	})

	it("opens the dialog on the order whose button was pressed", async () => {
		world.orders = [order({ name: "A", label: "T1" }), order({ name: "B", label: "T2" })]
		const wrapper = await show()

		await wrapper.findAll('[data-test="settle-order"]')[1].trigger("click")

		const stub = wrapper.get('[data-test="settle-stub"]')
		expect(stub.attributes("data-open")).toBe("true")
		expect(stub.attributes("data-order")).toBe("B")
	})

	it("reads the open orders again once one is settled, and tells the closing to read its figures again", async () => {
		world.orders = [order({ name: "A" }), order({ name: "B" })]
		const wrapper = await show()
		await wrapper.findAll('[data-test="settle-order"]')[0].trigger("click")

		world.orders = [order({ name: "B" })]
		wrapper.getComponent({ name: "SettleOrderDialog" }).vm.$emit("settled", { order: "A", issue: "cashed" })
		await flushPromises()

		expect(wrapper.findAll('[data-test="still-open-order"]')).toHaveLength(1)
		expect(wrapper.emitted("settled")).toEqual([[{ order: "A", issue: "cashed" }]])
	})

	it("says the orders the waiter opened can stay open for a colleague, and names the owner of the others", async () => {
		world.orders = [order({ name: "A", mine: true }), order({ name: "B", mine: false, owner: "Colleague" })]

		const wrapper = await show()

		expect(wrapper.get('[data-test="still-open-mine"]').text()).toContain("can stay open for a colleague")
		const rows = wrapper.findAll('[data-test="still-open-order"]')
		expect(rows[0].text()).not.toContain("Waiter")
		expect(rows[1].text()).toContain("Colleague")
	})

	it("does not tell the waiter his orders can stay open when none is his", async () => {
		world.orders = [order({ mine: false, owner: "Colleague" })]

		const wrapper = await show()

		expect(wrapper.find('[data-test="still-open-mine"]').exists()).toBe(false)
	})
})

describe("the notice of the sign-out dialogs", () => {
	const notice = async () => {
		const wrapper = mount(HeldTicketsNotice, { global: { mocks: { __ } } })
		await flushPromises()
		return wrapper
	}

	it("says how many tickets held on the device wait for the next session", async () => {
		world.drafts = [cart({ draft_id: 1 }), cart({ draft_id: 2 }), cart({ draft_id: 3 })]

		const wrapper = await notice()

		expect(wrapper.get('[data-test="held-tickets-notice"]').text()).toContain("3 held tickets on this device stay here for your next session")
	})

	it("uses the singular for one", async () => {
		world.drafts = [cart()]

		expect((await notice()).text()).toContain("1 held ticket on this device stays here for your next session")
	})

	it("says nothing when nothing is held", async () => {
		world.drafts = [cart({ items: [] })]

		expect((await notice()).find('[data-test="held-tickets-notice"]').exists()).toBe(false)
	})

	it("lets the user look at the tickets and hides them again", async () => {
		world.drafts = [cart({ draft_id: 1 }), cart({ draft_id: 2 })]
		const wrapper = await notice()
		expect(wrapper.find('[data-test="held-list-stub"]').exists()).toBe(false)

		await wrapper.get('[data-test="held-tickets-toggle"]').trigger("click")

		expect(wrapper.get('[data-test="held-list-stub"]').attributes("data-count")).toBe("2")
	})
})
