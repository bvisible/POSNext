/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen's words (NeoResto lot 1, task 38a-1, ruling 113): a BADGE
 * //// says the state a dish or a ticket is in, a BUTTON says the action the cook is about to do. The two used to share
 * //// their msgids ("Start", "Ready", "Delivered"), so « Début » sat on the button and « Prêt » on both the badge and the
 * //// button: the cook read « Prêt » on a dish that was to be delivered. Now the states are « Retenu » (held back by the
 * //// waiter), « En attente » (to start), « En préparation », « À livrer » (ready at the pass), « Livré »; the buttons are
 * //// « Commencer », « C'est prêt », « Livrer » (and « Remettre » for a takeaway, whose ready state reads « À remettre »).
 * ////
 * //// The French comes from the real catalogue (pos_next/locale/fr.po), through the real translate(), keyed the way Frappe
 * //// keys it ("msgid:context"). A bare word is given a different value so that a label can only read right through its context.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// The translator reaches for frappe-ui and the offline cache of the dictionary: neither is what is tested here
vi.mock("frappe-ui", () => ({ createResource: vi.fn() }))
vi.mock("@/utils/offline/translationCache", () => ({ translationCache: {} }))

const CATALOGUE = path.resolve(__dirname, "../../../../pos_next/locale/fr.po")
const STATE = "Kitchen order status"
const ACTION = "Kitchen action"

/** The catalogue as the till is handed it: msgid -> French, and "msgid:context" -> French for a word in a context. */
function readCatalogue(file) {
	const unquote = (text) =>
		text.replace(/\\(["\\nt])/g, (_, c) =>
			c === "n" ? "\n" : c === "t" ? "\t" : c,
		)
	const messages = {}
	let entry = {}
	let field = null
	const flush = () => {
		if (entry.msgid && entry.msgstr) {
			messages[
				entry.msgctxt ? `${entry.msgid}:${entry.msgctxt}` : entry.msgid
			] = entry.msgstr
		}
		entry = {}
		field = null
	}
	for (const line of readFileSync(file, "utf8").split("\n")) {
		if (line.startsWith("#~")) continue
		const start = line.match(/^(msgctxt|msgid|msgstr) "(.*)"$/)
		if (start) {
			const [, name, text] = start
			if (name === "msgctxt" || (name === "msgid" && "msgstr" in entry)) flush()
			entry[name] = unquote(text)
			field = name
			continue
		}
		const more = line.match(/^"(.*)"$/)
		if (more && field) entry[field] += unquote(more[1])
		else if (!line.trim()) flush()
	}
	flush()
	return messages
}

const catalogue = readCatalogue(CATALOGUE)

let kitchenStatusLabel
let kitchenActionLabel

beforeAll(async () => {
	const { translate } = await import("@/utils/translation")
	globalThis.__ = translate
	;({ kitchenStatusLabel, kitchenActionLabel } = await import(
		"@/utils/kitchenStatus"
	))
})

beforeEach(() => {
	// The bare words say something else on purpose: only the context gets the right French
	window.translatedMessages = {
		...catalogue,
		Start: "bare Start",
		Ready: "bare Ready",
		Delivered: "bare Delivered",
		Deliver: "bare Deliver",
		Waiting: "bare Waiting",
	}
})

describe("the states, which badges and filters show", () => {
	it("are Retenu, En attente, En préparation, À livrer and Livré", () => {
		expect(kitchenStatusLabel("Waiting")).toBe("Retenu")
		expect(kitchenStatusLabel("Pending")).toBe("En attente")
		expect(kitchenStatusLabel("Preparing")).toBe("En préparation")
		expect(kitchenStatusLabel("Ready")).toBe("À livrer")
		expect(kitchenStatusLabel("Delivered")).toBe("Livré")
	})

	it("read À remettre for a takeaway that is ready, and the other states are the same", () => {
		expect(kitchenStatusLabel("Ready", { takeaway: true })).toBe("À remettre")
		expect(kitchenStatusLabel("Preparing", { takeaway: true })).toBe(
			"En préparation",
		)
		expect(kitchenStatusLabel("Pending", { takeaway: true })).toBe("En attente")
	})

	it("show nothing for no state, and another word keeps its own", () => {
		expect(kitchenStatusLabel(undefined)).toBe("")
		expect(kitchenStatusLabel(null)).toBe("")
		expect(kitchenStatusLabel("")).toBe("")
		// Another word goes through the plain translation, as before
		expect(kitchenStatusLabel("Cleaning")).toBe(catalogue.Cleaning)
	})
})

describe("the actions, which buttons show", () => {
	it("are Commencer, C'est prêt and Livrer", () => {
		expect(kitchenActionLabel("start")).toBe("Commencer")
		expect(kitchenActionLabel("ready")).toBe("C'est prêt")
		expect(kitchenActionLabel("deliver")).toBe("Livrer")
	})

	it("is Rappeler en préparation to call a dish back from what waits at the pass", () => {
		expect(kitchenActionLabel("recall")).toBe("Rappeler en préparation")
	})

	it("read Remettre for a takeaway, and only the last action changes", () => {
		expect(kitchenActionLabel("deliver", { takeaway: true })).toBe("Remettre")
		expect(kitchenActionLabel("start", { takeaway: true })).toBe("Commencer")
		expect(kitchenActionLabel("ready", { takeaway: true })).toBe("C'est prêt")
	})

	it("show nothing for an action it does not know", () => {
		expect(kitchenActionLabel("explode")).toBe("")
		expect(kitchenActionLabel(undefined)).toBe("")
	})
})

describe("a badge and a button never share a message id", () => {
	/** Every (msgid, context) a label function asks the translator for, by calling it for each of its inputs. */
	function asked(fn, inputs) {
		const seen = []
		const real = globalThis.__
		globalThis.__ = (text, replace, context) => {
			seen.push(`${text}:${context ?? ""}`)
			return real(text, replace, context)
		}
		try {
			for (const input of inputs) {
				fn(input, { takeaway: false })
				fn(input, { takeaway: true })
			}
		} finally {
			globalThis.__ = real
		}
		return new Set(seen)
	}

	it("asks the translator for different (word, context) pairs, and for different words", () => {
		const badges = asked(kitchenStatusLabel, [
			"Waiting",
			"Pending",
			"Preparing",
			"Ready",
			"Delivered",
		])
		const buttons = asked(kitchenActionLabel, [
			"start",
			"ready",
			"deliver",
			"recall",
		])
		for (const pair of buttons) expect(badges.has(pair)).toBe(false)
		// Not even the same word under another context: « Deliver » (an action) is not « Delivered » (a state)
		const words = (set) => new Set([...set].map((pair) => pair.split(":")[0]))
		for (const word of words(buttons))
			expect(words(badges).has(word)).toBe(false)
	})

	it("keeps the buttons under the context « Kitchen action » and the badges under « Kitchen order status »", () => {
		for (const key of [
			"Start cooking",
			"Mark ready",
			"Deliver",
			"Hand over",
			"Recall to preparation",
		]) {
			expect(catalogue[`${key}:${ACTION}`], key).toBeTruthy()
		}
		for (const key of [
			"Waiting",
			"Pending",
			"Preparing",
			"Ready",
			"Delivered",
			"To hand over",
		]) {
			expect(catalogue[`${key}:${STATE}`], key).toBeTruthy()
		}
	})

	it("leaves the bare words, which the whole site shares, as they were", () => {
		expect(readCatalogue(CATALOGUE).Pending).toBe("En attente")
		expect(readCatalogue(CATALOGUE).Ready).toBe("Prêt")
		expect(readCatalogue(CATALOGUE).Delivered).toBe("Livré")
		expect(readCatalogue(CATALOGUE).Waiting).toBe("En attente")
		expect(readCatalogue(CATALOGUE).Start).toBe("Début")
	})
})
