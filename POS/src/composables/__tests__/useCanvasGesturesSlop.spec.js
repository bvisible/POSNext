/**
 * //// Neoffice — added file (no upstream equivalent). The pan of the floor plan begins past the few pixels a finger
 * //// shakes (NeoResto lot 1, task 26, fix round 1): a table opens when the finger lifts, and the pointer of that tap
 * //// goes on to the plan's gestures. A tap that shook 4 px moved the plan by 4 px and saved it: ten taps left (9, 9) in
 * //// the room's stored view. Now a pointer that moves less than the slop pans nothing and saves nothing; past it the
 * //// plan follows the pointer and the view is saved once, when the pointer lifts.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h, ref } from "vue"

const { useCanvasGestures } = await import("../useCanvasGestures.js")
const { SLOP_PX } = await import("@/utils/pointerSlop")

let wrapper
let gestures
let saved
let zoomed
let container

function mountPlan() {
	saved = vi.fn()
	zoomed = vi.fn()
	const Probe = defineComponent({
		setup() {
			const containerRef = ref(null)
			gestures = useCanvasGestures({
				containerRef,
				onViewChange: saved,
				onZoomChange: zoomed,
			})
			return () => h("div", { ref: containerRef, "data-test": "plan" })
		},
	})
	wrapper = mount(Probe, { attachTo: document.body })
	container = wrapper.find('[data-test="plan"]').element
}

function pointer(type, x, y, id = 1) {
	const event = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: x,
		clientY: y,
	})
	Object.defineProperty(event, "pointerId", { value: id })
	container.dispatchEvent(event)
}

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
})

describe("the pan of the floor plan", () => {
	it("is a slop of 8 px, the press's own", () => {
		expect(SLOP_PX).toBe(8)
	})

	it("moves nothing, and saves nothing, for a pointer that shakes less than the slop", () => {
		mountPlan()

		pointer("pointerdown", 100, 100)
		pointer("pointermove", 104, 103)
		pointer("pointermove", 105, 105)
		pointer("pointerup", 105, 105)

		expect([gestures.panX.value, gestures.panY.value]).toEqual([0, 0])
		expect(saved).not.toHaveBeenCalled()
		expect(zoomed).not.toHaveBeenCalled()
	})

	it("follows the pointer past the slop, and saves the view once, when it lifts", () => {
		mountPlan()

		pointer("pointerdown", 100, 100)
		pointer("pointermove", 112, 100)
		expect([gestures.panX.value, gestures.panY.value]).toEqual([12, 0])
		pointer("pointermove", 130, 120)
		expect(saved).not.toHaveBeenCalled()
		pointer("pointerup", 130, 120)

		expect([gestures.panX.value, gestures.panY.value]).toEqual([30, 20])
		expect(saved).toHaveBeenCalledTimes(1)
		expect(saved).toHaveBeenCalledWith(30, 20, 1)
	})

	it("starts each pan from rest: a tap after a pan saves nothing again", () => {
		mountPlan()
		pointer("pointerdown", 100, 100)
		pointer("pointermove", 140, 100)
		pointer("pointerup", 140, 100)
		expect(saved).toHaveBeenCalledTimes(1)

		pointer("pointerdown", 200, 200)
		pointer("pointermove", 203, 201)
		pointer("pointerup", 203, 201)

		expect(saved).toHaveBeenCalledTimes(1)
		expect([gestures.panX.value, gestures.panY.value]).toEqual([40, 0])
	})
})
