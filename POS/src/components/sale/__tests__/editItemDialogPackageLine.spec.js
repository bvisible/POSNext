/**
 * //// Neoffice — added file (no upstream equivalent). The line dialog of a line a package of sessions pays (NeoSalon lots G11, voie 4: the audit of 18.11): the price and the discount are
 * //// locked, with the reason in the package's words (not « promotional offer »), « Give the session back » is the one way out, and nothing offers the line, already worth nothing.
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
		// Open on purpose: only the package may lock the price here
		allowUserToEditRate: true,
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
	quantity: 1,
	uom: "Nos",
	stock_uom: "Nos",
	discount_percentage: 0,
	discount_amount: 0,
}
const paid = { ...line, customer_package: "CPK-1", package_label: "Settled by the package · 1 session", discount_percentage: 100, discount_amount: 9.5 }

function open(props = {}) {
	return mount(EditItemDialog, {
		props: {
			modelValue: true,
			item: { ...line },
			currency: "CHF",
			canOffer: false,
			...props,
		},
		global: {
			mocks: { __: globalThis.__ },
			stubs: { teleport: true, SelectInput: true },
		},
	})
}

const find = (wrapper, test) => wrapper.find(`[data-test="${test}"]`)

describe("the line dialog of a line a package pays", () => {
	beforeEach(() => setActivePinia(createPinia()))

	it("locks the price and the discount, and says it is the package's", () => {
		const wrapper = open({ item: { ...paid }, paidByPackage: true })
		const fields = wrapper.findAll("input[type='number'][step='0.01']")

		expect(fields.length).toBeGreaterThanOrEqual(2)
		for (const field of fields) expect(field.attributes("readonly")).toBeDefined()
		expect(wrapper.text()).toContain("Locked (paid by a package)")
		expect(wrapper.text()).not.toContain("Locked (promotional offer)")
	})

	it("keeps the price and the discount of an ordinary line editable", () => {
		const wrapper = open({ item: { ...line } })
		const [rate, discount] = wrapper.findAll("input[type='number'][step='0.01']")

		expect(rate.attributes("readonly")).toBeUndefined()
		expect(discount.attributes("disabled")).toBeUndefined()
		expect(wrapper.text()).not.toContain("Locked (paid by a package)")
	})

	it("gives the session back from the dialog, the one way out of the package", async () => {
		const wrapper = open({ item: { ...paid }, paidByPackage: true })

		await find(wrapper, "package-release").trigger("click")

		expect(wrapper.emitted("release-package")).toHaveLength(1)
		expect(find(wrapper, "offer-start").exists()).toBe(false)
	})
})
