//// Neoffice — added file (no upstream equivalent). How the lines of the cart look at a restaurant till (NeoResto lot 1; product owner, 05.11.2026: « on voit 3 choses par ticket, c'est pas
//// terrible », « la quantité est plus importante visuellement que le texte »). Two settings of the till (POS Settings): « Compact cart lines » (`cart_compact_lines`: one row per article,
//// its name, its quantity and its price side by side, the details under it) and « Pictures in the cart » (`cart_pictures`). Both are on unless the till switched them off; a till that is not
//// migrated yet sends neither, and reads them on. The compact lines are a restaurant till's: a shop's cart keeps the lines it always had.

// A setting that is on unless it was switched off (undefined, null: the server did not say)
export const settingIsOn = (value) => value === undefined || value === null || Boolean(Number(value))

// Whether the cart draws its lines compact: a restaurant till that did not switch it off
export function cartIsCompact(settings, restaurantMode) {
	return Boolean(restaurantMode) && settingIsOn(settings?.cart_compact_lines)
}

// Whether the cart shows the picture (or colour) of its articles
export function cartShowsPictures(settings) {
	return settingIsOn(settings?.cart_pictures)
}

// Whether a line draws its thumbnail. Pictures off: none. Compact: only an article that has a picture or a colour (a grey square with the first letters of the name says nothing the name beside
// it does not say). Otherwise as it always was (the line draws it, a phone hides a photoless one by its own class).
export function lineShowsThumb(item, { compact, pictures }) {
	if (!pictures) return false
	if (!compact) return true
	return Boolean(item?.image || item?.custom_color)
}

// The classes of a line's card: the compact layout, and the one without a thumbnail column
export function cartLineClasses(item, { compact, pictures }) {
	if (!compact) return ""
	return lineShowsThumb(item, { compact, pictures }) ? "cart-line cart-line--compact" : "cart-line cart-line--compact cart-line--no-thumb"
}
