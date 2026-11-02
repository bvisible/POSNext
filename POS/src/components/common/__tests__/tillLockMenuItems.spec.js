/**
 * //// Neoffice — added file (no upstream equivalent). The user's avatar menu offers "Lock", "Set my till code" and, for a user who
 * //// has a code, "Remove my code" (NeoResto lot 1, product owner, 01.11.2026). The entries are drawn by TillLockMenuItems, which
 * //// the till's menu holds in its slot; the dialog they open lives OUTSIDE the menu, because the menu closes on every click.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const lockNow = vi.hoisted(() => vi.fn())
const offlineState = vi.hoisted(() => ({ isOffline: false }))
const user = vi.hoisted(() => ({ userId: "waiter@yopmail.com" }))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/data/user", () => ({ userData: user }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState }))
vi.mock("@/composables/useSessionLock", () => ({ useSessionLock: () => ({ lockNow }) }))

const HAS = "pos_next.api.till_code.has_till_code"

let wrapper
let tillCode

async function menuItems({ has = { has_code: false, length: 0 } } = {}) {
	vi.resetModules()
	call.mockImplementation(async (method) => (method === HAS ? has : {}))
	const { useTillCode } = await import("@/composables/useTillCode")
	const { default: TillLockMenuItems } = await import("../TillLockMenuItems.vue")
	tillCode = useTillCode()
	wrapper = mount(TillLockMenuItems, { global: { mocks: { __: globalThis.__ } } })
	await flushPromises()
	return wrapper
}

const entry = (name) => wrapper.find(`[data-test="${name}"]`)

describe("the entries of the user's menu", () => {
	beforeEach(() => {
		localStorage.clear()
		call.mockReset()
		lockNow.mockReset()
		offlineState.isOffline = false
	})

	afterEach(() => {
		tillCode?.closeDialog()
		wrapper?.unmount()
	})

	it("has Lock and Set my till code", async () => {
		await menuItems()
		expect(entry("lock-the-till").exists()).toBe(true)
		expect(entry("lock-the-till").text()).toBe("Lock")
		expect(entry("set-till-code").exists()).toBe(true)
		expect(entry("set-till-code").text()).toBe("Set my till code")
	})

	it("locks at once when Lock is chosen", async () => {
		await menuItems()
		await entry("lock-the-till").trigger("click")
		expect(lockNow).toHaveBeenCalledTimes(1)
	})

	it("opens the dialog to set a code", async () => {
		await menuItems()
		await entry("set-till-code").trigger("click")
		expect(tillCode.dialog.open).toBe(true)
		expect(tillCode.dialog.mode).toBe("set")
	})

	it("offers Remove my code only to a user who has one", async () => {
		await menuItems({ has: { has_code: false, length: 0 } })
		expect(entry("remove-till-code").exists()).toBe(false)
		wrapper.unmount()
		await menuItems({ has: { has_code: true, length: 4 } })
		expect(entry("remove-till-code").exists()).toBe(true)
		expect(entry("remove-till-code").text()).toBe("Remove my code")
	})

	it("opens the dialog to remove the code", async () => {
		await menuItems({ has: { has_code: true, length: 4 } })
		await entry("remove-till-code").trigger("click")
		expect(tillCode.dialog.open).toBe(true)
		expect(tillCode.dialog.mode).toBe("remove")
	})

	it("asks the server whether the user has a code when the menu opens", async () => {
		await menuItems()
		expect(call).toHaveBeenCalledWith(HAS, {})
	})

	it("offers the entries whatever the auto-lock setting says (it does not read the setting)", async () => {
		await menuItems()
		expect(call).not.toHaveBeenCalledWith(expect.stringContaining("pos_settings"), expect.anything())
		expect(entry("lock-the-till").attributes("disabled")).toBeUndefined()
	})
})
