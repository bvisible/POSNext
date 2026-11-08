/**
 * //// Neoffice — added file (no upstream equivalent). Whether this till is the phone of a waiter, which keeps the waiter inside the app (the product owner, 08.11.2026: « pour pas que l'on puisse
 * //// facilement sortir de l'application au niveau du serveur »). It follows the width of the screen and what the till says the user may do.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h } from "vue"

const store = vi.hoisted(() => ({}))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => store }))

const { useWaiterLock } = await import("../useWaiterLock")

function withWidth(width) {
	Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true })
}

let wrapper
function lockOf({ width, enabled = true, can = {} }) {
	withWidth(width)
	for (const key of Object.keys(store)) delete store[key]
	Object.assign(store, { isEnabled: enabled, can })
	let lock
	wrapper = mount(
		defineComponent({
			setup() {
				lock = useWaiterLock()
				return () => h("div")
			},
		}),
	)
	return lock
}

const startWidth = window.innerWidth
afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	withWidth(startWidth)
})

describe("the lock of a waiter's phone", () => {
	it("holds on a phone for someone who does not lay the floor out, and takes the way to the back office", () => {
		const lock = lockOf({ width: 390, can: { set_table_status: true } })

		expect(lock.locked.value).toBe(true)
		expect(lock.mayLeave.value).toBe(false)
	})

	it("holds before the till has said what the user may do", () => {
		expect(lockOf({ width: 390, can: undefined }).locked.value).toBe(true)
	})

	it("lets a manager's phone go to the back office", () => {
		const lock = lockOf({ width: 390, can: { manage_floor: true } })

		expect(lock.locked.value).toBe(false)
		expect(lock.mayLeave.value).toBe(true)
	})

	it("lets a tablet and a computer go, whoever uses them", () => {
		for (const width of [768, 1180, 1920]) {
			expect(lockOf({ width, can: {} }).locked.value, String(width)).toBe(false)
			wrapper.unmount()
		}
	})

	it("does not lock a till that is no restaurant's", () => {
		expect(lockOf({ width: 390, enabled: false }).locked.value).toBe(false)
	})

	it("follows a phone turned sideways, a window widened", async () => {
		const lock = lockOf({ width: 390 })
		expect(lock.locked.value).toBe(true)

		withWidth(1024)
		window.dispatchEvent(new Event("resize"))
		await Promise.resolve()

		expect(lock.locked.value).toBe(false)
	})
})
