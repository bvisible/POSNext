//// Neoffice — added file (no upstream equivalent). Where the status menu of a dish opens on the kitchen ticket (NeoRestau
//// lot 1, task 23). The menu hung under the dish INSIDE the ticket. A long ticket's dishes now scroll inside the ticket,
//// and a menu inside a scrolling body is cut by its foot, or makes the body scroll to show it. It is placed on the screen
//// instead: below the dish, above it when there is no room below, always inside the window.

const clamp = (value, min, max) => Math.max(min, Math.min(value, max))

/**
 * The top left corner, in window coordinates, of a menu that opens from a dish.
 *
 * Its right edge lines up with the dish's right edge (where it always opened). It goes below the dish if it fits there,
 * else above it, else on the roomier side, and in every case it is kept inside the window.
 *
 * @param {{ top: number, bottom: number, right: number }} anchor - The box of the dish, in window coordinates
 * @param {{ width: number, height: number }} size - The size of the menu
 * @param {{ width: number, height: number }} viewport - The size of the window
 * @param {{ gap?: number, margin?: number }} [options] - Space between dish and menu, and kept free at the window's edges
 * @returns {{ top: number, left: number }}
 */
export function placeMenu(
	anchor,
	size,
	viewport,
	{ gap = 4, margin = 8 } = {},
) {
	const below = viewport.height - anchor.bottom - gap - margin
	const above = anchor.top - gap - margin
	const under = anchor.bottom + gap
	const over = anchor.top - gap - size.height
	let top = under
	if (size.height <= below) top = under
	else if (size.height <= above) top = over
	else top = below >= above ? under : over
	return {
		top: clamp(top, margin, viewport.height - size.height - margin),
		left: clamp(
			anchor.right - size.width,
			margin,
			viewport.width - size.width - margin,
		),
	}
}
