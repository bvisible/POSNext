/**
 * //// Neoffice — added file (no upstream equivalent). The pieces of the personal till code are wired into the till (NeoResto lot 1,
 * //// product owner, 01.11.2026): the user's menu holds the entries of the lock and the page mounts their dialog OUTSIDE the menu,
 * //// the three places that configure the lock hand it the "lock on leaving" choice, the settings store reads it, the sign-out
 * //// forgets the code's keys, and every string the feature shows is written in French in the catalogue.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

// The settings store reads its settings through the bootstrap store and the network; neither is under test here
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("frappe-ui", () => ({ createResource: () => ({ submit: vi.fn(), fetch: vi.fn() }) }))

const root = path.resolve(__dirname, "..")
const source = (relative) => readFileSync(path.join(root, relative), "utf8")
const catalogue = readFileSync(path.resolve(root, "../../pos_next/locale/fr.po"), "utf8")

// The msgstr of a one-line msgid in the catalogue, or null
function french(msgid) {
	const start = catalogue.indexOf(`\nmsgid ${JSON.stringify(msgid)}\n`)
	if (start === -1) return null
	const line = catalogue
		.slice(start)
		.split("\n")
		.find((l) => l.startsWith("msgstr "))
	return JSON.parse(line.slice("msgstr ".length))
}

describe("the till's page", () => {
	const page = source("pages/POSSale.vue")

	it("puts the lock entries in the user's menu, in place of upstream's Lock Screen button", () => {
		expect(page).toContain('import TillLockMenuItems from "@/components/common/TillLockMenuItems.vue"')
		expect(page).toContain("<TillLockMenuItems />")
		expect(page).not.toContain('__("Lock Screen")')
		expect(page).not.toContain('@click="lockSession()"')
		expect(page).not.toMatch(/^\s*lock: lockSession,/m)
	})

	it("mounts the dialog of the till code once, beside the lock screen and outside the menu", () => {
		expect(page).toContain('import TillCodeDialog from "@/components/common/TillCodeDialog.vue"')
		const lockScreen = page.indexOf("<SessionLockScreen />")
		const dialog = page.indexOf("<TillCodeDialog />")
		expect(lockScreen).toBeGreaterThan(0)
		expect(dialog).toBeGreaterThan(lockScreen)
		// not inside the header's slots, which the menu unmounts when it closes
		expect(dialog).toBeGreaterThan(page.indexOf("</POSHeader>"))
	})

	it("hands every configuration of the lock the choice of locking on leaving the screen", () => {
		const calls = page.match(/configureSessionLock\(\{[^}]*\}\)/g) || []
		expect(calls.length).toBe(3)
		for (const text of calls) {
			expect(text).toContain("lockOnLeave: posSettingsStore.sessionLockOnLeave")
		}
	})
})

describe("the sign-out", () => {
	it("forgets what the device kept of the code", () => {
		const cleanup = source("utils/sessionCleanup.js")
		for (const key of ["pos_till_code_state", "pos_till_code_hash", "pos_last_active"]) {
			expect(cleanup).toContain(`"${key}"`)
		}
	})
})

describe("the settings store", () => {
	it("reads the choice, off by default", async () => {
		const { createPinia, setActivePinia } = await import("pinia")
		setActivePinia(createPinia())
		const { usePOSSettingsStore } = await import("@/stores/posSettings")
		const store = usePOSSettingsStore()
		expect(store.sessionLockOnLeave).toBe(false)
		store.settings.session_lock_on_leave = 1
		expect(store.sessionLockOnLeave).toBe(true)
		store.settings.session_lock_on_leave = "0"
		expect(store.sessionLockOnLeave).toBe(false)
	})

	it("is off again when the settings are reset for the next user", async () => {
		const { createPinia, setActivePinia } = await import("pinia")
		setActivePinia(createPinia())
		const { usePOSSettingsStore } = await import("@/stores/posSettings")
		const store = usePOSSettingsStore()
		store.settings.session_lock_on_leave = 1
		store.resetSettings()
		expect(store.sessionLockOnLeave).toBe(false)
	})
})

describe("the French catalogue of the till code", () => {
	it("writes the entries the product owner named", () => {
		expect(french("Lock")).toBe("Verrouiller")
		expect(french("Set my till code")).toBe("Définir mon code de caisse")
		expect(french("Remove my code")).toBe("Retirer mon code")
		expect(french("Use my password")).toBe("Utiliser mon mot de passe")
	})

	it("writes every string the new screens and the module show", () => {
		const files = [
			"components/common/TillLockMenuItems.vue",
			"components/common/TillCodeDialog.vue",
			"composables/useTillCode.js",
		]
		const missing = []
		for (const file of files) {
			const text = source(file)
			for (const match of text.matchAll(/__\(\s*(["'])((?:\\.|(?!\1).)*)\1/g)) {
				const msgid = match[2].replace(/\\'/g, "'").replace(/\\"/g, '"')
				if (!french(msgid)) missing.push(`${file}: ${msgid}`)
			}
		}
		expect(missing).toEqual([])
	})

	it("writes the strings of the lock screen that are new", () => {
		const text = source("components/common/SessionLockScreen.vue")
		for (const msgid of ["Enter your till code", "Use my password", "Use my code", "Erase", "Code"]) {
			expect(text).toContain(msgid)
			expect(french(msgid), msgid).toBeTruthy()
		}
		const lock = source("composables/useSessionLock.js")
		for (const msgid of [
			"Incorrect code",
			"Too many wrong codes. Try again in {0} seconds.",
			"Cannot verify the code offline. Use your password.",
		]) {
			expect(lock).toContain(msgid)
			expect(french(msgid), msgid).toBeTruthy()
		}
	})

	it("writes the messages of the server module", () => {
		const python = readFileSync(path.resolve(root, "../../pos_next/api/till_code.py"), "utf8")
		for (const match of python.matchAll(/_\("((?:\\.|[^"\\])*)"\)/g)) {
			expect(french(match[1]), match[1]).toBeTruthy()
		}
	})
})
