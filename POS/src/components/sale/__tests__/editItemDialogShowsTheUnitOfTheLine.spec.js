/**
 * //// Neoffice — added file (no upstream equivalent). The unit select of « Edit Item Details » (NeoRestau lot 1, task 22).
 * //// A dish added from a restaurant card opened the dialog with « Nos » in the header and an EMPTY unit select: the card
 * //// entry carried no unit, the cart line was born without one, the dialog listed `undefined` as the only option and
 * //// invented « Nos » as the current value. Whatever path added a line, the select shows the unit the line is in and lists
 * //// the item's other units, and no option is ever empty.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
	return { submit: vi.fn() }
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	FeatherIcon: { template: "<i />" },
	call: vi.fn(async () => ({})),
	createResource: () => ({
		submit: mocks.submit,
		reload: vi.fn(),
		fetch: vi.fn(),
	}),
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
	usePOSSettingsStore: () => ({
		shouldEnforceStockValidation: () => false,
		allowUserToEditRate: false,
		allowItemDiscount: false,
		enableSalesPersons: false,
		maxDiscountAllowed: 0,
		settings: { pos_profile: "Restaurant till" },
	}),
}))
vi.mock("@/stores/posOffers", () => ({
	usePOSOffersStore: () => ({ availableOffers: [] }),
}))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({
		currentProfile: { company: "Test Co" },
		profileCompany: "Test Co",
	}),
}))
vi.mock("@/stores/serialNumber", () => ({
	useSerialNumberStore: () => ({ returnSerials: vi.fn() }),
}))
vi.mock("@/utils/stockValidator", () => ({
	getItemStock: vi.fn(),
	shouldValidateItemStock: () => false,
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => ({})) }))
vi.mock("@/utils/salesPersonsList", () => ({
	loadSalesPersonsForProfile: vi.fn(async () => []),
}))

const { default: EditItemDialog } = await import("../EditItemDialog.vue")
const { default: SelectInput } = await import(
	"@/components/common/SelectInput.vue"
)
const { usePOSCartStore } = await import("@/stores/posCart")
const { cardItemToCartItem } = await import("@/utils/cartLineUnits")

// Item entries of a card, as get_active_cards answers them
const WINE = {
	item_type: "Item",
	item: "vin",
	item_name: "Vin",
	item_group: "Drinks",
	price: 29,
	default_price: 29,
	stock_uom: "Unité",
	item_uoms: [],
}
const WATER = {
	item_type: "Item",
	item: "eau",
	item_name: "Eau",
	item_group: "Drinks",
	price: 4.5,
	default_price: 4.5,
	stock_uom: "Bouteille",
	item_uoms: [{ uom: "Caisse", conversion_factor: 6 }],
}

let cart
beforeEach(() => {
	setActivePinia(createPinia())
	cart = usePOSCartStore()
	mocks.submit.mockReset()
})

// The line the till puts in the cart for what a card entry says, through the function the till calls
const lineFromCard = (cardItem) => {
	cart.addItem(cardItemToCartItem(cardItem), 1)
	return cart.invoiceItems.at(-1)
}

async function open(line) {
	const wrapper = mount(EditItemDialog, {
		props: { modelValue: true, item: line, warehouses: [], currency: "CHF" },
		global: { stubs: { teleport: true }, mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	const unitLabel = wrapper
		.findAll("label")
		.find((label) => label.text().startsWith("UOM"))
	const unitSelect = wrapper
		.findAllComponents(SelectInput)
		.find(
			(select) =>
				select.element.parentElement === unitLabel.element.parentElement,
		)
	return {
		wrapper,
		unitSelect,
		shown: () => unitSelect.find("button").text(),
		options: () => unitSelect.props("options"),
		header: () =>
			wrapper.find("p.text-sm.text-gray-500").text().replace(/\s+/g, " "),
	}
}

describe("« Edit Item Details » shows the unit of a line added from a restaurant card", () => {
	it("the unit select shows the unit of the item, and the header names the same unit", async () => {
		const dialog = await open(lineFromCard(WINE))

		expect(dialog.shown()).toBe("Unité")
		expect(dialog.header()).toContain("/ Unité")
		expect(dialog.header()).not.toContain("Nos")
	})

	it("lists the other units of the item, the unit of the line selected", async () => {
		const dialog = await open(lineFromCard(WATER))

		expect(dialog.shown()).toBe("Bouteille")
		expect(dialog.options().map((option) => option.value)).toEqual([
			"Bouteille",
			"Caisse",
		])
	})

	it("changing the unit keeps working for an item with several units", async () => {
		mocks.submit.mockResolvedValue({ price_list_rate: 27 })
		const dialog = await open(lineFromCard(WATER))

		dialog.unitSelect.vm.$emit("update:modelValue", "Caisse")
		await flushPromises()
		const update = dialog.wrapper
			.findAll("button")
			.find((button) => button.text() === "Update Item")
		await update.trigger("click")

		const [line] = dialog.wrapper.emitted("update-item")[0]
		expect(line).toMatchObject({
			uom: "Caisse",
			conversion_factor: 6,
			rate: 27,
			stock_uom: "Bouteille",
		})
		expect(mocks.submit).toHaveBeenCalledWith(
			expect.objectContaining({ item_code: "eau", uom: "Caisse" }),
		)
	})

	it("confirming the dialog without touching the unit keeps the unit of the line, not an invented one", async () => {
		const dialog = await open(lineFromCard(WINE))

		const update = dialog.wrapper
			.findAll("button")
			.find((button) => button.text() === "Update Item")
		await update.trigger("click")

		const [line] = dialog.wrapper.emitted("update-item")[0]
		expect(line.uom).toBe("Unité")
	})
})

describe("« Edit Item Details » shows the unit of a line however it was added", () => {
	// What each path hands to the cart for the same item: a table's order read back from the server carries the unit
	// the line is in (the invoice row's) and nothing about the item's other units
	const ORDER_ROW = {
		item_code: "vin",
		item_name: "Vin",
		rate: 29,
		uom: "Unité",
		conversion_factor: 1,
	}
	// A menu course item, as get_active_menus answers it
	const MENU_ITEM = {
		item_code: "vin",
		item_name: "Vin",
		stock_uom: "Unité",
		item_uoms: [],
	}
	// A grid item (a shop), as get_items answers it
	const GRID_ITEM = {
		item_code: "eau",
		item_name: "Eau",
		rate: 4.5,
		uom: "Bouteille",
		stock_uom: "Bouteille",
		item_uoms: [{ uom: "Caisse", conversion_factor: 6 }],
	}

	it.each([
		["a table's order read back from the server", ORDER_ROW, "Unité"],
		["a menu course item", MENU_ITEM, "Unité"],
		["a grid item", GRID_ITEM, "Bouteille"],
	])("%s", async (_path, source, unit) => {
		cart.addItem({ ...source }, 1)
		const dialog = await open(cart.invoiceItems.at(-1))

		expect(dialog.shown()).toBe(unit)
		expect(dialog.options().map((option) => option.value)).toContain(unit)
	})

	it("never lists an empty option, whatever the line knows of its units", async () => {
		const lines = [
			lineFromCard(WINE),
			lineFromCard(WATER),
			// A line that knows nothing of its units (a draft held before units travelled with the line)
			{ item_code: "x", item_name: "X", rate: 1, quantity: 1 },
		]
		for (const line of lines) {
			const dialog = await open(line)
			for (const option of dialog.options()) {
				expect(option.value).toBeTruthy()
				expect(option.label).toBeTruthy()
			}
		}
	})
})

describe("« Edit Item Details » for a line that knows no unit at all", () => {
	// A held ticket from before units travelled with the line: nobody can tell the unit, so the dialog says none
	const NO_UNIT = { item_code: "vin", item_name: "Vin", rate: 29, quantity: 1 }

	it("never invents « Nos »: no unit in the header, an empty select with nothing to choose, nothing written on the line", async () => {
		cart.addItem({ ...NO_UNIT }, 1)
		const dialog = await open(cart.invoiceItems.at(-1))

		expect(dialog.shown()).toBe("")
		expect(dialog.header()).toBe("CHF 29.00")
		expect(dialog.options()).toEqual([])

		const update = dialog.wrapper
			.findAll("button")
			.find((button) => button.text() === "Update Item")
		await update.trigger("click")
		const [line] = dialog.wrapper.emitted("update-item")[0]
		expect(line.uom).toBeFalsy()
	})
})
