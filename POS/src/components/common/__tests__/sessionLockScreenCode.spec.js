/**
 * //// Neoffice — added file (no upstream equivalent). The lock screen of the till shows a big numeric keypad when the user has a
 * //// personal code (NeoRestau lot 1, product owner, 01.11.2026), and behaves exactly as it always did when they have none. The
 * //// real lock, the real code state and the real screen; only the network, the user and the cart are stand-ins.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const call = vi.hoisted(() => vi.fn())
const offlineState = vi.hoisted(() => ({ isOffline: false }))
const uiOffline = vi.hoisted(() => ({ value: false }))
const logout = vi.hoisted(() => vi.fn())
const cleanup = vi.hoisted(() => vi.fn(async () => {}))
const user = vi.hoisted(() => ({
	userId: "waiter@yopmail.com",
	getDisplayName: () => "Waiter One",
	getImageUrl: () => null,
	getInitials: () => "WO",
}))

vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? s.replace(/\{(\d+)\}/g, (_, i) => args[i]) : s)
})

vi.mock("frappe-ui", () => ({
	FeatherIcon: { props: ["name"], template: '<i :data-icon="name" />' },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/data/user", () => ({ userData: user }))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => ({ isSubmitting: false }) }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState }))
vi.mock("@/composables/useOfflineStatus", async () => {
	const { computed } = await import("vue")
	return { useOfflineStatus: () => ({ isOffline: computed(() => uiOffline.value) }) }
})
vi.mock("@/data/session", () => ({ session: { logout: { submit: logout } } }))
vi.mock("@/utils/sessionCleanup", () => ({ cleanupUserSession: cleanup }))

const HAS = "pos_next.api.till_code.has_till_code"
const VERIFY = "pos_next.api.till_code.verify_till_code"
const PASSWORD_CHECK = "pos_next.api.auth.verify_session_password"
const RIGHT = "4829"

function theServer({ has = { has_code: true, length: 4 }, verify, failing = false } = {}) {
	if (failing) {
		call.mockRejectedValue(new TypeError("Failed to fetch"))
		return
	}
	call.mockImplementation(async (method, args) => {
		if (method === HAS) return has
		if (method === VERIFY) {
			if (verify) return verify
			return args.code === RIGHT
				? { verified: true }
				: { verified: false, locked: false, wait_seconds: 0, message: "Incorrect code" }
		}
		if (method === PASSWORD_CHECK) return { verified: args.password === "right-password" }
		return {}
	})
}

let wrapper
let lock

/** The screen as a page load finds it, with the till locked by hand. */
async function lockedScreen(server = {}) {
	vi.resetModules()
	theServer(server)
	const { useSessionLock } = await import("@/composables/useSessionLock")
	const { default: SessionLockScreen } = await import("../SessionLockScreen.vue")
	lock = useSessionLock()
	wrapper = mount(SessionLockScreen, {
		global: { mocks: { __: globalThis.__ }, stubs: { teleport: true } },
		attachTo: document.body,
	})
	lock.lockNow()
	await flushPromises()
	return wrapper
}

const keypad = () => wrapper.find('[data-test="code-keypad"]')
const passwordForm = () => wrapper.find('[data-test="password-form"]')
const key = (digit) => wrapper.find(`[data-test="key-${digit}"]`)
const dots = () => wrapper.findAll('[data-test="code-dot"]')
const filled = () => dots().filter((dot) => dot.attributes("data-filled") === "true").length

async function type(digits) {
	for (const digit of digits) {
		await key(digit).trigger("click")
	}
	await flushPromises()
}

describe("the lock screen of a user who has a code", () => {
	beforeEach(() => {
		localStorage.clear()
		call.mockReset()
		offlineState.isOffline = false
		uiOffline.value = false
		logout.mockReset()
		cleanup.mockClear()
		user.userId = "waiter@yopmail.com"
	})

	afterEach(() => {
		wrapper?.unmount()
		lock?.stopActivityTracking()
		lock?.clearLock()
		vi.useRealTimers()
	})

	it("shows the keypad, and not the password field", async () => {
		await lockedScreen()
		expect(keypad().exists()).toBe(true)
		expect(passwordForm().exists()).toBe(false)
		expect(wrapper.text()).toContain("Waiter One")
	})

	it("has ten digit keys and a delete key, each at least 44 pixels high", async () => {
		await lockedScreen()
		for (const digit of "0123456789") {
			const button = key(digit)
			expect(button.exists(), `key ${digit}`).toBe(true)
			expect(button.text()).toBe(digit)
			// h-14 is 3.5rem, 56 px: above the 44 px of a finger
			expect(button.classes(), `key ${digit}`).toContain("h-14")
		}
		expect(wrapper.find('[data-test="key-delete"]').classes()).toContain("h-14")
	})

	it("draws one dot per digit of the code and fills them as the code is typed", async () => {
		await lockedScreen({ has: { has_code: true, length: 6 } })
		expect(dots()).toHaveLength(6)
		expect(filled()).toBe(0)
		await type("48")
		expect(filled()).toBe(2)
		await wrapper.find('[data-test="key-delete"]').trigger("click")
		expect(filled()).toBe(1)
	})

	it("sends the code by itself at the last digit, and not before", async () => {
		await lockedScreen()
		call.mockClear()
		await type("482")
		expect(call).not.toHaveBeenCalledWith(VERIFY, expect.anything())
		await type("9")
		expect(call).toHaveBeenCalledWith(VERIFY, { code: RIGHT })
	})

	it("opens the lock on the right code", async () => {
		await lockedScreen()
		await type(RIGHT)
		expect(lock.isLocked.value).toBe(false)
		expect(wrapper.find('[data-test="code-keypad"]').exists()).toBe(false)
	})

	it("clears the dots, shakes and says so on a wrong code", async () => {
		await lockedScreen()
		await type("9306")
		expect(lock.isLocked.value).toBe(true)
		expect(filled()).toBe(0)
		expect(wrapper.find('[data-test="lock-error"]').text()).toBe("Incorrect code")
		expect(wrapper.find('[data-test="code-dots"]').classes()).toContain("lock-shake")
		// and it can be tried again
		await type(RIGHT)
		expect(lock.isLocked.value).toBe(false)
	})

	it("takes no more digits than the code has while a check is under way", async () => {
		await lockedScreen()
		let release
		call.mockImplementation(
			(method) =>
				new Promise((resolve) => {
					release = () => resolve(method === VERIFY ? { verified: true } : {})
				})
		)
		await type("4829")
		await type("11")
		expect(filled()).toBe(4)
		release()
		await flushPromises()
	})

	it("types with a physical keyboard too", async () => {
		await lockedScreen()
		call.mockClear()
		for (const digit of RIGHT) {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: digit }))
		}
		await flushPromises()
		expect(call).toHaveBeenCalledWith(VERIFY, { code: RIGHT })
		expect(lock.isLocked.value).toBe(false)
	})

	it("shows the wait when the server throttles, keeps the keys off, and gives them back when it is over", async () => {
		vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] })
		vi.setSystemTime(new Date("2026-11-01T10:00:00Z"))
		await lockedScreen({
			verify: { verified: false, locked: true, wait_seconds: 60, message: "Too many wrong codes. Try again in 60 seconds." },
		})
		await type("9306")
		expect(wrapper.find('[data-test="lock-error"]').text()).toBe("Too many wrong codes. Try again in 60 seconds.")
		expect(key("1").attributes("disabled")).toBeDefined()
		await vi.advanceTimersByTimeAsync(20_000)
		expect(wrapper.find('[data-test="lock-error"]').text()).toBe("Too many wrong codes. Try again in 40 seconds.")
		expect(key("1").attributes("disabled")).toBeDefined()
		await vi.advanceTimersByTimeAsync(40_000)
		expect(key("1").attributes("disabled")).toBeUndefined()
		expect(wrapper.find('[data-test="lock-error"]').exists()).toBe(false)
	})

	it("falls back to the password with a plain link, and back", async () => {
		await lockedScreen()
		const link = wrapper.find('[data-test="use-password"]')
		expect(link.text()).toBe("Use my password")
		await link.trigger("click")
		expect(keypad().exists()).toBe(false)
		expect(passwordForm().exists()).toBe(true)
		expect(wrapper.find('input[autocomplete="current-password"]').exists()).toBe(true)
		const back = wrapper.find('[data-test="use-code"]')
		expect(back.text()).toBe("Use my code")
		await back.trigger("click")
		expect(keypad().exists()).toBe(true)
		expect(passwordForm().exists()).toBe(false)
	})

	it("opens with the password from the fallback, as it always did", async () => {
		await lockedScreen()
		await wrapper.find('[data-test="use-password"]').trigger("click")
		await wrapper.find('input[autocomplete="current-password"]').setValue("right-password")
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(call).toHaveBeenCalledWith(PASSWORD_CHECK, { password: "right-password" })
		expect(lock.isLocked.value).toBe(false)
	})

	it("starts on the keypad again the next time it locks", async () => {
		await lockedScreen()
		await wrapper.find('[data-test="use-password"]').trigger("click")
		await wrapper.find('input[autocomplete="current-password"]').setValue("right-password")
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(lock.isLocked.value).toBe(false)
		lock.lockNow()
		await flushPromises()
		expect(keypad().exists()).toBe(true)
	})

	it("still offers the sign-out", async () => {
		await lockedScreen()
		const signOut = wrapper.findAll("button").find((button) => button.text() === "Sign Out")
		expect(signOut).toBeDefined()
		await signOut.trigger("click")
		await flushPromises()
		expect(cleanup).toHaveBeenCalled()
		expect(logout).toHaveBeenCalled()
	})

	it("signs out when the session is gone", async () => {
		await lockedScreen()
		call.mockImplementation(async (method) => {
			if (method === VERIFY) throw Object.assign(new Error("forbidden"), { status: 403 })
			return {}
		})
		await type(RIGHT)
		expect(cleanup).toHaveBeenCalled()
		expect(logout).toHaveBeenCalled()
	})

	it("knows the user has a code at once from what the device remembers, before the server answers", async () => {
		localStorage.setItem(
			"pos_till_code_state",
			JSON.stringify({ user: "waiter@yopmail.com", has: true, length: 5 })
		)
		vi.resetModules()
		call.mockImplementation(() => new Promise(() => {}))
		const { useSessionLock } = await import("@/composables/useSessionLock")
		const { default: SessionLockScreen } = await import("../SessionLockScreen.vue")
		lock = useSessionLock()
		wrapper = mount(SessionLockScreen, {
			global: { mocks: { __: globalThis.__ }, stubs: { teleport: true } },
			attachTo: document.body,
		})
		lock.lockNow()
		await flushPromises()
		expect(keypad().exists()).toBe(true)
		expect(dots()).toHaveLength(5)
	})

	it("does not use the keypad of another user of the same browser", async () => {
		localStorage.setItem(
			"pos_till_code_state",
			JSON.stringify({ user: "someone.else@yopmail.com", has: true, length: 4 })
		)
		await lockedScreen({ has: { has_code: false, length: 0 } })
		expect(keypad().exists()).toBe(false)
		expect(passwordForm().exists()).toBe(true)
	})
})

describe("the lock screen of a user who has no code", () => {
	beforeEach(() => {
		localStorage.clear()
		call.mockReset()
		offlineState.isOffline = false
		uiOffline.value = false
		user.userId = "waiter@yopmail.com"
	})

	afterEach(() => {
		wrapper?.unmount()
		lock?.stopActivityTracking()
		lock?.clearLock()
	})

	it("is the password screen it always was, with no keypad and no link", async () => {
		await lockedScreen({ has: { has_code: false, length: 0 } })
		expect(keypad().exists()).toBe(false)
		expect(passwordForm().exists()).toBe(true)
		expect(wrapper.find('[data-test="use-password"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="use-code"]').exists()).toBe(false)
		expect(wrapper.text()).toContain("Session Locked")
	})

	it("opens with the password", async () => {
		await lockedScreen({ has: { has_code: false, length: 0 } })
		await wrapper.find('input[autocomplete="current-password"]').setValue("right-password")
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(lock.isLocked.value).toBe(false)
	})

	it("is the password screen when the server cannot be asked and nothing is remembered", async () => {
		await lockedScreen({ failing: true })
		expect(keypad().exists()).toBe(false)
		expect(passwordForm().exists()).toBe(true)
	})
})

describe("the lock screen offline", () => {
	beforeEach(() => {
		localStorage.clear()
		call.mockReset()
		offlineState.isOffline = true
		uiOffline.value = true
		user.userId = "waiter@yopmail.com"
	})

	afterEach(() => {
		wrapper?.unmount()
		lock?.stopActivityTracking()
		lock?.clearLock()
		offlineState.isOffline = false
		uiOffline.value = false
	})

	it("asks for the password when no code was verified on this device", async () => {
		localStorage.setItem(
			"pos_till_code_state",
			JSON.stringify({ user: "waiter@yopmail.com", has: true, length: 4 })
		)
		await lockedScreen()
		expect(keypad().exists()).toBe(false)
		expect(passwordForm().exists()).toBe(true)
		expect(wrapper.find('[data-test="use-code"]').exists()).toBe(false)
	})

	it("keeps the keypad, and opens, with a code verified on this device before", async () => {
		offlineState.isOffline = false
		uiOffline.value = false
		await lockedScreen()
		await type(RIGHT)
		await vi.waitFor(() => expect(localStorage.getItem("pos_till_code_hash")).not.toBeNull())
		lock.lockNow()
		offlineState.isOffline = true
		uiOffline.value = true
		await flushPromises()
		expect(keypad().exists()).toBe(true)
		call.mockClear()
		await type(RIGHT)
		// The hash is worked out by Web Crypto, which flushPromises does not wait for
		await vi.waitFor(() => expect(lock.isLocked.value).toBe(false))
		expect(call).not.toHaveBeenCalledWith(VERIFY, expect.anything())
	})

	it("shows the offline badge as before", async () => {
		await lockedScreen({ has: { has_code: false, length: 0 } })
		expect(wrapper.text()).toContain("Offline")
	})
})
