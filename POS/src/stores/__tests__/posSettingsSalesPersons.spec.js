//// Neoffice — added file (no upstream equivalent). The till asks for a sales person only when its setting says so (NeoSalon, lot G1, product owner, 09.11.2026).
// The option was read as « not Disabled », which is true of a settings answer that carries no value (null, empty, an older server): the till then asked
// for a sales person nobody had switched on. The tick of the products is read only where the option is on.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const bootstrap = { getPreloadedPOSSettings: vi.fn(() => null) }

vi.mock("../bootstrap", () => ({ useBootstrapStore: () => bootstrap }))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("frappe-ui", () => ({ createResource: () => ({ submit: vi.fn() }) }))

const { usePOSSettingsStore } = await import("../posSettings")

function tillWith(values) {
	const store = usePOSSettingsStore()
	Object.assign(store.settings, values)
	return store
}

describe("the option « who did the work »", () => {
	beforeEach(() => setActivePinia(createPinia()))

	it("is off by default", () => {
		const store = usePOSSettingsStore()
		expect(store.enableSalesPersons).toBe(false)
		expect(store.salesPersonsMode).toBe("Disabled")
		expect(store.trackProductSalesByPerson).toBe(false)
	})

	it("is off for a value that is missing, null or empty", () => {
		for (const value of [null, undefined, "", "Everybody"]) {
			const store = tillWith({ enable_sales_persons: value })
			expect(store.enableSalesPersons).toBe(false)
			expect(store.salesPersonsMode).toBe("Disabled")
		}
	})

	it("is on for one person and for several", () => {
		expect(
			tillWith({ enable_sales_persons: "Single" }).enableSalesPersons,
		).toBe(true)
		expect(
			tillWith({ enable_sales_persons: "Multiple" }).enableSalesPersons,
		).toBe(true)
		expect(usePOSSettingsStore().salesPersonsMode).toBe("Multiple")
	})

	it("follows the products only where the option is on and the tick is on", () => {
		expect(
			tillWith({
				enable_sales_persons: "Single",
				track_product_sales_by_person: 1,
			}).trackProductSalesByPerson,
		).toBe(true)
		expect(
			tillWith({
				enable_sales_persons: "Single",
				track_product_sales_by_person: 0,
			}).trackProductSalesByPerson,
		).toBe(false)
		expect(
			tillWith({
				enable_sales_persons: "Single",
				track_product_sales_by_person: "1",
			}).trackProductSalesByPerson,
		).toBe(true)
		expect(
			tillWith({
				enable_sales_persons: "Disabled",
				track_product_sales_by_person: 1,
			}).trackProductSalesByPerson,
		).toBe(false)
	})
})
