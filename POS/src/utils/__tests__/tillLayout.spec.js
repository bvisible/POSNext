//// Neoffice — added file (no upstream equivalent). The till's screen while its agenda is open (NeoSalon B', 16.11.2026).
// Jérémy: « dans l'onglet Rendez-vous, masquer le panneau de droite : ça bouffe toute une partie de la partie rendez-vous ». On a desktop
// the agenda takes the whole width, the sheet of an appointment opens over it on the right, and « Encaisser » brings the cart back.
import { describe, expect, it } from "vitest"

import { tillLayout } from "../appointments"

describe("the till's layout", () => {
	it("gives the agenda the whole width of a desktop, with no panel, while no appointment is chosen", () => {
		const layout = tillLayout({ isDesktop: true, agenda: true, selected: false, leftPanelWidth: 720, mobileTab: "items" })

		expect(layout).toEqual({ leftWidth: "100%", leftGrows: true, divider: false, cart: false, sheet: null })
	})

	// Jérémy, 16.11: the sheet « prend la place du panier à droite », it does not open over the agenda
	it("puts a chosen appointment's sheet in the cart's place on the right, the agenda beside it", () => {
		const layout = tillLayout({ isDesktop: true, agenda: true, selected: true, leftPanelWidth: 720, mobileTab: "items" })

		expect(layout).toEqual({ leftWidth: "auto", leftGrows: true, divider: false, cart: false, sheet: "panel" })
	})

	it("keeps the sale as it was when the agenda is closed: the items at their width, the divider, the cart", () => {
		const layout = tillLayout({ isDesktop: true, agenda: false, selected: false, leftPanelWidth: 720, mobileTab: "items" })

		expect(layout).toEqual({ leftWidth: "720px", leftGrows: false, divider: true, cart: true, sheet: null })
	})

	it("on a phone keeps one tab at a time, and the sheet covers the agenda", () => {
		expect(tillLayout({ isDesktop: false, agenda: true, selected: true, leftPanelWidth: 720, mobileTab: "items" })).toEqual({
			leftWidth: "100%",
			leftGrows: true,
			divider: false,
			cart: false,
			sheet: "cover",
		})
		expect(tillLayout({ isDesktop: false, agenda: false, leftPanelWidth: 720, mobileTab: "cart" }).cart).toBe(true)
	})

	//// Neoffice — the sheet of an appointment is mounted only with an appointment, on a phone as on a desktop (neoffice-maintenance#3203)
	it("on a phone mounts no sheet while no appointment is chosen: it would read the customer of nothing", () => {
		const layout = tillLayout({ isDesktop: false, agenda: true, selected: false, leftPanelWidth: 720, mobileTab: "items" })

		expect(layout.sheet).toBeNull()
		expect(tillLayout({ isDesktop: false, agenda: false, selected: false, leftPanelWidth: 720, mobileTab: "items" }).sheet).toBeNull()
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

describe("the hour an appointment is dropped at in the agenda", () => {
	it("is the quarter under the pointer, inside the day", async () => {
		const { dropTime } = await import("../appointments")
		const range = { start: 8, end: 19 }

		// 56 px an hour: 2 h 30 below the top is 10:30, 2 h 37 rounds to 10:30, 2 h 45 to 10:45
		expect(dropTime(140, range, 56)).toBe("10:30")
		expect(dropTime(146.5, range, 56)).toBe("10:30")
		expect(dropTime(154, range, 56)).toBe("10:45")
		expect(dropTime(-40, range, 56)).toBe("08:00")
		expect(dropTime(10000, range, 56)).toBe("18:45")
	})
})
