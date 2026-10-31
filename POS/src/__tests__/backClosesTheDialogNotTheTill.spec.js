/**
 * //// Neoffice — added file (no upstream equivalent). The Back of a phone closes the QR dialog and the till stays where it is
 * //// (NeoRestau lot 1). The dialog takes one entry of the browser's history while it is a phone's (composables/
 * //// useBackClosesDialog), and the Back that follows consumes it. That Back is a pop of the history like any other, which the
 * //// router of the till answers: onto the location it is already at, since the entry has the address of the page. Here it is
 * //// the real router of the till (guards and `afterEach` included) and the real dialog, and what has to stay is the till's:
 * //// its route, its address, and the name its tab carries ("Restaurant till · Neopos"): the router's `afterEach` hands the
 * //// tab to the screen of the route after every navigation, which would drop the name the till learned from its shift if it
 * //// took a pop onto the location already shown for a new screen.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

const toCanvas = vi.hoisted(() => vi.fn(async () => {}))
vi.mock("qrcode", () => ({ default: { toCanvas } }))
// The pages are lazy routes: the till itself is not under test, a navigation to it must not load it
vi.mock("@/pages/POSSale.vue", () => ({ default: { template: "<div />" } }))
vi.mock("@/pages/CustomerDisplay.vue", () => ({
	default: { template: "<div />" },
}))
// The router is only asked for its guards: its other imports are not under test
vi.mock("@/composables/useShift", () => ({ shiftState: {} }))
vi.mock("@/data/user", () => ({ userResource: {} }))
vi.mock("@/data/session", () => ({ session: { isLoggedIn: true } }))

const { default: router } = await import("../router")
const { default: TableQRCode } = await import(
	"@/components/restaurant/TableQRCode.vue"
)
const { ENTRY_KEY } = await import("@/composables/useBackClosesDialog")
const { nameTheTab } = await import("@/utils/tabTitle")

// jsdom answers history.back() on a task of its own
const settle = () => new Promise((resolve) => setTimeout(resolve, 40))
const NAME = "Restaurant till · Neopos"

let wrapper

function showTheCode() {
	window.innerWidth = 390
	window.innerHeight = 844
	wrapper = mount(TableQRCode, {
		props: {
			token: "tok-1",
			tableName: "Table 12",
			url: "https://shop.example/pos/guest/tok-1",
		},
		global: { mocks: { __: globalThis.__ } },
	})
	return wrapper
}

beforeEach(async () => {
	await router.push("/")
	await router.isReady()
	// What the till does once its shift is open (composables/useTillTabTitle)
	nameTheTab("Restaurant till")
})
afterEach(async () => {
	wrapper?.unmount()
	wrapper = undefined
	await settle()
})

describe("the Back of a phone that closes the QR code", () => {
	it("leaves the till on its route, at its address, with the name its tab carries", async () => {
		const address = location.href
		expect(document.title).toBe(NAME)
		showTheCode()
		expect(history.state[ENTRY_KEY]).toBeTruthy()

		history.back()
		await settle()

		expect(wrapper.emitted("close")).toHaveLength(1)
		expect(router.currentRoute.value.name).toBe("POSSale")
		expect(location.href).toBe(address)
		expect(document.title).toBe(NAME)
	})

	it("is no navigation that fails, and the router goes on", async () => {
		const failures = []
		router.afterEach((_to, _from, failure) => {
			if (failure) failures.push(failure)
		})
		showTheCode()

		history.back()
		await settle()

		expect(failures).toEqual([])
		await router.push("/display")
		expect(router.currentRoute.value.name).toBe("CustomerDisplay")
		router.back()
		await settle()
		expect(router.currentRoute.value.name).toBe("POSSale")
	})
})

describe("the dialog closed by its own button", () => {
	it("gives its entry back and leaves the till as it was, tab name included", async () => {
		const address = location.href
		showTheCode()
		expect(history.state[ENTRY_KEY]).toBeTruthy()

		// The page takes the dialog away, as it does when the dialog says close
		wrapper.unmount()
		wrapper = undefined
		await settle()

		expect(history.state[ENTRY_KEY]).toBeUndefined()
		expect(router.currentRoute.value.name).toBe("POSSale")
		expect(location.href).toBe(address)
		expect(document.title).toBe(NAME)
	})
})

describe("a navigation of the router", () => {
	it("still renames the tab for the screen it goes to, and drops the name of the one it leaves", async () => {
		await router.push("/display")

		expect(router.currentRoute.value.name).toBe("CustomerDisplay")
		// The customer display has a title of its own: the till's name went with the till
		expect(document.title).toBe("Customer Display · Neopos")
	})
})
