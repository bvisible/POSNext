/**
 * //// Neoffice — added file (no upstream equivalent). The boot of the till keeps its staff signed in (NeoRestau lot 1, product
 * //// owner, 01.11.2026): the moment the till's profile is known, however its settings arrive (handed over by the bootstrap,
 * //// or fetched on their own) and whoever loads them (the page's start, a shift opened later), the endpoint is called ONCE with
 * //// the profile; a call that fails never stops the settings from loading.
 * @vitest-environment jsdom
 */
import { flushPromises } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const bootstrap = vi.hoisted(() => ({ getPreloadedPOSSettings: vi.fn(() => null) }))
let apiSettings = {}

vi.mock("../bootstrap", () => ({ useBootstrapStore: () => bootstrap }))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/utils/logger", () => ({
	logger: { create: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))
vi.mock("frappe-ui", () => ({
	createResource: (options) => ({
		submit: vi.fn(async () => {
			options.onSuccess(apiSettings)
			return apiSettings
		}),
	}),
}))

const { usePOSSettingsStore } = await import("../posSettings")
const { forgetKeepSignedIn } = await import("@/utils/keepSignedIn")

const KEEP = "pos_next.api.session.keep_signed_in"
const keepCalls = () => call.mock.calls.filter(([method]) => method === KEEP)

const LOADS = {
	"bootstrap preload": () => bootstrap.getPreloadedPOSSettings.mockReturnValue({ enabled: 1 }),
	"API fallback": () => {
		bootstrap.getPreloadedPOSSettings.mockReturnValue(null)
		apiSettings = { enabled: 1 }
	},
}

describe("posSettings: the till's profile is known", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		forgetKeepSignedIn()
		call.mockReset()
		call.mockResolvedValue({ days: 30, stamped: true })
		bootstrap.getPreloadedPOSSettings.mockReset()
		apiSettings = {}
	})

	describe.each(Object.entries(LOADS))("%s", (_name, serve) => {
		it("calls the endpoint once with the profile", async () => {
			serve()

			await usePOSSettingsStore().loadSettings("Till 1")
			await flushPromises()

			expect(keepCalls()).toEqual([[KEEP, { pos_profile: "Till 1" }]])
		})

		it("calls it once for the page, whoever loads the settings again (the start, a shift opened later)", async () => {
			serve()
			const store = usePOSSettingsStore()

			await store.loadSettings("Till 1")
			await store.loadSettings("Till 1")
			await flushPromises()

			expect(keepCalls()).toHaveLength(1)
		})

		it("loads the settings all the same when the call fails", async () => {
			serve()
			call.mockRejectedValue(new Error("Not permitted"))
			const store = usePOSSettingsStore()

			await expect(store.loadSettings("Till 1")).resolves.toBe(true)
			await flushPromises()

			expect(store.isLoaded).toBe(true)
			expect(keepCalls()).toHaveLength(1)
		})
	})

	it("calls nothing while there is no profile", async () => {
		const store = usePOSSettingsStore()

		await expect(store.loadSettings("")).resolves.toBe(false)
		await flushPromises()

		expect(keepCalls()).toHaveLength(0)
	})
})
