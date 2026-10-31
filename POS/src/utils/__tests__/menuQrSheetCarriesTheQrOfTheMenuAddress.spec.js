/**
 * //// Neoffice — added file (no upstream equivalent). The sheet that carries the QR code of a restaurant's public menu
 * //// (NeoRestau lot 1, task 17): the code of the address of the menu, large, the restaurant's name, and « Scan to see the
 * //// menu ». It is printed from a hidden frame, so that nothing of the till under it ends up on the paper.
 * @vitest-environment jsdom
 */
import QRCode from "qrcode"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text) => text
})

const { escapeHtml, menuQrSheetHtml, menuQrSvg, printHtml, printMenuQr } = await import("../menuQrSheet")

const URL_OF_THE_MENU = "https://bistro.example.test/pos/menu/The%20Bistro"

// The code as the sheet draws it: a pure function of the address
const codeOf = (url) =>
	QRCode.toString(url, {
		type: "svg",
		margin: 2,
		errorCorrectionLevel: "M",
		color: { dark: "#141414", light: "#ffffff" },
	})

function theSheet(html) {
	return new DOMParser().parseFromString(html, "text/html")
}

describe("the sheet of the menu's QR code", () => {
	describe("what is on it", () => {
		it("carries the QR code of the address of the menu, and of no other", async () => {
			const html = await menuQrSheetHtml({ restaurantName: "The Bistro", url: URL_OF_THE_MENU })

			expect(html).toContain(await codeOf(URL_OF_THE_MENU))
			expect(await menuQrSvg(URL_OF_THE_MENU)).toBe(await codeOf(URL_OF_THE_MENU))
			expect(html).not.toContain(await codeOf("https://bistro.example.test/pos/menu/Another"))
			expect(theSheet(html).querySelectorAll("svg")).toHaveLength(1)
		})

		it("draws a different code for a different address", async () => {
			const one = await menuQrSvg("https://one.example.test/pos/menu/A")
			const other = await menuQrSvg("https://two.example.test/pos/menu/A")

			expect(one).not.toBe(other)
		})

		it("names the restaurant, says what to do, and writes the address under the code", async () => {
			const sheet = theSheet(await menuQrSheetHtml({ restaurantName: "The Bistro", url: URL_OF_THE_MENU }))

			expect(sheet.querySelector("h1").textContent).toBe("The Bistro")
			expect(sheet.querySelector(".sheet__caption").textContent).toBe("Scan to see the menu")
			expect(sheet.querySelector(".sheet__url").textContent).toBe(URL_OF_THE_MENU)
			expect(sheet.querySelector(".sheet__qr").getAttribute("data-url")).toBe(URL_OF_THE_MENU)
			expect(sheet.title).toBe("The Bistro")
		})

		it("shows the code before the caption and the name before the code", async () => {
			const sheet = theSheet(await menuQrSheetHtml({ restaurantName: "The Bistro", url: URL_OF_THE_MENU }))

			const order = [...sheet.querySelector("main").children].map((node) => node.className || node.tagName)
			expect(order).toEqual(["sheet__name", "sheet__rule", "sheet__qr", "sheet__caption", "sheet__url"])
		})

		it("is a white A4 page in the faces of the Design System", async () => {
			const html = await menuQrSheetHtml({ restaurantName: "The Bistro", url: URL_OF_THE_MENU })

			expect(html).toContain("size: A4 portrait")
			expect(html).toContain("background: #ffffff")
			expect(html).toContain('"Forum"')
			expect(html).toContain('"Karla"')
			expect(html).toContain("fonts.googleapis.com/css2?family=Forum&amp;family=Karla")
		})

		it("writes a name and an address as text: nothing a restaurant typed becomes markup", async () => {
			const name = `<img src=x onerror="alert(1)"> Café & "Bar" <script>alert(2)</script>`
			const url = `https://bistro.example.test/pos/menu/${encodeURIComponent(name)}`
			const html = await menuQrSheetHtml({ restaurantName: name, url })
			const sheet = theSheet(html)

			expect(sheet.querySelector("h1").textContent).toBe(name)
			expect(sheet.querySelector("h1 img")).toBeNull()
			expect(sheet.querySelector("script")).toBeNull()
			expect(sheet.querySelector("[onerror]")).toBeNull()
			expect(sheet.querySelector(".sheet__qr").getAttribute("data-url")).toBe(url)
			expect(sheet.title).toBe(name)
		})
	})

	describe("escapeHtml", () => {
		it("escapes the five characters that open a tag or leave an attribute", () => {
			expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
				"&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
			)
		})

		it("writes nothing for nothing", () => {
			expect(escapeHtml(undefined)).toBe("")
			expect(escapeHtml(null)).toBe("")
		})
	})

	describe("printing it", () => {
		let frames

		// The frame the browser would make: a detached stand-in that the test lets "load"
		beforeEach(() => {
			vi.useFakeTimers()
			frames = []
			vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
				frames.push(node)
				return node
			})
		})

		afterEach(() => {
			vi.restoreAllMocks()
			vi.useRealTimers()
		})

		function loaded(frame, { fonts } = {}) {
			const contentWindow = { focus: vi.fn(), print: vi.fn() }
			Object.defineProperty(frame, "contentWindow", { value: contentWindow })
			Object.defineProperty(frame, "contentDocument", { value: { fonts } })
			frame.remove = vi.fn()
			return contentWindow
		}

		it("puts the sheet in a hidden frame of the page, and prints it when it has loaded", async () => {
			const printing = printHtml("<p>sheet</p>")
			const frame = frames[0]
			const window_ = loaded(frame)

			expect(frame.srcdoc).toBe("<p>sheet</p>")
			expect(frame.style.width).toBe("0px")
			expect(frame.style.height).toBe("0px")
			expect(frame.getAttribute("aria-hidden")).toBe("true")
			expect(window_.print).not.toHaveBeenCalled()

			await frame.onload()
			await printing

			expect(window_.focus).toHaveBeenCalled()
			expect(window_.print).toHaveBeenCalledTimes(1)
		})

		it("sandboxes the frame: the sheet may print, nothing in it may run", async () => {
			const printing = printHtml("<p>sheet</p>")
			loaded(frames[0])
			await frames[0].onload()
			await printing

			// Printing is a modal and reading the frame's fonts is the page's own business: nothing else is allowed, and above
			// all not scripts, so that a mistake of escaping in the sheet someday cannot become one
			const allowed = frames[0].getAttribute("sandbox").split(" ")
			expect(allowed.sort()).toEqual(["allow-modals", "allow-same-origin"])
			expect(allowed).not.toContain("allow-scripts")
		})

		it("waits for the faces of the sheet, but not for ever", async () => {
			const printing = printHtml("<p>sheet</p>")
			const window_ = loaded(frames[0], { fonts: { ready: new Promise(() => {}) } })

			const onload = frames[0].onload()
			await vi.advanceTimersByTimeAsync(1000)
			expect(window_.print).not.toHaveBeenCalled()

			await vi.advanceTimersByTimeAsync(1500)
			await onload
			await printing

			expect(window_.print).toHaveBeenCalledTimes(1)
		})

		it("removes the frame a minute after the dialog", async () => {
			const printing = printHtml("<p>sheet</p>")
			loaded(frames[0])
			await frames[0].onload()
			await printing

			expect(frames[0].remove).not.toHaveBeenCalled()
			await vi.advanceTimersByTimeAsync(60_000)

			expect(frames[0].remove).toHaveBeenCalledTimes(1)
		})

		it("fails when the browser cannot print, and still removes the frame", async () => {
			const printing = printHtml("<p>sheet</p>")
			const window_ = loaded(frames[0])
			window_.print.mockImplementation(() => {
				throw new Error("blocked")
			})
			const caught = expect(printing).rejects.toThrow("blocked")

			await frames[0].onload()
			await caught
			await vi.advanceTimersByTimeAsync(60_000)

			expect(frames[0].remove).toHaveBeenCalledTimes(1)
		})

		it("prints the sheet of the restaurant it is given", async () => {
			vi.useRealTimers()
			const printing = printMenuQr({ restaurantName: "The Bistro", url: URL_OF_THE_MENU })
			// The sheet is made first (the code is loaded when it is needed), then the frame is added
			await vi.waitFor(() => expect(frames).toHaveLength(1))
			const window_ = loaded(frames[0])

			await frames[0].onload()
			await printing

			expect(frames[0].srcdoc).toContain(await codeOf(URL_OF_THE_MENU))
			expect(frames[0].srcdoc).toContain("<h1 class=\"sheet__name\">The Bistro</h1>")
			expect(window_.print).toHaveBeenCalledTimes(1)
		})
	})
})
