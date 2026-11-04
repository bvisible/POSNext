/**
 * //// Neoffice — added file (no upstream equivalent). The carts of the till's phones in its drafts dialog (scanning in
 * //// the shop, lot 3): each by its code, its customer, its articles and amount, since when and where it stands, and
 * //// « Take over » puts it in the till's cart as its code would. Nothing is asked where the till takes no phone's cart.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { reactive } from "vue"

vi.hoisted(() => {
	globalThis.__ = (s, args) => s.replace(/{(\d+)}/g, (_, n) => args?.[n] ?? _)
})

const fx = vi.hoisted(() => ({
	settings: null,
	cart: null,
	call: null,
	takeOver: null,
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => fx.settings,
}))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({
		profileName: "Shop till",
		profileCurrency: "CHF",
	}),
}))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => fx.cart }))
vi.mock("@/utils/apiWrapper", () => ({ call: (...args) => fx.call(...args) }))
vi.mock("@/utils/currency", () => ({
	formatCurrency: (value, currency) =>
		`${currency} ${Number(value).toFixed(2)}`,
}))
vi.mock("@/composables/useShopCart", () => ({
	useShopCart: () => ({ takeOver: (...args) => fx.takeOver(...args) }),
}))
vi.mock("frappe-ui", () => ({
	Button: {
		emits: ["click"],
		template:
			'<button type="button" @click="$emit(\'click\')"><slot /></button>',
	},
}))

const { default: PhoneCarts } = await import("../PhoneCarts.vue")

const CARTS = [
	{
		code: "K7Q-24M",
		invoice: "FA-1",
		status: "At the counter",
		customer: "C-1",
		customer_name: "Walk-in",
		grand_total: 58.3,
		currency: "CHF",
		articles: 4,
		since: "2026-11-04 14:31:07.1",
		needs_validation: false,
	},
	{
		code: "R4T-15A",
		invoice: "FA-2",
		status: "At the counter",
		customer: "C-1",
		customer_name: "Walk-in",
		grand_total: 58,
		currency: "CHF",
		articles: 1,
		since: "2026-11-04 14:58:00",
		needs_validation: true,
	},
	{
		code: "P9X-07B",
		invoice: "FA-3",
		status: "Scanning",
		customer: "C-1",
		customer_name: "Walk-in",
		grand_total: 23.1,
		currency: "CHF",
		articles: 2,
		since: "2026-11-04 15:04:00",
		needs_validation: false,
	},
]

async function aDialog() {
	const wrapper = mount(PhoneCarts, {
		global: { mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	return wrapper
}

describe("the carts of the phones at the till", () => {
	beforeEach(() => {
		fx.settings = { settings: { enable_shop_scan: 1 } }
		fx.cart = reactive({ shopCartInvoice: null })
		fx.call = vi.fn(async () => structuredClone(CARTS))
		fx.takeOver = vi.fn(async () => true)
	})

	it("lists each cart of the till by its code, customer, articles, amount, hour and state", async () => {
		const rows = (await aDialog()).findAll("li")

		expect(fx.call).toHaveBeenCalledWith(
			"pos_next.api.shop_scan.list_shop_carts",
			{
				pos_profile: "Shop till",
			},
		)
		expect(rows).toHaveLength(3)
		expect(rows[0].text()).toContain("K7Q-24M")
		expect(rows[0].text()).toContain("Walk-in")
		expect(rows[0].text()).toContain("4 articles · CHF 58.30 · 14:31")
		expect(rows[0].text()).toContain("To be paid")
		expect(rows[1].text()).toContain("An article to check")
		expect(rows[2].text()).toContain("The customer is still scanning")
	})

	it("takes a cart over by its code and closes once the till holds it", async () => {
		fx.takeOver = vi.fn(async () => {
			fx.cart.shopCartInvoice = "FA-1"
			return true
		})
		const wrapper = await aDialog()

		await wrapper.findAll("li")[0].find("button").trigger("click")
		await flushPromises()

		expect(fx.takeOver).toHaveBeenCalledWith("K7Q-24M")
		expect(wrapper.emitted("taken-over")).toHaveLength(1)
	})

	it("stays open when the till refuses it over a cart in progress", async () => {
		const wrapper = await aDialog()

		await wrapper.findAll("li")[0].find("button").trigger("click")
		await flushPromises()

		expect(wrapper.emitted("taken-over")).toBeUndefined()
	})

	it("asks nothing and shows nothing where the till takes no phone's cart", async () => {
		fx.settings = { settings: { enable_shop_scan: 0 } }
		const wrapper = await aDialog()

		expect(fx.call).not.toHaveBeenCalled()
		expect(wrapper.find("section").exists()).toBe(false)
	})

	it("shows nothing when the list cannot be read", async () => {
		fx.call = vi.fn(async () => Promise.reject(new Error("offline")))
		vi.spyOn(console, "error").mockImplementation(() => {})

		expect((await aDialog()).find("section").exists()).toBe(false)
	})
})
