/**
 * //// Neoffice — added file (no upstream equivalent). The guest's own pages (QR at the table) show an offered line as
 * //// « Offert », read only (NeoResto lot 1, task 24). The word comes from the server in the guest's language
 * //// (`offered_label` of get_order_status): the till's translations are not open to a guest.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

const guest = vi.hoisted(() => ({
	cart: [],
	orderItems: [],
	currency: "CHF",
	isFullyPaid: false,
	isLoading: false,
	paidAmount: 0,
	orderTotal: 19,
	remainingAmount: 19,
	taxAmount: 0,
	settings: {},
	error: null,
}))
vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? String(s).replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
})
vi.mock("@/stores/guestOrder", () => ({ useGuestOrderStore: () => guest }))

const { default: GuestCart } = await import("../GuestCart.vue")
const { default: GuestCheckout } = await import("../GuestCheckout.vue")

const ORDER = [
	{
		item_code: "TIRAMISU",
		item_name: "Tiramisu",
		qty: 2,
		rate: 9.5,
		amount: 19,
		kds_status: "Pending",
	},
	{
		item_code: "TIRAMISU",
		item_name: "Tiramisu",
		qty: 1,
		rate: 0,
		amount: 0,
		kds_status: "Pending",
		posa_is_offered: 1,
		offered_label: "Offert",
	},
]

const mountWith = (component) =>
	mount(component, { global: { mocks: { __: globalThis.__ } } })

describe("the guest's pages", () => {
	it("the order on the guest's cart reads « Offert » for the offered line, the paid one its price", () => {
		guest.orderItems = ORDER
		const lines = mountWith(GuestCart).findAll(
			"[data-test='guest-ordered-line']",
		)
		expect(lines).toHaveLength(2)
		expect(lines[0].text()).toContain("19.00")
		expect(lines[0].text()).not.toContain("Offert")
		expect(lines[1].text()).toContain("Offert")
		expect(lines[1].text()).not.toMatch(/0\.00/)
	})

	it("the bill the guest pays reads « Offert » for the offered line", () => {
		guest.orderItems = ORDER
		const lines = mountWith(GuestCheckout).findAll(
			"[data-test='guest-bill-line']",
		)
		expect(lines).toHaveLength(2)
		expect(lines[0].text()).toContain("19.00")
		expect(lines[1].text()).toContain("Offert")
		expect(lines[1].text()).not.toMatch(/-100%/)
	})
})
