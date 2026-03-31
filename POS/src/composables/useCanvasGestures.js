/**
 * Composable for pinch-to-zoom, pan/drag, and wheel zoom on a canvas container.
 * Uses native Pointer Events — zero dependencies.
 *
 * Transform model: translate(panX, panY) scale(zoomLevel)  with origin 0 0
 */
import { ref, computed, onMounted, onUnmounted, toValue } from "vue"

export function useCanvasGestures(options = {}) {
	const {
		containerRef,
		initialZoom = 1,
		zoomMin = 0.4,
		zoomMax = 2,
		zoomStep = 0.15,
		isEditMode = ref(false),
		onZoomChange = null,
		onViewChange = null,
	} = options

	const zoomLevel = ref(Math.max(zoomMin, Math.min(zoomMax, initialZoom)))
	const panX = ref(0)
	const panY = ref(0)
	const isAnimating = ref(false)

	// Active pointers map
	const pointers = new Map()

	// Gesture state: 'idle' | 'panning' | 'pinching'
	let gesture = "idle"
	let panStart = null
	let pinchStart = null
	let animTimeout = null

	// ── Helpers ────────────────────────────────────────────────

	function clamp(v, min, max) {
		return Math.min(max, Math.max(min, v))
	}

	function getDistance(p1, p2) {
		const dx = p1.x - p2.x
		const dy = p1.y - p2.y
		return Math.sqrt(dx * dx + dy * dy)
	}

	function getMidpoint(p1, p2) {
		return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
	}

	function getContainerOffset(clientX, clientY) {
		const rect = containerRef.value?.getBoundingClientRect()
		if (!rect) return { x: clientX, y: clientY }
		return { x: clientX - rect.left, y: clientY - rect.top }
	}

	function getTwoPointers() {
		const entries = Array.from(pointers.values())
		if (entries.length < 2) return null
		return [entries[0], entries[1]]
	}

	// ── Focal-point zoom ──────────────────────────────────────

	function applyZoomAtFocal(newZoom, focalX, focalY) {
		const oldZoom = zoomLevel.value
		const clamped = clamp(newZoom, zoomMin, zoomMax)
		if (clamped === oldZoom) return

		panX.value = focalX - (focalX - panX.value) * (clamped / oldZoom)
		panY.value = focalY - (focalY - panY.value) * (clamped / oldZoom)
		zoomLevel.value = clamped

		onZoomChange?.(clamped)
	}

	// ── Pointer handlers ──────────────────────────────────────

	function onPointerDown(event) {
		// Ignore if the target is inside the zoom-controls area
		if (event.target.closest("[data-gesture-ignore]")) return

		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

		if (pointers.size === 2) {
			// Transition to pinching
			gesture = "pinching"
			const [p1, p2] = getTwoPointers()
			const containerMid = getContainerOffset(
				...Object.values(getMidpoint(p1, p2)),
			)
			pinchStart = {
				distance: getDistance(p1, p2),
				midpoint: getMidpoint(p1, p2),
				containerMid,
				zoom: zoomLevel.value,
				panX: panX.value,
				panY: panY.value,
			}
			// Cancel any active single-finger pan
			panStart = null
			event.preventDefault()
		} else if (pointers.size === 1) {
			// Single finger: pan only if NOT in edit mode (edit mode uses single finger for table drag)
			if (!toValue(isEditMode)) {
				gesture = "panning"
				panStart = {
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					panX: panX.value,
					panY: panY.value,
				}
			}
		}
	}

	function onPointerMove(event) {
		if (!pointers.has(event.pointerId)) return
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

		if (gesture === "pinching" && pointers.size >= 2) {
			event.preventDefault()
			const [p1, p2] = getTwoPointers()
			const newDist = getDistance(p1, p2)
			const newMid = getMidpoint(p1, p2)

			// Zoom centered on pinch midpoint
			const newZoom = clamp(
				pinchStart.zoom * (newDist / pinchStart.distance),
				zoomMin,
				zoomMax,
			)

			// Focal point in container coords
			const containerMid = getContainerOffset(newMid.x, newMid.y)

			// Pan adjustment for zoom focal point
			const zoomRatio = newZoom / pinchStart.zoom
			let newPanX =
				containerMid.x -
				(pinchStart.containerMid.x - pinchStart.panX) * zoomRatio
			let newPanY =
				containerMid.y -
				(pinchStart.containerMid.y - pinchStart.panY) * zoomRatio

			// Also account for midpoint movement (two-finger pan)
			const midDeltaX = newMid.x - pinchStart.midpoint.x
			const midDeltaY = newMid.y - pinchStart.midpoint.y
			newPanX += midDeltaX - (containerMid.x - pinchStart.containerMid.x)
			newPanY += midDeltaY - (containerMid.y - pinchStart.containerMid.y)

			zoomLevel.value = newZoom
			panX.value = newPanX
			panY.value = newPanY
		} else if (
			gesture === "panning" &&
			panStart &&
			event.pointerId === panStart.pointerId
		) {
			panX.value = panStart.panX + (event.clientX - panStart.startX)
			panY.value = panStart.panY + (event.clientY - panStart.startY)
		}
	}

	function onPointerUp(event) {
		pointers.delete(event.pointerId)

		if (pointers.size < 2 && gesture === "pinching") {
			// End pinch, persist zoom + pan
			onZoomChange?.(zoomLevel.value)
			onViewChange?.(panX.value, panY.value, zoomLevel.value)
			pinchStart = null

			if (pointers.size === 1 && !toValue(isEditMode)) {
				// One finger left — start panning from current state
				const remaining = Array.from(pointers.entries())[0]
				gesture = "panning"
				panStart = {
					pointerId: remaining[0],
					startX: remaining[1].x,
					startY: remaining[1].y,
					panX: panX.value,
					panY: panY.value,
				}
			} else {
				gesture = "idle"
			}
		} else if (pointers.size === 0) {
			if (gesture === "panning") {
				onZoomChange?.(zoomLevel.value)
				onViewChange?.(panX.value, panY.value, zoomLevel.value)
			}
			gesture = "idle"
			panStart = null
			pinchStart = null
		}
	}

	// ── Wheel zoom ────────────────────────────────────────────

	function onWheel(event) {
		event.preventDefault()
		const focal = getContainerOffset(event.clientX, event.clientY)
		const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08
		applyZoomAtFocal(zoomLevel.value * factor, focal.x, focal.y)
		onViewChange?.(panX.value, panY.value, zoomLevel.value)
	}

	// ── Programmatic zoom (buttons) ───────────────────────────

	function animateTransition() {
		isAnimating.value = true
		clearTimeout(animTimeout)
		animTimeout = setTimeout(() => {
			isAnimating.value = false
		}, 250)
	}

	function getViewportCenter() {
		const rect = containerRef.value?.getBoundingClientRect()
		if (!rect) return { x: 0, y: 0 }
		return { x: rect.width / 2, y: rect.height / 2 }
	}

	function zoomIn() {
		animateTransition()
		const center = getViewportCenter()
		applyZoomAtFocal(
			+(zoomLevel.value + zoomStep).toFixed(2),
			center.x,
			center.y,
		)
	}

	function zoomOut() {
		animateTransition()
		const center = getViewportCenter()
		applyZoomAtFocal(
			+(zoomLevel.value - zoomStep).toFixed(2),
			center.x,
			center.y,
		)
	}

	function zoomReset() {
		animateTransition()
		zoomLevel.value = 1
		panX.value = 0
		panY.value = 0
		onZoomChange?.(1)
	}

	function resetPan() {
		panX.value = 0
		panY.value = 0
	}

	// ── Computed style ────────────────────────────────────────

	const transformStyle = computed(() => ({
		transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoomLevel.value})`,
		transformOrigin: "0 0",
		willChange: "transform",
		transition: isAnimating.value ? "transform 0.25s ease-out" : "none",
	}))

	// ── Lifecycle ─────────────────────────────────────────────

	function setup() {
		const el = containerRef.value
		if (!el) return

		el.addEventListener("pointerdown", onPointerDown, { passive: false })
		el.addEventListener("pointermove", onPointerMove, { passive: false })
		el.addEventListener("pointerup", onPointerUp)
		el.addEventListener("pointercancel", onPointerUp)
		el.addEventListener("wheel", onWheel, { passive: false })
	}

	function cleanup() {
		clearTimeout(animTimeout)
		const el = containerRef.value
		if (!el) return

		el.removeEventListener("pointerdown", onPointerDown)
		el.removeEventListener("pointermove", onPointerMove)
		el.removeEventListener("pointerup", onPointerUp)
		el.removeEventListener("pointercancel", onPointerUp)
		el.removeEventListener("wheel", onWheel)
		pointers.clear()
		gesture = "idle"
		panStart = null
		pinchStart = null
	}

	onMounted(setup)
	onUnmounted(cleanup)

	return {
		zoomLevel,
		panX,
		panY,
		transformStyle,
		zoomIn,
		zoomOut,
		zoomReset,
		resetPan,
		cleanup,
	}
}
