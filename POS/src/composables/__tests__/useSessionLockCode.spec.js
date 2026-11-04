/**
 * //// Neoffice — added file (no upstream equivalent). The lock of the till opens with a SHORT PERSONAL CODE (NeoResto lot 1,
 * //// product owner, 01.11.2026): verified by the server (pos_next.api.till_code.verify_till_code), or offline against a PBKDF2
 * //// hash of the code that was cached after a SUCCESSFUL online verification (same 24 h life and same attempt counter as the
 * //// cached password). Also here: "Lock" by hand works whatever the auto-lock setting says, and a lock that waits for its delay
 * //// instead of locking the moment the screen is left.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const offlineState = vi.hoisted(() => ({ isOffline: false }))
const user = vi.hoisted(() => ({
	userId: "waiter@yopmail.com",
	getDisplayName: () => "Waiter",
	getImageUrl: () => null,
	getInitials: () => "W",
}))
const cart = vi.hoisted(() => ({ isSubmitting: false }))

vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? s.replace(/\{(\d+)\}/g, (_, i) => args[i]) : s)
})

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/data/user", () => ({ userData: user }))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => cart }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState }))

const VERIFY = "pos_next.api.till_code.verify_till_code"
const RIGHT = "4829"
const HASH_KEY = "pos_till_code_hash"
const PASSWORD_HASH_KEY = "pos_session_pwd_hash"
const ATTEMPT_KEY = "pos_lock_attempts"
const DAY = 24 * 60 * 60 * 1000

/** The composable as a page load would find it: module state fresh, localStorage as it was left. */
async function pageLoad() {
	vi.resetModules()
	const { useSessionLock } = await import("@/composables/useSessionLock")
	return useSessionLock()
}

function theServer({ right = RIGHT, reply } = {}) {
	call.mockImplementation(async (method, args) => {
		if (method !== VERIFY) return {}
		if (reply) return reply
		return args.code === right
			? { verified: true }
			: { verified: false, locked: false, wait_seconds: 0, message: "Incorrect code" }
	})
}

async function cachedHash() {
	await vi.waitFor(() => expect(localStorage.getItem(HASH_KEY)).not.toBeNull())
	return JSON.parse(localStorage.getItem(HASH_KEY))
}

// A right code caches its hash in the background, without being waited for (PBKDF2, 100,000 rounds). On a slow machine (the
// CI runner, 04.11) that write landed in the NEXT test, after its localStorage.clear(), and « is not made by a wrong code »
// found a hash: each test waits for the hashing it started.
const hashing = new Set()
for (const step of ["importKey", "deriveBits"]) {
	const original = crypto.subtle[step].bind(crypto.subtle)
	vi.spyOn(crypto.subtle, step).mockImplementation((...args) => {
		const promise = original(...args)
		hashing.add(promise)
		return promise
	})
}

async function hashingDone() {
	while (hashing.size) {
		const started = [...hashing]
		hashing.clear()
		await Promise.allSettled(started)
		// What follows a step (the next step, the hex, the write) runs before this timer
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
}

describe("unlocking with the personal code", () => {
	let lock

	beforeEach(async () => {
		localStorage.clear()
		call.mockReset()
		offlineState.isOffline = false
		user.userId = "waiter@yopmail.com"
		cart.isSubmitting = false
		theServer()
		lock = await pageLoad()
		lock.lockNow()
	})

	afterEach(async () => {
		lock.stopActivityTracking()
		lock.clearLock()
		vi.useRealTimers()
		await hashingDone()
	})

	describe("online", () => {
		it("asks the server and opens the lock on the right code", async () => {
			expect(lock.isLocked.value).toBe(true)
			const result = await lock.unlockWithCode(RIGHT)
			expect(result).toEqual({ success: true })
			expect(call).toHaveBeenCalledWith(VERIFY, { code: RIGHT })
			expect(lock.isLocked.value).toBe(false)
			expect(lock.verifyError.value).toBe("")
		})

		it("keeps the lock on a wrong code and says so", async () => {
			const result = await lock.unlockWithCode("9306")
			expect(result.success).toBe(false)
			expect(lock.isLocked.value).toBe(true)
			expect(lock.verifyError.value).toBe("Incorrect code")
			expect(lock.isVerifying.value).toBe(false)
		})

		it("shows the wait the server asks for, and counts it down from the answer", async () => {
			vi.useFakeTimers()
			vi.setSystemTime(new Date("2026-11-01T10:00:00Z"))
			theServer({
				reply: {
					verified: false,
					locked: true,
					wait_seconds: 60,
					message: "Too many wrong codes. Try again in 60 seconds.",
				},
			})
			const result = await lock.unlockWithCode(RIGHT)
			expect(result.success).toBe(false)
			expect(lock.isLocked.value).toBe(true)
			expect(lock.verifyError.value).toBe("Too many wrong codes. Try again in 60 seconds.")
			expect(lock.codeWaitUntil.value).toBe(Date.now() + 60_000)
		})

		it("does not count a server lock as another wrong attempt of the device", async () => {
			theServer({ reply: { verified: false, locked: true, wait_seconds: 60, message: "wait" } })
			await lock.unlockWithCode(RIGHT)
			expect(localStorage.getItem(ATTEMPT_KEY)).toBeNull()
		})

		it("counts a wrong code on the device's attempt counter, the one of the password", async () => {
			await lock.unlockWithCode("9306")
			await lock.unlockWithCode("9307")
			expect(JSON.parse(localStorage.getItem(ATTEMPT_KEY)).count).toBe(2)
			await lock.unlockWithCode(RIGHT)
			expect(localStorage.getItem(ATTEMPT_KEY)).toBeNull()
		})

		it("stops calling the server after five wrong codes of the device", async () => {
			for (let i = 0; i < 5; i++) await lock.unlockWithCode("9306")
			call.mockClear()
			const result = await lock.unlockWithCode(RIGHT)
			expect(result.success).toBe(false)
			expect(call).not.toHaveBeenCalled()
			expect(lock.verifyError.value).toMatch(/^Too many attempts\. Try again in \d+ seconds\.$/)
			expect(lock.codeWaitUntil.value).toBeGreaterThan(Date.now())
		})

		it("signs the user out when the session is gone", async () => {
			call.mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }))
			expect(await lock.unlockWithCode(RIGHT)).toEqual({ sessionExpired: true })
			expect(lock.isLocked.value).toBe(true)
		})

		it("never puts the code in the lock's own state", async () => {
			await lock.unlockWithCode("9306")
			expect(JSON.stringify(localStorage)).not.toContain("9306")
			await lock.unlockWithCode(RIGHT)
			await cachedHash()
			expect(JSON.stringify(localStorage)).not.toContain(RIGHT)
		})
	})

	describe("the cached hash of the code", () => {
		it("is made after a successful online verification, as a PBKDF2 hash with a salt", async () => {
			expect(localStorage.getItem(HASH_KEY)).toBeNull()
			await lock.unlockWithCode(RIGHT)
			const cached = await cachedHash()
			expect(cached.user).toBe("waiter@yopmail.com")
			expect(cached.hash).toMatch(/^[0-9a-f]{64}$/)
			expect(cached.salt).toMatch(/^[0-9a-f]{32}$/)
			expect(cached.hash).not.toContain(RIGHT)
			expect(Math.abs(cached.ts - Date.now())).toBeLessThan(10_000)
		})

		it("is not made by a wrong code, nor by the password", async () => {
			await lock.unlockWithCode("9306")
			await lock.unlock("any-password")
			await new Promise((resolve) => setTimeout(resolve, 20))
			expect(localStorage.getItem(HASH_KEY)).toBeNull()
		})

		it("is not made by the password path, which keeps its own key", async () => {
			call.mockImplementation(async (method) =>
				method === "pos_next.api.auth.verify_session_password" ? { verified: true } : {}
			)
			await lock.unlock("any-password")
			await vi.waitFor(() => expect(localStorage.getItem(PASSWORD_HASH_KEY)).not.toBeNull())
			expect(localStorage.getItem(HASH_KEY)).toBeNull()
		})
	})

	describe("offline", () => {
		async function verifiedOnceOnline() {
			await lock.unlockWithCode(RIGHT)
			await cachedHash()
			lock.lockNow()
			expect(lock.isLocked.value).toBe(true)
			offlineState.isOffline = true
			call.mockClear()
		}

		it("opens with the code against the cached hash, without the server", async () => {
			await verifiedOnceOnline()
			expect(await lock.unlockWithCode(RIGHT)).toEqual({ success: true })
			expect(lock.isLocked.value).toBe(false)
			expect(call).not.toHaveBeenCalled()
		})

		it("keeps the lock on a wrong code and counts it", async () => {
			await verifiedOnceOnline()
			const result = await lock.unlockWithCode("9306")
			expect(result.success).toBe(false)
			expect(lock.isLocked.value).toBe(true)
			expect(lock.verifyError.value).toBe("Incorrect code")
			expect(JSON.parse(localStorage.getItem(ATTEMPT_KEY)).count).toBe(1)
		})

		it("locks out after five wrong codes, with the right one refused too", async () => {
			await verifiedOnceOnline()
			for (let i = 0; i < 5; i++) await lock.unlockWithCode("9306")
			const result = await lock.unlockWithCode(RIGHT)
			expect(result.success).toBe(false)
			expect(lock.isLocked.value).toBe(true)
			expect(lock.verifyError.value).toMatch(/^Too many attempts\./)
		})

		it("refuses, and says to use the password, when no code was ever verified on this device", async () => {
			offlineState.isOffline = true
			const result = await lock.unlockWithCode(RIGHT)
			expect(result.success).toBe(false)
			expect(result.needsPassword).toBe(true)
			expect(lock.isLocked.value).toBe(true)
			expect(lock.verifyError.value).toBe("Cannot verify the code offline. Use your password.")
			expect(lock.canCheckCodeOffline()).toBe(false)
			expect(call).not.toHaveBeenCalled()
		})

		it("can be checked offline once the code was verified online, and not before", async () => {
			expect(lock.canCheckCodeOffline()).toBe(false)
			await lock.unlockWithCode(RIGHT)
			await cachedHash()
			expect(lock.canCheckCodeOffline()).toBe(true)
		})

		it("does not take the cached PASSWORD hash for a code hash", async () => {
			// A device that only ever verified a password has a password hash and no code hash
			call.mockImplementation(async () => ({ verified: true }))
			await lock.unlock("1234abcd")
			await vi.waitFor(() => expect(localStorage.getItem(PASSWORD_HASH_KEY)).not.toBeNull())
			lock.lockNow()
			offlineState.isOffline = true
			const result = await lock.unlockWithCode("1234")
			expect(result.success).toBe(false)
			expect(lock.isLocked.value).toBe(true)
		})

		it("refuses a hash older than 24 hours", async () => {
			await verifiedOnceOnline()
			const cached = JSON.parse(localStorage.getItem(HASH_KEY))
			localStorage.setItem(HASH_KEY, JSON.stringify({ ...cached, ts: Date.now() - DAY - 1000 }))
			const result = await lock.unlockWithCode(RIGHT)
			expect(result.success).toBe(false)
			expect(lock.verifyError.value).toBe("Cannot verify the code offline. Use your password.")
			expect(localStorage.getItem(HASH_KEY)).toBeNull()
		})

		it("refuses a hash that was made for another user", async () => {
			await verifiedOnceOnline()
			user.userId = "someone.else@yopmail.com"
			const result = await lock.unlockWithCode(RIGHT)
			expect(result.success).toBe(false)
			expect(lock.isLocked.value).toBe(true)
		})

		it("falls back to the cached hash when the network fails in the middle of the call", async () => {
			await lock.unlockWithCode(RIGHT)
			await cachedHash()
			lock.lockNow()
			call.mockRejectedValue(new TypeError("Failed to fetch"))
			expect(await lock.unlockWithCode(RIGHT)).toEqual({ success: true })
		})

		it("is forgotten when the user signs out (clearLock)", async () => {
			await verifiedOnceOnline()
			lock.clearLock()
			expect(localStorage.getItem(HASH_KEY)).toBeNull()
		})
	})
})

describe("locking by hand", () => {
	let lock

	beforeEach(async () => {
		localStorage.clear()
		call.mockReset()
		offlineState.isOffline = false
		user.userId = "waiter@yopmail.com"
		cart.isSubmitting = false
		theServer()
		lock = await pageLoad()
	})

	afterEach(() => {
		lock.stopActivityTracking()
		lock.clearLock()
		vi.useRealTimers()
	})

	it("locks at once whatever the auto-lock setting says", () => {
		lock.configure({ enabled: false, timeoutMinutes: 5 })
		lock.lockNow()
		expect(lock.isLocked.value).toBe(true)
	})

	it("stays locked when the setting that is off is read again", () => {
		lock.configure({ enabled: false, timeoutMinutes: 5 })
		lock.lockNow()
		lock.configure({ enabled: false, timeoutMinutes: 5 })
		expect(lock.isLocked.value).toBe(true)
	})

	it("survives a reload of the page when the auto-lock is off", async () => {
		lock.configure({ enabled: false, timeoutMinutes: 5 })
		lock.lockNow()
		const afterReload = await pageLoad()
		expect(afterReload.isLocked.value).toBe(true)
		// the till reads its settings again, as it does on every start: the lock is still there
		afterReload.configure({ enabled: false, timeoutMinutes: 5 })
		expect(afterReload.isLocked.value).toBe(true)
		afterReload.clearLock()
	})

	it("still releases an automatic lock when the setting is switched off", () => {
		lock.configure({ enabled: true, timeoutMinutes: 1 })
		lock.lock()
		expect(lock.isLocked.value).toBe(true)
		lock.configure({ enabled: false, timeoutMinutes: 1 })
		expect(lock.isLocked.value).toBe(false)
	})

	it("does not start the idle timer when the lock is opened and the auto-lock is off", async () => {
		vi.useFakeTimers()
		lock.configure({ enabled: false, timeoutMinutes: 1 })
		lock.lockNow()
		await lock.unlockWithCode(RIGHT)
		expect(lock.isLocked.value).toBe(false)
		vi.advanceTimersByTime(10 * 60 * 1000)
		expect(lock.isLocked.value).toBe(false)
	})

	it("starts the idle timer again when the lock is opened and the auto-lock is on", async () => {
		vi.useFakeTimers()
		lock.configure({ enabled: true, timeoutMinutes: 1 })
		lock.lockNow()
		await lock.unlockWithCode(RIGHT)
		expect(lock.isLocked.value).toBe(false)
		vi.advanceTimersByTime(60 * 1000)
		expect(lock.isLocked.value).toBe(true)
	})

	it("does nothing when the till is already locked", () => {
		lock.lockNow()
		const name = lock.lockedUser.value
		lock.lockNow()
		expect(lock.isLocked.value).toBe(true)
		expect(lock.lockedUser.value).toEqual(name)
	})
})

describe("leaving the screen", () => {
	let lock

	function screen(hidden) {
		Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
		document.dispatchEvent(new Event("visibilitychange"))
	}

	beforeEach(async () => {
		localStorage.clear()
		call.mockReset()
		offlineState.isOffline = false
		cart.isSubmitting = false
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-11-01T10:00:00Z"))
		lock = await pageLoad()
	})

	afterEach(() => {
		lock.stopActivityTracking()
		lock.clearLock()
		screen(false)
		vi.useRealTimers()
	})

	it("locks at once when the till asks for it (the behaviour tills have had until now)", () => {
		lock.configure({ enabled: true, timeoutMinutes: 5, lockOnLeave: true })
		lock.startActivityTracking()
		screen(true)
		expect(lock.isLocked.value).toBe(true)
	})

	it("does not lock a phone that goes to sleep for a minute when the till waits for its delay", () => {
		lock.configure({ enabled: true, timeoutMinutes: 5, lockOnLeave: false })
		lock.startActivityTracking()
		screen(true)
		expect(lock.isLocked.value).toBe(false)
		vi.advanceTimersByTime(60 * 1000)
		screen(false)
		expect(lock.isLocked.value).toBe(false)
	})

	it("locks the phone that comes back after the delay", () => {
		lock.configure({ enabled: true, timeoutMinutes: 5, lockOnLeave: false })
		lock.startActivityTracking()
		screen(true)
		vi.setSystemTime(new Date(Date.now() + 6 * 60 * 1000))
		screen(false)
		expect(lock.isLocked.value).toBe(true)
	})

	it("counts the delay from the last use, not from the moment the screen went off", () => {
		lock.configure({ enabled: true, timeoutMinutes: 5, lockOnLeave: false })
		lock.startActivityTracking()
		vi.setSystemTime(new Date(Date.now() + 4 * 60 * 1000))
		document.dispatchEvent(new Event("touchstart"))
		screen(true)
		vi.setSystemTime(new Date(Date.now() + 2 * 60 * 1000))
		screen(false)
		expect(lock.isLocked.value).toBe(false)
	})

	it("locks a page that is loaded again after the delay (the phone dropped the tab)", async () => {
		lock.configure({ enabled: true, timeoutMinutes: 5, lockOnLeave: false })
		lock.startActivityTracking()
		document.dispatchEvent(new Event("touchstart"))
		const stamp = Date.now()
		lock.stopActivityTracking()
		// A new page, 8 minutes later
		vi.setSystemTime(new Date(stamp + 8 * 60 * 1000))
		const reloaded = await pageLoad()
		expect(reloaded.isLocked.value).toBe(false)
		reloaded.configure({ enabled: true, timeoutMinutes: 5, lockOnLeave: false })
		reloaded.startActivityTracking()
		expect(reloaded.isLocked.value).toBe(true)
		reloaded.stopActivityTracking()
		reloaded.clearLock()
	})

	it("does not lock a page that is loaded again inside the delay", async () => {
		lock.configure({ enabled: true, timeoutMinutes: 5, lockOnLeave: false })
		lock.startActivityTracking()
		document.dispatchEvent(new Event("touchstart"))
		const stamp = Date.now()
		lock.stopActivityTracking()
		vi.setSystemTime(new Date(stamp + 2 * 60 * 1000))
		const reloaded = await pageLoad()
		reloaded.configure({ enabled: true, timeoutMinutes: 5, lockOnLeave: false })
		reloaded.startActivityTracking()
		expect(reloaded.isLocked.value).toBe(false)
		reloaded.stopActivityTracking()
		reloaded.clearLock()
	})

	it("does not lock a page that is hidden while the lock is off", () => {
		lock.configure({ enabled: false, timeoutMinutes: 5, lockOnLeave: true })
		screen(true)
		screen(false)
		expect(lock.isLocked.value).toBe(false)
	})
})
