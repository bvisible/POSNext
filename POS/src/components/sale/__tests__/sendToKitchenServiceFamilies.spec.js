/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen dialog's boxes are ticked by the rhythm of the meal
 * //// (NeoResto lot 1, service families): at a table, the drinks and the first food family present are ticked, the other food
 * //// is not (the dialog then holds it back); at the counter, on a takeaway and on a site that sets no family, everything is
 * //// ticked, as before. The boxes stay editable: the dialog is the waiter's escape hatch. The rule is the one the server
 * //// decides by (utils/serviceFamilies.js, tested against the same table of examples).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
//// Neoffice — the restaurant's service rhythm is the store's (NeoResto lot 1, Daniel, 01.11); a test changes it
const restaurantStore = vi.hoisted(() => ({
	stationLabel: (station) => station,
	getStationForItem: () => null,
	serviceRhythm: "Called by the room",
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))

const { usePOSCartStore } = await import("@/stores/posCart")
const { setGroupFamilies } = await import("@/utils/serviceFamilies")
const { default: SendToKitchenDialog } = await import(
	"../SendToKitchenDialog.vue"
)

const dish = (code, group, more = {}) => ({
	item_code: code,
	item_name: code,
	item_group: group,
	rate: 10,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	item_uoms: [],
	...more,
})

describe("the kitchen dialog, for the rhythm of a meal", () => {
	let cart
	let dialog
	beforeEach(() => {
		restaurantStore.serviceRhythm = "Called by the room"
		setActivePinia(createPinia())
		setGroupFamilies({
			Wine: "Drink",
			Soups: "Starter",
			Pasta: "Main",
			Cakes: "Dessert",
		})
		cart = usePOSCartStore()
		dialog = mount(SendToKitchenDialog, {
			global: { mocks: { __: globalThis.__ } },
		})
	})
	afterEach(() => setGroupFamilies({}))

	const fullOrder = () => {
		cart.addItem(dish("RED", "Wine"))
		cart.addItem(dish("SOUP", "Soups"))
		cart.addItem(dish("PENNE", "Pasta"))
		cart.addItem(dish("TART", "Cakes"))
	}
	// The boxes as the dialog opens: one tick (or not) per line, in order
	const ticks = () =>
		dialog.vm.dialogItems.map((line) => Boolean(line.selected))

	it("ticks the drinks and the starters of a table, and not the mains and the desserts", () => {
		cart.setRestaurantTable({ name: "T1" })
		fullOrder()

		dialog.vm.open()

		expect(ticks()).toEqual([true, true, false, false])
	})

	it("ticks the mains with the drinks when there is no starter", () => {
		cart.setRestaurantTable({ name: "T1" })
		cart.addItem(dish("RED", "Wine"))
		cart.addItem(dish("PENNE", "Pasta"))
		cart.addItem(dish("TART", "Cakes"))

		dialog.vm.open()

		expect(ticks()).toEqual([true, true, false])
	})

	it("ticks everything on a takeaway order", () => {
		cart.setRestaurantTable({ name: "T1" })
		cart.isTakeaway = true
		fullOrder()

		dialog.vm.open()

		expect(ticks()).toEqual([true, true, true, true])
	})

	it("ticks everything at the counter", () => {
		fullOrder()

		dialog.vm.open()

		expect(ticks()).toEqual([true, true, true, true])
	})

	it("ticks everything on a site that sets no family", () => {
		setGroupFamilies({})
		cart.setRestaurantTable({ name: "T1" })
		fullOrder()

		dialog.vm.open()

		expect(ticks()).toEqual([true, true, true, true])
	})

	it("follows the family the waiter gave a line: a starter taken as a main goes with the mains", () => {
		cart.setRestaurantTable({ name: "T1" })
		fullOrder()
		cart.setServiceFamily(cart.invoiceItems[1], "Main")

		dialog.vm.open()

		expect(ticks()).toEqual([true, true, true, false])
	})

	it("sends a starter added later at once, the held mains stay held and unticked", () => {
		cart.setRestaurantTable({ name: "T1" })
		cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
		cart.addItem(dish("PENNE", "Pasta", { kds_status: "Waiting" }))
		cart.addItem(dish("SALAD", "Soups"))

		dialog.vm.open()

		const lines = dialog.vm.dialogItems
		expect(
			lines.map((line) => [line.item_code, Boolean(line.selected)]),
		).toEqual([
			["SOUP", false],
			["PENNE", false],
			["SALAD", true],
		])
	})

	it("holds a main added while the mains are held, with them", () => {
		cart.setRestaurantTable({ name: "T1" })
		cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
		cart.addItem(dish("PENNE", "Pasta", { kds_status: "Waiting" }))
		cart.addItem(dish("STEAK", "Pasta"))

		dialog.vm.open()

		expect(dialog.vm.dialogItems.map((line) => Boolean(line.selected))).toEqual(
			[false, false, false],
		)
	})

	it("leaves the boxes the waiter's to change: ticking a main sends it", () => {
		cart.setRestaurantTable({ name: "T1" })
		fullOrder()
		dialog.vm.open()
		dialog.vm.dialogItems[2].selected = true

		dialog.vm.sendSelected()

		expect(cart.invoiceItems.map((line) => line.kds_status)).toEqual([
			"Pending",
			"Pending",
			"Pending",
			"Waiting",
		])
		expect(dialog.emitted("items-sent")).toHaveLength(1)
	})

	it("holds back the lines it does not tick, and a held line keeps its family", () => {
		cart.setRestaurantTable({ name: "T1" })
		fullOrder()
		dialog.vm.open()

		dialog.vm.sendSelected()

		expect(
			cart.invoiceItems.map((line) => [line.kds_status, line.service_family]),
		).toEqual([
			["Pending", "Drink"],
			["Pending", "Starter"],
			["Waiting", "Main"],
			["Waiting", "Dessert"],
		])
	})

	it("names the course of each line it shows", () => {
		cart.setRestaurantTable({ name: "T1" })
		fullOrder()

		dialog.vm.open()

		return dialog.vm.$nextTick().then(() => {
			const rows = dialog
				.findAll("[data-service-family-label]")
				.map((row) => row.text())
			expect(rows).toEqual(["Drink", "Starter", "Main", "Dessert"])
		})
	})

	it("names no course where no family is set", () => {
		setGroupFamilies({})
		cart.setRestaurantTable({ name: "T1" })
		fullOrder()

		dialog.vm.open()

		return dialog.vm.$nextTick().then(() => {
			expect(dialog.findAll("[data-service-family-label]")).toHaveLength(0)
		})
	})

	//// Neoffice — where the kitchen prepares ahead (NeoResto lot 1, the service rhythm, Daniel, 01.11): everything is ticked, and what would have been held is sent marked ahead
	describe("where the kitchen prepares ahead", () => {
		beforeEach(() => {
			restaurantStore.serviceRhythm = "Prepared ahead"
		})

		it("ticks every line of a table: the later courses leave too", () => {
			cart.setRestaurantTable({ name: "T1" })
			fullOrder()

			dialog.vm.open()

			expect(ticks()).toEqual([true, true, true, true])
		})

		it("sends the lines the room would have held marked ahead, and the others as they always were", () => {
			cart.setRestaurantTable({ name: "T1" })
			fullOrder()
			dialog.vm.open()

			dialog.vm.sendSelected()

			expect(
				cart.invoiceItems.map((line) => [line.kds_status, Boolean(line.kds_ahead)]),
			).toEqual([
				["Pending", false],
				["Pending", false],
				["Pending", true],
				["Pending", true],
			])
		})

		it("holds back a line the waiter unticked, as ever: that is the waiter's own word, not a line ahead", () => {
			cart.setRestaurantTable({ name: "T1" })
			fullOrder()
			dialog.vm.open()
			dialog.vm.dialogItems[3].selected = false

			dialog.vm.sendSelected()

			expect(
				cart.invoiceItems.map((line) => [line.kds_status, Boolean(line.kds_ahead)]),
			).toEqual([
				["Pending", false],
				["Pending", false],
				["Pending", true],
				["Waiting", false],
			])
		})

		it("sends a main added once the mains left ahead ahead too, and a starter added late at once", () => {
			cart.setRestaurantTable({ name: "T1" })
			cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
			cart.addItem(dish("PENNE", "Pasta", { kds_status: "Pending", kds_ahead: 1 }))
			cart.addItem(dish("STEAK", "Pasta"))
			cart.addItem(dish("SALAD", "Soups"))
			dialog.vm.open()

			dialog.vm.sendSelected()

			expect(
				cart.invoiceItems.map((line) => [line.item_code, Boolean(line.kds_ahead)]),
			).toEqual([
				["SOUP", false],
				["PENNE", true],
				["STEAK", true],
				["SALAD", false],
			])
		})

		it("marks nothing ahead on a takeaway order or at the counter", () => {
			fullOrder()
			dialog.vm.open()
			dialog.vm.sendSelected()
			expect(cart.invoiceItems.map((line) => Boolean(line.kds_ahead))).toEqual([false, false, false, false])
		})
	})
})

