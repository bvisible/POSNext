/**
 * //// Neoffice — added file (no upstream equivalent). The lock of the till and the days it keeps its staff signed in (NeoResto
 * //// lot 1, product owner, 01.11.2026) are four POS Settings of the till's settings screen, which is drawn from the list the
 * //// server sends (task 13): "Lock the till" (off by default, nobody is forced to type a code), the delay without use, whether
 * //// leaving the screen locks at once, and "Keep staff signed in (days)", 0 to 90. They were fields of the old settings dialog;
 * //// this spec carries what that dialog's two specs pinned onto the new screen, and checks the French catalogue.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_m, i) => args[i]) : text)
})

vi.mock("frappe-ui", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock("@/composables/usePOSEvents", () => ({
	usePOSEvents: () => ({ detectSettingsChanges: vi.fn(), emitStockSyncConfigured: vi.fn(), emit: vi.fn() }),
}))
vi.mock("@/composables/useQzTray", async () => {
	const { ref } = await import("vue")
	return {
		useQzTray: () => ({
			qzConnected: ref(false),
			qzConnecting: ref(false),
			qzCertStatus: ref("unknown"),
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
vi.mock("@/stores/cloudPrnt", () => ({ useCloudPrntStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ currentProfile: {} }) }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => ({}) }))
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: { getStockSyncStatus: vi.fn(async () => ({ enabled: false, itemCount: 0, lastSync: null })) },
}))
vi.mock("@/utils/logger", () => ({ logger: { create: () => new Proxy({}, { get: () => vi.fn() }) } }))
vi.mock("@/utils/currency", () => ({ formatTime: () => "12:00" }))

const { default: POSSettings } = await import("../POSSettings.vue")

const READ = "pos_next.till_settings.api.get_till_settings"
const SAVE = "pos_next.till_settings.api.save_till_settings"

const LOCK = "Lock the till"
const DELAY = "Lock after (minutes)"
const ON_LEAVE = "Lock as soon as the screen is left"
const DAYS = "Keep staff signed in (days)"
const DAYS_HELP = "0 = the site's session length. The session stays open while the device is used within this time."

const ON = (key) => ({ key, equals: null, off: false })

// What the server sends for these four settings (pos_next.till_settings.registry)
function setting(key, group, label, widget, overrides = {}) {
	return {
		key,
		field: key,
		doctype: "POS Settings",
		store: "document",
		tab: "general",
		group,
		label,
		help: `What ${key} does`,
		widget,
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

function served(values = {}) {
	return {
		pos_profile: "Till 1",
		restaurant_till: false,
		restaurant: "",
		restaurant_name: "",
		can: { till: true, restaurant: false },
		tabs: [{ key: "general", label: "General", section: "till" }],
		groups: [
			{ key: "session_lock", tab: "general", label: "Lock", column: 1, scope: "till" },
			{ key: "staff_session", tab: "general", label: "Staff session", column: 1, scope: "till" },
		],
		settings: [
			setting("enable_session_lock", "session_lock", LOCK, "check"),
			setting("session_lock_timeout", "session_lock", DELAY, "int", {
				min: 1,
				max: 1440,
				depends_on: [ON("enable_session_lock")],
				indent: true,
			}),
			setting("session_lock_on_leave", "session_lock", ON_LEAVE, "check", {
				depends_on: [ON("enable_session_lock")],
				indent: true,
			}),
			setting("keep_signed_in_days", "staff_session", DAYS, "int", { min: 0, max: 90, help: DAYS_HELP }),
		],
		values: {
			enable_session_lock: 0,
			session_lock_timeout: 5,
			session_lock_on_leave: 0,
			keep_signed_in_days: 0,
			...values,
		},
		choices: {},
		status: {},
	}
}

let wrapper

async function open(answer) {
	call.mockImplementation(async (method, args) => {
		if (method === READ) return answer
		if (method === SAVE) return { ...answer, values: { ...answer.values, ...args.values } }
		return null
	})
	wrapper = mount(POSSettings, {
		props: { modelValue: false, posProfile: answer.pos_profile },
		global: { mocks: { __: globalThis.__ } },
	})
	await wrapper.setProps({ modelValue: true })
	await flushPromises()
}

const row = (key) => wrapper.find(`[data-setting='${key}']`)
const input = (key) => row(key).find("input")
const saves = () => call.mock.calls.filter(([method]) => method === SAVE)
const savedValues = () => saves().at(-1)[1].values

async function save() {
	await wrapper.find("button[data-action='save']").trigger("click")
	await flushPromises()
}

beforeEach(() => {
	call.mockReset()
	localStorage.clear()
})

afterEach(() => {
	wrapper?.unmount()
})

describe("the lock in the settings of the till", () => {
	it("offers the lock unticked, and shows the delay and the choice of locking on leaving greyed until it is on", async () => {
		await open(served())

		expect(input("enable_session_lock").attributes("type")).toBe("checkbox")
		expect(input("enable_session_lock").element.checked).toBe(false)
		expect(row("session_lock_timeout").attributes("data-greyed")).toBe("true")
		expect(row("session_lock_on_leave").attributes("data-greyed")).toBe("true")

		await input("enable_session_lock").setValue(true)

		expect(row("session_lock_timeout").attributes("data-greyed")).toBe("false")
		expect(row("session_lock_on_leave").attributes("data-greyed")).toBe("false")
	})

	it("shows what the till's settings hold", async () => {
		await open(served({ enable_session_lock: 1, session_lock_timeout: 12, session_lock_on_leave: 1 }))

		expect(input("enable_session_lock").element.checked).toBe(true)
		expect(input("session_lock_timeout").element.value).toBe("12")
		expect(input("session_lock_on_leave").element.checked).toBe(true)
	})

	it("saves the three choices, and nothing else", async () => {
		await open(served())

		await input("enable_session_lock").setValue(true)
		await input("session_lock_timeout").setValue("12")
		await input("session_lock_on_leave").setValue(true)
		await save()

		expect(savedValues()).toEqual({
			enable_session_lock: 1,
			session_lock_timeout: 12,
			session_lock_on_leave: 1,
		})
	})

	it("saves the lock off as 0", async () => {
		await open(served({ enable_session_lock: 1, session_lock_timeout: 12, session_lock_on_leave: 1 }))

		await input("enable_session_lock").setValue(false)
		await save()

		expect(savedValues().enable_session_lock).toBe(0)
	})

	it("holds the delay to the range the server sent, 1 to a day", async () => {
		await open(served({ enable_session_lock: 1 }))

		expect(input("session_lock_timeout").attributes("min")).toBe("1")
		expect(input("session_lock_timeout").attributes("max")).toBe("1440")
	})
})

describe("the days a till keeps its staff signed in", () => {
	it("offers the days with their help, from 0 to 90", async () => {
		await open(served({ keep_signed_in_days: 30 }))

		expect(row("keep_signed_in_days").exists()).toBe(true)
		expect(wrapper.text()).toContain("Staff session")
		expect(input("keep_signed_in_days").attributes("type")).toBe("number")
		expect(input("keep_signed_in_days").attributes("min")).toBe("0")
		expect(input("keep_signed_in_days").attributes("max")).toBe("90")
		expect(input("keep_signed_in_days").element.value).toBe("30")
	})

	it("shows 0, the site's rule, for a till whose settings say nothing", async () => {
		await open(served())

		expect(input("keep_signed_in_days").element.value).toBe("0")
	})

	it("saves the days with the other settings of the till", async () => {
		await open(served({ keep_signed_in_days: 30 }))

		await input("keep_signed_in_days").setValue("14")
		await save()

		expect(saves()[0][1].pos_profile).toBe("Till 1")
		expect(savedValues()).toEqual({ keep_signed_in_days: 14 })
	})
})

describe("the French catalogue of the lock and the staff session", () => {
	const catalogue = readFileSync(path.resolve(__dirname, "../../../../../pos_next/locale/fr.po"), "utf8")
	const entry = (msgid) => {
		const start = catalogue.indexOf(`\nmsgid ${JSON.stringify(msgid)}\n`)
		if (start === -1) return null
		const line = catalogue.slice(start).split("\n").find((l) => l.startsWith("msgstr "))
		return JSON.parse(line.slice("msgstr ".length))
	}

	it("writes the four fields in French", () => {
		expect(entry(LOCK)).toBe("Verrouiller la caisse")
		expect(entry(DELAY)).toBe("Verrouiller après (minutes)")
		expect(entry(ON_LEAVE)).toBe("Verrouiller dès que l'écran est quitté")
		expect(entry(DAYS)).toBe("Garder le personnel connecté (jours)")
		expect(entry("Staff session")).toBe("Session du personnel")
	})

	it("helps in French", () => {
		expect(entry("Each person unlocks it with their personal till code, or with their password if they have none.")).toBe(
			"Chacun la déverrouille avec le code de caisse qui lui est propre, ou avec son mot de passe s'il n'en a pas.",
		)
		expect(entry(DAYS_HELP)).toBe(
			"0 = durée de session du site. La session reste ouverte tant que l'appareil sert dans ce délai.",
		)
	})

	it("says the range of the days in French too", () => {
		expect(entry("Keep staff signed in (days) must be between 0 and {0}")).toContain("{0}")
	})
})
