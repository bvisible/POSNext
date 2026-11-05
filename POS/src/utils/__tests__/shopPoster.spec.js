/**
 * //// Neoffice — added file (no upstream equivalent). The poster of the shop's QR code (utils/shopPoster.js, scanning in the
 * //// shop, lot 5): the shop's name written as text, « Scan your articles », the code drawn from the address alone, the three
 * //// steps of the phone's page and the address under it.
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

const { posterSteps, shopPosterHtml } = await import("../shopPoster")

const URL = "https://shop.example.test/pos/shop/KEY123"

describe("the poster of the shop's QR code", () => {
	it("carries the shop's name, the title, the code, the three steps and the address", async () => {
		const html = await shopPosterHtml({ shopName: "The <b>shop</b>", url: URL })
		const page = new DOMParser().parseFromString(html, "text/html")

		expect(page.querySelector(".poster__name").textContent).toBe(
			"The <b>shop</b>",
		)
		expect(page.querySelector(".poster__name b")).toBeNull()
		expect(page.querySelector(".poster__title").textContent).toBe(
			"Scan your articles",
		)
		expect(page.querySelector(".poster__qr svg")).not.toBeNull()
		expect(page.querySelector(".poster__qr").dataset.url).toBe(URL)
		expect(
			[...page.querySelectorAll(".poster__step strong")].map(
				(step) => step.textContent,
			),
		).toEqual(["Scan", "Go to the till", "Checked and paid"])
		expect(page.querySelector(".poster__url").textContent).toBe(URL)
		// The number of a step is the step's own rule, not the rule of its text (a span, as the text is)
		expect(html).toContain(".poster__step .poster__number {")
	})

	it("carries the shop's own logo in place of its name, and none of Neoffice's design", async () => {
		// The shop shows the poster to its own customers: its logo as the company keeps it, no Forum, no web font (05.11.2026)
		const html = await shopPosterHtml({
			shopName: "The shop",
			shopLogo: "https://shop.example.test/files/logo.png",
			url: URL,
		})
		const page = new DOMParser().parseFromString(html, "text/html")

		const logo = page.querySelector(".poster__logo")
		expect(logo.getAttribute("src")).toBe("https://shop.example.test/files/logo.png")
		expect(logo.getAttribute("alt")).toBe("The shop")
		expect(page.querySelector(".poster__name")).toBeNull()
		expect(html).not.toContain("Forum")
		expect(html).not.toContain("fonts.googleapis.com")
	})

	it("says the steps the phone's page says", () => {
		expect(posterSteps().map(([title]) => title)).toEqual([
			"Scan",
			"Go to the till",
			"Checked and paid",
		])
		expect(posterSteps()[1][1]).toBe("Show your code to the seller.")
	})
})
