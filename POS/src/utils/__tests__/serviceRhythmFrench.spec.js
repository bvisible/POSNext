/**
 * //// Neoffice — added file (no upstream equivalent). The service rhythm in French (NeoRestau lot 1, Daniel, 01.11: « Oui, les deux modes »): the product owner speaks French, and everything a person reads about the rhythm
 * //// (the tag « À l'avance » and the pills of the kitchen's tickets, the toast of the call, the setting and its two choices, the refusals of the server) goes through the real catalogue (pos_next/locale/fr.po) and the
 * //// real `translate`. The catalogue template (main.pot) carries the same messages, so that the next extraction does not drop them.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("frappe-ui", () => ({ createResource: vi.fn() }))
vi.mock("@/utils/offline/translationCache", () => ({ translationCache: {} }))

const ROOT = path.resolve(__dirname, "../../../../pos_next")

/** The catalogue as the till is handed it: "msgid" -> French, and "msgid:context" -> French for a word in a context. `keepEmpty` keeps the entries that say nothing yet (a template). */
function readCatalogue(file, { keepEmpty = false } = {}) {
	const unquote = (text) => text.replace(/\\(["\\nt])/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c))
	const messages = {}
	let entry = {}
	let field = null
	const flush = () => {
		if (entry.msgid && (entry.msgstr || keepEmpty)) messages[entry.msgctxt ? `${entry.msgid}:${entry.msgctxt}` : entry.msgid] = entry.msgstr
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

const catalogue = readCatalogue(path.join(ROOT, "locale/fr.po"))
const template = readCatalogue(path.join(ROOT, "locale/main.pot"), { keepEmpty: true })
const CONTEXT = "Kitchen order status"
const SETTING = "Service rhythm"

beforeAll(async () => {
	const { translate } = await import("@/utils/translation")
	globalThis.__ = translate
})
beforeEach(() => {
	window.translatedMessages = { ...catalogue }
})

describe("what the kitchen's tickets say of a dish sent ahead", () => {
	it("tags it « À l'avance », and says « Prêt d'avance » once the kitchen finished it", () => {
		expect(__("Ahead", null, CONTEXT)).toBe("À l'avance")
		expect(__("Ready ahead", null, CONTEXT)).toBe("Prêt d'avance")
	})

	it("says what a ticket waits for when only dishes sent ahead are left", () => {
		expect(__("Ahead, waiting for the call", null, CONTEXT)).toBe("À l'avance, en attente de l'appel")
	})

	it("keeps the bare word « Ahead » for the sense of the kitchen, whatever another app says of it", () => {
		window.translatedMessages = { ...catalogue, Ahead: "bare Ahead" }

		expect(__("Ahead", null, CONTEXT)).toBe("À l'avance")
	})
})

describe("what the waiter sees after the call", () => {
	it("is « Suite commandée »", () => {
		expect(__("Next course ordered")).toBe("Suite commandée")
	})
})

describe("the setting of the restaurant", () => {
	it("is « Rythme du service », in the till's settings and on the desk's form", () => {
		expect(catalogue["Service rhythm"]).toBe("Rythme du service")
		expect(catalogue["Service Rhythm"]).toBe("Rythme du service")
	})

	it("offers « La salle appelle » and « La cuisine prépare à l'avance », in the till's settings and as the desk's Select options", () => {
		expect(catalogue[`The room calls:${SETTING}`]).toBe("La salle appelle")
		expect(catalogue[`The kitchen prepares ahead:${SETTING}`]).toBe("La cuisine prépare à l'avance")
		expect(catalogue["Called by the room"]).toBe("La salle appelle")
		expect(catalogue["Prepared ahead"]).toBe("La cuisine prépare à l'avance")
	})

	it("explains both choices in a help text that names them as the choices read", () => {
		const help = catalogue[
			"The room calls: at Validate the drinks and the first course leave, the next courses wait until the waiter orders them. The kitchen prepares ahead: everything leaves at Validate, the later courses reach the kitchen marked as ahead so that it can start them, and the waiter's call only tells it to serve them now."
		]

		expect(help).toContain("« La salle appelle »")
		expect(help).toContain("« La cuisine prépare à l'avance »")
		expect(help).toContain("« Valider »")
	})
})

describe("the refusals of the server", () => {
	it("are in French, with their placeholders", () => {
		expect(catalogue["Only an order at a table has courses to call"]).toMatch(/table/)
		expect(catalogue["The courses of this restaurant are not prepared ahead: there is no course to call"]).toMatch(/à l'avance/)
		expect(catalogue["{0} is not a course"]).toContain("{0}")
	})
})

describe("the catalogue and its template", () => {
	const MESSAGES = [
		"Service Rhythm",
		"Service rhythm",
		"Called by the room",
		"Prepared ahead",
		`The room calls:${SETTING}`,
		`The kitchen prepares ahead:${SETTING}`,
		"Only an order at a table has courses to call",
		"The courses of this restaurant are not prepared ahead: there is no course to call",
		"{0} is not a course",
		`Ahead:${CONTEXT}`,
		`Ready ahead:${CONTEXT}`,
		`Ahead, waiting for the call:${CONTEXT}`,
		"Next course ordered",
	]

	it("carries every message of the rhythm, translated", () => {
		for (const key of MESSAGES) expect(catalogue[key], key).toBeTruthy()
	})

	it("keeps the placeholders of each message in its French", () => {
		for (const key of MESSAGES) {
			const msgid = key.includes(":") && !key.startsWith("{") ? key.split(":")[0] : key
			const holes = (text) => (text.match(/{\d+}/g) || []).sort().join()
			expect(holes(catalogue[key]), key).toBe(holes(msgid))
		}
	})

	it("is in the template too, empty, for the next extraction", () => {
		for (const key of MESSAGES) expect(key in template, key).toBe(true)
	})
})
