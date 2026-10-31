/**
 * //// Neoffice — added file (no upstream equivalent). An offered row is part of a dish the guests ordered (NeoRestau lot
 * //// 1, task 24): it goes to the kitchen with its paid line, in the same send, never on a ticket of its own. The send
 * //// dialog lists the dish once (its paid line); sending that line sends the offered rows of the same dish not sent yet.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

const cart = vi.hoisted(() => ({ invoiceItems: [] }))

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? String(s).replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
})
vi.mock("frappe-ui", () => ({
	Dialog: {
		template: "<div><slot name='body-content' /><slot name='actions' /></div>",
	},
	Button: { template: "<button><slot /></button>" },
}))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => cart }))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({
		stationLabel: (s) => s,
		getStationForItem: () => null,
	}),
}))

const { default: SendToKitchenDialog } = await import(
	"../SendToKitchenDialog.vue"
)
const { makeOfferedRow } = await import("@/utils/offeredRows")

const tiramisu = (changes = {}) => ({
	item_code: "TIRAMISU",
	item_name: "Tiramisu",
	rate: 9.5,
	price_list_rate: 9.5,
	quantity: 3,
	uom: "Nos",
	kds_status: "",
	preparation_station: "Kitchen",
	...changes,
})

describe("the send-to-kitchen dialog and an offered row", () => {
	it("lists the dish once, by its paid line, and sends its offered rows with it", () => {
		const paid = tiramisu({ quantity: 2 })
		const offered = makeOfferedRow(tiramisu(), 1)
		const espresso = tiramisu({
			item_code: "ESPRESSO",
			item_name: "Espresso",
			quantity: 1,
		})
		cart.invoiceItems = [offered, paid, espresso]
		const state = mount(SendToKitchenDialog, {
			global: { mocks: { __: globalThis.__ } },
		}).vm.$.setupState
		state.open()
		expect(state.dialogItems.map((i) => [i.item_code, i.quantity])).toEqual([
			["TIRAMISU", 2],
			["ESPRESSO", 1],
		])
		state.selectAll()
		state.sendSelected()
		expect(
			cart.invoiceItems.map((r) => [r.item_code, r.quantity, r.kds_status]),
		).toEqual([
			["TIRAMISU", 1, "Pending"],
			["TIRAMISU", 2, "Pending"],
			["ESPRESSO", 1, "Pending"],
		])
	})

	it("a whole line offered before the send is listed on its own and sent like any dish", () => {
		const offered = makeOfferedRow(tiramisu({ quantity: 2 }), 2)
		const espresso = tiramisu({
			item_code: "ESPRESSO",
			item_name: "Espresso",
			quantity: 1,
		})
		cart.invoiceItems = [offered, espresso]
		const state = mount(SendToKitchenDialog, {
			global: { mocks: { __: globalThis.__ } },
		}).vm.$.setupState
		state.open()
		expect(state.dialogItems.map((i) => [i.item_code, i.quantity])).toEqual([
			["TIRAMISU", 2],
			["ESPRESSO", 1],
		])
		state.selectAll()
		state.sendSelected()
		expect(
			cart.invoiceItems.map((r) => [r.item_code, r.posa_is_offered || 0, r.kds_status]),
		).toEqual([
			["TIRAMISU", 1, "Pending"],
			["ESPRESSO", 0, "Pending"],
		])
	})

	it("a whole line offered and held back stays waiting", () => {
		const offered = makeOfferedRow(tiramisu({ quantity: 2 }), 2)
		cart.invoiceItems = [offered]
		const state = mount(SendToKitchenDialog, {
			global: { mocks: { __: globalThis.__ } },
		}).vm.$.setupState
		state.open()
		state.deselectAll()
		state.sendSelected()
		expect(cart.invoiceItems.map((r) => r.kds_status)).toEqual(["Waiting"])
	})

	it("a dish held back keeps its offered row held back too", () => {
		const paid = tiramisu({ quantity: 2 })
		const offered = makeOfferedRow(tiramisu(), 1)
		cart.invoiceItems = [paid, offered]
		const state = mount(SendToKitchenDialog, {
			global: { mocks: { __: globalThis.__ } },
		}).vm.$.setupState
		state.open()
		state.deselectAll()
		state.dialogItems[0].selected = false
		// Nothing selected: the dialog cannot send; the waiting rows stay waiting
		state.sendSelected()
		expect(cart.invoiceItems.map((r) => r.kds_status)).toEqual([
			"Waiting",
			"Waiting",
		])
	})
})

describe("the line's own send button sends its offered rows", () => {
	it("handleSendSingleItem marks the dish's offered rows not sent yet with it", () => {
		const page = readFileSync(
			path.resolve(__dirname, "../../../pages/POSSale.vue"),
			"utf8",
		)
		expect(page).toMatch(
			/function handleSendSingleItem[\s\S]{0,2200}kitchenFollowers\(cartStore\.invoiceItems, cartItem\)/,
		)
	})
})
