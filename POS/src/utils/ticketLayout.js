//// Neoffice — added file (no upstream equivalent). One size for the tickets of the runner and of the kitchen screen
//// (NeoRestau lot 1, task 9c). The two screens drew their tickets on grids of their own (5 columns of about 365 px
//// against 4 of about 450 px on a 1900 px wide screen) and cut them to sizes of their own (the padding, the title, the
//// timer, the item lines), so the same order did not look alike from one screen to the other. The grid and the frame
//// are written ONCE, here: both pages and both ticket cards take them from here, so a size changed in this file changes
//// both screens, and a test reads them back from both.
////
//// The classes are whole literals so that Tailwind's scan of `src/**/*.js` finds them. This build's Tailwind scale is
//// frappe-ui's, not the stock one (text-base is 14 px, text-lg 16 px, text-xl 18 px), and its screens are sm, md, lg and
//// xl only: there is no `2xl:`, so the fifth column comes in at an arbitrary `min-[1600px]:` step instead.

/**
 * The scrolling area that holds the tickets. Its margin takes part in the width of a ticket (the screen minus the margin
 * on both sides, shared among the columns), so it is shared like the grid.
 */
export const TICKET_AREA = "flex-1 overflow-y-auto p-4"

/**
 * The grid of the tickets: the same columns and the same gap at every width, on both screens. 4 columns of about 320 px
 * on a 1366 px wide screen, 5 of about 365 px on a 1920 px wide one.
 */
export const TICKET_GRID =
	"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1600px]:grid-cols-5 gap-4"

/**
 * The frame both ticket cards are cut to: the sizes only. Colours, borders and what goes inside the frame stay each
 * screen's own (the runner's "Mark Delivered", the kitchen's status of each dish and its "Delivered").
 *
 * - `header` / `body`: the padding of the head of the ticket and of its list of dishes
 * - `title`: the table (or the station, or the takeaway number)
 * - `number`: the order number under or beside the title
 * - `timer`: the time that has passed
 * - `line`: one dish. At least 48 px high, so that a dish is a touch target on the kitchen screen, where a tap opens its
 *   status menu; the runner's lines were 48 px already
 */
export const TICKET_FRAME = {
	header: "px-4 py-3",
	title: "text-xl font-bold leading-tight",
	number: "text-xs",
	timer: "font-mono text-lg font-bold tabular-nums",
	body: "p-4",
	line: "min-h-[48px] text-lg leading-tight",
}
