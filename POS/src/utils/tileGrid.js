//// Neoffice — added file (no upstream equivalent). How many tiles a row of the till's catalogue grids shows
//// (NeoResto lot 1, task 13; product owner, 30.10.2026: « six or seven would fit, all the more since many products
//// have no picture »). The till's setting `tiles_per_row` (POS Settings) is "Automatic" (the grids as they always
//// were: the shop's by the width of its pane, the restaurant's by the width of the screen) or a number from 3 to 8.
//// Both grids read it through here: the shop's item grid (ItemsSelector.vue) and the restaurant's card grid
//// (RestaurantCardGrid.vue).

export const TILES_PER_ROW_AUTOMATIC = "Automatic"
export const TILES_PER_ROW_MIN = 3
export const TILES_PER_ROW_MAX = 8

// The class a fixed grid carries: its tiles then fit their width (see the two grids' styles)
export const FIXED_GRID_CLASS = "tile-grid-fixed"

// The restaurant card grid's own columns, by the width of the screen: what "Automatic" keeps
export const CARD_GRID_AUTOMATIC_CLASSES =
	"grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"

// The number of tiles a row shows, or null for the automatic grid: anything but a whole number from 3 to 8 (a value
// an older till never sent, a typo) keeps the grid as it always was
export function tilesPerRow(setting) {
	if (setting === null || setting === undefined || setting === "") return null
	const count = Number(setting)
	if (!Number.isInteger(count)) return null
	return count >= TILES_PER_ROW_MIN && count <= TILES_PER_ROW_MAX ? count : null
}

// The inline style of a grid: its columns when the number is fixed, nothing when automatic
export function tileGridStyle(setting) {
	const count = tilesPerRow(setting)
	return count ? { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` } : {}
}

// How tall the restaurant card's tiles are (the till's « Tile height », POS Settings.tile_height; NeoResto lot 1, product owner, 05.11.2026: « arriver à caser en
// hauteur plus de boutons »): « Compact » (short pictures, a name-only tile just high enough for two lines), « Standard » (the default), or « Large » (square pictures,
// the tall name-only tile the grid always had). Anything else (an older till, a typo) is Standard.
export const TILE_HEIGHT_COMPACT = "Compact"
export const TILE_HEIGHT_STANDARD = "Standard"
export const TILE_HEIGHT_LARGE = "Large"
export const TILE_HEIGHTS = [TILE_HEIGHT_COMPACT, TILE_HEIGHT_STANDARD, TILE_HEIGHT_LARGE]

export function tileHeightOf(setting) {
	return TILE_HEIGHTS.includes(setting) ? setting : TILE_HEIGHT_STANDARD
}

// The class a card grid carries for its tile height: the grid's styles read the sizes from it
export function tileHeightClass(setting) {
	return `tile-grid-h-${tileHeightOf(setting).toLowerCase()}`
}

// The class of the shop's item grid besides its own: the fixed grid's, or none
export function tileGridClass(setting) {
	return tilesPerRow(setting) ? FIXED_GRID_CLASS : ""
}

// The column classes of the restaurant's card grid: its automatic ones, or the fixed grid's
export function cardGridClasses(setting) {
	return tilesPerRow(setting) ? FIXED_GRID_CLASS : CARD_GRID_AUTOMATIC_CLASSES
}
