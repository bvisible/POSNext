/**
 * //// Neoffice — added file (no upstream equivalent). The page a phone opens from the QR code of a table speaks the guest's language (NeoRestau lot 1,
 * //// Daniel's test of 01.11: « Order Summary », « Send Order » in English on a French phone). A guest has no user and no boot language, and the device
 * //// has kept no choice: the language of the browser stands in, and the dictionary is asked in it (`_lang`), the first thing Frappe reads.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const stored = new Map()
const calls = []

vi.mock("../offline/db", () => ({
	db: {
		translations: {
			get: vi.fn(async (locale) => stored.get(locale)),
			put: vi.fn(async (entry) => stored.set(entry.locale, entry)),
			delete: vi.fn(async (locale) => stored.delete(locale)),
			clear: vi.fn(async () => stored.clear()),
		},
	},
}))
vi.mock("../apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		calls.push({ method, args })
		return method.endsWith("get_translations_stamp") ? "stamp-1" : { "Order Summary": "Résumé de la commande" }
	}),
}))
vi.mock("frappe-ui", () => ({ createResource: vi.fn() }))

const DICTIONARY = "pos_next.api.localization.get_app_translations"
const STAMP = "pos_next.api.localization.get_translations_stamp"

const listeners = []
const addEventListener = document.addEventListener.bind(document)
document.addEventListener = (type, listener, options) => {
	listeners.push([type, listener, options])
	addEventListener(type, listener, options)
}

function browserLanguage(value) {
	Object.defineProperty(window.navigator, "language", { value, configurable: true })
}

async function boot() {
	vi.resetModules()
	window.translatedMessages = undefined
	const { default: plugin } = await import("../translation")
	plugin({ config: { globalProperties: {} } })
	await vi.waitFor(() => expect(window.translatedMessages).toBeTruthy())
	await new Promise((resolve) => setTimeout(resolve, 20))
}

beforeEach(() => {
	stored.clear()
	calls.length = 0
	window.localStorage.removeItem("pos_next_language")
	delete window.frappe
})
afterEach(() => {
	for (const [type, listener, options] of listeners.splice(0)) document.removeEventListener(type, listener, options)
	window.localStorage.removeItem("pos_next_language")
	delete window.frappe
})

describe("the language of a page that has no user", () => {
	it("is the language of the browser: « fr-CH » is French, and the dictionary is asked in it", async () => {
		browserLanguage("fr-CH")

		await boot()

		expect(window.translatedMessages["Order Summary"]).toBe("Résumé de la commande")
		const asked = calls.filter((call) => call.method === DICTIONARY || call.method === STAMP)
		expect(asked.length).toBeGreaterThan(0)
		for (const call of asked) expect(call.args, call.method).toEqual({ _lang: "fr" })
		expect(stored.has("fr")).toBe(true)
	})

	it("is English for an English browser, and the dictionary is asked in English", async () => {
		browserLanguage("en-GB")

		await boot()

		for (const call of calls.filter((entry) => entry.method === DICTIONARY)) expect(call.args).toEqual({ _lang: "en" })
	})

	it("is the choice the device kept, before the browser's", async () => {
		browserLanguage("fr-CH")
		window.localStorage.setItem("pos_next_language", "ar")

		await boot()

		for (const call of calls.filter((entry) => entry.method === DICTIONARY)) expect(call.args).toEqual({ _lang: "ar" })
	})

	it("is the language of the user's session, before the device's and the browser's", async () => {
		browserLanguage("fr-CH")
		window.localStorage.setItem("pos_next_language", "ar")
		window.frappe = { boot: { lang: "pt-BR" } }

		await boot()

		for (const call of calls.filter((entry) => entry.method === DICTIONARY)) expect(call.args).toEqual({ _lang: "pt-br" })
	})
})
