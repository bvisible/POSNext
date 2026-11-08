/**
 * //// Neoffice — added file (no upstream equivalent). Settling one open order when the service closes (NeoResto lot 1, the product owner, 08.11.2026): « soit considérer que c'est payé,
 * //// mettre sur ardoise, offert, perte sur client, annuler ». The dialog lists the five issues (the ones the server says are closed to the order disabled, with why), asks a reason
 * //// and a customer where they are needed, asks the manager's PIN where the gate does (offering, writing off), and sends the choice to `settle_open_order`.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const world = vi.hoisted(() => ({
	calls: [],
	grants: [],
	grantAnswer: { grant_token: "TOKEN-1" },
	customers: [],
	failWith: null,
	toasts: { success: [], error: [] },
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
		if (method.endsWith("get_customers")) return world.customers
		if (world.failWith) throw world.failWith
		return { issue: args.issue }
	}),
}))
vi.mock("@/composables/useAuthorization", () => ({
	useAuthorization: () => ({
		requireAuthorization: vi.fn(async (action, context) => {
			world.grants.push({ action, context })
			return world.grantAnswer
		}),
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: (text) => world.toasts.success.push(text),
		showError: (text) => world.toasts.error.push(text),
	}),
}))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Caisse", profileCurrency: "CHF" }),
}))

import SettleOrderDialog from "../SettleOrderDialog.vue"

const ALL = {
	cashed: { available: true, why: null },
	tab: { available: true, why: null },
	offered: { available: true, why: null },
	loss: { available: true, why: null },
	cancelled: { available: true, why: null },
}
const order = (issues = {}) => ({
	name: "SINV-1",
	label: "T4",
	grand_total: 48.5,
	offer_value: 52,
	issues: { ...ALL, ...issues },
})

const show = async (row = order()) => {
	const wrapper = mount(SettleOrderDialog, {
		props: { modelValue: true, order: row, formatMoney: (value) => `CHF ${value}` },
		global: { mocks: { __ } },
	})
	await flushPromises()
	return wrapper
}
const settleCall = () => world.calls.find((entry) => entry.method.endsWith("settle_open_order"))
const pick = async (wrapper, issue) => {
	await wrapper.get(`[data-issue="${issue}"] input`).setValue(true)
	await flushPromises()
}
const confirm = async (wrapper) => {
	await wrapper.get('[data-test="settle-confirm"]').trigger("click")
	await flushPromises()
}

beforeEach(() => {
	world.calls = []
	world.grants = []
	world.grantAnswer = { grant_token: "TOKEN-1" }
	world.customers = []
	world.failWith = null
	world.toasts = { success: [], error: [] }
})

describe("the dialog", () => {
	it("names the order and its total, and lists the five issues", async () => {
		const wrapper = await show()

		expect(wrapper.text()).toContain("Settle T4")
		expect(wrapper.text()).toContain("CHF 48.5")
		expect(wrapper.findAll("[data-issue]").map((row) => row.attributes("data-issue"))).toEqual([
			"cashed",
			"tab",
			"offered",
			"loss",
			"cancelled",
		])
	})

	it("starts on the first issue the order allows", async () => {
		const wrapper = await show(order({ cashed: { available: false, why: "No cash" } }))

		expect(wrapper.get('[data-issue="tab"] input').element.checked).toBe(true)
	})

	it("disables an issue the server closes to the order, and says why", async () => {
		const wrapper = await show(order({ cancelled: { available: false, why: "A dish was served" } }))

		const row = wrapper.get('[data-issue="cancelled"]')
		expect(row.get("input").attributes("disabled")).toBeDefined()
		expect(row.text()).toContain("A dish was served")
	})
})

describe("cashing it", () => {
	it("needs no reason and no customer: one gesture", async () => {
		const wrapper = await show()
		expect(wrapper.get('[data-test="settle-confirm"]').attributes("disabled")).toBeUndefined()
		expect(wrapper.find('[data-test="settle-reason"]').exists()).toBe(false)

		await confirm(wrapper)

		expect(settleCall().args).toMatchObject({ invoice: "SINV-1", issue: "cashed", complaint_filed: 0 })
		expect(settleCall().args.reason).toBeUndefined()
		expect(world.grants).toEqual([])
		expect(world.toasts.success).toEqual(["T4 cashed in cash"])
		expect(wrapper.emitted("settled")).toEqual([[{ order: "SINV-1", issue: "cashed" }]])
		expect(wrapper.emitted("update:modelValue")).toEqual([[false]])
	})
})

describe("what each issue asks", () => {
	it("a reason to cancel, before the button works", async () => {
		const wrapper = await show()
		await pick(wrapper, "cancelled")

		expect(wrapper.get('[data-test="settle-confirm"]').attributes("disabled")).toBeDefined()
		await wrapper.get("#settle-reason-text").setValue("Left before being served")
		expect(wrapper.get('[data-test="settle-confirm"]').attributes("disabled")).toBeUndefined()

		await confirm(wrapper)

		expect(settleCall().args).toMatchObject({ issue: "cancelled", reason: "Left before being served" })
		expect(world.grants).toEqual([])
	})

	it("a reason made of spaces is none", async () => {
		const wrapper = await show()
		await pick(wrapper, "cancelled")
		await wrapper.get("#settle-reason-text").setValue("    ")

		expect(wrapper.get('[data-test="settle-confirm"]').attributes("disabled")).toBeDefined()
	})

	it("a customer to put it on a tab, found by a search", async () => {
		vi.useFakeTimers()
		try {
			world.customers = [{ name: "CUST-9", customer_name: "Madame Test" }]
			const wrapper = await show()
			await pick(wrapper, "tab")
			expect(wrapper.get('[data-test="settle-confirm"]').attributes("disabled")).toBeDefined()

			await wrapper.get("#settle-customer-search").setValue("Mad")
			await vi.advanceTimersByTimeAsync(300)
			await flushPromises()
			await wrapper.get('[data-customer="CUST-9"]').trigger("click")
			vi.useRealTimers()
			await confirm(wrapper)

			expect(settleCall().args).toMatchObject({ issue: "tab", customer: "CUST-9" })
		} finally {
			vi.useRealTimers()
		}
	})

	it("says whether a complaint was filed when it is written off", async () => {
		const wrapper = await show()
		await pick(wrapper, "loss")
		await wrapper.get("#settle-reason-text").setValue("Left without paying")
		await wrapper.get('[data-test="settle-complaint"] input').setValue(true)

		await confirm(wrapper)

		expect(settleCall().args).toMatchObject({ issue: "loss", complaint_filed: 1 })
	})
})

describe("the manager's approval", () => {
	it("is asked to offer, for the value of the order at list price, and its grant goes with the call", async () => {
		const wrapper = await show()
		await pick(wrapper, "offered")
		await wrapper.get("#settle-reason-text").setValue("A gesture")

		await confirm(wrapper)

		expect(world.grants).toHaveLength(1)
		expect(world.grants[0].action).toBe("Offer an item")
		expect(world.grants[0].context).toMatchObject({ pos_profile: "Caisse", amount: 52 })
		expect(settleCall().args).toMatchObject({ issue: "offered", authorization_token: "TOKEN-1" })
	})

	it("is asked to write off, for the order itself", async () => {
		const wrapper = await show()
		await pick(wrapper, "loss")
		await wrapper.get("#settle-reason-text").setValue("Left without paying")

		await confirm(wrapper)

		expect(world.grants[0].action).toBe("Write off an order")
		expect(world.grants[0].context).toMatchObject({ invoice: "SINV-1", amount: 48.5, pos_profile: "Caisse" })
		expect(settleCall().args.authorization_token).toBe("TOKEN-1")
	})

	it("is not asked for the other issues", async () => {
		const wrapper = await show()
		for (const issue of ["cashed", "tab"]) {
			world.grants = []
			await pick(wrapper, issue)
			if (issue === "tab") break
			await confirm(wrapper)
		}

		expect(world.grants).toEqual([])
	})

	it("sends nothing when the manager gives up the PIN", async () => {
		world.grantAnswer = null
		const wrapper = await show()
		await pick(wrapper, "loss")
		await wrapper.get("#settle-reason-text").setValue("Left without paying")

		await confirm(wrapper)

		expect(settleCall()).toBeUndefined()
		expect(wrapper.emitted("settled")).toBeUndefined()
		expect(wrapper.find('[data-test="settle-order-dialog"]').exists()).toBe(true)
	})

	it("sends no token where the gate asks none (a stub grant without one)", async () => {
		world.grantAnswer = { grant_token: null, required: false }
		const wrapper = await show()
		await pick(wrapper, "offered")
		await wrapper.get("#settle-reason-text").setValue("A gesture")

		await confirm(wrapper)

		expect(settleCall().args.authorization_token).toBeUndefined()
	})
})

describe("when the server refuses", () => {
	it("says why, keeps the dialog open and tells nobody the order was settled", async () => {
		world.failWith = { messages: ["A dish was served: settle it as a loss"] }
		const wrapper = await show()
		await pick(wrapper, "cancelled")
		await wrapper.get("#settle-reason-text").setValue("Oops")

		await confirm(wrapper)

		expect(world.toasts.error).toEqual(["A dish was served: settle it as a loss"])
		expect(wrapper.emitted("settled")).toBeUndefined()
		expect(wrapper.find('[data-test="settle-order-dialog"]').exists()).toBe(true)
	})
})
