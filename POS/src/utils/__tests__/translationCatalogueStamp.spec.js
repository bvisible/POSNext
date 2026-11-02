/**
 * //// Neoffice — added file (no upstream equivalent). New French words reach a device at once (NeoResto lot 1, kitchen test of 01.11): a phone that kept a
 * //// dictionary fetched before a word was added showed that word in English for up to 24 hours, because a release that only carries new words does not change
 * //// the front build the cache is keyed by. The till asks the server for a short stamp of the dictionary at start-up and when it comes back to the screen, and
 * //// fetches the dictionary only when the stamp is not the one it holds.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const stored = new Map()
const calls = []
let answers

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
	call: vi.fn(async (method) => {
		calls.push(method)
		const answer = answers[method]
		if (answer instanceof Error) throw answer
		return answer
	}),
}))
vi.mock("frappe-ui", () => ({ createResource: vi.fn() }))

const STAMP = "pos_next.api.localization.get_translations_stamp"
const DICTIONARY = "pos_next.api.localization.get_app_translations"

const OLD_WORDS = { Validate: "Valider" }
const NEW_WORDS = { Validate: "Valider", Preparing: "En préparation" }

// every start-up of the plugin listens on the document: take those listeners off after each test, or a test hears the ones of the tests before it
const listeners = []
const addEventListener = document.addEventListener.bind(document)
document.addEventListener = (type, listener, options) => {
	listeners.push([type, listener, options])
	addEventListener(type, listener, options)
}

async function boot() {
	vi.resetModules()
	window.translatedMessages = undefined
	const { default: plugin } = await import("../translation")
	plugin({ config: { globalProperties: {} } })
	// start-up is not awaited by the plugin: wait until it has put a dictionary on the page
	await vi.waitFor(() => expect(window.translatedMessages).toBeTruthy())
	// ... and let a check that runs behind it finish
	await new Promise((resolve) => setTimeout(resolve, 20))
}

async function cacheEntry(extra = {}) {
	const { CACHE_VERSION } = await import("../offline/translationCache")
	stored.set("fr", {
		locale: "fr",
		messages: OLD_WORDS,
		timestamp: Date.now(),
		version: CACHE_VERSION,
		...extra,
	})
}

beforeEach(() => {
	stored.clear()
	calls.length = 0
	answers = { [STAMP]: "stamp-1", [DICTIONARY]: NEW_WORDS }
	window.localStorage.setItem("pos_next_language", "fr")
})
afterEach(() => {
	for (const [type, listener, options] of listeners.splice(0))
		document.removeEventListener(type, listener, options)
	vi.useRealTimers()
	window.localStorage.removeItem("pos_next_language")
})

describe("the dictionary a device holds, against the server's", () => {
	it("keeps the cached dictionary, and fetches no other, when the stamp is the one it holds", async () => {
		await cacheEntry({ stamp: "stamp-1" })

		await boot()

		expect(window.translatedMessages).toEqual(OLD_WORDS)
		expect(calls).toContain(STAMP)
		expect(calls).not.toContain(DICTIONARY)
	})

	it("fetches the dictionary again, and shows its new words, when the stamp is not the one it holds", async () => {
		await cacheEntry({ stamp: "stamp-0" })

		await boot()

		expect(calls).toContain(DICTIONARY)
		expect(window.translatedMessages.Preparing).toBe("En préparation")
		expect(stored.get("fr").stamp).toBe("stamp-1")
	})

	it("treats a dictionary cached before stamps existed as out of date, once", async () => {
		await cacheEntry()

		await boot()

		expect(calls).toContain(DICTIONARY)
		expect(stored.get("fr").stamp).toBe("stamp-1")

		calls.length = 0
		await boot()
		expect(calls).not.toContain(DICTIONARY)
	})

	it("keeps what it holds, and says nothing, when the server cannot be asked", async () => {
		await cacheEntry({ stamp: "stamp-0" })
		answers[STAMP] = new Error("offline")

		await boot()

		expect(window.translatedMessages).toEqual(OLD_WORDS)
		expect(calls).not.toContain(DICTIONARY)
	})

	it("stores the stamp of the dictionary it fetches on a first start", async () => {
		await boot()

		expect(window.translatedMessages.Preparing).toBe("En préparation")
		expect(stored.get("fr").stamp).toBe("stamp-1")
	})

	it("asks again when the till comes back to the screen after a while, not at every glance", async () => {
		vi.useFakeTimers({ toFake: ["Date"] })
		vi.setSystemTime(new Date("2026-11-01T12:00:00Z"))
		await cacheEntry({ stamp: "stamp-1" })
		await boot()
		calls.length = 0

		// a glance a minute later: nothing
		vi.setSystemTime(new Date("2026-11-01T12:01:00Z"))
		answers[STAMP] = "stamp-2"
		document.dispatchEvent(new Event("visibilitychange"))
		await new Promise((resolve) => setTimeout(resolve, 20))
		expect(calls).not.toContain(STAMP)

		// back after a quarter of an hour: the stamp is asked, and the new words come
		vi.setSystemTime(new Date("2026-11-01T12:15:00Z"))
		document.dispatchEvent(new Event("visibilitychange"))
		await vi.waitFor(() => expect(calls).toContain(DICTIONARY))
		expect(window.translatedMessages.Preparing).toBe("En préparation")
	})
})
