/**
 * //// Neoffice — added file (no upstream equivalent). The QZ Tray printer of this computer, cleared on the till's
 * //// settings screen, is forgotten for good (NeoResto lot 1, task 13, fix round 2): the composable keeps only a
 * //// chosen name in the browser's storage, and printing falls back to the stored name, so a printer cleared in
 * //// memory came back at the next reload. This runs the real composable and the real storage; only QZ Tray itself
 * //// (the websocket library) and the server are stood in for.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

const KEY = "pos_qz_printer_name"
const call = vi.hoisted(() => vi.fn(async () => null))

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_m, i) => args[i]) : text)
	// The printer this computer chose earlier, as the composable reads it when it is first loaded
	localStorage.setItem("pos_qz_printer_name", "Counter printer")
})

vi.mock("qz-tray", () => ({
	default: {
		websocket: {
			isActive: () => false,
			connect: vi.fn(async () => {
				throw new Error("QZ Tray is not running")
			}),
			disconnect: vi.fn(),
			setClosedCallbacks: vi.fn(),
		},
		security: { setCertificatePromise: vi.fn(), setSignatureAlgorithm: vi.fn(), setSignaturePromise: vi.fn() },
		printers: { find: vi.fn(async () => []) },
		configs: { create: vi.fn() },
		print: vi.fn(),
		api: { setSha256Type: vi.fn(), setPromiseType: vi.fn() },
	},
}))
vi.mock("frappe-ui", () => ({ call }))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock("@/composables/usePOSEvents", () => ({
	usePOSEvents: () => ({ detectSettingsChanges: vi.fn(), emitStockSyncConfigured: vi.fn(), emit: vi.fn() }),
}))
vi.mock("@/stores/cloudPrnt", () => ({ useCloudPrntStore: () => ({ load: vi.fn(async () => null) }) }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ currentProfile: {} }) }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => ({}) }))
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: {
		getStockSyncStatus: vi.fn(async () => ({ enabled: false, itemCount: 0, lastSync: null })),
		configureStockSync: vi.fn(),
		startStockSync: vi.fn(),
		stopStockSync: vi.fn(),
	},
}))
vi.mock("@/utils/currency", () => ({ formatTime: () => "12:00" }))

const { default: POSSettings } = await import("../POSSettings.vue")
const { getSavedPrinterName } = await import("@/utils/qzTray")

const READ = "pos_next.till_settings.api.get_till_settings"

function setting(key, overrides) {
	return {
		key,
		field: key,
		doctype: "POS Settings",
		store: "document",
		tab: "printing",
		group: "qz_tray",
		label: key,
		help: `What ${key} does`,
		widget: "check",
		kind: "setting",
		till: "all",
		depends_on: [],
		indent: false,
		desk_only: false,
		options: [],
		min: null,
		max: null,
		search: null,
		placeholder: "",
		applies: null,
		editable: true,
		required: false,
		...overrides,
	}
}

const ANSWER = {
	pos_profile: "Shop till",
	restaurant_till: false,
	restaurant: "",
	restaurant_name: "",
	can: { till: true, restaurant: false },
	tabs: [{ key: "printing", label: "Printing", section: "till" }],
	groups: [{ key: "qz_tray", tab: "printing", label: "Printing through QZ Tray", column: 1, scope: "computer" }],
	settings: [
		setting("silent_print"),
		setting("qz_printer", {
			doctype: null,
			store: "device",
			widget: "special",
			depends_on: [{ key: "silent_print", equals: null, off: false }],
			indent: true,
		}),
	],
	values: { silent_print: 1 },
	choices: {},
	status: {},
}

let wrapper

afterEach(() => wrapper?.unmount())

describe("this computer's QZ Tray printer", () => {
	it("is forgotten in the browser's storage when it is cleared, so a reload does not bring it back", async () => {
		call.mockImplementation(async (method) => (method === READ ? ANSWER : null))
		expect(getSavedPrinterName()).toBe("Counter printer")
		wrapper = mount(POSSettings, {
			props: { modelValue: false, posProfile: "Shop till" },
			global: { mocks: { __: globalThis.__ } },
		})
		await wrapper.setProps({ modelValue: true })
		await flushPromises()

		await wrapper.find("[data-setting='qz_printer'] select").setValue("")
		await wrapper.find("button[data-action='save']").trigger("click")
		await flushPromises()

		expect(localStorage.getItem(KEY) || "").toBe("")
		expect(getSavedPrinterName()).toBe("")
	})
})
