/**
 * //// Neoffice — added file (no upstream equivalent). « Offert » in the line dialog (NeoResto lot 1, task 24): a button
 * //// « Offert », then the quantity offered — 1 by default, from 1 to the line's quantity, « Tout » for the whole line —
 * //// and Confirm, the dialog's one primary action while it is open (ink, never clay).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? String(s).replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
})

vi.mock("frappe-ui", () => ({
	Button: {
		props: ["variant", "disabled"],
		emits: ["click"],
		template:
			"<button :data-variant='variant' :disabled='disabled' @click=\"$emit('click')\"><slot /></button>",
	},
	FeatherIcon: { props: ["name"], template: "<i :data-icon='name' />" },
	createResource: () => ({ submit: vi.fn() }),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showWarning: vi.fn(),
	}),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({
		allowItemDiscount: true,
		allowUserToEditRate: false,
		maxDiscountAllowed: 0,
		enableSalesPersons: false,
		settings: {},
	}),
}))
vi.mock("@/stores/posOffers", () => ({
	usePOSOffersStore: () => ({ availableOffers: [] }),
}))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ currentProfile: null }),
}))
vi.mock("@/stores/serialNumber", () => ({
	useSerialNumberStore: () => ({ returnSerials: vi.fn() }),
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/utils/stockValidator", () => ({ getItemStock: vi.fn() }))
vi.mock("@/utils/salesPersonsList", () => ({
	loadSalesPersonsForProfile: vi.fn(async () => []),
}))

const { default: EditItemDialog } = await import("../EditItemDialog.vue")

const line = {
	item_code: "TIRAMISU",
	item_name: "Tiramisu",
	rate: 9.5,
	price_list_rate: 9.5,
	quantity: 3,
	uom: "Nos",
	stock_uom: "Nos",
	discount_percentage: 0,
	discount_amount: 0,
}

function open(props = {}) {
	return mount(EditItemDialog, {
		props: {
			modelValue: true,
			item: { ...line },
			currency: "CHF",
			canOffer: true,
			...props,
		},
		global: {
			mocks: { __: globalThis.__ },
			stubs: { teleport: true, SelectInput: true },
		},
	})
}

const find = (wrapper, test) => wrapper.find(`[data-test="${test}"]`)

describe("« Offert » in the line dialog", () => {
	// The dialog reads the cart's store for the course of the line (service families): a real, empty store
	beforeEach(() => setActivePinia(createPinia()))

	it("is offered only where the line may be offered", () => {
		expect(find(open(), "offer-start").exists()).toBe(true)
		expect(find(open({ canOffer: false }), "offer-start").exists()).toBe(false)
	})

	it("asks the quantity offered: 1 by default, never below 1 nor above the line, « Tout » for the whole line", async () => {
		const wrapper = open()
		await find(wrapper, "offer-start").trigger("click")
		const qty = () => Number(find(wrapper, "offer-qty").element.value)
		expect(find(wrapper, "offer-panel").exists()).toBe(true)
		expect(qty()).toBe(1)
		await find(wrapper, "offer-minus").trigger("click")
		expect(qty()).toBe(1)
		await find(wrapper, "offer-plus").trigger("click")
		await find(wrapper, "offer-plus").trigger("click")
		await find(wrapper, "offer-plus").trigger("click")
		expect(qty()).toBe(3)
		await find(wrapper, "offer-minus").trigger("click")
		expect(qty()).toBe(2)
		await find(wrapper, "offer-all").trigger("click")
		expect(qty()).toBe(3)
		// A typed quantity is brought back within the line's
		await find(wrapper, "offer-qty").setValue("8")
		await find(wrapper, "offer-qty").trigger("blur")
		expect(qty()).toBe(3)
		// The value offered is read at the list price
		expect(find(wrapper, "offer-value").text()).toContain("28.50")
	})

	it("Confirm offers the quantity and closes; the line's own edits are not sent", async () => {
		const wrapper = open()
		await find(wrapper, "offer-start").trigger("click")
		await find(wrapper, "offer-plus").trigger("click")
		await find(wrapper, "offer-confirm").trigger("click")
		expect(wrapper.emitted("offer-item")).toEqual([[{ quantity: 2 }]])
		expect(wrapper.emitted("update-item")).toBeUndefined()
		expect(wrapper.emitted("update:modelValue")).toEqual([[false]])
	})

	it("Confirm is the one primary action while the offer is open, and it is ink (solid), never clay", async () => {
		const wrapper = open()
		await find(wrapper, "offer-start").trigger("click")
		const solid = wrapper.findAll("button[data-variant='solid']")
		expect(solid).toHaveLength(1)
		expect(solid[0].attributes("data-test")).toBe("offer-confirm")
		expect(find(wrapper, "offer-confirm").classes().join(" ")).not.toMatch(
			/clay|#D68A59|d68a59/i,
		)
	})

	it("Cancel closes the offer and offers nothing; Update Item is back", async () => {
		const wrapper = open()
		await find(wrapper, "offer-start").trigger("click")
		await find(wrapper, "offer-cancel").trigger("click")
		await nextTick()
		expect(find(wrapper, "offer-panel").exists()).toBe(false)
		expect(wrapper.emitted("offer-item")).toBeUndefined()
		expect(wrapper.emitted("update:modelValue")).toBeUndefined()
		expect(wrapper.text()).toContain("Update Item")
	})

	it("a weighed line below 1 is offered whole", async () => {
		const wrapper = open({
			item: { ...line, quantity: 0.35, uom: "Kg", stock_uom: "Kg" },
		})
		await find(wrapper, "offer-start").trigger("click")
		expect(Number(find(wrapper, "offer-qty").element.value)).toBe(0.35)
		await find(wrapper, "offer-confirm").trigger("click")
		expect(wrapper.emitted("offer-item")).toEqual([[{ quantity: 0.35 }]])
	})
})
