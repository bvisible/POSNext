//// Neoffice — added file (no upstream equivalent). The label of an item tile reads on the colour the manager picked (neoffice-maintenance#3222, follow-up): the ink of the design
//// system where it reads at least as well as white, white where white reads better; checked against the WCAG contrast written out here, for each swatch of the palette.
import { describe, expect, it } from "vitest"
import { isLightColor, ITEM_COLOR_PALETTE } from "../itemColors"

const luminance = (hex) => {
	const channel = (at) => {
		const v = Number.parseInt(hex.slice(at, at + 2), 16) / 255
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}
const contrast = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}
const INK = "#141414"
const WHITE = "#FFFFFF"

describe("the label of an item tile", () => {
	it("is the ink of the design system on a colour it reads on at least as well as white, and white on the others, for every swatch of the palette", () => {
		for (const { hex, name } of ITEM_COLOR_PALETTE) {
			const chosen = isLightColor(hex) ? INK : WHITE
			const other = isLightColor(hex) ? WHITE : INK
			expect(contrast(hex, chosen), `${name} ${hex}`).toBeGreaterThanOrEqual(contrast(hex, other))
		}
	})

	it("reads at 4.5:1 or more on every swatch of the palette", () => {
		for (const { hex, name } of ITEM_COLOR_PALETTE) {
			expect(contrast(hex, isLightColor(hex) ? INK : WHITE), `${name} ${hex}`).toBeGreaterThanOrEqual(4.5)
		}
	})

	it("turns red 500 from a white label at 3.8:1 to the ink at 4.9:1", () => {
		expect(isLightColor("#EF4444")).toBe(true)
		expect(contrast("#EF4444", WHITE)).toBeLessThan(4)
		expect(contrast("#EF4444", INK)).toBeGreaterThan(4.5)
	})

	it("keeps the colours that were light and the dark ones as they were", () => {
		expect(isLightColor("#EAB308")).toBe(true) // yellow
		expect(isLightColor("#F59E0B")).toBe(true) // amber
		expect(isLightColor("#111827")).toBe(false) // near black
		expect(isLightColor("#1D4ED8")).toBe(false) // a deep blue
	})

	it("takes a colour it cannot read as a light one, as before", () => {
		expect(isLightColor("")).toBe(true)
		expect(isLightColor("#fff")).toBe(true)
		expect(isLightColor(undefined)).toBe(true)
	})
})
