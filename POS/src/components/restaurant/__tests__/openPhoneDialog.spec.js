/**
 * //// Neoffice — added file (no upstream equivalent). « Open a smartphone » at the till (NeoResto lot 1, kitchen test 01.11): a waiter's
 * //// phone has no pairing to do, it signs in with its owner's own account. The manager only needs somewhere to GIVE the till's address,
 * //// so that nobody types it for the first time: a QR code to scan, and the same link to copy and send.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toString = vi.hoisted(() => vi.fn(async (url) => `<svg data-url="${url}"></svg>`))
const showError = vi.hoisted(() => vi.fn())

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, index) => args[index]) : text)
})

vi.mock("frappe-ui", () => ({
	Dialog: {
		props: ["modelValue", "options"],
		template: "<div v-if='modelValue' data-test='dialog'><h2>{{ options.title }}</h2><slot name='body-content' /></div>",
	},
}))
vi.mock("qrcode", () => ({ default: { toString } }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showError, showSuccess: vi.fn() }) }))

const { default: OpenPhoneDialog } = await import("../OpenPhoneDialog.vue")

const TILL = `${window.location.origin}/pos`
let opened = []
let writeText

function open(props = { modelValue: true }) {
	const wrapper = mount(OpenPhoneDialog, { props, global: { mocks: { __: globalThis.__ } } })
	opened.push(wrapper)
	return wrapper
}

beforeEach(() => {
	toString.mockClear()
	showError.mockReset()
	writeText = vi.fn(async () => {})
	Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
	opened = []
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
})

describe("opening a smartphone at the till", () => {
	it("shows the QR code of the till's address, with nothing to pair: no server call, no time limit", async () => {
		const wrapper = open()
		await flushPromises()

		expect(wrapper.get("h2").text()).toBe("Open the till on a device")
		expect(toString).toHaveBeenCalledWith(TILL, expect.objectContaining({ type: "svg" }))
		expect(wrapper.get("[data-test=phone-qr]").html()).toContain(`data-url="${TILL}"`)
		expect(wrapper.text()).toContain("signs in with their own account")
		expect(wrapper.find("[data-test=pairing-time-left]").exists()).toBe(false)
	})

	it("shows the same address as a link, to copy and send", async () => {
		const wrapper = open()
		await flushPromises()

		expect(wrapper.get("[data-test=phone-link]").element.value).toBe(TILL)
		expect(wrapper.get("[data-test=phone-link]").attributes("readonly")).toBeDefined()
	})

	it("copies the link, and says it did", async () => {
		const wrapper = open()
		await flushPromises()
		expect(wrapper.get("[data-test=phone-copy]").text()).toBe("Copy the link")

		await wrapper.get("[data-test=phone-copy]").trigger("click")
		await flushPromises()

		expect(writeText).toHaveBeenCalledWith(TILL)
		expect(wrapper.get("[data-test=phone-copy]").text()).toBe("Link copied")
		expect(showError).not.toHaveBeenCalled()
	})

	it("says so when the phone's browser refuses the copy, and leaves the link to select by hand", async () => {
		writeText.mockRejectedValue(new Error("denied"))
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test=phone-copy]").trigger("click")
		await flushPromises()

		expect(showError).toHaveBeenCalledWith("Could not copy the link.")
		expect(wrapper.get("[data-test=phone-copy]").text()).toBe("Copy the link")
		expect(wrapper.get("[data-test=phone-link]").element.value).toBe(TILL)
	})

	it("draws nothing while it is closed", async () => {
		const wrapper = open({ modelValue: false })
		await flushPromises()

		expect(wrapper.find("[data-test=dialog]").exists()).toBe(false)
	})
})
