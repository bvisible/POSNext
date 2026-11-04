/**
 * //// Neoffice — added file (no upstream equivalent). The seller's check of a cart paid on the phone (ShopCartControl.vue,
 * //// scanning in the shop, lot 4): validated only once each line is ticked there or marked missing; all there, the sale is
 * //// validated as paid; a missing article is refunded on the phone's payment first; an article found in the bag sends the
 * //// seller to scan it, and the till's payment takes the rest.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { reactive } from "vue"

vi.hoisted(() => {
	globalThis.__ = (s, args) => s.replace(/{(\d+)}/g, (_, n) => args?.[n] ?? _)
})

const fx = vi.hoisted(() => ({ cart: null, call: null, toast: null }))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => fx.cart }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({
		profileName: "Shop till",
		profileCurrency: "CHF",
	}),
}))
vi.mock("@/utils/apiWrapper", () => ({ call: (...args) => fx.call(...args) }))
vi.mock("@/utils/currency", () => ({
	formatCurrency: (value, currency) =>
		`${currency} ${Number(value).toFixed(2)}`,
}))
vi.mock("@/composables/useToast", () => ({ useToast: () => fx.toast }))
vi.mock("frappe-ui", () => ({
	Button: {
		props: ["disabled", "loading"],
		emits: ["click"],
		template:
			'<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
	},
	Dialog: {
		props: ["modelValue"],
		template:
			"<div v-if='modelValue'><slot name='body-content' /><slot name='actions' /></div>",
	},
}))

const { default: ShopCartControl } = await import("../ShopCartControl.vue")

const CHECK = {
	code: "K7Q-24M",
	invoice: "FA-1",
	paid_amount: 38,
	grand_total: 38,
	currency: "CHF",
	lines: [
		{
			line: "L1",
			item_name: "Tea",
			qty: 2,
			amount: 18,
			needs_validation: false,
		},
		{
			line: "L2",
			item_name: "Knife",
			qty: 1,
			amount: 20,
			needs_validation: true,
		},
	],
}

function aCheck() {
	return mount(ShopCartControl, { global: { mocks: { __: globalThis.__ } } })
}

const validateButton = (wrapper) => wrapper.findAll("button").at(-1)

describe("the seller's check of a cart paid on the phone", () => {
	beforeEach(() => {
		fx.cart = reactive({
			shopCartCheck: structuredClone(CHECK),
			shopCartCheckOpen: true,
			posOpeningShift: "SHIFT-1",
			clearCart: vi.fn(async () => {}),
			$patch: vi.fn((values) => Object.assign(fx.cart, values)),
		})
		fx.call = vi.fn(async () => ({
			invoice: "FA-1",
			refunded: 0,
			grand_total: 38,
		}))
		fx.toast = { showSuccess: vi.fn(), showWarning: vi.fn() }
	})

	it("lists the paid lines, says the one a seller checks, and waits for each to be decided", async () => {
		const wrapper = aCheck()

		expect(wrapper.text()).toContain("Tea")
		expect(wrapper.text()).toContain("To check by a seller")
		expect(wrapper.text()).toContain("0 of 2 checked")
		expect(validateButton(wrapper).attributes("disabled")).toBeDefined()

		await wrapper.find("#check-L1").setValue(true)
		expect(wrapper.text()).toContain("1 of 2 checked")
		expect(validateButton(wrapper).attributes("disabled")).toBeDefined()
	})

	it("validates the cart as paid when all is there", async () => {
		const wrapper = aCheck()
		await wrapper.find("#check-L1").setValue(true)
		await wrapper.find("#check-L2").setValue(true)

		expect(validateButton(wrapper).text()).toBe("All there · Validate the cart")
		await validateButton(wrapper).trigger("click")
		await flushPromises()

		expect(fx.call).toHaveBeenCalledWith(
			"pos_next.api.shop_scan.validate_shop_cart",
			{
				code: "K7Q-24M",
				pos_profile: "Shop till",
				missing: null,
				pos_opening_shift: "SHIFT-1",
			},
		)
		expect(fx.cart.clearCart).toHaveBeenCalled()
		expect(fx.toast.showSuccess).toHaveBeenCalledWith("Cart K7Q-24M validated.")
	})

	it("refunds a missing article on the phone's payment, then validates", async () => {
		fx.call = vi.fn(async () => ({
			invoice: "FA-1",
			refunded: 9,
			grand_total: 29,
		}))
		const wrapper = aCheck()
		await wrapper.find("#check-L2").setValue(true)
		const missing = wrapper
			.findAll("button")
			.find((button) => button.text() === "Missing")
		await missing.trigger("click")
		await wrapper.find("[aria-label='One less missing']").trigger("click")

		expect(wrapper.text()).toContain("To refund")
		expect(validateButton(wrapper).text()).toBe("Refund CHF 9.00 and validate")
		await validateButton(wrapper).trigger("click")
		await flushPromises()

		expect(JSON.parse(fx.call.mock.calls[0][1].missing)).toEqual([
			{ line: "L1", qty: 1 },
		])
		expect(fx.toast.showSuccess).toHaveBeenCalledWith(
			"Cart K7Q-24M validated, CHF 9.00 refunded.",
		)
	})

	it("says why the cart could not be validated, and keeps it", async () => {
		fx.call = vi.fn(async () =>
			Promise.reject(
				new Error("The provider did not perform the refund: refused"),
			),
		)
		const wrapper = aCheck()
		await wrapper.find("#check-L1").setValue(true)
		await wrapper.find("#check-L2").setValue(true)

		await validateButton(wrapper).trigger("click")
		await flushPromises()

		expect(wrapper.text()).toContain("The provider did not perform the refund")
		expect(fx.cart.clearCart).not.toHaveBeenCalled()
	})

	it("sends the seller to scan an article found in the bag", async () => {
		const wrapper = aCheck()

		await wrapper
			.findAll("button")
			.find((button) => button.text() === "Article found in the bag")
			.trigger("click")

		expect(fx.cart.shopCartCheckOpen).toBe(false)
		expect(fx.toast.showWarning).toHaveBeenCalled()
	})
})
