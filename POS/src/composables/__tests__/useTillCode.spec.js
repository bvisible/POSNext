/**
 * //// Neoffice — added file (no upstream equivalent). What a device knows of the signed-in user's personal till code (NeoResto
 * //// lot 1, product owner, 01.11.2026): whether there is one and how long it is, cached per user so that the lock screen can show
 * //// its keypad after a reload and offline, replaced by every answer of the server, and never holding the code itself.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const offlineState = vi.hoisted(() => ({ isOffline: false }))
const user = vi.hoisted(() => ({ userId: "waiter@yopmail.com" }))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/data/user", () => ({ userData: user }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState }))

const STATE_KEY = "pos_till_code_state"
const HASH_KEY = "pos_till_code_hash"

async function pageLoad() {
	vi.resetModules()
	return await import("@/composables/useTillCode")
}

describe("what the device knows of the till code", () => {
	beforeEach(() => {
		localStorage.clear()
		call.mockReset()
		call.mockResolvedValue({ has_code: false, length: 0 })
		offlineState.isOffline = false
		user.userId = "waiter@yopmail.com"
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("knows nothing at first", async () => {
		const { useTillCode } = await pageLoad()
		const code = useTillCode()
		expect(code.hasCode.value).toBe(false)
		expect(code.codeLength.value).toBe(0)
	})

	it("takes the answer of the server and keeps it for the next page load", async () => {
		const { useTillCode } = await pageLoad()
		call.mockResolvedValue({ has_code: true, length: 5 })
		const code = useTillCode()
		await code.refresh()
		expect(call).toHaveBeenCalledWith("pos_next.api.till_code.has_till_code", {})
		expect(code.hasCode.value).toBe(true)
		expect(code.codeLength.value).toBe(5)

		const next = (await pageLoad()).useTillCode()
		expect(next.hasCode.value).toBe(true)
		expect(next.codeLength.value).toBe(5)
	})

	it("forgets a code the server no longer has", async () => {
		const { useTillCode } = await pageLoad()
		const code = useTillCode()
		call.mockResolvedValue({ has_code: true, length: 4 })
		await code.refresh()
		call.mockResolvedValue({ has_code: false, length: 0 })
		await code.refresh()
		expect(code.hasCode.value).toBe(false)
		expect(localStorage.getItem(STATE_KEY)).toBeNull()
	})

	it("keeps what it knew when the server cannot be reached, or the device is offline", async () => {
		localStorage.setItem(STATE_KEY, JSON.stringify({ user: "waiter@yopmail.com", has: true, length: 4 }))
		const { useTillCode } = await pageLoad()
		const code = useTillCode()
		call.mockRejectedValue(new TypeError("Failed to fetch"))
		await code.refresh()
		expect(code.hasCode.value).toBe(true)
		call.mockClear()
		offlineState.isOffline = true
		await code.refresh()
		expect(call).not.toHaveBeenCalled()
		expect(code.codeLength.value).toBe(4)
	})

	it("never gives one user the keypad of another", async () => {
		// What the device kept belongs to someone else
		localStorage.setItem(STATE_KEY, JSON.stringify({ user: "someone.else@yopmail.com", has: true, length: 4 }))
		const { useTillCode } = await pageLoad()
		expect(useTillCode().hasCode.value).toBe(false)
	})

	it("serves a user who signs in on the same page from what the device kept for THEM, not for the one before", async () => {
		const { useTillCode } = await pageLoad()
		call.mockResolvedValue({ has_code: true, length: 4 })
		await useTillCode().refresh()
		expect(useTillCode().hasCode.value).toBe(true)

		user.userId = "someone.else@yopmail.com"
		const second = useTillCode()
		expect(second.hasCode.value).toBe(false)
		expect(second.codeLength.value).toBe(0)
	})

	it("sets a code with the password and takes the answer", async () => {
		const { useTillCode } = await pageLoad()
		const code = useTillCode()
		call.mockResolvedValue({ has_code: true, length: 4 })
		await code.setCode("account-password", "4829")
		expect(call).toHaveBeenCalledWith("pos_next.api.till_code.set_till_code", {
			password: "account-password",
			code: "4829",
		})
		expect(code.hasCode.value).toBe(true)
		expect(code.codeLength.value).toBe(4)
		expect(JSON.stringify(localStorage)).not.toContain("4829")
		expect(JSON.stringify(localStorage)).not.toContain("account-password")
	})

	it("forgets the offline hash of the old code when the code changes or goes", async () => {
		const { useTillCode } = await pageLoad()
		const code = useTillCode()
		localStorage.setItem(HASH_KEY, JSON.stringify({ user: "waiter@yopmail.com", hash: "h", salt: "s", ts: Date.now() }))
		call.mockResolvedValue({ has_code: true, length: 6 })
		await code.setCode("pw", "380417")
		expect(localStorage.getItem(HASH_KEY)).toBeNull()

		localStorage.setItem(HASH_KEY, JSON.stringify({ user: "waiter@yopmail.com", hash: "h", salt: "s", ts: Date.now() }))
		call.mockResolvedValue({ has_code: false, length: 0 })
		await code.clearCode("pw")
		expect(call).toHaveBeenCalledWith("pos_next.api.till_code.clear_till_code", { password: "pw" })
		expect(localStorage.getItem(HASH_KEY)).toBeNull()
		expect(code.hasCode.value).toBe(false)
	})

	it("lets the refusal of the server reach the caller, and changes nothing", async () => {
		const { useTillCode } = await pageLoad()
		const code = useTillCode()
		call.mockRejectedValue(Object.assign(new Error("x"), { messages: ["Incorrect password"] }))
		await expect(code.setCode("wrong", "4829")).rejects.toMatchObject({ messages: ["Incorrect password"] })
		expect(code.hasCode.value).toBe(false)
	})

	it("opens and closes the dialog in a mode", async () => {
		const { useTillCode } = await pageLoad()
		const code = useTillCode()
		expect(code.dialog.open).toBe(false)
		code.openDialog("remove")
		expect(code.dialog).toMatchObject({ open: true, mode: "remove" })
		code.openDialog("anything else")
		expect(code.dialog.mode).toBe("set")
		code.closeDialog()
		expect(code.dialog.open).toBe(false)
	})

	it("forgets everything at sign-out", async () => {
		const { useTillCode, forgetTillCodeState } = await pageLoad()
		const code = useTillCode()
		call.mockResolvedValue({ has_code: true, length: 4 })
		await code.refresh()
		forgetTillCodeState()
		expect(code.hasCode.value).toBe(false)
		expect(localStorage.getItem(STATE_KEY)).toBeNull()
	})

	it("reads the message of an error the way the server wrote it, without markup", async () => {
		const { messageOfError } = await pageLoad()
		expect(messageOfError({ messages: ["<p>Too easy</p>"] })).toBe("Too easy")
		expect(messageOfError({ messages: [] }, "fallback")).toBe("fallback")
		expect(messageOfError(new Error("boom"))).toBe("Something went wrong. Please try again.")
	})
})
