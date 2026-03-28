// Predefined color palette for item display in POS grid
export const ITEM_COLOR_PALETTE = [
	{ hex: "#EF4444", name: "Red" },
	{ hex: "#F97316", name: "Orange" },
	{ hex: "#F59E0B", name: "Amber" },
	{ hex: "#EAB308", name: "Yellow" },
	{ hex: "#22C55E", name: "Green" },
	{ hex: "#14B8A6", name: "Teal" },
	{ hex: "#3B82F6", name: "Blue" },
	{ hex: "#6366F1", name: "Indigo" },
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
