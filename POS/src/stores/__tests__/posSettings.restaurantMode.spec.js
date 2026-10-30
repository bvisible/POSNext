//// Neoffice — added file (no upstream equivalent). The till's restaurant mode is what the SERVER says it is
//// (NeoRestau lot 1, task 4): the till's own POS Settings, counted only where the site runs NeoRestau, and only for a
//// till that names its restaurant. Nothing on the device decides it any more: the old per-device memory is dropped,
//// no store action flips the mode, and the store holds no second copy of the answer.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const bootstrap = { getPreloadedPOSSettings: vi.fn(() => null) }
let apiSettings = {}

vi.mock("../bootstrap", () => ({ useBootstrapStore: () => bootstrap }))
// The settings resource answers with whatever the test put in apiSettings, like get_pos_settings would.
vi.mock("frappe-ui", () => ({
	createResource: (options) => ({
		submit: vi.fn(async () => {
			options.onSuccess(apiSettings)
			return apiSettings
		}),
	}),
}))

const { usePOSSettingsStore } = await import("../posSettings")

describe("posSettings: the old device memory of the restaurant mode", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		localStorage.clear()
		bootstrap.getPreloadedPOSSettings.mockReset()
		bootstrap.getPreloadedPOSSettings.mockReturnValue(null)
		apiSettings = {}
	})

	// Already true since lot 0 removed the header switch (posSettingsRestaurantMode.spec.js has the full matrix):
	// kept here as the regression test of this task's brief.
	it("ignores and removes the old browser memory", async () => {
		localStorage.setItem("pos_next_restaurant_mode", "1")
		apiSettings = { enabled: 1, enable_restaurant_mode: 0 }
		const store = usePOSSettingsStore()

		await store.loadSettings("POS-1")

		expect(store.settings.enable_restaurant_mode).toBeFalsy()
		expect(localStorage.getItem("pos_next_restaurant_mode")).toBeNull()
	})

	it("has no way left to toggle restaurant mode from the till", () => {
		expect(usePOSSettingsStore().toggleRestaurantMode).toBeUndefined()
	})

	it("holds no second copy of the mode: the settings the server sent are the one source", () => {
		expect(usePOSSettingsStore().enableRestaurantMode).toBeUndefined()
	})
})

describe("posSettings: whether the site runs NeoRestau", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		bootstrap.getPreloadedPOSSettings.mockReset()
		bootstrap.getPreloadedPOSSettings.mockReturnValue(null)
		apiSettings = {}
	})

	it("is off until the server says so", () => {
		expect(usePOSSettingsStore().settings.neorestau_active).toBe(false)
	})

	it.each([true, false])(
		"carries what the bootstrap sent (%s)",
		async (active) => {
			bootstrap.getPreloadedPOSSettings.mockReturnValue({
				enabled: 1,
				neorestau_active: active,
			})
			const store = usePOSSettingsStore()

			await store.loadSettings("POS-1")

			expect(store.settings.neorestau_active).toBe(active)
		},
	)

	it("is forgotten with the rest of the settings when the next user signs in", async () => {
		apiSettings = {
			enabled: 1,
			neorestau_active: true,
			enable_restaurant_mode: 1,
		}
		const store = usePOSSettingsStore()
		await store.loadSettings("POS-1")

		store.resetSettings()

		expect(store.settings.neorestau_active).toBe(false)
		expect(store.settings.enable_restaurant_mode).toBe(0)
	})
})
