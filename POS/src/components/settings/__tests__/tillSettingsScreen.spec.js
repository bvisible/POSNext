/**
 * //// Neoffice — added file (no upstream equivalent). The till's settings screen (NeoRestau lot 1, task 13; product
 * //// owner, 30.10.2026) is drawn from the list the server sends: the tabs of the till (the restaurant's four first,
 * //// on a restaurant till only), every setting with its help behind the lightbulb, a setting greyed while its
 * //// condition is off, and ONE Save that sends what changed and nothing else. A restaurant manager gets the
 * //// restaurant's tabs only, the till's own settings of those tabs included (ruling 63).
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const showSuccess = vi.hoisted(() => vi.fn())
const showError = vi.hoisted(() => vi.fn())
const detectSettingsChanges = vi.hoisted(() => vi.fn())
const emitEvent = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({}))
const shiftStore = vi.hoisted(() => ({ currentProfile: {} }))
const printing = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_m, i) => args[i]) : text)
})

vi.mock("frappe-ui", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showSuccess, showError }) }))
vi.mock("@/composables/usePOSEvents", () => ({
	usePOSEvents: () => ({ detectSettingsChanges, emitStockSyncConfigured: vi.fn(), emit: emitEvent }),
}))
const qz = vi.hoisted(() => ({}))
vi.mock("@/composables/useQzTray", async () => {
	const { ref } = await import("vue")
	// This computer's QZ Tray printer, kept by the composable (browser storage)
	qz.selectedPrinter = ref("")
	return {
		useQzTray: () => ({
			qzConnected: ref(true),
			qzConnecting: ref(false),
			qzCertStatus: ref("unknown"),
			selectedPrinter: qz.selectedPrinter,
			loadingPrinters: ref(false),
			printerOptions: ref([{ value: "Counter printer", label: "Counter printer" }]),
			certLoading: ref(false),
			certReady: ref(false),
			handleConnect: vi.fn(),
			refreshPrinters: vi.fn(),
			generateCertificate: vi.fn(),
			downloadCertificate: vi.fn(),
		}),
	}
})
vi.mock("@/stores/cloudPrnt", () => ({ useCloudPrntStore: () => printing }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => shiftStore }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurantStore }))
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: {
		getStockSyncStatus: vi.fn(async () => ({ enabled: false, itemCount: 0, lastSync: null })),
		configureStockSync: vi.fn(),
		startStockSync: vi.fn(),
		stopStockSync: vi.fn(),
	},
}))
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))
vi.mock("@/utils/currency", () => ({ formatTime: () => "12:00" }))

const { ref } = await import("vue")
const { default: POSSettings } = await import("../POSSettings.vue")

const READ = "pos_next.till_settings.api.get_till_settings"
const SAVE = "pos_next.till_settings.api.save_till_settings"

const RESTAURANT_TABS = [
	{ key: "restaurant", label: "Restaurant", section: "restaurant" },
	{ key: "hours", label: "Hours and cards", section: "restaurant" },
	{ key: "online", label: "Online ordering", section: "restaurant" },
	{ key: "reservations", label: "Reservations", section: "restaurant" },
]
const TILL_TABS = [
	{ key: "general", label: "General", section: "till" },
	{ key: "sale_screen", label: "Sale screen", section: "till" },
	{ key: "prices", label: "Prices and discounts", section: "till" },
	{ key: "sales", label: "Sales", section: "till" },
	{ key: "stock", label: "Stock", section: "till" },
	{ key: "printing", label: "Printing", section: "till" },
	{ key: "closing", label: "Closing", section: "till" },
]
const GROUPS = [
	{ key: "service", tab: "restaurant", label: "Service", column: 1, scope: "restaurant" },
	{ key: "room", tab: "restaurant", label: "Room", column: 1, scope: "till" },
	{ key: "opening_hours", tab: "hours", label: "Opening hours", column: 1, scope: "restaurant" },
	{ key: "cards", tab: "hours", label: "Restaurant cards", column: 2, scope: "restaurant" },
	{ key: "qr_ordering", tab: "online", label: "Table ordering by QR code", column: 1, scope: "restaurant" },
	{ key: "reservations", tab: "reservations", label: "Reservations", column: 1, scope: "restaurant" },
	{ key: "session_lock", tab: "general", label: "Lock", column: 1, scope: "till" },
	{ key: "items", tab: "sale_screen", label: "Items", column: 1, scope: "till" },
	{ key: "items_offered", tab: "sale_screen", label: "Items offered", column: 2, scope: "till" },
	{ key: "scale_barcodes", tab: "prices", label: "Scale barcodes", column: 3, scope: "till" },
	{ key: "payment", tab: "sales", label: "Payment", column: 1, scope: "till" },
	{ key: "warehouse", tab: "stock", label: "Warehouse", column: 1, scope: "till" },
	{ key: "stock_sync", tab: "stock", label: "Stock sync", column: 2, scope: "device" },
	{ key: "network_printer", tab: "printing", label: "Network printer (Star)", column: 2, scope: "till" },
	{ key: "qz_tray", tab: "printing", label: "Printing through QZ Tray", column: 3, scope: "computer" },
	{ key: "eod_report", tab: "closing", label: "End-of-day report", column: 3, scope: "till" },
]

function setting(key, group, tab, overrides = {}) {
	return {
		key,
		field: key,
		doctype: "POS Settings",
		store: "document",
		tab,
		group,
		label: `Label of ${key}`,
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

const ON = (key) => ({ key, equals: null, off: false })

const RESTAURANT_SETTINGS = [
	setting("enable_runner", "service", "restaurant", {
		doctype: "Restaurant",
		till: "restaurant",
		applies: "restaurant",
	}),
	setting("default_restaurant_area", "room", "restaurant", { widget: "link", till: "restaurant" }),
	setting("opening_hours", "opening_hours", "hours", {
		doctype: "Restaurant",
		widget: "special",
		label: "Opening hours",
		till: "restaurant",
	}),
	setting("restaurant_cards", "cards", "hours", {
		doctype: null,
		store: "device",
		widget: "special",
		kind: "info",
		help: null,
		till: "restaurant",
	}),
	setting("enable_qr_ordering", "qr_ordering", "online", { doctype: "Restaurant", till: "restaurant" }),
	setting("token_expiry_mode", "qr_ordering", "online", {
		doctype: "Restaurant",
		widget: "segmented",
		till: "restaurant",
		depends_on: [ON("enable_qr_ordering")],
		indent: true,
		options: [
			{ value: "On Table Close", label: "When the table closes" },
			{ value: "Timed", label: "After a delay" },
		],
	}),
	setting("token_expiry_days", "qr_ordering", "online", {
		doctype: "Restaurant",
		widget: "int",
		till: "restaurant",
		min: 1,
		depends_on: [ON("enable_qr_ordering"), { key: "token_expiry_mode", equals: "Timed", off: false }],
		indent: true,
	}),
	setting("no_show_delay", "reservations", "reservations", {
		doctype: "Restaurant",
		widget: "int",
		till: "restaurant",
		min: 0,
	}),
]
const TILL_SETTINGS = [
	setting("enable_session_lock", "session_lock", "general"),
	setting("session_lock_timeout", "session_lock", "general", {
		widget: "int",
		min: 1,
		depends_on: [ON("enable_session_lock")],
		indent: true,
	}),
	setting("tiles_per_row", "items", "sale_screen", {
		widget: "segmented",
		options: [
			{ value: "Automatic", label: "Automatic" },
			...["3", "4", "5", "6", "7", "8"].map((count) => ({ value: count, label: count })),
		],
	}),
	setting("item_groups", "items_offered", "sale_screen", {
		doctype: "POS Profile",
		widget: "multiselect",
		applies: "catalogue",
	}),
	setting("barcode_rules", "scale_barcodes", "prices", {
		widget: "table",
		columns: [
			{ fieldname: "barcode_rule", fieldtype: "Data", label: "Barcode Rule" },
			{ fieldname: "disable", fieldtype: "Check", label: "Disable" },
		],
	}),
	setting("allow_credit_sale", "payment", "sales"),
	setting("allow_partial_payment", "payment", "sales"),
	setting("use_exact_amount", "payment", "sales", {
		depends_on: [
			{ key: "allow_credit_sale", equals: null, off: true },
			{ key: "allow_partial_payment", equals: null, off: true },
		],
	}),
	setting("warehouse", "warehouse", "stock", {
		doctype: "POS Profile",
		widget: "link",
		required: true,
		applies: "profile",
	}),
	setting("stock_sync_enabled", "stock_sync", "stock", { doctype: null, store: "device" }),
	setting("receipt_printer", "network_printer", "printing", {
		doctype: null,
		store: "cloudprnt",
		widget: "special",
		label: "Network printer",
		help: "A Star printer on the network prints the receipts",
	}),
	setting("auto_print", "network_printer", "printing", {
		doctype: null,
		store: "cloudprnt",
		widget: "special",
		label: "Print at validation",
		help: "The receipt comes out by itself",
	}),
	setting("open_drawer", "network_printer", "printing", {
		doctype: null,
		store: "cloudprnt",
		widget: "special",
		label: "The drawer opens",
		help: "When the drawer opens",
	}),
	setting("test_print", "network_printer", "printing", {
		doctype: null,
		store: "cloudprnt",
		widget: "special",
		kind: "action",
		help: "",
	}),
	setting("silent_print", "qz_tray", "printing"),
	setting("qz_printer", "qz_tray", "printing", {
		doctype: null,
		store: "device",
		widget: "special",
		depends_on: [ON("silent_print")],
		indent: true,
	}),
	setting("eod_email_recipients", "eod_report", "closing", { widget: "text" }),
	setting("eod_email_auto", "eod_report", "closing", {
		depends_on: [ON("eod_email_recipients")],
		indent: true,
	}),
]

const SHOP_VALUES = {
	enable_session_lock: 0,
	session_lock_timeout: 5,
	tiles_per_row: "Automatic",
	item_groups: [],
	barcode_rules: [],
	allow_credit_sale: 0,
	allow_partial_payment: 0,
	use_exact_amount: 0,
	warehouse: "Store - T",
	silent_print: 0,
	eod_email_recipients: "",
	eod_email_auto: 0,
}
const RESTAURANT_VALUES = {
	enable_runner: 1,
	default_restaurant_area: "AREA-1",
	opening_hours: [],
	enable_qr_ordering: 0,
	token_expiry_mode: "On Table Close",
	token_expiry_days: 7,
	no_show_delay: 60,
}
const CHOICES = {
	item_groups: [
		{ value: "Drinks", label: "Drinks" },
		{ value: "Dishes", label: "Dishes" },
	],
	warehouse: [
		{ value: "Store - T", label: "Store" },
		{ value: "Back - T", label: "Back" },
	],
	default_restaurant_area: [{ value: "AREA-1", label: "Terrace" }],
	opening_hours: [{ value: "CARD-1", label: "Lunch card" }],
}

function screenOf({ restaurantTill = false, can = { till: true, restaurant: false }, values = {} } = {}) {
	const tabs = [
		...(restaurantTill && (can.till || can.restaurant) ? RESTAURANT_TABS : []),
		...(can.till ? TILL_TABS : []),
	]
	const tabKeys = new Set(tabs.map((tab) => tab.key))
	const settings = [...(restaurantTill ? RESTAURANT_SETTINGS : []), ...TILL_SETTINGS]
		.filter((entry) => tabKeys.has(entry.tab))
		.map((entry) => ({
			...entry,
			// As the server says it: the restaurant's are its managers', the till's the till manager's, and those of the
			// restaurant's tabs the restaurant's managers' too (ruling 63)
			editable:
				entry.doctype === "Restaurant"
					? can.restaurant
					: entry.doctype
					? can.till || (RESTAURANT_TABS.some((tab) => tab.key === entry.tab) && can.restaurant)
					: true,
		}))
	const groupKeys = new Set(settings.map((entry) => entry.group))
	const shown = new Set(settings.map((entry) => entry.key))
	const allValues = { ...SHOP_VALUES, ...(restaurantTill ? RESTAURANT_VALUES : {}), ...values }
	return {
		pos_profile: restaurantTill ? "Restaurant till" : "Shop till",
		restaurant_till: restaurantTill,
		restaurant: restaurantTill ? "REST-1" : "",
		restaurant_name: restaurantTill ? "Our restaurant" : "",
		can,
		tabs,
		groups: GROUPS.filter((group) => groupKeys.has(group.key)),
		settings,
		values: Object.fromEntries(Object.entries(allValues).filter(([key]) => shown.has(key))),
		choices: CHOICES,
		status: restaurantTill ? { tip_item: "TIP", tip_account: "2211 - T" } : {},
	}
}

let wrapper

async function open(answer, props = {}) {
	call.mockImplementation(async (method, args) => {
		if (method === READ) return answer
		if (method === SAVE) return { ...answer, values: { ...answer.values, ...args.values } }
		return null
	})
	wrapper = mount(POSSettings, {
		props: { modelValue: false, posProfile: answer.pos_profile, ...props },
		global: { mocks: { __: globalThis.__ } },
	})
	await wrapper.setProps({ modelValue: true })
	await flushPromises()
	return wrapper
}

function railHeads() {
	return wrapper.findAll("nav[role='tablist'] > div").map((head) => head.text())
}

function railTabs() {
	return wrapper.findAll("nav[role='tablist'] button[role='tab']").map((tab) => tab.attributes("data-tab"))
}

function activeTab() {
	return wrapper.find("nav[role='tablist'] button[aria-selected='true']").attributes("data-tab")
}

async function openTab(key) {
	await wrapper.find(`button[data-tab='${key}']`).trigger("click")
}

function row(key) {
	return wrapper.find(`[data-setting='${key}']`)
}

function saveButton() {
	return wrapper.find("button[data-action='save']")
}

function saves() {
	return call.mock.calls.filter(([method]) => method === SAVE)
}

beforeEach(() => {
	call.mockReset()
	showSuccess.mockReset()
	showError.mockReset()
	detectSettingsChanges.mockReset()
	emitEvent.mockReset()
	Object.assign(restaurantStore, {
		can: undefined,
		fetchRestaurantSettings: vi.fn(),
		fetchActiveCards: vi.fn(),
		fetchRestaurantStatus: vi.fn(),
	})
	shiftStore.currentProfile = { warehouse: "Store - T" }
	qz.selectedPrinter.value = ""
	Object.assign(printing, {
		config: ref({
			printers: [{ name: "PRN-1", label: "Counter printer", online: true }],
			receipt_printer: null,
			auto_print: 0,
			open_drawer: "Cash payments",
			can_configure: true,
			stations: [],
		}),
		load: vi.fn(async () => printing.config.value),
		save: vi.fn(async () => printing.config.value),
		testPrint: vi.fn(),
	})
	localStorage.clear()
})

afterEach(() => {
	wrapper?.unmount()
})

describe("the tabs of the till's settings", () => {
	it("shows the seven tabs of the till on a shop till, and opens on General", async () => {
		await open(screenOf())

		expect(railHeads()).toEqual(["Till"])
		expect(railTabs()).toEqual(TILL_TABS.map((tab) => tab.key))
		expect(activeTab()).toBe("general")
	})

	it("shows the restaurant's four tabs first on a restaurant till, and opens on them", async () => {
		await open(screenOf({ restaurantTill: true }))

		expect(railHeads()).toEqual(["Restaurant", "Till"])
		expect(railTabs()).toEqual([...RESTAURANT_TABS, ...TILL_TABS].map((tab) => tab.key))
		expect(activeTab()).toBe("restaurant")
	})

	it("opens on the tab it is asked for, the card editor's hours", async () => {
		await open(screenOf({ restaurantTill: true }), { initialTab: "hours" })

		expect(activeTab()).toBe("hours")
		expect(row("opening_hours").exists()).toBe(true)
	})

	it("reads its settings once, for the till it is opened for", async () => {
		await open(screenOf())

		expect(call).toHaveBeenCalledWith(READ, { pos_profile: "Shop till" })
	})
})

describe("one Save for the whole screen", () => {
	it("has one Save, closed until something changes", async () => {
		await open(screenOf())

		expect(wrapper.findAll("button[data-action='save']")).toHaveLength(1)
		expect(saveButton().attributes("disabled")).toBeDefined()
	})

	it("sends what changed in every tab in one save, and nothing else", async () => {
		await open(screenOf())
		await openTab("sales")
		await row("allow_credit_sale").find("input[type='checkbox']").setValue(true)
		await openTab("sale_screen")
		const six = row("tiles_per_row").findAll("button[role='radio']").find((button) => button.text() === "6")
		await six.trigger("click")

		await saveButton().trigger("click")
		await flushPromises()

		expect(saves()).toEqual([
			[SAVE, { pos_profile: "Shop till", values: { allow_credit_sale: 1, tiles_per_row: "6" } }],
		])
		expect(showSuccess).toHaveBeenCalled()
		// Saved, nothing is left to save
		expect(saveButton().attributes("disabled")).toBeDefined()
	})

	it("tells the till what changed, so that it takes its settings again", async () => {
		await open(screenOf())
		await openTab("stock")
		await row("warehouse").find("select").setValue("Back - T")

		await saveButton().trigger("click")
		await flushPromises()

		expect(detectSettingsChanges).toHaveBeenCalledWith({ warehouse: "Back - T" }, { warehouse: "Store - T" })
		expect(shiftStore.currentProfile.warehouse).toBe("Back - T")
		// A new warehouse changes what the till offers (its stock, the unavailable items): its items come from the server
		expect(emitEvent).toHaveBeenCalledWith("settings:catalogue-changed", { changes: ["warehouse"] })
	})

	it("asks the till to read its items again when the catalogue changed", async () => {
		await open(screenOf())
		await openTab("sale_screen")
		await row("item_groups").find("select").setValue("Drinks")

		await saveButton().trigger("click")
		await flushPromises()

		expect(saves()[0][1].values).toEqual({ item_groups: ["Drinks"] })
		expect(emitEvent).toHaveBeenCalledWith("settings:catalogue-changed", { changes: ["item_groups"] })
	})

	it("saves the network printer through the printer app with the rest", async () => {
		await open(screenOf())
		await openTab("printing")
		await row("receipt_printer").find("select").setValue("PRN-1")

		await saveButton().trigger("click")
		await flushPromises()

		expect(printing.save).toHaveBeenCalledWith({
			receipt_printer: "PRN-1",
			auto_print: 0,
			open_drawer: "Cash payments",
		})
		// Nothing of the till's documents changed: no save of them
		expect(saves()).toEqual([])
	})

	it("keeps Save closed while a number is out of its bounds", async () => {
		await open(screenOf({ values: { enable_session_lock: 1 } }))
		await row("session_lock_timeout").find("input").setValue("0")

		expect(saveButton().attributes("disabled")).toBeDefined()
		await row("session_lock_timeout").find("input").setValue("3")
		expect(saveButton().attributes("disabled")).toBeUndefined()
	})

	it("never keeps Save closed for a number the user may not change", async () => {
		// The restaurant's link of the QR menu is out of its bounds; the till manager cannot change it, nor be stuck by it
		await open(
			screenOf({
				restaurantTill: true,
				values: { enable_qr_ordering: 1, token_expiry_mode: "Timed", token_expiry_days: 0 },
			})
		)
		await openTab("sales")
		await row("allow_credit_sale").find("input[type='checkbox']").setValue(true)

		expect(saveButton().attributes("disabled")).toBeUndefined()
	})

	it("forgets the changes on Cancel", async () => {
		await open(screenOf())
		await openTab("sales")
		await row("allow_credit_sale").find("input[type='checkbox']").setValue(true)

		await wrapper.findAll("button").find((button) => button.text() === "Cancel").trigger("click")

		expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([false])
		expect(saves()).toEqual([])
	})
})

describe("a setting that depends on another", () => {
	it("stays visible, greyed and closed while its condition is off, and opens again with it", async () => {
		await open(screenOf())

		expect(row("session_lock_timeout").exists()).toBe(true)
		expect(row("session_lock_timeout").attributes("data-greyed")).toBe("true")
		expect(row("session_lock_timeout").find("input").attributes("disabled")).toBeDefined()

		await row("enable_session_lock").find("input[type='checkbox']").setValue(true)

		expect(row("session_lock_timeout").attributes("data-greyed")).toBe("false")
		expect(row("session_lock_timeout").find("input").attributes("disabled")).toBeUndefined()
	})

	it("waits for every condition: the days of the QR link need the QR ordering and a delay", async () => {
		await open(screenOf({ restaurantTill: true, can: { till: true, restaurant: true } }))
		await openTab("online")

		expect(row("token_expiry_days").attributes("data-greyed")).toBe("true")
		await row("enable_qr_ordering").find("input[type='checkbox']").setValue(true)
		expect(row("token_expiry_days").attributes("data-greyed")).toBe("true")
		const delay = row("token_expiry_mode")
			.findAll("button[role='radio']")
			.find((button) => button.text() === "After a delay")
		await delay.trigger("click")
		expect(row("token_expiry_days").attributes("data-greyed")).toBe("false")
	})

	it("is greyed while a setting it cannot go with is on", async () => {
		await open(screenOf())
		await openTab("sales")

		expect(row("use_exact_amount").attributes("data-greyed")).toBe("false")
		await row("allow_credit_sale").find("input[type='checkbox']").setValue(true)
		expect(row("use_exact_amount").attributes("data-greyed")).toBe("true")
	})

	it("is unticked when a setting it cannot go with is ticked, so that the save is not refused", async () => {
		await open(screenOf({ values: { use_exact_amount: 1 } }))
		await openTab("sales")

		expect(row("use_exact_amount").find("input[type='checkbox']").element.checked).toBe(true)
		await row("allow_partial_payment").find("input[type='checkbox']").setValue(true)
		await flushPromises()
		expect(row("use_exact_amount").find("input[type='checkbox']").element.checked).toBe(false)

		await saveButton().trigger("click")
		await flushPromises()
		expect(saves()[0][1].values).toEqual({ allow_partial_payment: 1, use_exact_amount: 0 })
	})
})

describe("the help of every setting, behind its lightbulb", () => {
	it("gives every setting of every tab a bulb that says what it does, and unfolds it on a click", async () => {
		const answer = screenOf({ restaurantTill: true, can: { till: true, restaurant: true } })
		await open(answer)

		const checked = []
		for (const tab of answer.tabs) {
			await openTab(tab.key)
			for (const entry of answer.settings.filter((item) => item.tab === tab.key && item.kind === "setting")) {
				const bulb = wrapper.find(
					`[data-setting='${entry.key}'] button[aria-label='Help'], [data-group='${entry.group}'] h3 button[aria-label='Help']`
				)
				expect(bulb.exists(), `${entry.key} has no bulb`).toBe(true)
				expect(bulb.attributes("title")).toBe(entry.help)
				await bulb.trigger("click")
				expect(wrapper.text()).toContain(entry.help)
				checked.push(entry.key)
			}
		}
		expect(checked).toHaveLength(answer.settings.filter((item) => item.kind === "setting").length)
	})

	it("keeps the help folded until the bulb is clicked", async () => {
		await open(screenOf())

		expect(wrapper.find(".till-setting-help").exists()).toBe(false)
		expect(wrapper.text()).not.toContain("What enable_session_lock does")
	})
})

describe("a restaurant manager who does not manage the till", () => {
	const can = { till: false, restaurant: true }

	it("gets the restaurant's tabs only", async () => {
		await open(screenOf({ restaurantTill: true, can }))

		expect(railHeads()).toEqual(["Restaurant"])
		expect(railTabs()).toEqual(RESTAURANT_TABS.map((tab) => tab.key))
	})

	it("sets the restaurant's settings and the till's own ones of his tabs", async () => {
		await open(screenOf({ restaurantTill: true, can }))

		// The till's default room sits in his tab: his to set (ruling 63)
		expect(row("default_restaurant_area").attributes("data-locked")).toBe("false")
		expect(row("default_restaurant_area").find("select").attributes("disabled")).toBeUndefined()
		await row("enable_runner").find("input[type='checkbox']").setValue(false)

		await saveButton().trigger("click")
		await flushPromises()

		expect(saves()).toEqual([[SAVE, { pos_profile: "Restaurant till", values: { enable_runner: 0 } }]])
		// The till takes the restaurant's settings again
		expect(restaurantStore.fetchRestaurantSettings).toHaveBeenCalled()
	})
})

describe("what the screen keeps on this computer", () => {
	it("forgets this computer's QZ Tray printer when it is cleared", async () => {
		qz.selectedPrinter.value = "Counter printer"
		await open(screenOf({ values: { silent_print: 1 } }))
		await openTab("printing")

		await row("qz_printer").find("select").setValue("")
		await saveButton().trigger("click")
		await flushPromises()

		expect(qz.selectedPrinter.value).toBe("")
		expect(saves()).toEqual([])
	})
})

describe("the cards of the restaurant", () => {
	it("opens a card in the till's own card editor, not on the desk", async () => {
		restaurantStore.can = { manage_cards: true }
		await open(screenOf({ restaurantTill: true, can: { till: true, restaurant: true } }), { initialTab: "hours" })

		expect(wrapper.find("[data-setting='restaurant_cards'] a[href*='/app/']").exists()).toBe(false)
		await row("restaurant_cards").find("button[data-card='CARD-1']").trigger("click")

		expect(wrapper.emitted("open-card")).toEqual([["CARD-1"]])
	})

	it("offers to edit a card only to whoever may edit the cards at the till", async () => {
		restaurantStore.can = { manage_cards: false }
		await open(screenOf({ restaurantTill: true, can: { till: true, restaurant: true } }), { initialTab: "hours" })

		expect(row("restaurant_cards").text()).toContain("Lunch card")
		expect(row("restaurant_cards").find("button[data-card]").exists()).toBe(false)
	})
})

describe("what the screen offers", () => {
	it("offers the tiles per row from 3 to 8, or automatic, and nothing else", async () => {
		await open(screenOf())
		await openTab("sale_screen")

		const offered = row("tiles_per_row").findAll("button[role='radio']").map((button) => button.text())
		expect(offered).toEqual(["Automatic", "3", "4", "5", "6", "7", "8"])
	})

	it("says nothing of the restaurant on a shop till", async () => {
		await open(screenOf())

		expect(wrapper.text()).not.toContain("Our restaurant")
		expect(wrapper.find("[data-setting='enable_runner']").exists()).toBe(false)
	})
})
