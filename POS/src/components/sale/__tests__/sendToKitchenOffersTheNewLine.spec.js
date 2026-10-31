/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen dialog offers the new unit of a dish that has already
 * //// been sent, on a line of its own, and marks that line when it is sent (NeoRestau lot 1, task 22, fix round 1).
 * //// The extra unit used to be added to the line the kitchen already had: billed, never offered, never sent. And the
 * //// dialog found the line to mark by the item and its unit alone, so with two lines of the same dish (the one sent,
 * //// the one that waits) it marked the first.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
	Button: { template: "<button><slot /></button>" },
	Dialog: {
		template: "<div><slot name='body-content' /><slot name='actions' /></div>",
	},
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showWarning: vi.fn(),
		showInfo: vi.fn(),
	}),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({
		stationLabel: (station) => station,
		getStationForItem: () => ({ station: "Bar", station_name: "Bar" }),
	}),
}))

const { usePOSCartStore } = await import("@/stores/posCart")
const { default: SendToKitchenDialog } = await import(
	"../SendToKitchenDialog.vue"
)
const { cardItemToCartItem } = await import("@/utils/cartLineUnits")

const SENT_WINE = {
	item_code: "wine",
	item_name: "Wine",
	rate: 29,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	item_uoms: [],
	kds_status: "Pending",
	preparation_station: "Bar",
}
const WINE_ENTRY = {
	item_type: "Item",
	item: "wine",
	item_name: "Wine",
	item_group: "Drinks",
	price: 29,
	stock_uom: "Unit",
	item_uoms: [],
}

describe("the kitchen dialog and a dish that has already been sent", () => {
	let cart
	let dialog
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		// The table's order read back: four glasses already with the bar
		cart.addItem({ ...SENT_WINE }, 4)
		dialog = mount(SendToKitchenDialog, {
			global: { mocks: { __: globalThis.__ } },
		})
	})

	// What the dialog shows: each line, whether it can be sent, whether it is ticked
	const offered = () =>
		dialog.vm.dialogItems.map((line) => ({
			quantity: line.quantity,
			status: line.kds_status || "",
			ticked: line.selected,
		}))

	it("offers the new unit, ticked, on a line of its own, and the sent line as sent", () => {
		cart.addItem(cardItemToCartItem(WINE_ENTRY), 1)

		dialog.vm.open()

		expect(offered()).toEqual([
			{ quantity: 4, status: "Pending", ticked: false },
			{ quantity: 1, status: "", ticked: true },
		])
	})

	it("offers the unit added with the + of the stepper too", () => {
		cart.updateItemQuantity("wine", 5, "Unit", cart.invoiceItems[0])

		dialog.vm.open()

		expect(offered()).toEqual([
			{ quantity: 4, status: "Pending", ticked: false },
			{ quantity: 1, status: "", ticked: true },
		])
	})

	it("sends the new line, and marks that line and no other", () => {
		cart.addItem(cardItemToCartItem(WINE_ENTRY), 1)
		const [sent, added] = cart.invoiceItems
		dialog.vm.open()

		dialog.vm.sendSelected()

		expect(added.kds_status).toBe("Pending")
		expect(added.preparation_station).toBe("Bar")
		expect(sent.kds_status).toBe("Pending")
		expect(sent.quantity).toBe(4)
		expect(dialog.emitted("items-sent")).toHaveLength(1)
	})

	it("holds the new line back when it is not ticked, and the line that was sent stays sent", () => {
		cart.addItem(cardItemToCartItem(WINE_ENTRY), 1)
		const [sent, added] = cart.invoiceItems
		dialog.vm.open()
		dialog.vm.deselectAll()

		dialog.vm.sendSelected()

		expect(added.kds_status).toBe("Waiting")
		expect(sent.kds_status).toBe("Pending")
	})
})
