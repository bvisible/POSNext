//// Neoffice — onMounted imported for the document-level scanner listener added below
//// (7fe0b7d1, 2026-07-09 "capture hardware scanner globally in scanner mode").
import { ref, watch, nextTick, onMounted, onUnmounted } from "vue"
import { QueuedMutex } from "@/utils/mutex"

/**
 * Composable for search input, barcode scanning, and auto-add logic.
 *
 * Owns all search-input state, timers, and event handlers with proper
 * concurrency control.  Extracted from ItemsSelector.vue.
 *
 * Concurrency model:
 *   - On Enter (or auto-add timeout), the barcode is **snapshotted** from the
 *     DOM input immediately, then the input is cleared so the next scan starts
 *     into a clean field.
 *   - The snapshot is pushed into a {@link QueuedMutex}-backed queue
 *     (`processBarcodeScan`), which processes barcode lookups sequentially.
 *   - This guarantees no barcode is ever lost, even when scanning different
 *     items faster than the API can respond (~50 ms between scans).
 *
 * @param {Object} options
 * @param {Object} options.itemStore          - Pinia item-search store
 * @param {(item: Object, autoAdd: boolean) => boolean} options.onItemFound
 *        Component's selectItem(). Returns true if item was accepted.
 * @param {Object} options.showWarning        - useToast().showWarning
 * @param {import('vue').Ref<boolean>} options.isAnyDialogOpen
 */
//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
export function useSearchInput({
	itemStore,
	onItemFound,
	showWarning,
	isAnyDialogOpen,
}) {
	// --- Reactive state (exposed) ---
	const searchInputRef = ref(null)
	const scannerEnabled = ref(false)
	const autoAddEnabled = ref(false)

	// --- Internal (non-reactive) ---
	let autoSearchTimer = null
	const barcodeQueue = new QueuedMutex({
		timeout: 10000,
		name: "BarcodeSearch",
	})

	//// global hardware-scanner capture: scan works anywhere, not just the focused bar
	// A hardware scanner types fast then sends Enter. When scanner mode is on we
	// capture those bursts at the document level so a scan lands in the cart even
	// after the cashier clicked elsewhere. Human typing is filtered out by the
	// inter-key gap; typing into a real field (or during a modal) is never hijacked.
	let scanBuffer = ""
	let lastScanKeyTime = 0
	const SCAN_RESET_MS = 60 // gap above which the buffer resets (scanner ≪ human)
	const SCAN_MIN_LENGTH = 3

	// ---- Timer helpers ----

	function clearAutoSearchTimer() {
		if (autoSearchTimer) {
			clearTimeout(autoSearchTimer)
			autoSearchTimer = null
		}
	}

	// ---- Focus ----

	function focusSearchInput() {
		nextTick(() => {
			if (searchInputRef.value) {
				searchInputRef.value.focus()
			}
		})
	}

	// ---- Clear ----

	/** Atomic clear: timer -> store -> DOM input.value -> refocus */
	function clearSearchAndResetInput() {
		clearAutoSearchTimer()
		itemStore.clearSearch()
		if (searchInputRef.value) {
			searchInputRef.value.value = ""
		}
		if (scannerEnabled.value || autoAddEnabled.value) {
			focusSearchInput()
		}
	}

	// ---- Event handlers ----

	function handleKeyDown(event) {
		if (event.key === "Enter") {
			event.preventDefault()
			clearAutoSearchTimer()

			// Snapshot the barcode NOW from the DOM input, before anything overwrites it
			//// Neoffice — Biome formatter pass shipped with the de-branding commit: line reflow,
			//// double quotes, trailing commas, Number.parseInt over the global. No behaviour
			//// change anywhere in this file — at the next upstream merge take upstream's version
			//// wholesale and re-run the formatter, do not hand-merge these hunks
			//// (458d81a9, 2026-03-20 "remove BrainWise branding, add restaurant mode, and code
			//// formatting").
			const barcode =
				searchInputRef.value?.value?.trim() || itemStore.searchTerm?.trim()
			if (barcode) {
				// Clear input immediately so next scan starts clean
				itemStore.clearSearch()
				if (searchInputRef.value) searchInputRef.value.value = ""

				// Queue the search with the captured barcode
				processBarcodeScan(barcode, autoAddEnabled.value)
			}
			return
		}
		// All other keys: no special handling needed.
		// Dead scanner-speed-detection code removed.
	}

	/**
	 * Handles the `input` event on the search <input>.
	 *
	 * Two independent timers exist by design:
	 *   1. itemStore.setSearchTerm() triggers the store's own debounce for
	 *      updating the displayed item grid.
	 *   2. autoSearchTimer (500 ms) triggers auto-add behaviour — completely
	 *      separate from display.
	 */
	function handleSearchInput(event) {
		const value = event.target.value

		// Guard: ignore stale empty events after search was already cleared
		if (!value && !itemStore.searchTerm) {
			return
		}

		itemStore.setSearchTerm(value)

		clearAutoSearchTimer()

		// Auto-add: after user stops typing for 500 ms, trigger barcode search
		if (autoAddEnabled.value && value.trim().length > 0) {
			autoSearchTimer = setTimeout(() => {
				//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
				const barcode =
					searchInputRef.value?.value?.trim() || itemStore.searchTerm?.trim()
				if (barcode) {
					itemStore.clearSearch()
					if (searchInputRef.value) searchInputRef.value.value = ""
					processBarcodeScan(barcode, true)
				}
			}, 500)
		}
	}

	/** Clicking the search input clears search + timer atomically. */
	function handleSearchClick() {
		clearSearchAndResetInput()
	}

	/**
	 * Queue a barcode scan for sequential processing.
	 *
	 * The barcode string is already captured (snapshotted) by the caller —
	 * it is never read from shared state here. The {@link QueuedMutex}
	 * ensures scans execute one at a time so every scan is resolved before
	 * the next begins, preventing double-adds and lost barcodes.
	 *
	 * Lookup: exact barcode match via `itemStore.searchByBarcode()`.
	 * If the barcode is not found, shows a "not found" warning.
	 *
	 * @param {string}  barcode      - Pre-captured barcode value
	 * @param {boolean} forceAutoAdd - When true, item is added without user click
	 */
	function processBarcodeScan(barcode, forceAutoAdd) {
		//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
		const shouldAutoAdd =
			forceAutoAdd || (scannerEnabled.value && autoAddEnabled.value)

		barcodeQueue.withLock(async () => {
			try {
				const item = await itemStore.searchByBarcode(barcode)
				if (item) {
					onItemFound(item, shouldAutoAdd)
					focusSearchInput()
					return
				}
			} catch (error) {
				console.error("Barcode API error:", error)
			}

			// Barcode not found — show clear "not found" message.
			// Note: we cannot fall back to filteredItems here because
			// clearSearch() was called before the API request, so
			// filteredItems would contain ALL cached items (not search results).
			//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
			showWarning(
				__("Item Not Found: No item found with barcode: {0}", [barcode]),
			)
			focusSearchInput()
		})
	}

	// ---- Toggles ----

	function toggleBarcodeScanner() {
		scannerEnabled.value = !scannerEnabled.value

		if (scannerEnabled.value) {
			autoAddEnabled.value = true
			focusSearchInput()
		} else {
			autoAddEnabled.value = false
		}
	}

	function toggleAutoAdd() {
		autoAddEnabled.value = !autoAddEnabled.value

		if (autoAddEnabled.value && !scannerEnabled.value) {
			scannerEnabled.value = true
		}

		if (!autoAddEnabled.value) {
			clearAutoSearchTimer()
		}

		if (autoAddEnabled.value) {
			focusSearchInput()
		}
	}

	//// Neoffice — upstream binds the barcode handler to the search input's keydown alone, so
	//// a hardware scanner did nothing unless the search bar happened to hold focus — and at
	//// a counter the cashier has just clicked something else. In scanner mode the burst is
	//// captured at document level and routed to the same lookup. Human typing is filtered by
	//// the inter-key gap (a scanner types far faster), and a focused editable field or an
	//// open modal is never hijacked (7fe0b7d1, 2026-07-09 "capture hardware scanner
	//// globally in scanner mode").
	// ---- Global hardware-scanner capture ----

	/** True when the event target is a field that owns its own text input. */
	function isEditableTarget(el) {
		if (!el) return false
		const tag = el.tagName
		return (
			tag === "INPUT" ||
			tag === "TEXTAREA" ||
			tag === "SELECT" ||
			el.isContentEditable === true
		)
	}

	/**
	 * Document-level keydown handler that turns a fast scanner burst into a
	 * barcode lookup regardless of what is focused. Only active in scanner mode.
	 *
	 * Skipped when a field is focused (the search bar has its own handler; other
	 * fields are human typing) or while a modal is open. The inter-key gap
	 * (SCAN_RESET_MS) discards slow human keystrokes so only real scans fire.
	 */
	function handleGlobalKeydown(event) {
		if (!scannerEnabled.value) return
		if (isAnyDialogOpen?.value) return
		// Editable fields (incl. the search input) handle their own keydown.
		if (isEditableTarget(event.target)) return

		const now = Date.now()
		if (now - lastScanKeyTime > SCAN_RESET_MS) scanBuffer = ""
		lastScanKeyTime = now

		if (event.key === "Enter") {
			const barcode = scanBuffer
			scanBuffer = ""
			if (barcode.length >= SCAN_MIN_LENGTH) {
				event.preventDefault()
				processBarcodeScan(barcode, autoAddEnabled.value)
			}
			return
		}

		// Accumulate single printable characters (ignore modifiers/navigation).
		if (
			event.key.length === 1 &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.altKey
		) {
			scanBuffer += event.key
		}
	}

	onMounted(() => {
		document.addEventListener("keydown", handleGlobalKeydown, true)
	})

	// ---- Dialog-close watcher ----
	// Refocuses the search bar when all dialogs close (scanner/auto-add modes)
	const stopDialogWatcher = watch(isAnyDialogOpen, (isOpen, wasOpen) => {
		if (wasOpen && !isOpen && (scannerEnabled.value || autoAddEnabled.value)) {
			focusSearchInput()
		}
	})

	// ---- Cleanup ----
	function cleanup() {
		clearAutoSearchTimer()
		stopDialogWatcher()
		//// Neoffice — the document-level listener is torn down with the composable: a leaked
		//// capture-phase keydown would keep swallowing keys for the rest of the session
		//// (7fe0b7d1, 2026-07-09).
		document.removeEventListener("keydown", handleGlobalKeydown, true)
	}

	onUnmounted(cleanup)

	return {
		// State
		searchInputRef,
		scannerEnabled,
		autoAddEnabled,

		// Event handlers
		handleSearchInput,
		handleKeyDown,
		handleSearchClick,

		// Toggles
		toggleBarcodeScanner,
		toggleAutoAdd,

		// Utilities
		focusSearchInput,
		clearSearchAndResetInput,
		cleanup,
	}
}
