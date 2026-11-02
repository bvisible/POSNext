/**
 * //// Neoffice — added file (no upstream equivalent). The small dialog of the user's menu: "Set my till code" (the current
 * //// password, the new code, the code again) and "Remove my code" (the current password) — NeoResto lot 1, product owner,
 * //// 01.11.2026. The server checks the password and the code; the dialog never keeps either once it is done, and never
 * //// writes them to the console.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }))
const offlineState = vi.hoisted(() => ({ isOffline: false }))
const user = vi.hoisted(() => ({ userId: "waiter@yopmail.com" }))
const lockState = vi.hoisted(() => ({ locked: { value: false } }))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/data/user", () => ({ userData: user }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState }))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))
vi.mock("@/composables/useSessionLock", async () => {
	const { ref } = await import("vue")
	lockState.locked = ref(false)
	return { useSessionLock: () => ({ isLocked: lockState.locked }) }
})

const SET = "pos_next.api.till_code.set_till_code"
const CLEAR = "pos_next.api.till_code.clear_till_code"
const PASSWORD = "Account-Password#2026"

let wrapper
let tillCode

async function dialogOpenedFor(mode = "set", has = { has_code: false, length: 0 }) {
	vi.resetModules()
	call.mockImplementation(async (method) => {
		if (method === SET) return { has_code: true, length: 4 }
		if (method === CLEAR) return { has_code: false, length: 0 }
		return has
	})
	const { useTillCode } = await import("@/composables/useTillCode")
	const { default: TillCodeDialog } = await import("../TillCodeDialog.vue")
	tillCode = useTillCode()
	wrapper = mount(TillCodeDialog, {
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	tillCode.openDialog(mode)
	await flushPromises()
	return wrapper
}

const field = (name) => wrapper.find(`[data-test="${name}"]`)
const saveButton = () => wrapper.find('[data-test="till-code-save"]')

async function fill({ password = PASSWORD, code = "4829", again = code } = {}) {
	await field("till-code-password").setValue(password)
	if (code !== null) {
		await field("till-code-new").setValue(code)
		await field("till-code-again").setValue(again)
	}
}

describe("the dialog of the till code", () => {
	beforeEach(() => {
		localStorage.clear()
		call.mockReset()
		toast.showSuccess.mockReset()
		toast.showError.mockReset()
		offlineState.isOffline = false
	})

	afterEach(() => {
		wrapper?.unmount()
	})

	it("draws nothing while it is closed", async () => {
		await dialogOpenedFor()
		tillCode.closeDialog()
		await flushPromises()
		expect(wrapper.find('[data-test="till-code-dialog"]').exists()).toBe(false)
	})

	it("asks for the current password, the new code and the code again", async () => {
		await dialogOpenedFor("set")
		expect(wrapper.find('[data-test="till-code-dialog"]').exists()).toBe(true)
		expect(wrapper.text()).toContain("Set my till code")
		expect(field("till-code-password").attributes("type")).toBe("password")
		expect(field("till-code-password").attributes("autocomplete")).toBe("current-password")
		expect(field("till-code-new").attributes("inputmode")).toBe("numeric")
		expect(field("till-code-new").attributes("maxlength")).toBe("6")
		expect(field("till-code-again").attributes("inputmode")).toBe("numeric")
		const labels = wrapper.findAll("label").map((label) => label.text())
		expect(labels).toEqual(["Current password", "New code", "Repeat the code"])
	})

	it("keeps only digits in the code fields", async () => {
		await dialogOpenedFor("set")
		await field("till-code-new").setValue("48a9-2x1")
		expect(field("till-code-new").element.value).toBe("48921")
		await field("till-code-again").setValue("４８")
		expect(field("till-code-again").element.value).toBe("")
	})

	it("saves nothing until the password is given and the two codes are four to six digits and alike", async () => {
		await dialogOpenedFor("set")
		expect(saveButton().attributes("disabled")).toBeDefined()
		await fill({ password: "", code: "4829" })
		expect(saveButton().attributes("disabled")).toBeDefined()
		await fill({ code: "482", again: "482" })
		expect(saveButton().attributes("disabled")).toBeDefined()
		await fill({ code: "4829", again: "4820" })
		expect(saveButton().attributes("disabled")).toBeDefined()
		await fill({ code: "4829", again: "4829" })
		expect(saveButton().attributes("disabled")).toBeUndefined()
	})

	it("says the two codes differ, once the second has the length of the first", async () => {
		await dialogOpenedFor("set")
		await fill({ code: "4829", again: "48" })
		expect(wrapper.text()).not.toContain("The two codes are different.")
		await fill({ code: "4829", again: "4820" })
		expect(wrapper.text()).toContain("The two codes are different.")
		await call.mockClear()
		await wrapper.find("form").trigger("submit")
		expect(call).not.toHaveBeenCalled()
	})

	it("sets the code with the password, closes, and says so", async () => {
		await dialogOpenedFor("set")
		await fill()
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(call).toHaveBeenCalledWith(SET, { password: PASSWORD, code: "4829" })
		expect(toast.showSuccess).toHaveBeenCalledWith("Till code saved")
		expect(tillCode.dialog.open).toBe(false)
		expect(tillCode.hasCode.value).toBe(true)
		expect(tillCode.codeLength.value).toBe(4)
	})

	it("shows what the server says when it refuses, and stays open", async () => {
		await dialogOpenedFor("set")
		call.mockRejectedValueOnce(Object.assign(new Error("x"), { messages: ["Incorrect password"] }))
		await fill()
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(field("till-code-error").text()).toBe("Incorrect password")
		expect(tillCode.dialog.open).toBe(true)
		expect(toast.showSuccess).not.toHaveBeenCalled()
		// The password is asked again, the code can be corrected
		expect(field("till-code-password").element.value).toBe("")
		expect(field("till-code-new").element.value).toBe("4829")
	})

	it("shows the server's refusal of a code that is too easy", async () => {
		await dialogOpenedFor("set")
		call.mockRejectedValueOnce(
			Object.assign(new Error("x"), { messages: ["<p>This code is too easy to guess. Choose another one.</p>"] })
		)
		await fill({ code: "1234" })
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(field("till-code-error").text()).toBe("This code is too easy to guess. Choose another one.")
	})

	it("says it cannot be done offline instead of calling", async () => {
		await dialogOpenedFor("set")
		offlineState.isOffline = true
		await fill()
		call.mockClear()
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(call).not.toHaveBeenCalledWith(SET, expect.anything())
		expect(field("till-code-error").text()).toBe("A code can only be set or removed online.")
	})

	it("removes the code with the password only", async () => {
		await dialogOpenedFor("remove", { has_code: true, length: 4 })
		expect(wrapper.text()).toContain("Remove my code")
		expect(field("till-code-new").exists()).toBe(false)
		expect(field("till-code-again").exists()).toBe(false)
		expect(saveButton().attributes("disabled")).toBeDefined()
		await field("till-code-password").setValue(PASSWORD)
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(call).toHaveBeenCalledWith(CLEAR, { password: PASSWORD })
		expect(toast.showSuccess).toHaveBeenCalledWith("Till code removed")
		expect(tillCode.dialog.open).toBe(false)
		expect(tillCode.hasCode.value).toBe(false)
	})

	it("wipes what was typed when it is cancelled, and when it opens again", async () => {
		await dialogOpenedFor("set")
		await fill()
		await wrapper.find('[data-test="till-code-cancel"]').trigger("click")
		expect(tillCode.dialog.open).toBe(false)
		tillCode.openDialog("set")
		await flushPromises()
		expect(field("till-code-password").element.value).toBe("")
		expect(field("till-code-new").element.value).toBe("")
		expect(field("till-code-again").element.value).toBe("")
	})

	it("closes, and forgets what was typed, when the till locks", async () => {
		await dialogOpenedFor("set")
		await fill()
		lockState.locked.value = true
		await flushPromises()
		expect(tillCode.dialog.open).toBe(false)
		lockState.locked.value = false
		tillCode.openDialog("set")
		await flushPromises()
		expect(field("till-code-password").element.value).toBe("")
	})

	it("never writes the password or the code to the console or to storage", async () => {
		const spies = ["log", "info", "warn", "error", "debug"].map((name) => vi.spyOn(console, name).mockImplementation(() => {}))
		await dialogOpenedFor("set")
		call.mockRejectedValueOnce(Object.assign(new Error("x"), { messages: ["Incorrect password"] }))
		await fill()
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		for (const spy of spies) {
			expect(JSON.stringify(spy.mock.calls)).not.toContain(PASSWORD)
			expect(JSON.stringify(spy.mock.calls)).not.toContain("4829")
			spy.mockRestore()
		}
		expect(JSON.stringify(localStorage)).not.toContain(PASSWORD)
		expect(JSON.stringify(localStorage)).not.toContain("4829")
	})
})
