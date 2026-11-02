/**
 * //// Neoffice — added file (no upstream equivalent). The « Service » choice also sits in the dialog of the line's note and
 * //// options (NeoResto lot 1, service families), so that the waiter who opens a line to add a remark or an option can give it
 * //// another course in the same place: the field is the line's `service_family`, the one the chip on the line and « Edit Item
 * //// Details » change too. Shown only on a table's order of a restaurant that has set a family; a line the kitchen has keeps its course.
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
	Button: {
		emits: ["click"],
		template:
			"<button :disabled='$attrs.disabled' @click=\"$emit('click')\"><slot /></button>",
	},
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
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileCurrency: "CHF" }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ getModifiersForItem: () => [] }),
}))

const { usePOSCartStore } = await import("@/stores/posCart")
const { setGroupFamilies } = await import("@/utils/serviceFamilies")
const { default: ItemModifiersDialog } = await import(
	"../ItemModifiersDialog.vue"
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

describe("the dialog of a line's note and options, and the Service choice", () => {
	let cart
	let dialog
	beforeEach(() => {
		setActivePinia(createPinia())
		setGroupFamilies({ Soups: "Starter", Pasta: "Main" })
		cart = usePOSCartStore()
		cart.setRestaurantTable({ name: "T1" })
		dialog = mount(ItemModifiersDialog, {
			global: { mocks: { __: globalThis.__ } },
		})
	})
	afterEach(() => setGroupFamilies({}))

	const choice = () => dialog.find("[data-service-choice]")
	const radios = () => choice().findAll("[role=radio]")
	const confirm = () =>
		dialog
			.findAll("button")
			.find((b) => b.text() === "Confirm")
			.trigger("click")

	it("offers the four courses, the line's own chosen", async () => {
		cart.addItem(dish("SOUP", "Soups"))

		dialog.vm.open(cart.invoiceItems[0])
		await dialog.vm.$nextTick()

		expect(radios().map((r) => r.attributes("data-family"))).toEqual([
			"Drink",
			"Starter",
			"Main",
			"Dessert",
		])
		expect(
			radios()
				.filter((r) => r.attributes("aria-checked") === "true")
				.map((r) => r.attributes("data-family")),
		).toEqual(["Starter"])
		expect(choice().text()).toContain("Service")
	})

	it("gives the line the course chosen when the waiter confirms: a starter served with the mains", async () => {
		cart.addItem(dish("SOUP", "Soups"))
		cart.addItem(dish("SALAD", "Soups"))
		dialog.vm.open(cart.invoiceItems[0])
		await dialog.vm.$nextTick()

		await radios()[2].trigger("click")
		await confirm()

		expect(cart.invoiceItems.map((line) => line.service_family)).toEqual([
			"Main",
			"Starter",
		])
		expect(dialog.emitted("saved")).toHaveLength(1)
	})

	it("keeps a remark typed with the course", async () => {
		cart.addItem(dish("SOUP", "Soups"))
		dialog.vm.open(cart.invoiceItems[0])
		await dialog.vm.$nextTick()

		await dialog.find("textarea").setValue("no croutons")
		await radios()[2].trigger("click")
		await confirm()

		expect(cart.invoiceItems[0]).toMatchObject({
			service_family: "Main",
			posa_special_instructions: "no croutons",
		})
	})

	it("is not there at the counter, on a takeaway, or on a site that sets no family", async () => {
		cart.addItem(dish("SOUP", "Soups"))

		cart.setRestaurantTable(null)
		dialog.vm.open(cart.invoiceItems[0])
		await dialog.vm.$nextTick()
		expect(choice().exists()).toBe(false)

		cart.setRestaurantTable({ name: "T1" })
		cart.isTakeaway = true
		dialog.vm.open(cart.invoiceItems[0])
		await dialog.vm.$nextTick()
		expect(choice().exists()).toBe(false)

		cart.isTakeaway = false
		setGroupFamilies({})
		dialog.vm.open(cart.invoiceItems[0])
		await dialog.vm.$nextTick()
		expect(choice().exists()).toBe(false)
	})

	it("shows a line the kitchen has with its course and no way to change it", async () => {
		cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
		dialog.vm.open(cart.invoiceItems[0])
		await dialog.vm.$nextTick()

		expect(radios().every((r) => r.attributes("disabled") !== undefined)).toBe(
			true,
		)

		await confirm()
		expect(cart.invoiceItems[0].service_family).toBe("Starter")
	})
})
