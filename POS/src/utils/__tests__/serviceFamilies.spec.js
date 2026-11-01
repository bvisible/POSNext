/**
 * //// Neoffice — added file (no upstream equivalent). The service families of a restaurant order, on the till's side
 * //// (NeoRestau lot 1): what a send puts on the pass and what it holds back, which course « order the next course »
 * //// releases, and the words of it. The rule is the server's (pos_next/restaurant/service_families.py); this copy only
 * //// serves the kitchen dialog's pre-ticked boxes and the label of the button. Both are tested against ONE table of
 * //// examples, pos_next/tests/service_family_cases.json, so that the lines the dialog ticks are the lines the server sends.
 * ////
 * //// The French comes from the real catalogue (pos_next/locale/fr.po), through the real translate().
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("frappe-ui", () => ({ createResource: vi.fn() }))
vi.mock("@/utils/offline/translationCache", () => ({ translationCache: {} }))

const ROOT = path.resolve(__dirname, "../../../../pos_next")
const CASES = JSON.parse(
	readFileSync(path.join(ROOT, "tests/service_family_cases.json"), "utf8"),
)

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

const catalogue = readCatalogue(path.join(ROOT, "locale/fr.po"))

let rule
beforeAll(async () => {
	const { translate } = await import("@/utils/translation")
	globalThis.__ = translate
	rule = await import("@/utils/serviceFamilies")
})

beforeEach(() => {
	// The bare words say something else on purpose: only the context gets the right French
	window.translatedMessages = {
		...catalogue,
		Drink: "bare Drink",
		Starter: "bare Starter",
		Main: "bare Main",
		Dessert: "bare Dessert",
	}
})

describe("the rule of a send, against the table the server is tested against", () => {
	it("gives the plan of every example of the shared table", () => {
		expect(CASES.send_cases.length).toBeGreaterThanOrEqual(20)
		for (const example of CASES.send_cases) {
			expect(
				rule.planKitchenSend(
					example.lines,
					example.table_service,
					example.sent_families,
				),
				example.name,
			).toEqual(example.plan)
		}
	})

	it("gives the next course and every held line of every example of the shared table", () => {
		expect(CASES.next_cases.length).toBeGreaterThanOrEqual(8)
		for (const example of CASES.next_cases) {
			expect(rule.nextRelease(example.lines), example.name).toEqual(
				example.next,
			)
			expect(rule.heldLines(example.lines), example.name).toEqual(example.all)
		}
	})

	it("does not change the lines it is given", () => {
		const lines = [
			{ service_family: "Starter", kds_status: "" },
			{ service_family: "Main", kds_status: "Waiting" },
		]
		const before = JSON.stringify(lines)

		rule.planKitchenSend(lines, true)
		rule.nextRelease(lines)
		rule.heldLines(lines)

		expect(JSON.stringify(lines)).toBe(before)
	})

	it("takes no family nobody knows for one", () => {
		const lines = [
			{ service_family: "Cheese", kds_status: "" },
			{ service_family: "Main", kds_status: "" },
		]

		expect(rule.planKitchenSend(lines, true)).toEqual(["send", "send"])
	})

	it("is the cart's own lines it reads: the field is service_family and the status is kds_status", () => {
		const cartLine = {
			item_code: "SOUP",
			quantity: 2,
			service_family: "Starter",
			kds_status: "",
		}

		expect(rule.planKitchenSend([cartLine], true)).toEqual(["send"])
	})
})

describe("a table's service", () => {
	it("is an order at a table that is no takeaway", () => {
		expect(
			rule.isTableService({
				restaurantTable: { name: "T1" },
				isTakeaway: false,
			}),
		).toBe(true)
		expect(
			rule.isTableService({
				restaurantTable: { name: "T1" },
				isTakeaway: true,
			}),
		).toBe(false)
		expect(
			rule.isTableService({ restaurantTable: null, isTakeaway: false }),
		).toBe(false)
		expect(rule.isTableService({})).toBe(false)
	})
})

describe("a line's family can be changed until the line has left", () => {
	it("on a line not sent yet, or held back", () => {
		expect(rule.canChangeFamily({ kds_status: "" })).toBe(true)
		expect(rule.canChangeFamily({})).toBe(true)
		expect(rule.canChangeFamily({ kds_status: "Waiting" })).toBe(true)
	})

	it("not on a line the kitchen has", () => {
		for (const status of ["Pending", "Preparing", "Ready", "Delivered"]) {
			expect(rule.canChangeFamily({ kds_status: status })).toBe(false)
		}
	})
})

describe("the words", () => {
	it("name the four families in French", () => {
		expect(rule.familyLabel("Drink")).toBe("Boisson")
		expect(rule.familyLabel("Starter")).toBe("Entrée")
		expect(rule.familyLabel("Main")).toBe("Plat")
		expect(rule.familyLabel("Dessert")).toBe("Dessert")
	})

	it("show nothing for no family, and for one nobody knows", () => {
		expect(rule.familyLabel("")).toBe("")
		expect(rule.familyLabel(undefined)).toBe("")
		expect(rule.familyLabel("Cheese")).toBe("")
	})

	it("name the next course on the button, as Daniel says it", () => {
		expect(rule.nextCourseLabel("Main")).toBe("Commander la suite · les plats")
		expect(rule.nextCourseLabel("Dessert")).toBe(
			"Commander la suite · les desserts",
		)
		expect(rule.nextCourseLabel("Starter")).toBe(
			"Commander la suite · les entrées",
		)
	})

	it("is the plain button when no course is named", () => {
		expect(rule.nextCourseLabel("")).toBe("Commander la suite")
	})

	it("name the second action", () => {
		expect(rule.orderEverythingLabel()).toBe("Tout commander")
	})

	it("explain that a starter served with the mains is a starter given the Main family", () => {
		expect(rule.servedWithTheMainsHint()).toBe(
			"Pour servir une entrée avec les plats, choisissez Plat.",
		)
	})
})
