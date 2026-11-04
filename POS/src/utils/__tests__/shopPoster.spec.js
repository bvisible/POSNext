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
