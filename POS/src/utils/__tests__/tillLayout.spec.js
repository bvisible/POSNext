//// Neoffice — added file (no upstream equivalent). The till's screen while its agenda is open (NeoSalon B', 16.11.2026).
// Jérémy: « dans l'onglet Rendez-vous, masquer le panneau de droite : ça bouffe toute une partie de la partie rendez-vous ». On a desktop
// the agenda takes the whole width, the sheet of an appointment opens over it on the right, and « Encaisser » brings the cart back.
import { describe, expect, it } from "vitest"

import { tillLayout } from "../appointments"

describe("the till's layout", () => {
	it("gives the agenda the whole width of a desktop and hides the cart and the divider", () => {
		const layout = tillLayout({ isDesktop: true, agenda: true, leftPanelWidth: 720, mobileTab: "items" })

		expect(layout).toEqual({ leftWidth: "100%", leftGrows: true, divider: false, cart: false, sheet: "drawer" })
	})

	it("keeps the sale as it was when the agenda is closed: the items at their width, the divider, the cart", () => {
		const layout = tillLayout({ isDesktop: true, agenda: false, leftPanelWidth: 720, mobileTab: "items" })

		expect(layout).toEqual({ leftWidth: "720px", leftGrows: false, divider: true, cart: true, sheet: null })
	})

	it("on a phone keeps one tab at a time, and the sheet covers the agenda", () => {
		expect(tillLayout({ isDesktop: false, agenda: true, leftPanelWidth: 720, mobileTab: "items" })).toEqual({
			leftWidth: "100%",
			leftGrows: true,
			divider: false,
			cart: false,
			sheet: "cover",
		})
		expect(tillLayout({ isDesktop: false, agenda: false, leftPanelWidth: 720, mobileTab: "cart" }).cart).toBe(true)
	})
})

describe("the colour of a person at the till", () => {
	it("is the one the reservation gives her, the same as on the planning of the desk", async () => {
		const { colorOfPerson, colorOfStep } = await import("../appointments")
		const people = [{ sales_person: "Maya", sales_person_name: "Maya Rochat", color: "#3A5572" }]

		expect(colorOfPerson(people[0])).toBe("#3A5572")
		expect(colorOfStep({ sales_person: "Maya", sales_person_name: "Maya Rochat" }, people)).toBe("#3A5572")
	})

	it("falls back on the colour of her name where the reservation gives none", async () => {
		const { avatarColorOf, colorOfPerson, colorOfStep } = await import("../appointments")

		expect(colorOfPerson({ sales_person_name: "Luc Bonvin" })).toBe(avatarColorOf("Luc Bonvin"))
		expect(colorOfStep({ sales_person: "Luc", sales_person_name: "Luc Bonvin" }, [])).toBe(avatarColorOf("Luc Bonvin"))
	})
})
