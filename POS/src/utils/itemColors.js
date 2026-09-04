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

// Returns true if color is light enough to need dark text (BT.601 luminance)
export function isLightColor(hex) {
	if (!hex || hex.length < 7) return true
	const r = Number.parseInt(hex.slice(1, 3), 16)
	const g = Number.parseInt(hex.slice(3, 5), 16)
	const b = Number.parseInt(hex.slice(5, 7), 16)
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
}
