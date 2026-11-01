/**
 * //// Neoffice — added file (no upstream equivalent). The till's settings dialog offers "Keep staff signed in (days)" (NeoRestau
 * //// lot 1, product owner, 01.11.2026): on the Restaurant tab, read from the till's POS Settings, kept to 0..90 days, saved with
 * //// the other settings of the till, and written in French in the catalogue (pos_next/locale/fr.po), label and help.
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
const LABEL = "Keep staff signed in (days)"
const HELP = "0 = the site's session length. The session stays open while the device is used within this time."

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

function theFieldInput(wrapper) {
	const label = wrapper.findAll("label").find((node) => node.text() === LABEL)
	return label ? wrapper.find(`#${label.attributes("for")}`) : null
}

describe("the settings dialog of the till", () => {
	beforeEach(() => {
		call.mockReset()
		call.mockImplementation(async (method, args) => (method === UPDATE ? args.settings : []))
		restaurant.on = true
		tillSettings = { ...A_TILL, keep_signed_in_days: 30 }
	})

	it("offers the days on the Restaurant tab, with its help", async () => {
		const wrapper = await openTheDialog()

		expect(wrapper.text()).toContain("Staff session")
		expect(wrapper.text()).toContain(HELP)
		const input = theFieldInput(wrapper)
		expect(input).not.toBeNull()
		expect(input.attributes("type")).toBe("number")
		expect(input.attributes("min")).toBe("0")
		expect(input.attributes("max")).toBe("90")
	})

	it("shows the days the till's settings hold", async () => {
		const wrapper = await openTheDialog()

		expect(theFieldInput(wrapper).element.value).toBe("30")
	})

	it("shows 0, the site's rule, for a till whose settings say nothing", async () => {
		tillSettings = { ...A_TILL }

		const wrapper = await openTheDialog()

		expect(theFieldInput(wrapper).element.value).toBe("0")
	})

	it("saves the days with the other settings of the till", async () => {
		const wrapper = await openTheDialog()

		await theFieldInput(wrapper).setValue("14")
		await wrapper.findAll("button").find((button) => button.text() === "Save Changes").trigger("click")
		await flushPromises()

		const saved = call.mock.calls.find(([method]) => method === UPDATE)
		expect(saved[1].pos_profile).toBe("Till 1")
		expect(saved[1].settings.keep_signed_in_days).toBe(14)
	})

	it("holds the days to 0..90, as the server does", async () => {
		const wrapper = await openTheDialog()
		const save = () => wrapper.findAll("button").find((button) => button.text() === "Save Changes").trigger("click")
		const savedDays = () => call.mock.calls.filter(([method]) => method === UPDATE).at(-1)[1].settings.keep_signed_in_days

		await theFieldInput(wrapper).setValue("365")
		await save()
		await flushPromises()
		expect(savedDays()).toBe(90)

		await theFieldInput(wrapper).setValue("-4")
		await save()
		await flushPromises()
		expect(savedDays()).toBe(0)

		await theFieldInput(wrapper).setValue("12.6")
		await save()
		await flushPromises()
		expect(savedDays()).toBe(13)
	})

	it("is on the Restaurant tab, which a counter till does not have", async () => {
		restaurant.on = false

		const wrapper = await openTheDialog()

		expect(theFieldInput(wrapper)).toBeNull()
	})
})

describe("the French catalogue", () => {
	const catalogue = readFileSync(path.resolve(__dirname, "../../../../../pos_next/locale/fr.po"), "utf8")
	const entry = (msgid) => {
		const start = catalogue.indexOf(`\nmsgid ${JSON.stringify(msgid)}\n`)
		if (start === -1) return null
		const line = catalogue.slice(start).split("\n").find((l) => l.startsWith("msgstr "))
		return JSON.parse(line.slice("msgstr ".length))
	}

	it("labels the field « Garder le personnel connecté (jours) »", () => {
		expect(entry(LABEL)).toBe("Garder le personnel connecté (jours)")
	})

	it("helps in one line", () => {
		expect(entry(HELP)).toBe(
			"0 = durée de session du site. La session reste ouverte tant que l'appareil sert dans ce délai.",
		)
	})

	it("titles the block and says the range in French too", () => {
		expect(entry("Staff session")).toBe("Session du personnel")
		expect(entry("Keep staff signed in (days) must be between 0 and {0}")).toContain("{0}")
	})
})
