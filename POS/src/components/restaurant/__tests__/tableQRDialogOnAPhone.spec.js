/**
 * //// Neoffice — added file (no upstream equivalent). The QR dialog of a table on a phone (NeoRestau lot 1). The product
 * //// owner: a waiter shows the table's code on his PHONE to the guests, who scan it. Below Tailwind's `sm` (640 px) the
 * //// dialog is therefore the whole screen: the code as large as the width allows (never under 300 px, ink on white, with its
 * //// quiet zone), the name of the table large, the line that says what the code is for, and at the bottom, within thumb
 * //// reach, a "Close" button in ink. A phone prints nothing, so "Print" is not offered there. While the code is shown the
 * //// screen is kept awake (Screen Wake Lock API), so that it does not go dark in the guests' faces; where the API does not
 * //// exist, or refuses, nothing happens. On a tablet and a desktop the dialog keeps its size, and its primary button is ink
 * //// there too, never blue (design system, README 7).
 * ////
 * //// The dialog is the till's own overlay, and it must cover the till: on the real page the sticky header (z-200) and the phone's
 * //// tab strip (z-100) share its stacking context, so a dialog at z-50 had them paint over its top and stay tappable, and a
 * //// guest's stray touch could leave the till mid-scan. It sits at z-300, the till's convention for an overlay, under the
 * //// dialogs of frappe-ui (z-400). The Back of a phone (the Android Back button, the iOS edge swipe) closes it instead of
 * //// leaving the till: it takes one entry of the history while it is a phone's (composables/useBackClosesDialog).
 * ////
 * //// jsdom does not lay a page out and draws no canvas: the window's size is set to each phone, the library that draws the
 * //// code is replaced by a spy, and what the dialog hands it and the size it gives the canvas are read. The look at 390 px
 * //// is checked in a real browser.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

const toCanvas = vi.hoisted(() => vi.fn(async () => {}))
// jsdom has no canvas: the library that draws the code is replaced by a spy
vi.mock("qrcode", () => ({ default: { toCanvas } }))

const { default: TableQRCode } = await import("../TableQRCode.vue")
const { ENTRY_KEY } = await import("@/composables/useBackClosesDialog")

// The font sizes the till's Tailwind scale defines: the preset of frappe-ui (node_modules/frappe-ui/tailwind/plugin.js,
// `fontSize`) replaces Tailwind's own scale, and stops at text-3xl. Its config cannot be loaded here (the preset imports
// `tailwindcss/plugin` without its extension, which Node's ESM refuses), so the list is copied: a size added by a later
// frappe-ui is one line here.
const FONT_SIZES = ["2xs", "xs", "sm", "base", "lg", "xl", "2xl", "3xl"]
const SIZE_CLASS = /^text-(?:[2-9]?xs|sm|base|lg|[1-9]?xl)$/
const URL = "https://shop.example/pos/guest/tok-1"
const INK = "#141414"
const NO_COLOUR =
	/\b(?:bg|text|border|ring|from|to)-(?:blue|indigo|violet|purple|sky|cyan|emerald|green)/
// The phones a waiter carries, down to the smallest one still sold
const PHONES = [
	[390, 844, 3],
	[360, 800, 3],
	[412, 915, 2.625],
	[320, 568, 2],
]
// A small tablet upright, a tablet, a laptop, a desktop
const WIDE = [
	[640, 960],
	[768, 1024],
	[1024, 768],
	[1366, 768],
	[1920, 1080],
]

let wrapper
const savedRatio = window.devicePixelRatio

function screenOf(width, height, ratio = 1) {
	window.innerWidth = width
	window.innerHeight = height
	window.devicePixelRatio = ratio
}

function dialog(props = {}) {
	wrapper = mount(TableQRCode, {
		props: { token: "tok-1", tableName: "Table 12", url: URL, ...props },
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	return wrapper
}

/** The code is drawn 50 ms after the dialog opens (the canvas must be in the page first). */
async function drawn() {
	await new Promise((resolve) => setTimeout(resolve, 80))
	await flushPromises()
}

const part = (name) => wrapper.find(`[data-test="${name}"]`)
const canvasSize = () =>
	Number.parseFloat(part("table-qr-canvas").element.style.width)
/** Every class of every element of the dialog, as one string: what could colour it. */
const everyClass = () =>
	[...wrapper.element.querySelectorAll("*"), wrapper.element]
		.map((element) => element.getAttribute("class") ?? "")
		.join(" ")

beforeEach(() => {
	toCanvas.mockClear()
	screenOf(1024, 768)
	// A phone's dialog gives its entry of the history back when it goes, with a Back that jsdom answers on a task of its own: it
	// would land in the middle of the next test and be taken for the Back of that test's dialog. Only the tests of the Back
	// (last describe) have the real one.
	vi.spyOn(history, "back").mockImplementation(() => {})
})
afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
	window.devicePixelRatio = savedRatio
	vi.restoreAllMocks()
})

describe.each(PHONES)(
	"the QR dialog on a phone of %i x %i",
	(width, height, ratio) => {
		beforeEach(() => screenOf(width, height, ratio))

		it("is the whole screen, not a card on a dimmed page", () => {
			dialog()

			expect(part("table-qr-dialog").attributes("data-layout")).toBe("phone")
			const root = part("table-qr-dialog").classes()
			expect(root).toEqual(
				expect.arrayContaining([
					"fixed",
					"inset-0",
					"flex",
					"flex-col",
					"bg-white",
				]),
			)
			expect(root).not.toContain("bg-black/60")
			expect(root).not.toContain("p-4")
			// The card fills it, with no rounded corners or shadow of a card
			const card = part("table-qr-card").classes()
			expect(card).toEqual(expect.arrayContaining(["w-full", "flex-1"]))
			expect(card).not.toContain("max-w-sm")
			expect(card).not.toContain("rounded-2xl")
			// No title bar of a dialog, no cross: the screen is the code
			expect(wrapper.text()).not.toContain("QR Code")
		})

		it("draws the code as large as the width allows, and never under 300 px", async () => {
			dialog()
			await drawn()

			const expected = Math.max(300, Math.min(width - 24, 480))
			expect(canvasSize()).toBe(expected)
			expect(canvasSize()).toBeGreaterThanOrEqual(300)
			// ... square, and no wider than the screen (the narrowest phone still gets its 300 px)
			expect(part("table-qr-canvas").element.style.height).toBe(`${expected}px`)
			expect(canvasSize()).toBeLessThanOrEqual(width)
			// ... drawn at the screen's own pixel density, so that its modules stay sharp
			expect(toCanvas).toHaveBeenCalledTimes(1)
			expect(toCanvas.mock.calls[0][1]).toBe(URL)
			expect(toCanvas.mock.calls[0][2].width).toBe(Math.round(expected * ratio))
		})

		it("draws ink on white, with a quiet zone of four modules around it", async () => {
			dialog()
			await drawn()

			const options = toCanvas.mock.calls[0][2]
			expect(options.color).toEqual({ dark: INK, light: "#ffffff" })
			expect(options.margin).toBeGreaterThanOrEqual(4)
		})

		it("names the table large, as the title of the screen, above the code", () => {
			dialog()

			const name = part("table-qr-name")
			expect(name.text()).toBe("Table 12")
			expect(name.classes()).toEqual(
				expect.arrayContaining(["font-display", "text-[40px]", "order-first"]),
			)
			expect(wrapper.text().split("Table 12")).toHaveLength(2)
		})

		it("says in one line what the code is for", () => {
			dialog()

			expect(part("table-qr-purpose").text()).toBe(
				"Guests scan this code to order from their phone.",
			)
			expect(part("table-qr-purpose").classes()).toContain("text-[17px]")
		})

		it("offers no Print, and shows no address: a phone prints nothing, and the guests scan", () => {
			dialog()

			expect(part("table-qr-print").exists()).toBe(false)
			expect(wrapper.text()).not.toContain("Print")
			expect(wrapper.text()).not.toContain(URL)
			expect(wrapper.findAll("button")).toHaveLength(1)
		})

		it("puts Close in ink at the bottom of the screen, big enough for a thumb", async () => {
			dialog()

			const close = part("table-qr-close")
			expect(close.text()).toBe("Close")
			expect(close.classes()).toEqual(
				expect.arrayContaining([
					"bg-[#141414]",
					"text-white",
					"min-h-[56px]",
					"flex-1",
				]),
			)
			expect(close.classes().join(" ")).not.toMatch(NO_COLOUR)
			// It is the last thing of the screen, under the code, and keeps clear of the home bar of the phone
			const card = part("table-qr-card").element
			expect(card.lastElementChild).toBe(part("table-qr-actions").element)
			expect(part("table-qr-actions").classes().join(" ")).toContain(
				"env(safe-area-inset-bottom)",
			)
			expect(
				card.firstElementChild.contains(part("table-qr-canvas").element),
			).toBe(true)

			await close.trigger("click")
			expect(wrapper.emitted("close")).toHaveLength(1)
		})

		it("scrolls the code and the name inside the screen, never the button away", () => {
			dialog()

			// A phone held sideways has no height for all of it: the middle scrolls, the Close button stays
			const body = part("table-qr-body")
			expect(body.classes()).toEqual(
				expect.arrayContaining(["overflow-y-auto", "flex-1", "min-h-0"]),
			)
			expect(part("table-qr-card").classes()).toContain("overflow-hidden")
			// ... and a screen too short for it scrolls from the top of it: margins centre it, justify-center would cut its top off
			expect(body.classes()).not.toContain("justify-center")
			expect(part("table-qr-canvas").element.parentElement.className).toContain(
				"my-auto",
			)
		})

		it("carries no blue, whatever colour the old dialog used", () => {
			dialog()

			expect(everyClass()).not.toMatch(NO_COLOUR)
		})

		it("sizes its text with sizes the till's Tailwind scale defines, or with values", () => {
			dialog()

			// frappe-ui's preset replaces Tailwind's scale and stops at text-3xl: a `text-4xl` generates no rule at all, and the
			// name of the table showed at the size of the page's text (found in a real browser, not in jsdom)
			const sizes = everyClass()
				.split(/\s+/)
				.filter((name) => SIZE_CLASS.test(name))
			expect(
				sizes.filter(
					(name) => !FONT_SIZES.includes(name.slice("text-".length)),
				),
			).toEqual([])
		})
	},
)

describe.each(WIDE)(
	"the QR dialog on a tablet or a desktop of %i x %i",
	(width, height) => {
		beforeEach(() => screenOf(width, height))

		it("keeps its size: a card on a dimmed page, the code at 224 px, a header, the address", async () => {
			dialog()
			await drawn()

			expect(part("table-qr-dialog").attributes("data-layout")).toBe("card")
			expect(part("table-qr-dialog").classes()).toEqual(
				expect.arrayContaining([
					"fixed",
					"inset-0",
					"items-center",
					"justify-center",
					"bg-black/60",
					"p-4",
				]),
			)
			expect(part("table-qr-card").classes()).toEqual(
				expect.arrayContaining([
					"w-full",
					"max-w-sm",
					"rounded-2xl",
					"shadow-xl",
				]),
			)
			expect(canvasSize()).toBe(224)
			expect(toCanvas.mock.calls[0][2].width).toBe(224)
			expect(wrapper.text()).toContain("QR Code")
			expect(wrapper.text()).toContain(URL)
			expect(part("table-qr-name").text()).toBe("Table 12")
			expect(part("table-qr-purpose").text()).toBe(
				"Guests scan this code to order from their phone.",
			)
		})

		it("keeps Print beside Close", async () => {
			dialog()

			expect(part("table-qr-print").exists()).toBe(true)
			expect(part("table-qr-print").text()).toBe("Print")
			expect(
				wrapper
					.findAll("[data-test='table-qr-actions'] button")
					.map((button) => button.text()),
			).toEqual(["Print", "Close"])
		})

		it("has Close in ink as its primary button, never blue", async () => {
			dialog()

			const close = part("table-qr-close")
			expect(close.classes()).toEqual(
				expect.arrayContaining(["bg-[#141414]", "text-white"]),
			)
			expect(close.classes().join(" ")).not.toMatch(NO_COLOUR)
			expect(everyClass()).not.toMatch(NO_COLOUR)

			await close.trigger("click")
			expect(wrapper.emitted("close")).toHaveLength(1)
		})

		it("scrolls inside a short screen instead of being cut off at both ends", () => {
			dialog()

			expect(part("table-qr-card").classes()).toEqual(
				expect.arrayContaining(["max-h-full", "overflow-y-auto"]),
			)
		})

		it("sizes its text with sizes the till's Tailwind scale defines, or with values", () => {
			dialog()

			const sizes = everyClass()
				.split(/\s+/)
				.filter((name) => SIZE_CLASS.test(name))
			expect(
				sizes.filter(
					(name) => !FONT_SIZES.includes(name.slice("text-".length)),
				),
			).toEqual([])
		})
	},
)

describe("the dialog follows the window", () => {
	it("becomes the whole screen when the window narrows to a phone, and a card again when it widens", async () => {
		screenOf(1024, 768)
		dialog()
		await drawn()
		expect(part("table-qr-dialog").attributes("data-layout")).toBe("card")
		expect(canvasSize()).toBe(224)

		screenOf(390, 844, 3)
		window.dispatchEvent(new Event("resize"))
		await drawn()
		expect(part("table-qr-dialog").attributes("data-layout")).toBe("phone")
		expect(canvasSize()).toBe(366)
		expect(part("table-qr-print").exists()).toBe(false)

		screenOf(1024, 768)
		window.dispatchEvent(new Event("resize"))
		await drawn()
		expect(part("table-qr-dialog").attributes("data-layout")).toBe("card")
		expect(canvasSize()).toBe(224)
		expect(part("table-qr-print").exists()).toBe(true)
	})

	it("redraws the code when a phone is turned (the orientation changes its width)", async () => {
		screenOf(390, 844, 3)
		dialog()
		await drawn()
		expect(canvasSize()).toBe(366)

		screenOf(360, 800, 3)
		window.dispatchEvent(new Event("orientationchange"))
		await drawn()

		expect(canvasSize()).toBe(336)
		expect(toCanvas).toHaveBeenCalledTimes(2)
	})

	it("draws again for a new address", async () => {
		screenOf(390, 844, 3)
		dialog()
		await drawn()

		await wrapper.setProps({ url: "https://shop.example/pos/guest/tok-2" })
		await drawn()

		expect(toCanvas).toHaveBeenCalledTimes(2)
		expect(toCanvas.mock.calls[1][1]).toBe(
			"https://shop.example/pos/guest/tok-2",
		)
	})

	it("stops listening to the window when it is closed", async () => {
		screenOf(390, 844, 3)
		const remove = vi.spyOn(window, "removeEventListener")
		dialog()
		await drawn()

		wrapper.unmount()
		wrapper = undefined

		expect(remove.mock.calls.map((call) => call[0])).toEqual(
			expect.arrayContaining(["resize", "orientationchange"]),
		)
		remove.mockRestore()
	})
})

describe("the screen stays awake while the code is shown", () => {
	/** A wake lock as the browser hands it: it can be released by the page, or by the browser itself. */
	function aLock() {
		const listeners = []
		const lock = {
			released: false,
			release: vi.fn(async () => {
				lock.released = true
			}),
			addEventListener: vi.fn((type, listener) => {
				if (type === "release") listeners.push(listener)
			}),
			/** The browser takes it back (the page was hidden). */
			takenBack() {
				lock.released = true
				for (const listener of listeners) listener()
			},
		}
		return lock
	}

	function theBrowserGrants(...locks) {
		const queue = [...locks]
		const request = vi.fn(async () => queue.shift() ?? aLock())
		Object.defineProperty(navigator, "wakeLock", {
			configurable: true,
			value: { request },
		})
		return request
	}

	function thePageIs(state) {
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			get: () => state,
		})
		document.dispatchEvent(new Event("visibilitychange"))
	}

	beforeEach(() => screenOf(390, 844, 3))
	afterEach(() => {
		// jsdom has no wake lock, and its Document has a getter for the visibility: the test's own properties go
		Reflect.deleteProperty(navigator, "wakeLock")
		Reflect.deleteProperty(document, "visibilityState")
	})

	it("asks the browser to keep the screen awake when the dialog opens", async () => {
		const request = theBrowserGrants(aLock())

		dialog()
		await flushPromises()

		expect(request).toHaveBeenCalledTimes(1)
		expect(request).toHaveBeenCalledWith("screen")
	})

	it("releases the lock when the dialog is closed", async () => {
		const lock = aLock()
		theBrowserGrants(lock)
		dialog()
		await flushPromises()
		expect(lock.release).not.toHaveBeenCalled()

		wrapper.unmount()
		wrapper = undefined

		expect(lock.release).toHaveBeenCalledTimes(1)
	})

	it("releases a lock the browser grants after the dialog was already closed", async () => {
		const lock = aLock()
		let grant
		const request = vi.fn(
			() =>
				new Promise((resolve) => {
					grant = () => resolve(lock)
				}),
		)
		Object.defineProperty(navigator, "wakeLock", {
			configurable: true,
			value: { request },
		})
		dialog()
		wrapper.unmount()
		wrapper = undefined

		grant()
		await flushPromises()

		expect(lock.release).toHaveBeenCalledTimes(1)
	})

	it("takes the lock again when the page comes back after the browser took it back", async () => {
		const first = aLock()
		const second = aLock()
		const request = theBrowserGrants(first, second)
		dialog()
		await flushPromises()
		expect(request).toHaveBeenCalledTimes(1)

		// The phone's screen was turned off, then on: the browser released the lock itself
		first.takenBack()
		thePageIs("visible")
		await flushPromises()

		expect(request).toHaveBeenCalledTimes(2)
		wrapper.unmount()
		wrapper = undefined
		expect(second.release).toHaveBeenCalledTimes(1)
	})

	it("does not ask again while it still holds the lock, nor while the page is hidden", async () => {
		const request = theBrowserGrants(aLock())
		dialog()
		await flushPromises()

		thePageIs("visible")
		await flushPromises()
		expect(request).toHaveBeenCalledTimes(1)

		thePageIs("hidden")
		await flushPromises()
		expect(request).toHaveBeenCalledTimes(1)
	})

	it("does not ask once the dialog is closed", async () => {
		const first = aLock()
		const request = theBrowserGrants(first)
		dialog()
		await flushPromises()
		first.takenBack()
		wrapper.unmount()
		wrapper = undefined

		thePageIs("visible")
		await flushPromises()

		expect(request).toHaveBeenCalledTimes(1)
	})

	it("does nothing, and shows the code all the same, where the browser has no such API", async () => {
		expect(navigator.wakeLock).toBeUndefined()

		dialog()
		await drawn()

		expect(canvasSize()).toBe(366)
		expect(part("table-qr-dialog").exists()).toBe(true)
		wrapper.unmount()
		wrapper = undefined
	})

	it("does nothing, and shows the code all the same, where the browser refuses", async () => {
		const request = vi.fn(async () => {
			throw new DOMException(
				"Wake Lock permission request denied",
				"NotAllowedError",
			)
		})
		Object.defineProperty(navigator, "wakeLock", {
			configurable: true,
			value: { request },
		})

		// A refusal nobody caught would be reported by the runner as an unhandled rejection and fail the run
		dialog()
		await drawn()

		expect(request).toHaveBeenCalledTimes(1)
		expect(canvasSize()).toBe(366)
		wrapper.unmount()
		wrapper = undefined
	})

	it("is kept by a tablet's dialog too: a card held up to a table is the same use", async () => {
		screenOf(1024, 768)
		const request = theBrowserGrants(aLock())

		dialog()
		await flushPromises()

		expect(request).toHaveBeenCalledWith("screen")
	})

	it("asks once when the page comes back to the front before the first request is answered", async () => {
		const first = aLock()
		let grant
		const request = vi.fn(
			() =>
				new Promise((resolve) => {
					grant = () => resolve(first)
				}),
		)
		Object.defineProperty(navigator, "wakeLock", {
			configurable: true,
			value: { request },
		})
		dialog()

		// The page is shown again, twice, while the browser is still deciding on the first request
		thePageIs("visible")
		thePageIs("visible")
		expect(request).toHaveBeenCalledTimes(1)

		grant()
		await flushPromises()
		wrapper.unmount()
		wrapper = undefined

		// One lock was granted, and it is the one that was released with the dialog
		expect(request).toHaveBeenCalledTimes(1)
		expect(first.release).toHaveBeenCalledTimes(1)
	})

	it("asks again when the page comes back after the browser refused", async () => {
		const second = aLock()
		const request = vi
			.fn()
			.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"))
			.mockResolvedValueOnce(second)
		Object.defineProperty(navigator, "wakeLock", {
			configurable: true,
			value: { request },
		})
		dialog()
		await flushPromises()

		thePageIs("visible")
		await flushPromises()

		// A refusal is no request in flight: the next time the page is shown, the lock is asked for again
		expect(request).toHaveBeenCalledTimes(2)
		wrapper.unmount()
		wrapper = undefined
		expect(second.release).toHaveBeenCalledTimes(1)
	})
})

describe("the dialog sits above the till's own chrome", () => {
	const source = (file) => readFileSync(path.resolve(__dirname, file), "utf8")
	/** The z-index of the first element of a source whose class matches, as `z-[N]` in its classes. */
	const zOf = (classes) => Number(/\bz-\[(\d+)\]/.exec(classes ?? "")?.[1])
	const classOf = (file, wanted) =>
		new RegExp(`class="([^"]*${wanted}[^"]*)"`).exec(source(file))?.[1]

	// The two things that share its stacking context on the real page: the dialog is a direct child of the till's root, which
	// has no z-index, transform or containment of its own
	const header = () => zOf(classOf("../../pos/POSHeader.vue", "\\bsticky\\b"))
	const tabStrip = () =>
		zOf(
			classOf("../../../pages/POSSale.vue", '\\blg:hidden\\b[^"]*\\bsticky\\b'),
		)
	// The dialogs of frappe-ui are lifted by the stylesheet of the till to this
	const frappeDialogs = () =>
		Number(
			/\.dialog-overlay\s*\{[^}]*z-index:\s*(\d+)/.exec(
				source("../../../index.css"),
			)?.[1],
		)

	it.each([
		["a phone", 390, 844],
		["a tablet", 768, 1024],
		["a desktop", 1366, 768],
	])(
		"is at z-300 on %s, the till's convention for an overlay",
		(_name, width, height) => {
			screenOf(width, height)
			dialog()

			expect(part("table-qr-dialog").classes()).toContain("z-[300]")
			expect(part("table-qr-dialog").classes().join(" ")).not.toMatch(
				/\bz-(?:\d+|auto)\b/,
			)
		},
	)

	it("covers the sticky header and the phone's tab strip, which stay tappable under anything lower", () => {
		dialog()
		const z = zOf(part("table-qr-dialog").classes().join(" "))

		// The header is the logo, the menu and the way out: under a lower dialog it paints over its top, and a touch there acts
		expect(header()).toBe(200)
		expect(tabStrip()).toBe(100)
		expect(z).toBeGreaterThan(header())
		expect(z).toBeGreaterThan(tabStrip())
	})

	it("stays under the dialogs of frappe-ui, which a failed call may raise over it", () => {
		dialog()
		const z = zOf(part("table-qr-dialog").classes().join(" "))

		expect(frappeDialogs()).toBe(400)
		expect(z).toBeLessThan(frappeDialogs())
	})
})

describe("the Back of a phone closes the dialog", () => {
	// jsdom answers history.back() on a task of its own
	const settle = () => new Promise((resolve) => setTimeout(resolve, 40))

	beforeEach(() => {
		// The real Back, on the page as the router leaves it
		vi.mocked(history.back).mockRestore()
		history.replaceState({ position: 3, current: "/" }, "", "/pos/")
	})
	afterEach(async () => {
		wrapper?.unmount()
		wrapper = undefined
		await settle()
	})

	it("takes one entry of the history on a phone, and none on a card", () => {
		const push = vi.spyOn(history, "pushState")
		screenOf(1024, 768)
		dialog()
		expect(push).not.toHaveBeenCalled()
		expect(history.state[ENTRY_KEY]).toBeUndefined()
		wrapper.unmount()

		screenOf(390, 844, 3)
		dialog()
		expect(push).toHaveBeenCalledTimes(1)
		expect(history.state[ENTRY_KEY]).toBeTruthy()
		expect(history.state).toMatchObject({ position: 3, current: "/" })
		expect(location.pathname).toBe("/pos/")
	})

	it("closes on the Back of the phone, once, and the till stays where it was", async () => {
		screenOf(390, 844, 3)
		dialog()

		history.back()
		await settle()

		expect(wrapper.emitted("close")).toHaveLength(1)
		expect(location.pathname).toBe("/pos/")
		expect(history.state).toMatchObject({ position: 3, current: "/" })
		expect(history.state[ENTRY_KEY]).toBeUndefined()
	})

	it("gives its entry back when its own button closes it", async () => {
		screenOf(390, 844, 3)
		dialog()
		await part("table-qr-close").trigger("click")
		expect(wrapper.emitted("close")).toHaveLength(1)

		// The page takes the dialog away, as it does when it is told to close
		wrapper.unmount()
		wrapper = undefined
		await settle()

		expect(history.state[ENTRY_KEY]).toBeUndefined()
		expect(history.state).toMatchObject({ position: 3, current: "/" })
		expect(location.pathname).toBe("/pos/")
	})

	it("takes an entry when the window narrows to a phone while it is open", async () => {
		screenOf(1024, 768)
		dialog()
		const push = vi.spyOn(history, "pushState")

		screenOf(390, 844, 3)
		window.dispatchEvent(new Event("resize"))
		await settle()

		expect(push).toHaveBeenCalledTimes(1)
		history.back()
		await settle()
		expect(wrapper.emitted("close")).toHaveLength(1)
	})
})
