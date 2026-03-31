/**
 * Composable for drag-and-drop and resize in the floor plan editor.
 * Uses native Pointer Events API for unified mouse/touch support.
 */
export function useDraggable(options = {}) {
	const { onDragEnd, onResizeEnd, canvasRef, zoomLevel } = options

	let dragState = null
	let resizeState = null

	function getCanvasBounds() {
		if (!canvasRef?.value) return { width: 800, height: 600 }
		const rect = canvasRef.value.getBoundingClientRect()
		return { width: rect.width, height: rect.height }
	}

	// Constrain position within canvas bounds
	function constrain(x, y, w, h) {
		const bounds = getCanvasBounds()
		return {
			x: Math.max(0, Math.min(x, bounds.width - w)),
			y: Math.max(0, Math.min(y, bounds.height - h)),
		}
	}

	// === DRAG ===

	function handleDragStart(event, table) {
		if (event.isPrimary === false) return
		if (
			event.button !== undefined &&
			event.button !== 0 &&
			event.pointerType !== "touch"
		)
			return

		dragState = {
			pointerId: event.pointerId,
			table,
			startX: event.clientX,
			startY: event.clientY,
			startPosX: table.pos_x || 0,
			startPosY: table.pos_y || 0,
		}

		document.addEventListener("pointermove", handleDragMove)
		document.addEventListener("pointerup", handleDragEnd)
		document.addEventListener("pointercancel", handleDragEnd)

		event.currentTarget?.setPointerCapture?.(event.pointerId)
		document.body.style.cursor = "grabbing"
		document.body.style.userSelect = "none"

		event.preventDefault()
		event.stopPropagation()
	}

	function handleDragMove(event) {
		if (!dragState || event.pointerId !== dragState.pointerId) return

		const scale = zoomLevel?.value || 1
		const deltaX = (event.clientX - dragState.startX) / scale
		const deltaY = (event.clientY - dragState.startY) / scale

		const w = dragState.table.width || 100
		const h = dragState.table.height || 100

		const { x, y } = constrain(
			dragState.startPosX + deltaX,
			dragState.startPosY + deltaY,
			w,
			h,
		)

		dragState.table.pos_x = Math.round(x)
		dragState.table.pos_y = Math.round(y)
	}

	function handleDragEnd(event) {
		if (!dragState) return

		const table = dragState.table

		document.removeEventListener("pointermove", handleDragMove)
		document.removeEventListener("pointerup", handleDragEnd)
		document.removeEventListener("pointercancel", handleDragEnd)

		document.body.style.cursor = ""
		document.body.style.userSelect = ""

		if (onDragEnd) onDragEnd(table)
		dragState = null
	}

	// === RESIZE ===

	function handleResizeStart(event, table, handle) {
		if (event.isPrimary === false) return
		if (
			event.button !== undefined &&
			event.button !== 0 &&
			event.pointerType !== "touch"
		)
			return

		resizeState = {
			pointerId: event.pointerId,
			table,
			handle, // 'se', 'sw', 'ne', 'nw'
			startX: event.clientX,
			startY: event.clientY,
			startW: table.width || 100,
			startH: table.height || 100,
			startPosX: table.pos_x || 0,
			startPosY: table.pos_y || 0,
		}

		document.addEventListener("pointermove", handleResizeMove)
		document.addEventListener("pointerup", handleResizeEnd)
		document.addEventListener("pointercancel", handleResizeEnd)

		document.body.style.cursor =
			handle === "se" || handle === "nw" ? "nwse-resize" : "nesw-resize"
		document.body.style.userSelect = "none"

		event.preventDefault()
		event.stopPropagation()
	}

	function handleResizeMove(event) {
		if (!resizeState || event.pointerId !== resizeState.pointerId) return

		const scale = zoomLevel?.value || 1
		const deltaX = (event.clientX - resizeState.startX) / scale
		const deltaY = (event.clientY - resizeState.startY) / scale
		const MIN_SIZE = 60

		let newW = resizeState.startW
		let newH = resizeState.startH
		let newX = resizeState.startPosX
		let newY = resizeState.startPosY

		if (resizeState.handle.includes("e")) {
			newW = Math.max(MIN_SIZE, resizeState.startW + deltaX)
		}
		if (resizeState.handle.includes("w")) {
			const dw = Math.min(deltaX, resizeState.startW - MIN_SIZE)
			newW = resizeState.startW - dw
			newX = resizeState.startPosX + dw
		}
		if (resizeState.handle.includes("s")) {
			newH = Math.max(MIN_SIZE, resizeState.startH + deltaY)
		}
		if (resizeState.handle.includes("n")) {
			const dh = Math.min(deltaY, resizeState.startH - MIN_SIZE)
			newH = resizeState.startH - dh
			newY = resizeState.startPosY + dh
		}

		// Constrain to canvas
		const bounds = getCanvasBounds()
		newW = Math.min(newW, bounds.width - newX)
		newH = Math.min(newH, bounds.height - newY)
		newX = Math.max(0, newX)
		newY = Math.max(0, newY)

		resizeState.table.width = Math.round(newW)
		resizeState.table.height = Math.round(newH)
		resizeState.table.pos_x = Math.round(newX)
		resizeState.table.pos_y = Math.round(newY)
	}

	function handleResizeEnd(event) {
		if (!resizeState) return

		const table = resizeState.table

		document.removeEventListener("pointermove", handleResizeMove)
		document.removeEventListener("pointerup", handleResizeEnd)
		document.removeEventListener("pointercancel", handleResizeEnd)

		document.body.style.cursor = ""
		document.body.style.userSelect = ""

		if (onResizeEnd) onResizeEnd(table)
		resizeState = null
	}

	// Cleanup
	function destroy() {
		document.removeEventListener("pointermove", handleDragMove)
		document.removeEventListener("pointerup", handleDragEnd)
		document.removeEventListener("pointercancel", handleDragEnd)
		document.removeEventListener("pointermove", handleResizeMove)
		document.removeEventListener("pointerup", handleResizeEnd)
		document.removeEventListener("pointercancel", handleResizeEnd)
		dragState = null
		resizeState = null
	}

	return {
		handleDragStart,
		handleResizeStart,
		destroy,
	}
}
