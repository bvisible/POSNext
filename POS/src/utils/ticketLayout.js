//// Neoffice — added file (no upstream equivalent). One size for the tickets of the runner and of the kitchen screen
//// (NeoRestau lot 1, task 9c). The two screens drew their tickets on grids of their own (5 columns of about 365 px
//// against 4 of about 450 px on a 1900 px wide screen) and cut them to sizes of their own (the padding, the title, the
//// timer, the item lines), so the same order did not look alike from one screen to the other. The grid and the frame
//// are written ONCE, here: both pages and both ticket cards take them from here, so a size changed in this file changes
//// both screens, and a test reads them back from both.
////
//// Task 38a-2 (ruling 109 and the approved mockup): the WIDTH of a ticket follows the text size. It used to be the share of a
//// grid of 1 to 5 columns that the width of the screen decided (about 320 px at 1366 px wide, whatever the text), so a cook
//// who chose the dense size still saw tickets as wide as the large ones, four across. It is now `--kds-card-w`, a variable the
//// screen's root sets with the size (utils/kitchenTextSize: 250, 280, 330, 390 px), and the grids and the lanes below are as many
//// tickets of that width as the screen holds: Compact is narrower, more tickets fit across. The gap between two is 8 px and the
//// margin of the area 12 px (they were 16), the mockup's.
////
//// The classes are whole literals so that Tailwind's scan of `src/**/*.js` finds them. This build's Tailwind scale is
//// frappe-ui's, not the stock one (text-base is 14 px, text-lg 16 px, text-xl 18 px).

/**
 * The scrolling area that holds the tickets. Its margin takes part in the width of a ticket (the screen minus the margin
 * on both sides, shared among the columns), so it is shared like the grid.
 */
export const TICKET_AREA = "flex-1 overflow-y-auto p-3"

/**
 * The grid of the tickets: as many columns of the text size's width (`--kds-card-w`) as the screen holds, from the left, the same gap on both screens.
 * `minmax(0, width)` and not the width alone: the number of columns is counted by the width, and a screen narrower than one ticket still gets a column
 * that gives way instead of one that overflows.
 */
export const TICKET_GRID =
	"grid grid-cols-[repeat(auto-fill,minmax(0,var(--kds-card-w,250px)))] justify-start gap-2"

// ---------------------------------------------------------------------------------------------------------------------
// The kitchen screen in two bands (NeoRestau lot 1, task 23). The kitchen shows the tickets waiting and the tickets in
// preparation apart from each other, and it is used on tablets: it can hold thirty tickets in one band and tickets of
// twenty-five dishes. Neither a long grid that scrolls down a page nor a ticket that grows with its dishes can do that
// and keep the two bands on the screen, so a ticket is bounded by its band, and the band by its share of the screen.
// Whichever way the bands are laid out, a ticket is as wide as the text size says (`--kds-card-w`): it is the same ticket as on the runner. A test reads
// the widths back from these classes, at every width from 320 to 2560 px.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * BANDS layout, one band above the other: a band is ONE row of tickets that scrolls sideways (a swipe), oldest on the left.
 * Each ticket is exactly `--kds-card-w` wide, so as many tickets across as the screen holds at that size. The single row is as tall as the lane
 * (`minmax(0, 1fr)`): a ticket never grows past its band, its dishes scroll inside it (KDSOrderCard). Tickets stop on a
 * ticket edge after a swipe (`snap`), and the lane hands no scroll on to the page (`overscroll-contain`): sideways, a swipe
 * from the left edge would be taken for "back" on a tablet; up and down, the end of a ticket's dishes would pass the swipe
 * on and an Android tablet would pull the page to refresh it. The ticket does not contain its own scroll (see KDSOrderCard):
 * it is the band that stops it.
 */
export const TICKET_LANE =
	"grid grid-flow-col grid-rows-[minmax(0,1fr)] gap-2 overflow-x-auto overflow-y-hidden overscroll-contain snap-x snap-mandatory auto-cols-[var(--kds-card-w,250px)]"

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
 * COLUMNS layout, side by side: a row as tall as the screen leaves it, the waiting tickets in a column of ONE ticket's width (a little more, for the
 * scrollbar of a screen that draws one), the tickets in preparation taking the rest of the width, laid out in as many columns of the text size's
 * width as it holds. Below 768 px the layout is not offered (the screen stays in bands).
 */
export const TICKET_COLUMNS = "flex h-full min-h-[20rem] gap-3"
export const TICKET_SPLIT_WAITING = "flex-none w-[calc(var(--kds-card-w,250px)+12px)]"
export const TICKET_SPLIT_PRODUCTION = "min-w-0 flex-1"
export const TICKET_COLUMN_WAITING =
	"grid grid-cols-[var(--kds-card-w,250px)] gap-2"
export const TICKET_COLUMN_PRODUCTION =
	"grid grid-cols-[repeat(auto-fill,minmax(0,var(--kds-card-w,250px)))] justify-start gap-2"

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

/**
 * The sizes of the KITCHEN card (NeoRestau lot 1, task 38a-1, ruling 109), laid over the shared frame above, for the parts the size chosen
 * changes: paddings, text, dish line. Each reads a CSS variable the screen's root sets (utils/kitchenTextSize) with the Compact value as its
 * fallback, so that a card drawn outside the page is dense too. They are `!important`: the frame's `text-xl`, `px-4`... are in the same
 * stylesheet at the same weight and the later one wins, and they also carry a letter-spacing and a weight of their own that the kitchen's
 * text does not want. The runner's card reads them too since task 38a-2 (ruling 130: one card anatomy for both screens).
 */
export const KITCHEN_FRAME = {
	header: "!px-[var(--kds-pad-x,8px)] !py-[var(--kds-head-py,5px)]",
	title: "!text-[length:var(--kds-fs-table,15px)]",
	number: "!text-[length:var(--kds-fs-num,12px)]",
	timer: "!text-[length:var(--kds-fs-timer,13px)]",
	body: "!px-[var(--kds-pad-x,8px)] !py-[var(--kds-body-py,0px)]",
	line: "!min-h-0 !text-[length:var(--kds-fs,13px)]",
}

// ---------------------------------------------------------------------------------------------------------------------
// The runner screen's tickets, STACKED (NeoRestau lot 1, task 38a-2, ruling 130). The runner's cards stood in one row of full-height columns, so a ticket of two
// dishes left most of its column empty while the next ticket sat off the screen. A short ticket now stacks under the one before it in the same column, and a
// long ticket keeps a column for itself: the cards FLOW, oldest first, from the top of a column to its foot and on to the next column (a column-wrapping flex
// box as tall as the screen leaves it), each as wide as the size of the text says (`--kds-card-w`, utils/kitchenTextSize) and never taller than the screen
// (`max-h-full`: its dishes scroll inside it). The area scrolls sideways, by touch, and hands no scroll on to the page.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The scrolling area of the runner's tickets: sideways only. A column of tickets is as tall as the screen leaves it, so nothing scrolls up and down; a swipe
 * from the left edge would be taken for "back" on a tablet, and the area keeps the scroll to itself (`overscroll-contain`).
 */
export const RUNNER_AREA =
	"flex-1 min-h-0 overflow-x-auto overflow-y-hidden overscroll-contain px-3 pt-2 pb-2"

/** The cards flowing in columns: top to bottom, then the next column. The setting « stack short tickets » (on by default). */
export const TICKET_STACK =
	"flex h-full min-h-[14rem] flex-col flex-wrap content-start items-start gap-2"

/** The same cards with one ticket per column, as full-height columns side by side: the setting turned off. */
export const TICKET_ROW = "flex h-full min-h-[14rem] flex-row items-stretch gap-2"

/** A card of the runner's flow: as wide as the text size says, never taller than the flow. */
export const TICKET_CARD = "w-[var(--kds-card-w,250px)] max-h-full flex-none"

// ---------------------------------------------------------------------------------------------------------------------
// The WIDE card (NeoRestau lot 1, task 38a-3, ruling 107 layer 2). A ticket with more than `WIDE_TICKET_LINES` dishes (utils/wideTicket) takes two card widths where the screen holds at least
// three columns: in a grid or a lane it spans two columns (the gap between them is part of it), in the runner's flow it is two widths and the gap wide. It never spans more than the room there is
// (`max-w-full`), and its dishes stay in one list.
// ---------------------------------------------------------------------------------------------------------------------

/** The cell of a kitchen band that holds a wide ticket: two columns of the grid, or of the lane. */
export const TICKET_CELL_WIDE = "col-span-2"

/** A card of the runner's flow that is wide: two ticket widths and the gap between them (`gap-2`, 0.5rem), never wider than the flow, never taller than it. */
export const TICKET_CARD_WIDE =
	"w-[calc(var(--kds-card-w,250px)*2+0.5rem)] max-w-full max-h-full flex-none"

// ---------------------------------------------------------------------------------------------------------------------
// The FULL-SCREEN ticket (NeoRestau lot 1, task 38a-3, ruling 107 layer 3). The card opened over the board: its dishes in as many columns as the height of the panel needs, side by side
// (a 24-dish ticket does not fit one screen even in large text), the panel scrolling sideways when it still overflows. The sizes are the variables of the size the panel is drawn in
// (utils/kitchenTextSize fullScreenVariables); these are the classes that change with the form, and they stay whole literals for Tailwind's scan of `src/**/*.js`.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * What the full-screen form of a card changes. `body`: the dishes flow down a column and on to the next, each column as wide as the size says less a margin (the mockup's 300 px in Large), a
 * dish is never cut between two columns, and the body scrolls sideways by touch, handing no scroll on to the page. `line`: a dish is a touch target of at least 44 px, as in the mockup.
 * `actions`: the row under the head, with the room of a panel.
 */
export const FULLSCREEN_FRAME = {
	body: "overflow-x-auto overflow-y-hidden overscroll-contain [column-fill:auto] [column-gap:24px] [columns:calc(var(--kds-card-w,330px)_-_30px)]",
	line: "!min-h-[44px] !text-[length:var(--kds-fs,13px)]",
	actions: "gap-2 px-[var(--kds-pad-x,16px)] pb-3 pt-1",
}
