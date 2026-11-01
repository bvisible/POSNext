//// Neoffice — added file (no upstream equivalent). Keep the screen on, and let it rest on purpose (NeoRestau lot 1, task 47). The product owner's
//// tablet fell asleep by itself in the kitchen; he also wants a screen that nobody touched for half an hour to go quiet, and to come back with a touch.
//// These are TWO DIFFERENT THINGS, and this composable keeps them apart:
////
//// (1) KEEP THE SCREEN ON — the browser's Screen Wake Lock (`navigator.wakeLock.request("screen")`, https only). The browser RELEASES the lock whenever
////     the page is hidden (another tab, the tablet locked), so it is asked for again when the page is visible again, after a `release` event and after a
////     rejection (a low battery). Where the API does not exist nothing is done: no hack, no hidden video.
//// (2) REST — a web page cannot switch the physical screen off nor dim it. After N minutes without a touch the page DRAWS a near-black layer
////     (ScreenRestLayer) while the lock and the live updates keep running. A touch wakes it without reaching the control under the finger (the first
////     touch is swallowed, whole, down to the click the browser sends after it); a new ticket wakes it too, because a kitchen must never miss one.
////
//// The settings (utils/screenAwake) are the built-in defaults, the restaurant's values when it has some (`restaurantDefaults`, to come from the
//// till's settings screen) and what THIS DEVICE chose, kept in localStorage like the text size. "Let the tablet sleep after N more minutes of rest"
//// RELEASES the lock so that the tablet's own auto-lock takes over (a web page cannot wake a locked tablet: a ticket then lights nothing).
import {
	computed,
	getCurrentInstance,
	onBeforeUnmount,
	onMounted,
	ref,
	unref,
} from "vue"
import {
	cleanSetting,
	hasNewTicket,
	readDeviceSettings,
	resolveSettings,
	saveDeviceSetting,
} from "@/utils/screenAwake"

const MINUTE = 60 * 1000

// After a rejection (a low battery) the lock is asked for again this long after, and not in a loop
export const WAKE_LOCK_RETRY_MS = 30 * 1000
// After the end of a touch that woke the screen, the browser may still send the click (or a late mouse event) for this long: it is swallowed too
export const GHOST_CLICK_MS = 400
// A touch that never ends (a finger lifted off the screen's edge) must not swallow the screen for good
export const SWALLOW_LIMIT_MS = 2000

// What starts a gesture, what ends one, and the click the browser sends once it has ended
const START_EVENTS = ["pointerdown", "touchstart", "mousedown", "keydown"]
const END_EVENTS = [
	"pointerup",
	"pointercancel",
	"touchend",
	"touchcancel",
	"mouseup",
	"keyup",
]
const CLICK_EVENTS = [
	"click",
	"dblclick",
	"auxclick",
	"contextmenu",
	"keypress",
]

const wakeLockApi = () => {
	try {
		return typeof navigator !== "undefined" &&
			navigator.wakeLock &&
			typeof navigator.wakeLock.request === "function"
			? navigator.wakeLock
			: null
	} catch {
		return null
	}
}
const pageIsVisible = () =>
	typeof document === "undefined" || document.visibilityState !== "hidden"

/**
 * @param {string} screen - "kitchen", "runner" or "display": the defaults of the screen (utils/screenAwake)
 * @param {{ rest?: boolean, restaurantDefaults?: object }} [options]
 *   rest: false for a page that is never touched, the customer display: its screen is kept on and never drawn dark.
 *   restaurantDefaults: the restaurant's values (a plain object or a ref), between the built-in defaults and the device's choice.
 * @returns {{
 *   settings: import("vue").Ref<object>,
 *   resting: import("vue").Ref<boolean>,
 *   wakeLockActive: import("vue").Ref<boolean>,
 *   wakeLockSupported: import("vue").Ref<boolean>,
 *   setSetting: (key: string, value: boolean|number) => void,
 *   noteTickets: (counts: Record<string, number>) => void,
 *   wakeUp: () => void,
 *   start: () => void,
 *   stop: () => void,
 * }}
 *   settings: the four settings in force. resting: the near-black layer is to be drawn. wakeLockActive: a lock is held right now. wakeLockSupported: the browser
 *   has the API at all. setSetting: one setting, taking effect at once and kept on this device when it can be. noteTickets: a reading of the screen's tickets
 *   (utils/screenAwake.ticketCounts); a new ticket wakes the screen. wakeUp: leave the rest from the code. start/stop: called by the component's lifecycle
 *   when the composable is used inside one.
 */
export function useScreenAwake(
	screen,
	{ rest = true, restaurantDefaults = {} } = {},
) {
	// Read now, not on mount: the first paint must already be the right one
	const device = ref(readDeviceSettings())
	const settings = computed(() =>
		resolveSettings({
			screen,
			restaurant: unref(restaurantDefaults),
			device: device.value,
		}),
	)
	const resting = ref(false)
	const wakeLockActive = ref(false)
	const wakeLockSupported = ref(!!wakeLockApi())

	let started = false
	let sentinel = null
	let acquiring = false
	// The rest let the lock go ("let the tablet sleep after N more minutes"): it is not asked for again until the screen is woken
	let releasedByRest = false
	let lastActivity = Date.now()
	let idleTimer = null
	let releaseTimer = null
	let retryTimer = null
	let swallowing = false
	let swallowEndTimer = null
	let swallowLimitTimer = null
	let seenTickets = null

	const restMinutes = () => (rest ? settings.value.rest_after_minutes : 0)
	const wantsLock = () =>
		started && settings.value.keep_screen_on && !releasedByRest

	// ---- (1) the Screen Wake Lock ----------------------------------------------------------------------------------------------
	function clearRetry() {
		if (retryTimer) clearTimeout(retryTimer)
		retryTimer = null
	}

	function onReleased(event) {
		// The browser (the page was hidden, the battery is low) or this page let go of THIS lock
		if (event?.target && event.target !== sentinel) return
		sentinel = null
		wakeLockActive.value = false
		// Still visible and still wanted: the system took it back, ask again. A hidden page asks when it is visible again.
		if (pageIsVisible() && wantsLock()) acquire()
	}

	async function acquire() {
		const api = wakeLockApi()
		wakeLockSupported.value = !!api
		if (!api || !wantsLock() || sentinel || acquiring || !pageIsVisible())
			return
		acquiring = true
		try {
			const lock = await api.request("screen")
			// The page closed, or the setting changed, while the browser was thinking
			if (!wantsLock()) {
				try {
					await lock.release()
				} catch {
					// Nothing more to do for a lock that cannot be released
				}
				return
			}
			sentinel = lock
			lock.addEventListener?.("release", onReleased)
			wakeLockActive.value = true
			clearRetry()
		} catch {
			// Rejected (a low battery, a page the browser calls hidden): ask again later, and at the next touch
			wakeLockActive.value = false
			clearRetry()
			if (wantsLock()) {
				retryTimer = setTimeout(() => {
					retryTimer = null
					acquire()
				}, WAKE_LOCK_RETRY_MS)
			}
		} finally {
			acquiring = false
		}
	}

	async function releaseLock() {
		clearRetry()
		const lock = sentinel
		sentinel = null
		wakeLockActive.value = false
		if (!lock) return
		lock.removeEventListener?.("release", onReleased)
		try {
			await lock.release()
		} catch {
			// Already released by the browser
		}
	}

	// ---- (2) the rest --------------------------------------------------------------------------------------------------------------
	function clearTimer(timer) {
		if (timer) clearTimeout(timer)
	}

	function armIdle() {
		clearTimer(idleTimer)
		idleTimer = null
		lastActivity = Date.now()
		const minutes = restMinutes()
		if (!started || resting.value || !minutes) return
		idleTimer = setTimeout(beginRest, minutes * MINUTE)
	}

	function armRelease() {
		clearTimer(releaseTimer)
		releaseTimer = null
		const minutes = settings.value.release_wake_lock_after_minutes
		if (
			!started ||
			!resting.value ||
			!minutes ||
			!settings.value.keep_screen_on
		)
			return
		releaseTimer = setTimeout(() => {
			releaseTimer = null
			releasedByRest = true
			releaseLock()
		}, minutes * MINUTE)
	}

	function beginRest() {
		idleTimer = null
		if (!started || !restMinutes()) return
		resting.value = true
		armRelease()
	}

	function leaveRest() {
		resting.value = false
		clearTimer(releaseTimer)
		releaseTimer = null
		if (releasedByRest) {
			releasedByRest = false
			acquire()
		}
	}

	/** Leave the rest and start the count again. */
	function wakeUp() {
		leaveRest()
		armIdle()
	}

	// ---- a touch ---------------------------------------------------------------------------------------------------------------------
	function swallow(event) {
		event.stopImmediatePropagation()
		if (event.cancelable) event.preventDefault()
	}

	function startSwallowing() {
		swallowing = true
		clearTimer(swallowEndTimer)
		swallowEndTimer = null
		clearTimer(swallowLimitTimer)
		swallowLimitTimer = setTimeout(stopSwallowing, SWALLOW_LIMIT_MS)
	}

	function stopSwallowing() {
		swallowing = false
		clearTimer(swallowEndTimer)
		clearTimer(swallowLimitTimer)
		swallowEndTimer = null
		swallowLimitTimer = null
	}

	// The finger left: the click the browser sends after it may come a moment later
	function swallowEndsSoon() {
		clearTimer(swallowEndTimer)
		swallowEndTimer = setTimeout(stopSwallowing, GHOST_CLICK_MS)
	}

	function onGestureStart(event) {
		if (swallowing) {
			swallow(event)
			// A key that is held down sends keydown again and again, and a lifted key may send no keyup to this page
			if (event.type === "keydown") swallowEndsSoon()
			return
		}
		if (resting.value) {
			startSwallowing()
			swallow(event)
			if (event.type === "keydown") swallowEndsSoon()
			wakeUp()
			return
		}
		// An ordinary touch: the count starts again, and a missing lock is another chance
		armIdle()
		if (!sentinel) acquire()
	}

	function onGestureEnd(event) {
		if (!swallowing) return
		swallow(event)
		swallowEndsSoon()
	}

	function onClick(event) {
		if (!swallowing) return
		swallow(event)
		swallowEndsSoon()
	}

	// ---- the page --------------------------------------------------------------------------------------------------------------------
	function onVisibilityChange() {
		if (!pageIsVisible()) return
		acquire()
		// A frozen page does not run its timers: the clock says whether the rest is due
		const minutes = restMinutes()
		if (
			started &&
			minutes &&
			!resting.value &&
			Date.now() - lastActivity >= minutes * MINUTE
		)
			beginRest()
	}

	function start() {
		if (started) return
		started = true
		releasedByRest = false
		lastActivity = Date.now()
		const options = { capture: true, passive: false }
		for (const type of [...START_EVENTS, ...END_EVENTS, ...CLICK_EVENTS])
			window.addEventListener(type, listenerOf(type), options)
		document.addEventListener("visibilitychange", onVisibilityChange)
		wakeLockSupported.value = !!wakeLockApi()
		acquire()
		armIdle()
	}

	function stop() {
		if (!started) return
		started = false
		const options = { capture: true, passive: false }
		for (const type of [...START_EVENTS, ...END_EVENTS, ...CLICK_EVENTS])
			window.removeEventListener(type, listenerOf(type), options)
		document.removeEventListener("visibilitychange", onVisibilityChange)
		for (const timer of [
			idleTimer,
			releaseTimer,
			swallowEndTimer,
			swallowLimitTimer,
		])
			clearTimer(timer)
		idleTimer = releaseTimer = swallowEndTimer = swallowLimitTimer = null
		swallowing = false
		resting.value = false
		releaseLock()
	}

	// One listener per event type, kept so that it can be removed
	const listeners = new Map()
	function listenerOf(type) {
		if (!listeners.has(type)) {
			listeners.set(
				type,
				START_EVENTS.includes(type)
					? onGestureStart
					: END_EVENTS.includes(type)
						? onGestureEnd
						: onClick,
			)
		}
		return listeners.get(type)
	}

	// ---- the settings ----------------------------------------------------------------------------------------------------------
	function setSetting(key, value) {
		const cleaned = cleanSetting(key, value)
		if (cleaned === undefined) return
		device.value = { ...device.value, [key]: cleaned }
		saveDeviceSetting(key, cleaned)
		applySettings()
	}

	// What a choice changes at once: the lock, the count to the rest, the count to the release
	function applySettings() {
		if (!started) return
		if (settings.value.keep_screen_on) {
			acquire()
		} else {
			releasedByRest = false
			releaseLock()
		}
		if (!restMinutes()) {
			if (resting.value) leaveRest()
			clearTimer(idleTimer)
			idleTimer = null
		} else if (!resting.value) {
			armIdle()
		}
		armRelease()
	}

	// ---- the tickets -----------------------------------------------------------------------------------------------------------
	function noteTickets(counts) {
		const previous = seenTickets
		seenTickets = counts || {}
		if (!rest || !settings.value.wake_on_new_ticket) return
		if (hasNewTicket(previous, seenTickets)) wakeUp()
	}

	if (getCurrentInstance()) {
		onMounted(start)
		onBeforeUnmount(stop)
	}

	return {
		settings,
		resting,
		wakeLockActive,
		wakeLockSupported,
		setSetting,
		noteTickets,
		wakeUp,
		start,
		stop,
	}
}
