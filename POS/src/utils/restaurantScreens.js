//// Neoffice — added file (no upstream equivalent). The screens of the restaurant, and the way from one to another (NeoRestau lot 1, task 38a-2,
//// ruling 132). The kitchen screen let its user hop from the bar to the kitchen and never to the runner, while the runner could go to either:
//// two ideas were mixed, WHICH SCREEN (preparation, runner, floor plan) and WHICH FILTER (the room, the station). They are separate now. A
//// switch on every screen goes from one screen to another, and the filters ride along in the address, so that going from the bar's kitchen to the
//// runner shows the runner of the bar, and « all » stays « all ». The rules are written once, here, and only read by the screens.

export const SCREEN_PREPARATION = "preparation"
export const SCREEN_RUNNER = "runner"
export const SCREEN_PLAN = "plan"

// In the order the switch draws them: what is cooked, what is carried, the dining room
export const SCREENS = [SCREEN_PREPARATION, SCREEN_RUNNER, SCREEN_PLAN]

// The addresses of the screens, inside the app (it lives under /pos). The floor plan is the till's own page: the one « back to POS » goes to.
const PATHS = {
	[SCREEN_PREPARATION]: "/kds",
	[SCREEN_RUNNER]: "/runner",
	[SCREEN_PLAN]: "/",
}

/**
 * The screens a session may go to from the one it is on.
 *
 * A desk user has all of them: the kitchen, the runner (unless the restaurant has switched its runner off: its page would only say so) and the
 * till's floor plan. A tablet signed in with its own account was paired for ONE screen and has no till behind it: it keeps its own and nothing
 * else, so that nothing it could press leads somewhere the server would refuse.
 *
 * @param {{ current: string, deskSession: boolean, runnerEnabled?: boolean }} context
 * @returns {string[]} The ids of the screens to draw, in order
 */
export function screensToChooseFrom({
	current,
	deskSession,
	runnerEnabled = true,
}) {
	if (!deskSession) return [current]
	return SCREENS.filter(
		(screen) =>
			screen !== SCREEN_RUNNER ||
			runnerEnabled !== false ||
			current === SCREEN_RUNNER,
	)
}

/**
 * Where a screen is, with the filters the user has on. A filter that is not set (all rooms, all stations, no restaurant named in the address)
 * is not written: the screen it leads to then has its own default, which is « all ». The floor plan is the till's page, which has none of them.
 *
 * @param {string} screen - One of SCREENS
 * @param {{ restaurant?: string|null, station?: string|null, room?: string|null }} [filters]
 * @returns {{ path: string, query?: Record<string, string> }} A location for the router
 */
export function screenLocation(screen, { restaurant, station, room } = {}) {
	const path = PATHS[screen] || PATHS[SCREEN_PREPARATION]
	if (screen === SCREEN_PLAN) return { path }
	const query = {}
	if (restaurant) query.restaurant = restaurant
	if (station) query.station = station
	if (room) query.room = room
	return { path, query }
}
