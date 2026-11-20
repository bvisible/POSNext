/**
 * //// Neoffice — added file (no upstream equivalent). A gift card is money already paid, so it covers what the customer owes
 * //// WITH the VAT. The cart capped it on the total without the VAT (the grand total minus the tax): a card worth more than the
 * //// sale left the VAT of the sale to pay (a 150.00 card on a 76.60 sale left 5.75 to pay, the VAT rounded to the 0.05). The
 * //// amount a card may cover is the invoice's grand total before the coupon, or its net total when the POS Profile applies the
 * //// discount on the net total (ERPNext cannot take a discount above the base it is applied on).
 */
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("frappe-ui", () => ({
	createResource: () => ({
		submit: vi.fn(),
		fetch: vi.fn(),
		reload: vi.fn(),
		data: null,
	}),
	call: vi.fn(),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => true,
	getCachedItem: vi.fn(async () => undefined),
}))
vi.mock("@/stores/serialNumber", () => ({
	useSerialNumberStore: () => ({ returnSerials: vi.fn() }),
}))

const { shiftState } = await import("@/composables/useShift")
const { useInvoice } = await import("../useInvoice")

const VAT_ROW = {
	account_head: "VAT 8.1",
	description: "VAT 8.1 %",
	charge_type: "On Net Total",
	rate: 8.1,
}

const line = (itemCode, price) => ({
	item_code: itemCode,
	item_name: itemCode,
	rate: price,
	price_list_rate: price,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
})

// A till whose prices include the VAT (the Swiss shop) or exclude it
function till({ inclusive }) {
	const inv = useInvoice()
	inv.taxRules.value = [
		{ ...VAT_ROW, included_in_print_rate: inclusive ? 1 : 0 },
	]
	inv.setTaxInclusive(inclusive)
	return inv
}

// What the coupon dialog hands the cart for a gift card: its amount and the base it was capped on
const card = (inv, amount) => ({
	code: "GC-TEST",
	name: "GC-TEST",
	percentage: 0,
	amount,
	isGiftCard: true,
	base_amount: inv.amountDueBeforeAdditionalDiscount.value,
})

describe("a gift card covers the VAT of the sale", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})
	afterEach(() => {
		shiftState.value = null
	})

	it("a till pricing with the VAT: the amount due is the grand total, and a card above it pays all of it", () => {
		const inv = till({ inclusive: true })
		for (const [code, price] of [
			["A", 29.9],
			["B", 18.9],
			["C", 9.9],
			["D", 17.9],
		])
			inv.addItem(line(code, price))
		expect(inv.grandTotal.value).toBe(76.6)
		expect(inv.totalTax.value).toBe(5.74)

		expect(inv.amountDueBeforeAdditionalDiscount.value).toBe(76.6)
		// The card is 150.00: the dialog caps it on the amount due
		inv.applyDiscount(card(inv, 76.6))

		expect(inv.additionalDiscount.value).toBe(76.6)
		expect(inv.grandTotal.value).toBe(0)
	})

	it("a cart with an offer on one line: the amount due is the one after the offer, and the card pays all of it", () => {
		const inv = till({ inclusive: true })
		for (const [code, price] of [
			["A", 29.9],
			["B", 18.9],
			["C", 9.9],
		])
			inv.addItem(line(code, price))
		// Two units at 17.90 with 50 % off: 17.90 to pay instead of 35.80 (the fields an offer writes on its line)
		inv.addItem(line("D", 17.9), 2)
		Object.assign(inv.invoiceItems.value[3], {
			rate: 8.95,
			discount_percentage: 50,
			discount_amount: 8.95,
			pricing_rules: '["OFFER-50"]',
		})
		expect(inv.grandTotal.value).toBe(76.6)

		expect(inv.amountDueBeforeAdditionalDiscount.value).toBe(76.6)
		inv.applyDiscount(card(inv, 76.6))

		expect(inv.grandTotal.value).toBe(0)
	})

	it("a till pricing without the VAT: the card pays the VAT as well", () => {
		const inv = till({ inclusive: false })
		for (const [code, price] of [
			["A", 27.66],
			["B", 17.48],
			["C", 9.16],
			["D", 16.56],
		])
			inv.addItem(line(code, price))
		// 70.86 without the VAT, 76.60 with it
		expect(inv.grandTotal.value).toBe(76.6)

		expect(inv.amountDueBeforeAdditionalDiscount.value).toBe(76.6)
		inv.applyDiscount(card(inv, 76.6))

		expect(inv.grandTotal.value).toBe(0)
	})

	it("the amount due is the one BEFORE the coupon, whatever coupon is applied", () => {
		const inv = till({ inclusive: true })
		inv.addItem(line("A", 100))
		inv.applyDiscount(card(inv, 30))
		expect(inv.grandTotal.value).toBe(70)

		expect(inv.amountDueBeforeAdditionalDiscount.value).toBe(100)
	})

	it("a POS Profile that applies the discount on the net total keeps the card under the net total", () => {
		shiftState.value = { pos_profile: { apply_discount_on: "Net Total" } }
		const inv = till({ inclusive: false })
		inv.addItem(line("A", 100))

		// 100.00 net, 108.10 with the VAT: a discount on the net total cannot go past 100.00
		expect(inv.amountDueBeforeAdditionalDiscount.value).toBe(100)
	})
})
