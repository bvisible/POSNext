/**
 * //// Neoffice — added file (no upstream equivalent). What to write on a preparation station's colour, and the colour a
 * //// station is written in on a dark card (NeoRestau lot 1, task 46). The restaurant picks a station's colour, so the kitchen
 * //// and runner screens cannot know it when they are written: white text on it was 2.8:1 on a clay station, and a blue station's
 * //// name on a tint of its own colour was 2.0:1 on a dark card.
 */
import { describe, expect, it } from "vitest"
import { inkOn, onDark } from "../stationColors"

const channel = (value) => {
	const s = value / 255
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = (hex) => {
	const [r, g, b] = [1, 3, 5].map((i) =>
		channel(Number.parseInt(hex.slice(i, i + 2), 16)),
	)
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}
// The two grounds a station's name sits on in dark mode: a ticket (the till's remap of `bg-white`) and a filter chip (its remap of `bg-gray-100`)
const DARK_TICKET = "#1C1F26"
const DARK_CHIP = "#23272F"

describe("the text on a station's colour", () => {
	it("is the design system's ink on a light station and white on a dark one", () => {
		// The clay of a kitchen station: ink 7.1:1, white 2.8:1
		expect(inkOn("#D68A59")).toBe("#141414")
		// The blue of a bar: white 7.9:1
		expect(inkOn("#2C4FA8")).toBe("#FFFFFF")
	})

	it("is whichever of the two reads better, for any colour", () => {
		for (const color of [
			"#22C55E",
			"#F59E0B",
			"#E11D48",
			"#7C3AED",
			"#0EA5E9",
			"#6B7280",
			"#FFFFFF",
			"#000000",
		]) {
			const chosen = inkOn(color)
			const other = chosen === "#141414" ? "#FFFFFF" : "#141414"
			expect(contrast(color, chosen), color).toBeGreaterThanOrEqual(
				contrast(color, other),
			)
		}
	})

	it("reads the short form and survives a colour it cannot read", () => {
		expect(inkOn("#fc0")).toBe("#141414")
		expect(inkOn("")).toBe("#FFFFFF")
		expect(inkOn(undefined)).toBe("#FFFFFF")
		expect(inkOn("not a colour")).toBe("#FFFFFF")
	})
})

describe("a station's colour on a dark card", () => {
	// The ground a station's name sits on: a ground washed with 12.5 % of the station's own colour (the tint of its pill or count)
	const tinted = (color, ground) => {
		const mix = [1, 3, 5].map((i) => {
			const base = Number.parseInt(ground.slice(i, i + 2), 16)
			const own = Number.parseInt(color.slice(i, i + 2), 16)
			return Math.round(base + (own - base) * 0.125)
		})
		return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`
	}

	it("reaches 4.5:1 on the tint of its own colour, on a ticket and on a filter chip, whatever the station's colour", () => {
		for (const color of [
			"#2C4FA8",
			"#D68A59",
			"#22C55E",
			"#7C3AED",
			"#6B7280",
			"#000000",
			"#E11D48",
			"#F59E0B",
		]) {
			for (const ground of [DARK_TICKET, DARK_CHIP])
				expect(
					contrast(onDark(color), tinted(color, ground)),
					`${color} on ${ground}`,
				).toBeGreaterThanOrEqual(4.5)
		}
	})

	it("keeps a colour that already reads as it is, and lightens a dark one toward white only as far as it must", () => {
		// A pale amber already reads on its own tint
		expect(onDark("#F5C27A")).toBe("#F5C27A")
		// The bar's blue does not (2.0:1 on the card): it is lightened, and stays blue (its blue channel is still the largest)
		const lighter = onDark("#2C4FA8")
		expect(lighter).not.toBe("#2C4FA8")
		const [r, g, b] = [1, 3, 5].map((i) =>
			Number.parseInt(lighter.slice(i, i + 2), 16),
		)
		expect(b).toBeGreaterThan(r)
		expect(b).toBeGreaterThan(g)
		expect(contrast(lighter, DARK_TICKET)).toBeGreaterThanOrEqual(4.8)
		// The clay of the kitchen is lightened a little, not turned into a white
		const clay = onDark("#D68A59")
		expect(Number.parseInt(clay.slice(1, 3), 16)).toBeGreaterThanOrEqual(0xd6)
		expect(Number.parseInt(clay.slice(1, 3), 16)).toBeLessThan(0xf0)
	})

	it("falls back to a readable grey for a colour it cannot read", () => {
		expect(contrast(onDark(undefined), DARK_CHIP)).toBeGreaterThanOrEqual(4.5)
		expect(contrast(onDark("nonsense"), DARK_CHIP)).toBeGreaterThanOrEqual(4.5)
	})
})
