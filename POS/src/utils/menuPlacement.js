//// Neoffice — added file (no upstream equivalent). Where the status menu of a dish opens on the kitchen ticket (NeoRestau
//// lot 1, task 23). The menu hung under the dish INSIDE the ticket. A long ticket's dishes now scroll inside the ticket,
//// and a menu inside a scrolling body is cut by its foot, or makes the body scroll to show it. It is placed on the screen
//// instead: below the dish, above it when there is no room below, always inside the window.

const clamp = (value, min, max) => Math.max(min, Math.min(value, max))

/**
 * Where a menu that opens from a dish goes, in window coordinates.
 *
 * Its right edge lines up with the dish's right edge (where it always opened). It goes below the dish if it fits there,
 * else above it, else on the roomier side, and in every case it is kept inside the window.
 *
 * A menu that opens DOWNWARD is held by its upper edge (`top`), one that opens UPWARD by its LOWER edge (`bottom`, the
 * distance from the foot of the window): so it touches the dish whatever its height. A dish being prepared offers two
 * buttons and a dish waiting offers three; held by its upper edge, the shorter menu floated 44 px over its dish.
 *
 * @param {{ top: number, bottom: number, right: number }} anchor - The box of the dish, in window coordinates
 * @param {{ width: number, height: number }} size - The size of the menu (the height of the buttons it has, so that the
 *   choice of the side is made with the room it really needs)
 * @param {{ width: number, height: number }} viewport - The size of the window
 * @param {{ gap?: number, margin?: number }} [options] - Space between dish and menu, and kept free at the window's edges
 * @returns {{ placement: "below"|"above", left: number, top?: number, bottom?: number }}
 */
export function placeMenu(
	anchor,
	size,
	viewport,
	{ gap = 4, margin = 8 } = {},
) {
	const room = {
		below: viewport.height - anchor.bottom - gap - margin,
		above: anchor.top - gap - margin,
	}
	let placement = "below"
	if (size.height <= room.below) placement = "below"
	else if (size.height <= room.above) placement = "above"
	else placement = room.below >= room.above ? "below" : "above"

	const left = clamp(
		anchor.right - size.width,
		margin,
		viewport.width - size.width - margin,
	)
	// The farthest a menu of this height may be held from the edge it hangs from, to stay inside the window
	const farthest = viewport.height - size.height - margin
	if (placement === "below")
		return {
			placement,
			left,
			top: clamp(anchor.bottom + gap, margin, farthest),
		}
	return {
		placement,
		left,
		bottom: clamp(viewport.height - anchor.top + gap, margin, farthest),
	}
}
