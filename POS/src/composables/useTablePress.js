//// Neoffice — added file (no upstream equivalent). A finger on a table of the floor plan (NeoResto lot 1, task 26). The
//// plan opened a table as soon as the pointer went down; a long press on a table now shows the table's QR code at once
//// (product owner, 31.10.2026: « on phones the table's QR code must be easy to reach »), so a tap opens
//// the table when the finger lifts, and the two are told apart by how long the finger stays. A press that moves is the
//// start of a pan of the plan, and a second finger the start of a pinch: neither is a tap nor a long press. The editor
//// does not come here: there a press drags the table, as before. The long press is a finger's or a pen's, never a
//// mouse's (fix round 1): a mouse held on a table opens it when the button is released, as a click, and a click that
//// slips is still a click, since the plan does not pan from a table under a mouse (FloorPlanEditor stops its pointer).
import { onUnmounted } from "vue"
import { SLOP_PX } from "@/utils/pointerSlop"

// How long a finger stays on a table for its QR code, and how far it may shake meanwhile: past the slop, the plan's own
// pan begins (useCanvasGestures, the same slop)
export const LONG_PRESS_MS = 500
export const MOVE_TOLERANCE_PX = SLOP_PX

/** A finger or a pen, which press and pan; a mouse (and a pointer that says nothing of its type) clicks */
export function isFinger(event) {
	return event?.pointerType === "touch" || event?.pointerType === "pen"
}
// The click a browser makes of a long press, once the finger is up, comes right after it; past this, none is coming
const CLICK_AFTER_MS = 400

/**
 * @param {object} actions
 * @param {(table: object) => void} actions.onTap - the finger lifted soon enough: open the table
 * @param {(table: object) => void} actions.onLongPress - the finger stayed: show the table's QR code
 * @param {(table: object) => boolean} [actions.canLongPress] - whether this table may have a QR code (else a press,
 *   however long, is a tap)
 */
export function useTablePress({
	onTap,
	onLongPress,
	canLongPress = () => false,
}) {
	let press = null
	let letTheClickGo = null

	function down(event, table) {
		// The main button of a mouse; a finger and a pen have no other
		if (event.button > 0) return
		if (press && press.pointerId !== event.pointerId) {
			// A second finger on another table: two fingers pinch the plan, they press no table
			cancel()
			return
		}
		cancel()
		press = {
			pointerId: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			table,
			finger: isFinger(event),
			fired: false,
			timer: null,
		}
		// A mouse never long-presses: held as long as it may be, it opens the table when its button is released
		if (press.finger && canLongPress(table)) {
			const pressed = press
			pressed.timer = setTimeout(() => {
				pressed.timer = null
				pressed.fired = true
				onLongPress(pressed.table)
			}, LONG_PRESS_MS)
		}
	}

	function move(event) {
		// A mouse's click that slips is still a click: the plan does not pan from a table under a mouse
		if (!isThePress(event) || !press.finger) return
		const moved = Math.hypot(
			(event.clientX ?? press.x) - press.x,
			(event.clientY ?? press.y) - press.y,
		)
		// Further than a finger shakes: the plan is being panned
		if (moved > MOVE_TOLERANCE_PX) cancel()
	}

	function up(event) {
		if (!isThePress(event)) return
		const ended = press
		cancel()
		if (ended.fired) swallowTheClick()
		else onTap(ended.table)
	}

	// A pointer that went down elsewhere on the plan while a table is pressed: a second finger, a pinch
	function otherPointer(event) {
		if (press && press.pointerId !== event.pointerId) cancel()
	}

	function cancel() {
		if (press?.timer) clearTimeout(press.timer)
		press = null
	}

	function isThePress(event) {
		return Boolean(press) && press.pointerId === event.pointerId
	}

	// The QR code opens under the finger: the click the browser makes of the press, once the finger is up, must not
	// reach what is now under it (the dialog's backdrop closes the dialog). That click, and no other, is stopped.
	function swallowTheClick() {
		letTheClickGo?.()
		const stop = (event) => {
			event.stopPropagation()
			event.preventDefault()
			end()
		}
		const timer = setTimeout(() => end(), CLICK_AFTER_MS)
		function end() {
			clearTimeout(timer)
			document.removeEventListener("click", stop, true)
			letTheClickGo = null
		}
		document.addEventListener("click", stop, true)
		letTheClickGo = end
	}

	onUnmounted(() => {
		cancel()
		letTheClickGo?.()
	})

	return { down, move, up, cancel, otherPointer }
}
