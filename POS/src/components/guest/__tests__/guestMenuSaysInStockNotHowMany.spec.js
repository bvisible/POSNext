/**
 * //// Neoffice — added file (no upstream equivalent). The guest's page (the QR code of a table) greys out a stock dish when there is none left. The
 * //// server used to hand it the quantity in the warehouse, the business's figure on a public page; it now says whether the dish is in stock, and
 * //// the page reads that (guest_ordering._build_menu_from_card).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (msgid, args) =>
		args ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid
})

const { default: GuestMenuView } = await import("../GuestMenuView.vue")
const { useGuestOrderStore } = await import("@/stores/guestOrder")

const NONE_LEFT = { item_code: "S", item_name: "Sparkling", price: 4, is_stock_item: true, in_stock: false }
const IN_STOCK = { item_code: "W", item_name: "Water", price: 3, is_stock_item: true, in_stock: true }
const NOT_STOCKED = { item_code: "T", item_name: "Tart", price: 6 }

function menu() {
	setActivePinia(createPinia())
	useGuestOrderStore().menuCategories = [{ label: "Drinks", menu_items: [NONE_LEFT, IN_STOCK, NOT_STOCKED] }]
	return mount(GuestMenuView, { global: { mocks: { __: globalThis.__ } } })
}

describe("a stock dish on the guest's menu", () => {
	it("is sold out when the server says it is not in stock", () => {
		expect(menu().vm.isOutOfStock(NONE_LEFT)).toBe(true)
	})

	it("is offered when the server says it is in stock", () => {
		expect(menu().vm.isOutOfStock(IN_STOCK)).toBe(false)
	})

	it("is offered when it is no stock item", () => {
		expect(menu().vm.isOutOfStock(NOT_STOCKED)).toBe(false)
	})

	it("does not read a quantity any more", () => {
		expect(menu().vm.isOutOfStock({ ...IN_STOCK, actual_qty: 0 })).toBe(false)
	})
})
