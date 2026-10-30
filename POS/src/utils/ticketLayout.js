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

// ---------------------------------------------------------------------------------------------------------------------
// The kitchen screen in two bands (NeoRestau lot 1, task 23). The kitchen shows the tickets waiting and the tickets in
// preparation apart from each other, and it is used on tablets: it can hold thirty tickets in one band and tickets of
// twenty-five dishes. Neither a long grid that scrolls down a page nor a ticket that grows with its dishes can do that
// and keep the two bands on the screen, so a ticket is bounded by its band, and the band by its share of the screen.
// Whichever way the bands are laid out, a ticket is as wide as a column of TICKET_GRID at that screen width: it is the
// same ticket as on the runner. A test reads the widths back from these classes, at every width from 320 to 2560 px.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * BANDS layout, one band above the other: a band is ONE row of tickets that scrolls sideways (a swipe), oldest on the left.
 * Each ticket is exactly one column of TICKET_GRID wide: `(100% - (n - 1) gaps) / n` for the n columns that grid has at
 * that width, so 4 tickets across on 1280 px, 3 on 1180 and 1024, 2 on 800. The single row is as tall as the lane
 * (`minmax(0, 1fr)`): a ticket never grows past its band, its dishes scroll inside it (KDSOrderCard). Tickets stop on a
 * ticket edge after a swipe (`snap`), and the lane hands no scroll on to the page (`overscroll-contain`): sideways, a swipe
 * from the left edge would be taken for "back" on a tablet; up and down, the end of a ticket's dishes would pass the swipe
 * on and an Android tablet would pull the page to refresh it. The ticket does not contain its own scroll (see KDSOrderCard):
 * it is the band that stops it.
 */
export const TICKET_LANE =
	"grid grid-flow-col grid-rows-[minmax(0,1fr)] gap-4 overflow-x-auto overflow-y-hidden overscroll-contain snap-x snap-mandatory auto-cols-[100%] md:auto-cols-[calc((100%-1rem)/2)] lg:auto-cols-[calc((100%-2rem)/3)] xl:auto-cols-[calc((100%-3rem)/4)] min-[1600px]:auto-cols-[calc((100%-4rem)/5)]"

/**
 * The height each band of the BANDS layout gets, as a share of the screen left under the filter line, and a floor.
 * The shares are fixed, they do not follow what the bands hold: the boundary between the two never moves when a ticket
 * arrives or leaves, so that the button a cook is about to touch is not under another ticket's by the time he does. The
 * band where the cooks work (in preparation) gets more. The floor keeps a short screen from crushing a band: the page
 * scrolls instead.
 */
export const BAND_WAITING_HEIGHT = "flex-[5_1_0%] min-h-[14rem]"
export const BAND_PRODUCTION_HEIGHT = "flex-[6_1_0%] min-h-[16rem]"

/**
 * COLUMNS layout, side by side: the page-level split IS TICKET_GRID (same columns, same gap). The waiting tickets take the
 * first column of it, the tickets in preparation take the others, and inside them the tickets are laid out in as many
 * columns as the side spans, so a ticket is again one column of the grid wide. Below 768 px the grid has one column and
 * the layout is not offered (the screen stays in bands).
 */
export const TICKET_SPLIT_WAITING = "col-span-1"
export const TICKET_SPLIT_PRODUCTION =
	"col-span-1 lg:col-span-2 xl:col-span-3 min-[1600px]:col-span-4"
export const TICKET_COLUMN_WAITING = "grid grid-cols-1 gap-4"
export const TICKET_COLUMN_PRODUCTION =
	"grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 min-[1600px]:grid-cols-4 gap-4"

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
