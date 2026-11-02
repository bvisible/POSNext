//// Neoffice — added file (no upstream equivalent). « Block a sale beyond the stock » means what it says at the till
//// too (NeoResto lot 1, task 13, ruling 82): where the site allows negative stock the till's box decides whether an
//// item beyond the stock is refused when it is added; where the site refuses negative stock the till refuses it
//// whatever the box says (ERPNext would refuse to book the sale). Upstream's guard read the site's setting only.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const bootstrap = { getPreloadedPOSSettings: vi.fn(() => null) }

vi.mock("../bootstrap", () => ({ useBootstrapStore: () => bootstrap }))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("frappe-ui", () => ({ createResource: () => ({ submit: vi.fn() }) }))

const { usePOSSettingsStore } = await import("../posSettings")

function tillWhere({ siteAllows, box, enabled = 1 }) {
	const store = usePOSSettingsStore()
	Object.assign(store.settings, {
		enabled,
		allow_negative_stock: siteAllows ? 1 : 0,
		posa_block_sale_beyond_available_qty: box,
	})
	return store
}

describe("the till's guard against a sale beyond the stock", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it("follows the box where the site allows negative stock", () => {
		expect(tillWhere({ siteAllows: true, box: 1 }).shouldEnforceStockValidation()).toBe(true)
		expect(tillWhere({ siteAllows: true, box: 0 }).shouldEnforceStockValidation()).toBe(false)
	})

	it("blocks whatever the box says where the site refuses negative stock", () => {
		expect(tillWhere({ siteAllows: false, box: 1 }).shouldEnforceStockValidation()).toBe(true)
		expect(tillWhere({ siteAllows: false, box: 0 }).shouldEnforceStockValidation()).toBe(true)
	})

	it("blocks, as the box's own default, when the server did not say", () => {
		expect(tillWhere({ siteAllows: true, box: undefined }).shouldEnforceStockValidation()).toBe(true)
	})

	it("starts with the box ticked, as the field's default", () => {
		setActivePinia(createPinia())
		expect(usePOSSettingsStore().settings.posa_block_sale_beyond_available_qty).toBe(1)
	})

	it("checks nothing on a till whose settings are switched off, as upstream", () => {
		expect(tillWhere({ siteAllows: false, box: 1, enabled: 0 }).shouldEnforceStockValidation()).toBe(false)
	})
})
