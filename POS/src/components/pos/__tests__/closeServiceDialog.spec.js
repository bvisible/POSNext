/**
 * //// Neoffice — added file (no upstream equivalent). Closing the service of the restaurant (NeoResto lot 1, the product owner, 08.11.2026): « si des gens traînent encore au bistrot, le
 * //// restaurant n'est pas fermé ». The dialog asks « is the room empty? » (no: nothing happens), then lists the orders to settle, cancels the ones that never left for the kitchen
 * //// together, and closes the service once none is left; the server closes it and the dialog tells what was done.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const world = vi.hoisted(() => ({
	calls: [],
	survey: null,
	closeAnswer: null,
	readFails: false,
	closeFails: false,
	settleFails: false,
	toasts: { info: [], error: [] },
	refreshed: 0,
}))

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

vi.mock("frappe-ui", () => ({
	Dialog: {
		props: ["modelValue", "options"],
		template: '<div v-if="modelValue" data-test="dialog"><h2>{{ options.title }}</h2><slot name="body-content" /></div>',
	},
	Button: {
		props: ["disabled", "loading", "variant"],
		emits: ["click"],
		template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
	},
}))
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		world.calls.push({ method, args })
		if (method.endsWith("get_service_closing")) {
			if (world.readFails) throw { messages: ["Not permitted"] }
			return JSON.parse(JSON.stringify(world.survey))
		}
		if (method.endsWith("close_service")) {
			if (world.closeFails) throw { messages: ["Orders are still open: T4"] }
			return world.closeAnswer
		}
		if (world.settleFails) throw { messages: ["Settling failed"] }
		// settling an order takes it out of the survey, as the server does
		world.survey.orders = world.survey.orders.filter((order) => order.name !== args.invoice)
		return { issue: args.issue }
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showInfo: (text) => world.toasts.info.push(text),
		showError: (text) => world.toasts.error.push(text),
		showSuccess: () => {},
	}),
}))
vi.mock("@/composables/useFormatters", () => ({
	useFormatters: () => ({ formatCurrency: (value) => `CHF ${value}` }),
}))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Caisse" }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({
		ofTheRestaurant: () => ({ restaurant: "Bistro" }),
		fetchFromNetwork: () => {
			world.refreshed += 1
		},
	}),
}))

import CloseServiceDialog from "../CloseServiceDialog.vue"

const order = (name, stage, more = {}) => ({
	name,
	label: name,
	stage,
	grand_total: 20,
	idle_minutes: 15,
	owner: "Anna",
	served: false,
	consumed: false,
	holds_money: stage === "holds_money",
	issues: { cashed: { available: stage !== "holds_money" } },
	...more,
})

const show = async () => {
	const wrapper = mount(CloseServiceDialog, {
		props: { modelValue: true },
		global: { mocks: { __ }, stubs: { SettleOrderDialog: true } },
	})
	await flushPromises()
	return wrapper
}
const yes = async (wrapper) => {
	await wrapper.get('[data-test="room-empty"]').trigger("click")
	await flushPromises()
}
const callOf = (suffix) => world.calls.filter((entry) => entry.method.endsWith(suffix))

beforeEach(() => {
	world.calls = []
	world.survey = {
		orders: [],
		empty_orders: 0,
		tables_to_free: 0,
		dishes_to_deliver: 0,
		last_closing: null,
	}
	world.closeAnswer = {
		closing: "RSVC-26-00001",
		orders_settled: 0,
		empty_orders_removed: 0,
		tables_freed: 0,
		dishes_delivered: 0,
	}
	world.readFails = false
	world.closeFails = false
	world.settleFails = false
	world.toasts = { info: [], error: [] }
	world.refreshed = 0
})

describe("the question", () => {
	it("opens on « is the room empty? » and reads what the closing meets, for this till and restaurant", async () => {
		const wrapper = await show()

		expect(wrapper.text()).toContain("Close the service")
		expect(wrapper.get('[data-test="close-service-ask"]').text()).toContain("Is the room empty?")
		expect(callOf("get_service_closing")[0].args).toEqual({
			pos_profile: "Caisse",
			restaurant: "Bistro",
		})
	})

	it("answering no changes nothing: the dialog closes and says the service stays open", async () => {
		const wrapper = await show()

		await wrapper.get('[data-test="room-not-empty"]').trigger("click")
		await flushPromises()

		expect(wrapper.emitted("update:modelValue")).toEqual([[false]])
		expect(world.toasts.info).toEqual(["The service stays open."])
		expect(callOf("close_service")).toEqual([])
		expect(callOf("settle_open_order")).toEqual([])
	})

	it("cannot be answered yes when what the closing meets could not be read", async () => {
		world.readFails = true

		const wrapper = await show()

		expect(wrapper.get('[data-test="close-service-failed"]').text()).toContain("Not permitted")
		expect(wrapper.get('[data-test="room-empty"]').attributes("disabled")).toBeDefined()
	})
})

describe("the orders to settle", () => {
	beforeEach(() => {
		world.survey.orders = [order("T1", "empty"), order("T4", "sent", { consumed: true }), order("T6", "holds_money")]
	})

	it("lists every order but the empty tables, and counts them", async () => {
		const wrapper = await show()

		await yes(wrapper)

		const rows = wrapper.findAll('[data-test="close-service-order"]')
		expect(rows.map((row) => row.text())).toEqual([expect.stringContaining("T4"), expect.stringContaining("T6")])
		expect(wrapper.get('[data-test="close-service-left"]').text()).toBe("2 orders are left to settle")
	})

	it("offers to settle an order the server lets settle, and sends the other to its table", async () => {
		const wrapper = await show()

		await yes(wrapper)

		const rows = wrapper.findAll('[data-test="close-service-order"]')
		expect(rows[0].find('[data-test="settle-order"]').exists()).toBe(true)
		expect(rows[1].find('[data-test="settle-order"]').exists()).toBe(false)
		expect(rows[1].text()).toContain("Cash it from its table")
	})

	it("does not let the service close while an order is left", async () => {
		const wrapper = await show()

		await yes(wrapper)

		expect(wrapper.get('[data-test="close-the-service"]').attributes("disabled")).toBeDefined()
	})

	it("says what the closing will do by itself", async () => {
		world.survey.empty_orders = 1
		world.survey.tables_to_free = 3
		const wrapper = await show()

		await yes(wrapper)

		const text = wrapper.get('[data-test="close-service-by-itself"]').text()
		expect(text).toContain("1 table opened and left is removed")
		expect(text).toContain("3 tables are freed")
	})
})

describe("the orders that never left for the kitchen", () => {
	beforeEach(() => {
		world.survey.orders = [order("T2", "never_sent"), order("T3", "never_sent"), order("T4", "sent", { consumed: true })]
	})

	it("are cancelled together, each with a reason, and the list is read again", async () => {
		const wrapper = await show()
		await yes(wrapper)
		expect(wrapper.get('[data-test="never-sent"]').text()).toContain("2 orders never left for the kitchen: nothing was consumed")

		await wrapper.get('[data-test="cancel-never-sent"]').trigger("click")
		await flushPromises()

		expect(callOf("settle_open_order").map((entry) => entry.args)).toEqual([
			{ invoice: "T2", issue: "cancelled", reason: "Never sent to the kitchen" },
			{ invoice: "T3", issue: "cancelled", reason: "Never sent to the kitchen" },
		])
		expect(callOf("get_service_closing").length).toBe(2)
		expect(wrapper.find('[data-test="never-sent"]').exists()).toBe(false)
		expect(wrapper.findAll('[data-test="close-service-order"]').length).toBe(1)
	})

	it("stop at the first one the server refuses, say why and read the list again", async () => {
		world.settleFails = true
		const wrapper = await show()
		await yes(wrapper)

		await wrapper.get('[data-test="cancel-never-sent"]').trigger("click")
		await flushPromises()

		expect(callOf("settle_open_order").length).toBe(1)
		expect(world.toasts.error).toEqual(["Settling failed"])
		expect(wrapper.findAll('[data-test="close-service-order"]').length).toBe(3)
	})
})

describe("the closing", () => {
	it("is possible once no order is left but the empty tables, and tells what it did", async () => {
		world.survey.orders = [order("T1", "empty")]
		world.survey.empty_orders = 1
		world.closeAnswer = {
			closing: "RSVC-26-00002",
			orders_settled: 2,
			empty_orders_removed: 1,
			tables_freed: 6,
			dishes_delivered: 0,
		}
		const wrapper = await show()
		await yes(wrapper)
		expect(wrapper.get('[data-test="close-service-ready"]').text()).toContain("Every order is settled")

		await wrapper.get('[data-test="close-the-service"]').trigger("click")
		await flushPromises()

		expect(callOf("close_service")[0].args).toEqual({
			pos_profile: "Caisse",
			restaurant: "Bistro",
			room_empty: 1,
		})
		const done = wrapper.get('[data-test="close-service-done"]').text()
		expect(done).toContain("The service is closed.")
		expect(done).toContain("2 orders settled")
		expect(done).toContain("6 tables freed")
		expect(wrapper.emitted("closed")[0][0]).toEqual(world.closeAnswer)
		expect(world.refreshed).toBe(1)
	})

	it("says why when the server refuses, and reads the list again", async () => {
		world.closeFails = true
		const wrapper = await show()
		await yes(wrapper)

		await wrapper.get('[data-test="close-the-service"]').trigger("click")
		await flushPromises()

		expect(world.toasts.error).toEqual(["Orders are still open: T4"])
		expect(wrapper.find('[data-test="close-service-done"]').exists()).toBe(false)
		expect(callOf("get_service_closing").length).toBe(2)
	})

	it("starts again on the question each time it opens", async () => {
		const wrapper = await show()
		await yes(wrapper)
		expect(wrapper.find('[data-test="close-service-settle"]').exists()).toBe(true)

		await wrapper.setProps({ modelValue: false })
		await wrapper.setProps({ modelValue: true })
		await flushPromises()

		expect(wrapper.find('[data-test="close-service-ask"]').exists()).toBe(true)
	})
})
