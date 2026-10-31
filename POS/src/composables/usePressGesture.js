//// Neoffice — added file (no upstream equivalent). A touch and a long press on the same button, told apart from a
//// scroll (NeoRestau lot 1, task 27: on the phone's card a touch is +1, a long press opens the options). The till's
//// useLongPress cannot do it: it ignores the finger's movement, so a waiter scrolling the card with a finger resting
//// on a dish would open its options. Here a press that moves more than a few pixels is a scroll, and adds nothing
//// either, however long the finger stays. The touch itself is the button's click (a keyboard's Enter included); a
//// long press or a scroll swallows the click its own finger makes, never a keyboard's.

import { getCurrentInstance, onUnmounted } from "vue"

// How long a press is held before it is a long press
export const LONG_PRESS_MS = 500
// How far a finger may tremble before the press is a scroll
export const SCROLL_SLOP_PX = 10

/**
 * @param {{onTap: Function, onLongPress: Function, delay?: number, slop?: number}} options
 * @returns {{down: Function, move: Function, up: Function, cancel: Function, leave: Function, click: Function,
 *            contextmenu: Function, dispose: Function}}
 */
export function usePressGesture({ onTap, onLongPress, delay = LONG_PRESS_MS, slop = SCROLL_SLOP_PX }) {
	// The press under way: its target, where it started, its timer, and what it became
	let press = null
	// The target whose next pointer click is not a tap: until the next press starts (a click that never came, the
	// browser having taken the scroll, cannot eat a later tap)
	let swallowed = null

	function clearTimer() {
		if (press?.timer) clearTimeout(press.timer)
		if (press) press.timer = null
	}

	function swallowNextClick(target) {
		swallowed = target
	}

	function fire() {
		if (!press || press.moved || press.fired) return
		press.fired = true
		clearTimer()
		swallowNextClick(press.target)
		globalThis.navigator?.vibrate?.(12)
		onLongPress?.(press.target)
	}

	// A press starts: a long press unless it moves or ends first
	function down(target, event) {
		swallowed = null
		if (event && event.button !== undefined && event.button !== 0) return
		clearTimer()
		press = { target, x: event?.clientX ?? 0, y: event?.clientY ?? 0, moved: false, fired: false, timer: null }
		press.timer = setTimeout(fire, delay)
	}

	// A press that moves past the slop is a scroll: no long press, no tap
	function move(event) {
		if (!press || press.moved || press.fired) return
		const distance = Math.hypot((event?.clientX ?? press.x) - press.x, (event?.clientY ?? press.y) - press.y)
		if (distance > slop) scrolled()
	}

	function scrolled() {
		press.moved = true
		clearTimer()
		swallowNextClick(press.target)
	}

	// The finger lifts: the click that follows decides (a tap, unless swallowed)
	function up() {
		clearTimer()
		press = null
	}

	// The browser took the gesture (a scroll), or the pointer left the button while pressed (a mouse)
	function cancel() {
		if (press && !press.fired) scrolled()
		clearTimer()
		press = null
	}

	function leave() {
		if (press) cancel()
	}

	// The tap: a click that no long press nor scroll swallowed. A keyboard's click (detail 0) is always a tap: no finger
	// made it
	function click(target, event) {
		const eaten = swallowed !== null && swallowed === target && (event?.detail ?? 1) !== 0
		swallowed = null
		if (eaten) {
			event?.preventDefault?.()
			return
		}
		onTap?.(target)
	}

	// A right click or the menu key opens the options; the menu a long touch raises (Android) is the long press itself
	function contextmenu(target, event) {
		event?.preventDefault?.()
		if (press && press.target === target) {
			fire()
			return
		}
		if (swallowed === target) return
		onLongPress?.(target)
	}

	function dispose() {
		clearTimer()
		press = null
		swallowed = null
	}

	if (getCurrentInstance()) onUnmounted(dispose)

	return { down, move, up, cancel, leave, click, contextmenu, dispose }
}
