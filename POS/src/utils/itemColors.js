//// Neoffice — added file (no upstream equivalent). A restaurant sells dishes that have no
//// photo, so the item grid needs a colour to tell tiles apart: this is the 10-swatch
//// palette CreateItemDialog offers for Item.custom_color, plus the BT.601 luminance test
//// that decides black or white label text (26f5a3f1, 2026-03-25 "add image and color
//// support for items in POS restaurant"). The two "#d68a59" entries are the Design System
//// clay sweep of e4769383 (2026-06-14 "retheme blue/violet -> Design System clay") landing
//// on the old Blue and Indigo swatches: their names no longer match their hex and the two
//// are now the same colour. TO REVIEW: the palette needs renaming or two fresh hues.
// Predefined color palette for item display in POS grid
export const ITEM_COLOR_PALETTE = [
	{ hex: "#EF4444", name: "Red" },
	{ hex: "#F97316", name: "Orange" },
	{ hex: "#F59E0B", name: "Amber" },
	{ hex: "#EAB308", name: "Yellow" },
	{ hex: "#22C55E", name: "Green" },
	{ hex: "#14B8A6", name: "Teal" },
	{ hex: "#d68a59", name: "Blue" },
	{ hex: "#d68a59", name: "Indigo" },
	{ hex: "#A855F7", name: "Purple" },
	{ hex: "#EC4899", name: "Pink" },
]

//// Neoffice — the label of a tile reads on the colour the manager picked (neoffice-maintenance#3222, follow-up). The BT.601 test above said « light » only over 0.6, so a
//// mid-tone colour (red 500, #EF4444) kept a white label at 3.8:1. The test is the contrast itself now: the ink of the design system (#141414) where it reads at
//// least as well as white does, white where white reads better: every swatch of the palette reaches 4.5:1 that way (a colour of another hue the manager types in may not: the better of the two is still the one).
// Returns true if the dark ink reads at least as well as white on this colour (WCAG contrast of each)
const INK_LUMINANCE = 0.007 // #141414, the design system's ink
export function isLightColor(hex) {
	if (!hex || hex.length < 7) return true
	const channel = (at) => {
		const v = Number.parseInt(hex.slice(at, at + 2), 16) / 255
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
	}
	const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
	const withInk = (luminance + 0.05) / (INK_LUMINANCE + 0.05)
	const withWhite = 1.05 / (luminance + 0.05)
	return withInk >= withWhite
}
