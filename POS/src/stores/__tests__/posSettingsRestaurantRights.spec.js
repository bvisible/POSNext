//// Neoffice — added file (no upstream equivalent). What a user may manage of the restaurant comes with the till's
//// settings (`restaurant_can`, NeoRestau lot 1, task 3) and is that user's: it is nothing before the settings are
//// loaded, and nothing again once they are reset, so that the next cashier is told his own rights.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const bootstrap = { getPreloadedPOSSettings: vi.fn(() => null) }

vi.mock("../bootstrap", () => ({ useBootstrapStore: () => bootstrap }))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("frappe-ui", () => ({ createResource: () => ({ submit: vi.fn() }) }))

const { usePOSSettingsStore } = await import("../posSettings")

describe("posSettings: what the user may manage of the restaurant", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		bootstrap.getPreloadedPOSSettings.mockReset()
	})

	it("is nothing before the settings are loaded", () => {
		expect(usePOSSettingsStore().settings.restaurant_can).toEqual({})
	})

	it("is what the loaded settings say, and nothing again once they are reset", async () => {
		const store = usePOSSettingsStore()
		bootstrap.getPreloadedPOSSettings.mockReturnValue({ restaurant_can: { manage_floor: true } })

		await store.loadSettings("Till")
		expect(store.settings.restaurant_can).toEqual({ manage_floor: true })

		store.resetSettings()

		expect(store.settings.restaurant_can).toEqual({})
	})
})
