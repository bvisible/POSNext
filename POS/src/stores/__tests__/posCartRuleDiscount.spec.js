/**
 * //// Neoffice — added file (no upstream equivalent). Our header-discount design (44ea4e9a,
 * //// 4d61216b): a transaction rule's discount lives in ruleHeaderDiscount, never in the
 * //// additionalDiscount a coupon, gift card or manual discount uses. While the rule applies its
 * //// amount is the header discount; the coupon stays applied underneath and is back in force when
 * //// the rule stops, and the cashier can bypass the rule for one ticket. Upstream develop's own
 * //// design (posCartHeaderDiscount.spec.js, skipped cases) is not taken — NEOFFICE_FORK_MARKERS.md.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? `${s} ${args.join(" ")}` : s)
	return { header: 0, rules: [] }
})
const toast = vi.hoisted(() => ({}))
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: () => ({
		submit: vi.fn(async ({ selected_offers }) => ({
			items: [],
			free_items: [],
			applied_pricing_rules: server.rules.filter((rule) => selected_offers.includes(rule)),
			discount_amount: server.header,
		})),
		reload: vi.fn(),
		fetch: vi.fn(),
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => {
		Object.assign(toast, { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() })
		return toast
	},
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

const { usePOSCartStore } = await import("../posCart")

const tv = { item_code: "TV", item_name: "TV", rate: 1000, price_list_rate: 1000, uom: "Nos", stock_uom: "Nos", conversion_factor: 1 }
const coupon = { name: "C50", code: "C50", percentage: 0, amount: 50 }
const order = { name: "ORDER100" }

describe("rule discount and coupon (Neoffice design)", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		cart.posProfile = "POS-1"
		cart.customer = "CUST-1"
		cart.addItem({ ...tv })
		Object.assign(server, { header: 100, rules: ["ORDER100"] })
	})

	it("a rule firing keeps the coupon applied underneath, and the rule's amount is the header", async () => {
		cart.applyDiscountToCart({ ...coupon })
		await cart.applyOffer(order, {})

		expect(cart.appliedCoupon?.code).toBe("C50")
		expect(cart.additionalDiscount).toBe(50)
		expect(cart.ruleHeaderDiscount).toBe(100)
		expect(cart.effectiveHeaderDiscount).toBe(100)
		expect(cart.totalDiscount).toBe(100)
		expect(toast.showWarning).not.toHaveBeenCalled()
	})

	it("a coupon is still accepted while a rule applies", async () => {
		await cart.applyOffer(order, {})
		cart.applyDiscountToCart({ ...coupon })

		expect(cart.appliedCoupon?.code).toBe("C50")
		expect(cart.additionalDiscount).toBe(50)
		expect(cart.effectiveHeaderDiscount).toBe(100)
	})

	it("the coupon is back in force when the rule stops", async () => {
		cart.applyDiscountToCart({ ...coupon })
		await cart.applyOffer(order, {})
		await cart.removeOffer("ORDER100", {})

		expect(cart.ruleHeaderDiscount).toBe(0)
		expect(cart.appliedCoupon?.code).toBe("C50")
		expect(cart.effectiveHeaderDiscount).toBe(50)
	})

	it("the cashier bypass hands the header back to the coupon for this ticket, and back to the rule after", async () => {
		cart.applyDiscountToCart({ ...coupon })
		await cart.applyOffer(order, {})

		cart.setBypassRuleDiscount(true)
		expect(cart.bypassRuleDiscount).toBe(true)
		expect(cart.ruleHeaderDiscount).toBe(0)
		expect(cart.effectiveHeaderDiscount).toBe(50)

		// The rule cannot take the header back while the bypass is on
		cart.applyHeaderDiscountFromServer({ discountAmount: 100 })
		expect(cart.effectiveHeaderDiscount).toBe(50)

		cart.setBypassRuleDiscount(false)
		cart.applyHeaderDiscountFromServer({ discountAmount: 100 })
		expect(cart.effectiveHeaderDiscount).toBe(100)
	})
})
