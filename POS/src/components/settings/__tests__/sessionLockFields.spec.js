/**
 * //// Neoffice — added file (no upstream equivalent). The till's settings dialog offers the lock of the till on its Restaurant tab,
 * //// next to "Keep staff signed in (days)" (NeoRestau lot 1, product owner, 01.11.2026): "Lock the till" (off by default, nobody
 * //// is forced to type a code), the delay without use, and whether leaving the screen locks at once. The three are the till's POS
 * //// Settings (enable_session_lock, session_lock_timeout, session_lock_on_leave), saved with the others, and written in French.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurant = vi.hoisted(() => ({ on: true }))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

let tillSettings = {}

vi.mock("frappe-ui", () => ({
	Button: {
		emits: ["click"],
		template: '<button type="button" @click="$emit(\'click\')"><slot name="prefix" /><slot /></button>',
	},
	call,
	// The settings resource answers with the till's POS Settings, like get_pos_settings would
	createResource: (options) => ({
		...options,
		reload: vi.fn(() => options.onSuccess?.({ ...tillSettings })),
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/composables/usePOSEvents", () => ({
	usePOSEvents: () => ({
		detectSettingsChanges: vi.fn(),
		updateSettingsSnapshot: vi.fn(),
		emitStockSyncConfigured: vi.fn(),
	}),
}))
vi.mock("@/composables/useQzTray", async () => {
	const { ref } = await import("vue")
	return {
		useQzTray: () => ({
			qzConnected: ref(false),
			qzConnecting: ref(false),
			qzCertStatus: ref(null),
			printers: ref([]),
			selectedPrinter: ref(""),
			loadingPrinters: ref(false),
			printerOptions: ref([]),
			certLoading: ref(false),
			certReady: ref(false),
			handleConnect: vi.fn(),
			refreshPrinters: vi.fn(),
			generateCertificate: vi.fn(),
			downloadCertificate: vi.fn(),
		}),
	}
})
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: { getStockSyncStatus: vi.fn(async () => ({})) },
}))
vi.mock("@/utils/logger", () => ({
	logger: { create: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))
// The restaurant store is the Restaurant tab's own business: a plain stand-in that says whether the till is a restaurant till
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({
		get isEnabled() {
			return restaurant.on
		},
		restaurantSettings: {},
		restaurantStatus: { isOpen: true, warning: null },
		fetchRestaurantSettings: vi.fn(async () => {}),
		saveRestaurantSettings: vi.fn(async () => {}),
		saveTipSettings: vi.fn(async () => {}),
		updateRestaurantSettings: vi.fn(async () => {}),
		ofTheRestaurant: () => ({}),
	}),
}))

const { default: POSSettings } = await import("../POSSettings.vue")

const UPDATE = "pos_next.pos_next.doctype.pos_settings.pos_settings.update_pos_settings"
// What the stock policy compares on a save: a change of the site's negative stock reloads the page, which is not this test's business
const A_TILL = { pos_profile: "Till 1", enabled: 1, allow_negative_stock: 0, tax_inclusive: 0 }
const LOCK = "Lock the till"
const DELAY = "Lock after (minutes)"
const ON_LEAVE = "Lock as soon as the screen is left"

async function openTheDialog() {
	const wrapper = mount(POSSettings, {
		props: { modelValue: false, posProfile: "Till 1", currentWarehouse: "Stores" },
		global: {
			mocks: { __: globalThis.__ },
			stubs: {
				teleport: true,
				OpeningHoursEditor: true,
				CloudPrntTillSettings: true,
				TranslatedHTML: true,
			},
		},
	})
	await wrapper.setProps({ modelValue: true })
	await flushPromises()
	return wrapper
}

function inputOf(wrapper, labelText) {
	const label = wrapper.findAll("label").find((node) => node.text() === labelText)
	return label ? wrapper.find(`#${label.attributes("for")}`) : null
}

async function save(wrapper) {
	await wrapper.findAll("button").find((button) => button.text() === "Save Changes").trigger("click")
	await flushPromises()
}

const savedSettings = () => call.mock.calls.filter(([method]) => method === UPDATE).at(-1)[1].settings

describe("the lock in the settings dialog of the till", () => {
	beforeEach(() => {
		call.mockReset()
		call.mockImplementation(async (method, args) => (method === UPDATE ? args.settings : []))
		restaurant.on = true
		tillSettings = { ...A_TILL, enable_session_lock: 0, session_lock_timeout: 5, session_lock_on_leave: 0 }
	})

	it("offers the lock on the Restaurant tab, unticked, with its help", async () => {
		const wrapper = await openTheDialog()

		const box = inputOf(wrapper, LOCK)
		expect(box).not.toBeNull()
		expect(box.attributes("type")).toBe("checkbox")
		expect(box.element.checked).toBe(false)
		expect(wrapper.text()).toContain("Each person unlocks it with their personal till code, or with their password if they have none.")
	})

	it("hides the delay and the choice of locking on leaving until the lock is on", async () => {
		const wrapper = await openTheDialog()

		expect(inputOf(wrapper, DELAY)).toBeNull()
		expect(inputOf(wrapper, ON_LEAVE)).toBeNull()

		await inputOf(wrapper, LOCK).setValue(true)

		expect(inputOf(wrapper, DELAY)).not.toBeNull()
		expect(inputOf(wrapper, ON_LEAVE)).not.toBeNull()
	})

	it("shows what the till's settings hold", async () => {
		tillSettings = { ...A_TILL, enable_session_lock: 1, session_lock_timeout: 12, session_lock_on_leave: 1 }

		const wrapper = await openTheDialog()

		expect(inputOf(wrapper, LOCK).element.checked).toBe(true)
		expect(inputOf(wrapper, DELAY).element.value).toBe("12")
		expect(inputOf(wrapper, ON_LEAVE).element.checked).toBe(true)
	})

	it("starts at five minutes and waiting for the delay for a till that never had a lock", async () => {
		tillSettings = { ...A_TILL }

		const wrapper = await openTheDialog()
		await inputOf(wrapper, LOCK).setValue(true)

		expect(inputOf(wrapper, DELAY).element.value).toBe("5")
		expect(inputOf(wrapper, ON_LEAVE).element.checked).toBe(false)
	})

	it("saves the three choices with the other settings of the till", async () => {
		const wrapper = await openTheDialog()

		await inputOf(wrapper, LOCK).setValue(true)
		await inputOf(wrapper, DELAY).setValue("12")
		await inputOf(wrapper, ON_LEAVE).setValue(true)
		await save(wrapper)

		expect(savedSettings()).toMatchObject({
			enable_session_lock: 1,
			session_lock_timeout: 12,
			session_lock_on_leave: 1,
		})
	})

	it("saves the lock off as 0", async () => {
		tillSettings = { ...A_TILL, enable_session_lock: 1, session_lock_timeout: 12, session_lock_on_leave: 1 }
		const wrapper = await openTheDialog()

		await inputOf(wrapper, LOCK).setValue(false)
		await save(wrapper)

		expect(savedSettings().enable_session_lock).toBe(0)
	})

	it("holds the delay to a whole number of minutes between 1 and 1440", async () => {
		const wrapper = await openTheDialog()
		await inputOf(wrapper, LOCK).setValue(true)

		for (const [typed, saved] of [["0", 1], ["-3", 1], ["5000", 1440], ["2.6", 3]]) {
			await inputOf(wrapper, DELAY).setValue(typed)
			await save(wrapper)
			expect(savedSettings().session_lock_timeout, `typed ${typed}`).toBe(saved)
		}
	})

	it("is on the Restaurant tab, which a counter till does not have", async () => {
		restaurant.on = false

		const wrapper = await openTheDialog()

		expect(inputOf(wrapper, LOCK)).toBeNull()
	})
})

describe("the French catalogue of the lock", () => {
	const catalogue = readFileSync(path.resolve(__dirname, "../../../../../pos_next/locale/fr.po"), "utf8")
	const entry = (msgid) => {
		const start = catalogue.indexOf(`\nmsgid ${JSON.stringify(msgid)}\n`)
		if (start === -1) return null
		const line = catalogue.slice(start).split("\n").find((l) => l.startsWith("msgstr "))
		return JSON.parse(line.slice("msgstr ".length))
	}

	it("writes the three fields in French", () => {
		expect(entry(LOCK)).toBe("Verrouiller la caisse")
		expect(entry(DELAY)).toBe("Verrouiller après (minutes)")
		expect(entry(ON_LEAVE)).toBe("Verrouiller dès que l'écran est quitté")
	})

	it("helps in French", () => {
		expect(entry("Each person unlocks it with their personal till code, or with their password if they have none.")).toBe(
			"Chacun la déverrouille avec le code de caisse qui lui est propre, ou avec son mot de passe s'il n'en a pas.",
		)
	})
})
