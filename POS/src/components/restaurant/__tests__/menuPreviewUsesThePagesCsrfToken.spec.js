/**
 * //// Neoffice — added file (no upstream equivalent). The menu designer's preview was blank (NeoResto lot 1, Daniel 01.11: « je clique sur le design PDF, tout a pété, on voit rien »): it posted with `fetch` and read its
 * //// CSRF token from a `csrf_token` COOKIE, which Frappe does not set, so the header was empty, the server refused (400) and the preview got no HTML. The token is the page's own (`window.csrf_token`), asked of
 * //// utils/csrf.js. The preview is mounted for real, with a cookie jar that holds no token.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text) => text
})

const { default: MenuPreview } = await import("../MenuPreview.vue")
const { currentCSRFToken } = await import("@/utils/csrf")

let fetchMock
beforeEach(() => {
	document.cookie.split(";").forEach((cookie) => {
		document.cookie = `${cookie.split("=")[0].trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
	})
	window.csrf_token = "page-token-123"
	fetchMock = vi.fn(async () => ({
		json: async () => ({ message: "<html><body>THE MENU</body></html>" }),
	}))
	vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
	vi.unstubAllGlobals()
	window.csrf_token = undefined
})

describe("the token a raw fetch carries", () => {
	it("is the page's own, and there is no cookie to read it from", async () => {
		expect(document.cookie).not.toContain("csrf_token")

		expect(await currentCSRFToken()).toBe("page-token-123")
	})
})

describe("the menu preview", () => {
	const mountPreview = () => mount(MenuPreview, { props: { cardName: "Carte Principale", refreshKey: 0 } })

	it("posts with the page's token and puts the server's HTML in its frame", async () => {
		const wrapper = mountPreview()
		await wrapper.setProps({ refreshKey: 1 })
		await flushPromises()

		const [url, options] = fetchMock.mock.calls[0]
		expect(url).toBe("/api/method/pos_next.api.menu_pdf.get_menu_preview_html")
		expect(options.headers["X-Frappe-CSRF-Token"]).toBe("page-token-123")
		expect(wrapper.get("iframe").attributes("srcdoc")).toContain("THE MENU")
	})

	it("says so on the page when the server answers nothing, and is not left blank", async () => {
		fetchMock.mockResolvedValueOnce({ json: async () => ({ exc_type: "CSRFTokenError" }) })
		const wrapper = mountPreview()
		await wrapper.setProps({ refreshKey: 1 })
		await flushPromises()

		expect(wrapper.get("iframe").attributes("srcdoc")).toContain("Failed to load preview")
	})
})
