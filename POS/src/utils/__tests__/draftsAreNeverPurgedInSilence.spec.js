/**
 * //// Neoffice — added file (no upstream equivalent). The rule of the product owner (08.11.2026): « s'il y a un brouillon, il faut en faire quelque chose » — a draft or a held
 * //// ticket is never deleted in silence. The cart used to purge the cashier's own drafts an hour old after every sale (`cleanup_old_drafts`), and signing out erased every held ticket
 * //// of the device (`clearAllDrafts`); both are gone, and the closing, the sign-out dialogs and the drafts dialog list what is kept so that the user deletes by hand.
 * //// This spec reads the sources of the till and fails if one of those two silent purges comes back.
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"

// Every source file of the till that is not a test (the glob is read at build time: a new file is covered without a line here)
const sources = import.meta.glob(["../../**/*.{js,vue}", "!../../**/__tests__/**", "!../../**/*.spec.js", "!../../**/*.test.js"], {
	query: "?raw",
	import: "default",
	eager: true,
})

// The keys are relative to this spec (src/utils/__tests__): `../draftManager.js` is src/utils/draftManager.js
const DRAFT_MANAGER = "../draftManager.js"
const SESSION_CLEANUP = "../sessionCleanup.js"
const entries = Object.entries(sources)
const withoutComments = (text) =>
	text
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.split("\n")
		.map((line) => line.replace(/\/\/.*$/, ""))
		.join("\n")

describe("the detector of this guard", () => {
	const calls = (text) => /\bclearAllDrafts\b/.test(withoutComments(text))

	it("sees an import or a call", () => {
		expect(calls('import { clearAllDrafts } from "@/utils/draftManager"')).toBe(true)
		expect(calls("await clearAllDrafts()")).toBe(true)
		expect(calls("function leave() { clearAllDrafts() }")).toBe(true)
	})

	it("does not take a mention in a comment for a call", () => {
		expect(calls("// the old cleanup called clearAllDrafts here")).toBe(false)
		expect(calls("/* clearAllDrafts is gone */ const kept = true")).toBe(false)
		expect(calls("<!-- clearAllDrafts -->")).toBe(false)
		expect(calls("const kept = true // clearAllDrafts")).toBe(false)
	})
})

describe("no silent purge of drafts", () => {
	it("reads the sources of the till (the guard is not empty)", () => {
		expect(entries.length).toBeGreaterThan(200)
		expect(entries.some(([path]) => path === DRAFT_MANAGER)).toBe(true)
	})

	it("calls `clearAllDrafts` nowhere: it is defined for a hand that asks, and no flow calls it", () => {
		const callers = entries
			.filter(([path]) => path !== DRAFT_MANAGER)
			.filter(([, text]) => /\bclearAllDrafts\b/.test(withoutComments(text)))
			.map(([path]) => path)

		expect(callers).toEqual([])
	})

	it("does not call the server's `cleanup_old_drafts`, which deleted the cashier's drafts an hour old with no word", () => {
		const callers = entries.filter(([, text]) => /cleanup_old_drafts/.test(withoutComments(text))).map(([path]) => path)

		expect(callers).toEqual([])
	})

	it("keeps the held tickets when the session ends: the sign-out cleanup deletes no draft", () => {
		const cleanup = entries.find(([path]) => path === SESSION_CLEANUP)
		expect(cleanup).toBeTruthy()

		const code = withoutComments(cleanup[1])
		// It does not even import the draft store: the tickets a user holds are his, kept for his next session
		expect(code).not.toMatch(/draftManager|posDrafts|\bdeleteDraft\b|\bclearAllDrafts\b|\bgetAllDrafts\b/)
	})
})
