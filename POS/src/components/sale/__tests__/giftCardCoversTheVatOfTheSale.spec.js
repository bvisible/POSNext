/**
 * //// Neoffice — added file (no upstream equivalent). The coupon dialog caps a gift card on what the customer owes WITH the VAT
 * //// (the `dueBeforeDiscount` prop), not on the total without it: the card is money already paid, and a card worth more than the
 * //// sale left the VAT of the sale to pay (a 150.00 card on a 76.60 sale left 5.75 to pay). The base it hands the cart is the
 * //// same amount, since the cart clamps the discount to it.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import CouponDialog from "../CouponDialog.vue"

const server = vi.hoisted(() => {
	globalThis.__ = (s) => s
	return { balance: 150 }
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div><slot name='body-content' /><slot /></div>" },
	Input: { template: "<input />" },
	call: vi.fn(async () => ({
		valid: true,
		coupon: {
			coupon_code: "GC-TEST",
			coupon_type: "Gift Card",
			is_gift_card: true,
			balance: server.balance,
			gift_card_amount: server.balance,
			discount_amount: server.balance,
		},
	})),
	createResource: () => ({ reload: vi.fn() }),
}))
vi.mock("@/utils/promoApi", () => ({
	isPromotionsAppInstalled: () => false,
	promoApi: { getActiveCoupons: () => "x", validateCoupon: () => "x" },
}))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => ({}) }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showWarning: vi.fn(),
	}),
}))
vi.mock("@/composables/useInvoice", () => ({
	useInvoice: () => ({
		calculateDiscountAmount: (d, base) =>
			d.percentage > 0
				? (base * d.percentage) / 100
				: d.amount > 0
					? d.amount
					: 0,
	}),
}))

async function applyTheCard(props) {
	const wrapper = mount(CouponDialog, {
		props: {
			modelValue: true,
			customer: "Walk-In Customer",
			company: "Shop",
			...props,
		},
		global: { mocks: { __: globalThis.__ } },
	})
	wrapper.vm.$.setupState.couponCode = "GC-TEST"
	await wrapper.vm.$.setupState.applyCoupon()
	return wrapper.emitted("discount-applied")[0][0]
}

describe("a gift card covers the VAT of the sale", () => {
	beforeEach(() => {
		server.balance = 150
	})

	it("a card above the sale pays all of it, VAT included (prices with the VAT)", async () => {
		// 76.60 with the VAT, 70.86 without it: the card was clamped to 70.86 and 5.75 stayed to pay
		const discount = await applyTheCard({
			subtotal: 76.6,
			netTotal: 76.6,
			taxAmount: 5.74,
			grandTotal: 76.6,
			dueBeforeDiscount: 76.6,
		})

		expect(discount.amount).toBe(76.6)
		expect(discount.base_amount).toBe(76.6)
		expect(discount.remainingBalance).toBeCloseTo(73.4, 2)
	})

	it("a card above the sale pays all of it, VAT included (prices without the VAT)", async () => {
		// The cart's net total is 70.86 here: the VAT is added on top, and the card pays it too
		const discount = await applyTheCard({
			subtotal: 70.86,
			netTotal: 70.86,
			taxAmount: 5.74,
			grandTotal: 76.6,
			dueBeforeDiscount: 76.6,
		})

		expect(discount.amount).toBe(76.6)
		expect(discount.base_amount).toBe(76.6)
	})

	it("a card below the sale pays its balance and nothing stays on it", async () => {
		server.balance = 50
		const discount = await applyTheCard({
			subtotal: 179.9,
			netTotal: 179.9,
			taxAmount: 13.48,
			grandTotal: 179.9,
			dueBeforeDiscount: 179.9,
		})

		expect(discount.amount).toBe(50)
		expect(discount.remainingBalance).toBe(0)
	})

	it("the amount is rounded to the cent, with no trailing digits of a subtraction", async () => {
		const discount = await applyTheCard({
			subtotal: 76.6,
			netTotal: 76.6,
			taxAmount: 5.74,
			grandTotal: 76.6,
			dueBeforeDiscount: 76.60000000000001,
		})

		expect(discount.amount).toBe(76.6)
		expect(discount.base_amount).toBe(76.6)
	})
})
