/**
 * //// Neoffice — added file (no upstream equivalent). A finger on a table of the floor plan (NeoRestau lot 1, task 26):
 * //// a tap opens the table when the finger lifts, a long press shows the table's QR code at once (where the table may
 * //// have one), and a press that moves is a pan of the plan: neither a tap nor a long press. A second finger makes
 * //// a pinch, which presses no table either. The long press is a finger's or a pen's, never a mouse's: a mouse held on a
 * //// table opens it when the button is released, and a click that slips a little is still a click (fix round 1).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h } from "vue"

const { useTablePress, isFinger, LONG_PRESS_MS, MOVE_TOLERANCE_PX } =
	await import("../useTablePress.js")

const TABLE = { name: "t1", table_name: "Table 1", status: "Occupied" }

// A finger by default: the long press is a finger's (and a pen's)
function pointer(
	type,
	{ x = 100, y = 100, id = 1, button = 0, pointerType = "touch" } = {},
) {
	return { type, clientX: x, clientY: y, pointerId: id, button, pointerType }
}

describe("a press on a table of the plan", () => {
	let press
	let onTap
	let onLongPress
	let wrapper

	function setUp(canLongPress = () => true) {
		onTap = vi.fn()
		onLongPress = vi.fn()
		const Probe = defineComponent({
			setup() {
				press = useTablePress({ onTap, onLongPress, canLongPress })
				return () => h("div")
			},
		})
		wrapper = mount(Probe, { attachTo: document.body })
	}

	beforeEach(() => vi.useFakeTimers())
	afterEach(() => {
		wrapper?.unmount()
		vi.useRealTimers()
	})

	it("opens the table when the finger lifts after a short press", () => {
		setUp()
		press.down(pointer("pointerdown"), TABLE)
		expect(onTap).not.toHaveBeenCalled()

		vi.advanceTimersByTime(LONG_PRESS_MS - 100)
		press.up(pointer("pointerup"))

		expect(onTap).toHaveBeenCalledWith(TABLE)
		expect(onLongPress).not.toHaveBeenCalled()
	})

	it("shows the QR code after a long press, at once, and opens nothing when the finger lifts", () => {
		setUp()
		press.down(pointer("pointerdown"), TABLE)

		vi.advanceTimersByTime(LONG_PRESS_MS)
		expect(onLongPress).toHaveBeenCalledWith(TABLE)

		press.up(pointer("pointerup"))
		expect(onTap).not.toHaveBeenCalled()
	})

	it("is a pan when it moves: neither the table nor its QR code", () => {
		setUp()
		press.down(pointer("pointerdown"), TABLE)
		press.move(pointer("pointermove", { x: 100 + MOVE_TOLERANCE_PX + 1 }))

		vi.advanceTimersByTime(LONG_PRESS_MS * 2)
		press.up(pointer("pointerup", { x: 100 + MOVE_TOLERANCE_PX + 1 }))

		expect(onLongPress).not.toHaveBeenCalled()
		expect(onTap).not.toHaveBeenCalled()
	})

	it("forgives the few pixels a finger shakes", () => {
		setUp()
		press.down(pointer("pointerdown"), TABLE)
		press.move(pointer("pointermove", { x: 104, y: 97 }))

		vi.advanceTimersByTime(LONG_PRESS_MS)

		expect(onLongPress).toHaveBeenCalledTimes(1)
	})

	it("is a pinch when a second finger comes down: no table, no QR code", () => {
		setUp()
		press.down(pointer("pointerdown", { id: 1 }), TABLE)
		press.otherPointer(pointer("pointerdown", { id: 2 }))

		vi.advanceTimersByTime(LONG_PRESS_MS)
		press.up(pointer("pointerup", { id: 1 }))

		expect(onLongPress).not.toHaveBeenCalled()
		expect(onTap).not.toHaveBeenCalled()
	})

	it("is a pinch too when the second finger lands on another table", () => {
		setUp()
		press.down(pointer("pointerdown", { id: 1 }), TABLE)
		press.down(pointer("pointerdown", { id: 2 }), { ...TABLE, name: "t2" })

		vi.advanceTimersByTime(LONG_PRESS_MS)
		press.up(pointer("pointerup", { id: 2 }))
		press.up(pointer("pointerup", { id: 1 }))

		expect(onLongPress).not.toHaveBeenCalled()
		expect(onTap).not.toHaveBeenCalled()
	})

	it("hears only the pointer that pressed", () => {
		setUp()
		press.down(pointer("pointerdown", { id: 1 }), TABLE)
		press.move(pointer("pointermove", { id: 3, x: 400 }))
		press.up(pointer("pointerup", { id: 3 }))

		expect(onTap).not.toHaveBeenCalled()
		press.up(pointer("pointerup", { id: 1 }))
		expect(onTap).toHaveBeenCalledTimes(1)
	})

	it("is cancelled when the pointer leaves the table or the browser takes it", () => {
		setUp()
		press.down(pointer("pointerdown"), TABLE)
		press.cancel()
		vi.advanceTimersByTime(LONG_PRESS_MS)
		press.up(pointer("pointerup"))

		expect(onLongPress).not.toHaveBeenCalled()
		expect(onTap).not.toHaveBeenCalled()
	})

	it("is only a tap on a table that may have no QR code, however long", () => {
		setUp(() => false)
		press.down(pointer("pointerdown"), TABLE)

		vi.advanceTimersByTime(LONG_PRESS_MS * 3)
		press.up(pointer("pointerup"))

		expect(onLongPress).not.toHaveBeenCalled()
		expect(onTap).toHaveBeenCalledWith(TABLE)
	})

	it("asks whether the table may have a QR code when it is pressed", () => {
		const canLongPress = vi.fn(() => true)
		setUp(canLongPress)

		press.down(pointer("pointerdown"), TABLE)

		expect(canLongPress).toHaveBeenCalledWith(TABLE)
	})

	it("takes no other mouse button than the main one", () => {
		setUp()
		press.down(pointer("pointerdown", { button: 2 }), TABLE)
		vi.advanceTimersByTime(LONG_PRESS_MS)
		press.up(pointer("pointerup", { button: 2 }))

		expect(onLongPress).not.toHaveBeenCalled()
		expect(onTap).not.toHaveBeenCalled()
	})

	it("swallows the click a long press leaves behind, and that click only", () => {
		setUp()
		const heard = vi.fn()
		document.body.addEventListener("click", heard)
		press.down(pointer("pointerdown"), TABLE)
		vi.advanceTimersByTime(LONG_PRESS_MS)
		press.up(pointer("pointerup"))

		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
		expect(heard).not.toHaveBeenCalled()

		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
		expect(heard).toHaveBeenCalledTimes(1)
		document.body.removeEventListener("click", heard)
	})

	it("swallows nothing when that click never comes", () => {
		setUp()
		const heard = vi.fn()
		document.body.addEventListener("click", heard)
		press.down(pointer("pointerdown"), TABLE)
		vi.advanceTimersByTime(LONG_PRESS_MS)
		press.up(pointer("pointerup"))

		vi.advanceTimersByTime(1000)
		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))

		expect(heard).toHaveBeenCalledTimes(1)
		document.body.removeEventListener("click", heard)
	})

	it("leaves no long press behind once the plan is gone", () => {
		setUp()
		press.down(pointer("pointerdown"), TABLE)

		wrapper.unmount()
		wrapper = null
		vi.advanceTimersByTime(LONG_PRESS_MS)

		expect(onLongPress).not.toHaveBeenCalled()
	})

	it("reads a mouse event as a click: a mouse has no pointer id", () => {
		setUp()
		press.down({ clientX: 10, clientY: 10, button: 0 }, TABLE)
		press.up({ clientX: 10, clientY: 10, button: 0 })

		expect(onTap).toHaveBeenCalledWith(TABLE)
	})

	it("forgives a finger 8 px and no more: past them the plan is panned", () => {
		expect(MOVE_TOLERANCE_PX).toBe(8)
		setUp()
		press.down(pointer("pointerdown"), TABLE)
		press.move(pointer("pointermove", { x: 108 }))
		vi.advanceTimersByTime(LONG_PRESS_MS)
		expect(onLongPress).toHaveBeenCalledTimes(1)
		press.up(pointer("pointerup", { x: 108 }))

		press.down(pointer("pointerdown"), TABLE)
		press.move(pointer("pointermove", { x: 109 }))
		vi.advanceTimersByTime(LONG_PRESS_MS)
		press.up(pointer("pointerup", { x: 109 }))
		expect(onLongPress).toHaveBeenCalledTimes(1)
		expect(onTap).not.toHaveBeenCalled()
	})

	it("long-presses with a pen as with a finger", () => {
		setUp()
		press.down(pointer("pointerdown", { pointerType: "pen" }), TABLE)
		vi.advanceTimersByTime(LONG_PRESS_MS)

		expect(onLongPress).toHaveBeenCalledWith(TABLE)
	})
})

describe("a mouse on a table of the plan", () => {
	let press
	let onTap
	let onLongPress
	let wrapper
	const mouse = (type, init = {}) =>
		pointer(type, { pointerType: "mouse", id: 1, ...init })

	beforeEach(() => {
		vi.useFakeTimers()
		onTap = vi.fn()
		onLongPress = vi.fn()
		const Probe = defineComponent({
			setup() {
				press = useTablePress({ onTap, onLongPress, canLongPress: () => true })
				return () => h("div")
			},
		})
		wrapper = mount(Probe, { attachTo: document.body })
	})
	afterEach(() => {
		wrapper.unmount()
		vi.useRealTimers()
	})

	it("never shows the QR code, however long the button is held: it opens the table when released", () => {
		press.down(mouse("pointerdown"), TABLE)
		vi.advanceTimersByTime(LONG_PRESS_MS * 3)
		expect(onLongPress).not.toHaveBeenCalled()

		press.up(mouse("pointerup"))

		expect(onTap).toHaveBeenCalledWith(TABLE)
	})

	it("opens the table on a click that slips: under a mouse the plan does not pan from a table", () => {
		press.down(mouse("pointerdown"), TABLE)
		press.move(mouse("pointermove", { x: 112 }))
		press.up(mouse("pointerup", { x: 112 }))

		expect(onTap).toHaveBeenCalledWith(TABLE)
	})

	it("tells a finger and a pen from a mouse, and a pointer of no type is a mouse", () => {
		expect(
			["touch", "pen", "mouse", undefined].map((pointerType) =>
				isFinger({ pointerType }),
			),
		).toEqual([true, true, false, false])
	})
})
