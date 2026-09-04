import { useDialog, useDialogState } from "@/composables/useDialogState"
import { defineStore } from "pinia"
import { computed, ref } from "vue"

const LEFT_PANEL_MIN = 320
//// Neoffice — the right-hand cart panel's minimum width goes from upstream's 360px to 450px,
//// in step with the min-width: 450px the same commit sets on the cart column in POSSale.vue
//// (7e3f9458, 2026-03-31 "right panel minimum width 450px (was 360/300)"). TO REVIEW: the
//// commit records no rationale beyond the number itself.
//// right panel minimum width 450px (was 360/300) — 7e3f945
const RIGHT_PANEL_MIN = 450

export const usePOSUIStore = defineStore("posUI", () => {
	// Loading state
	const isLoading = ref(true)

	// Dialog states using the dialog composable
	const { isOpen: showPaymentDialog } = useDialog("payment")
	const { isOpen: showCustomerDialog } = useDialog("customer")
	const { isOpen: showSuccessDialog } = useDialog("success")
	const { isOpen: showOpenShiftDialog } = useDialog("openShift")
	const { isOpen: showCloseShiftDialog } = useDialog("closeShift")
	const { isOpen: showDraftDialog } = useDialog("draft")
	const { isOpen: showReturnDialog } = useDialog("return")
	const { isOpen: showCouponDialog } = useDialog("coupon")
	const { isOpen: showOffersDialog } = useDialog("offers")
	const { isOpen: showBatchSerialDialog } = useDialog("batchSerial")
	const { isOpen: showHistoryDialog } = useDialog("history")
	const { isOpen: showOfflineInvoicesDialog } = useDialog("offlineInvoices")
	const { isOpen: showCreateCustomerDialog } = useDialog("createCustomer")
	const { isOpen: showClearCartDialog } = useDialog("clearCart")
	const { isOpen: showLogoutDialog } = useDialog("logout")
	const { isOpen: showItemSelectionDialog } = useDialog("itemSelection")
	const { isOpen: showErrorDialog } = useDialog("invoiceError")
	//// Neoffice — dialog state with no upstream equivalent: a customer can create their own
	//// account on the customer-facing display, and the cashier's screen has to acknowledge it —
	//// upstream has no second screen at all (912ef092, 2026-02-04 "improve UX for customer
	//// creation flow").
	//// improve UX for customer creation flow — 912ef09
	const { isOpen: showCustomerCreatedDialog } = useDialog("customerCreated")

	// Global dialog state
	const { isAnyDialogOpen } = useDialogState()

	//// Neoffice — the customer-facing display can create a customer on its own screen, so the
	//// cashier's side needs somewhere to hold that record until it is acknowledged; upstream
	//// has no second screen at all (912ef092, 2026-02-04 "improve UX for customer creation
	//// flow").
	// Customer created from display dialog state
	const customerCreatedData = ref(null)

	// Error dialog state
	const errorDialogTitle = ref("")
	const errorDialogMessage = ref("")
	const errorDetails = ref("")
	const errorType = ref("error") // 'error', 'warning', 'validation'
	const errorRetryAction = ref(null)
	const errorRetryActionData = ref(null)

	// Success dialog state
	const lastInvoiceName = ref("")
	const lastInvoiceTotal = ref(0)
	const lastPaidAmount = ref(0)
	/** Full receipt payload for invoices not yet on the server (offline queue) */
	const lastOfflinePrintDoc = ref(null)

	// Customer dialog state
	const initialCustomerName = ref("")

	// Mobile responsiveness
	const mobileActiveTab = ref("items") // 'items' or 'cart'
	const windowWidth = ref(
		typeof window !== "undefined" ? window.innerWidth : 1024,
	)

	//// Neoffice — upstream hard-codes leftPanelWidth to 800px. The split is restored from
	//// localStorage instead, defaulting to 80% of the viewport, so it survives a reload and fits
	//// the terminal it runs on rather than a fixed pixel count (97d370df, 2026-03-31 "persist left
	//// panel width in localStorage, default 80/20 ratio").
	//// persist left panel width in localStorage, default 80/20 ratio — 97d370d
	// Layout state — restore from localStorage or default to 80% of viewport
	const savedPanelWidth = parseFloat(localStorage.getItem("pos_left_panel_width"))
	const defaultPanelWidth = savedPanelWidth && savedPanelWidth > LEFT_PANEL_MIN
		? savedPanelWidth
		: Math.round(window.innerWidth * 0.8)
	const leftPanelWidth = ref(defaultPanelWidth)
	const isResizing = ref(false)

	// Computed
	const isDesktop = computed(() => windowWidth.value >= 1024)

	// Actions
	function setLoading(loading) {
		isLoading.value = loading
	}

	function setWindowWidth(width) {
		windowWidth.value = width
	}

	function setMobileTab(tab) {
		mobileActiveTab.value = tab
	}

	function showError(
		title,
		message,
		details = "",
		retryAction = null,
		retryData = null,
	) {
		errorDialogTitle.value = title
		errorDialogMessage.value = message
		errorDetails.value = details
		errorRetryAction.value = retryAction
		errorRetryActionData.value = retryData
		showErrorDialog.value = true
	}

	function clearError() {
		errorDialogTitle.value = ""
		errorDialogMessage.value = ""
		errorDetails.value = ""
		errorRetryAction.value = null
		errorRetryActionData.value = null
		showErrorDialog.value = false
	}

	function showSuccess(invoiceName, total, paidAmount = null) {
		lastInvoiceName.value = invoiceName
		lastInvoiceTotal.value = total
		lastPaidAmount.value = paidAmount !== null ? paidAmount : total
		showSuccessDialog.value = true
	}

	function setLastOfflinePrintDoc(doc) {
		lastOfflinePrintDoc.value = doc
	}

	function clearLastOfflinePrintDoc() {
		lastOfflinePrintDoc.value = null
	}

	function setInitialCustomerName(name) {
		initialCustomerName.value = name
	}

	//// Neoffice — raise / clear the "a customer just signed up on the display" notification.
	//// Same origin: no upstream customer display (912ef092, 2026-02-04).
	function showCustomerCreatedNotification(customerData) {
		customerCreatedData.value = customerData
		showCustomerCreatedDialog.value = true
	}

	function clearCustomerCreatedNotification() {
		customerCreatedData.value = null
		showCustomerCreatedDialog.value = false
	}

	// Layout actions
	function clampLeftPanelWidth(width, containerWidth) {
		const safeContainerWidth =
			Number.isFinite(containerWidth) && containerWidth > 0
				? containerWidth
				: LEFT_PANEL_MIN + RIGHT_PANEL_MIN
		const maxWidth = Math.max(
			LEFT_PANEL_MIN,
			safeContainerWidth - RIGHT_PANEL_MIN,
		)
		const clampedWidth = Math.min(Math.max(width, LEFT_PANEL_MIN), maxWidth)
		return Number.isFinite(clampedWidth) ? clampedWidth : LEFT_PANEL_MIN
	}

	function setLeftPanelWidth(width, containerWidth = null) {
		if (containerWidth !== null) {
			const clamped = clampLeftPanelWidth(width, containerWidth)
			leftPanelWidth.value = clamped
			//// Neoffice — the panel split is a per-terminal habit (a 24" counter screen is not a 13"
			//// laptop), so it is persisted instead of resetting to upstream's fixed ratio on every
			//// reload (97d370df, 2026-03-31 "persist left panel width in localStorage, default 80/20
			//// ratio").
			localStorage.setItem("pos_left_panel_width", clamped.toString())
		} else {
			leftPanelWidth.value = width
		}
	}

	function setResizing(resizing) {
		isResizing.value = resizing
	}

	//// Neoffice — module-level memory of the last container width. It is what lets
	//// updateLayoutBounds below tell a real browser resize from a plain re-clamp, so the split can
	//// be rescaled as a ratio instead of staying frozen in pixels (1edd2aa1, 2026-03-31 "maintain
	//// left/right panel ratio when browser window resizes").
	//// maintain left/right panel ratio when browser window resizes — 1edd2aa
	let lastContainerWidth = 0

	function updateLayoutBounds(containerWidth) {
		if (containerWidth) {
			//// Neoffice — upstream only re-clamps the stored pixel width, so widening the browser left
			//// the item grid narrow and the cart huge. The split is now kept as a RATIO of the
			//// container and rescaled on resize, then persisted (1edd2aa1, 2026-03-31 "maintain
			//// left/right panel ratio when browser window resizes"; 7e3f9458 raised the right-panel
			//// minimum to 450px so the payment column stays usable).
			if (lastContainerWidth > 0 && lastContainerWidth !== containerWidth) {
				// Scale proportionally when window resizes to maintain ratio
				const ratio = leftPanelWidth.value / lastContainerWidth
				const scaled = clampLeftPanelWidth(Math.round(ratio * containerWidth), containerWidth)
				leftPanelWidth.value = scaled
				localStorage.setItem("pos_left_panel_width", scaled.toString())
			} else {
				leftPanelWidth.value = clampLeftPanelWidth(
					leftPanelWidth.value,
					containerWidth,
				)
			}
			lastContainerWidth = containerWidth
		}
	}

	function resetAllDialogs() {
		// Close all dialogs on logout to prevent stale state
		showPaymentDialog.value = false
		showCustomerDialog.value = false
		showSuccessDialog.value = false
		showOpenShiftDialog.value = false
		showCloseShiftDialog.value = false
		showDraftDialog.value = false
		showReturnDialog.value = false
		showCouponDialog.value = false
		showOffersDialog.value = false
		showBatchSerialDialog.value = false
		showHistoryDialog.value = false
		showOfflineInvoicesDialog.value = false
		showCreateCustomerDialog.value = false
		showClearCartDialog.value = false
		showLogoutDialog.value = false
		showItemSelectionDialog.value = false
		showErrorDialog.value = false
		//// Neoffice — logout must also close the display's "customer created" dialog and drop the
		//// record it was showing, or the next cashier inherits it (912ef092, 2026-02-04).
		showCustomerCreatedDialog.value = false
		clearError()
		//// Neoffice — logout must also drop the customer record the display dialog was showing, not
		//// merely hide the dialog, or the next cashier inherits it (912ef092, 2026-02-04).
		clearCustomerCreatedNotification()
		lastOfflinePrintDoc.value = null
	}

	return {
		// State
		isLoading,
		showPaymentDialog,
		showCustomerDialog,
		showSuccessDialog,
		showOpenShiftDialog,
		showCloseShiftDialog,
		showDraftDialog,
		showReturnDialog,
		showCouponDialog,
		showOffersDialog,
		showBatchSerialDialog,
		showHistoryDialog,
		showOfflineInvoicesDialog,
		showCreateCustomerDialog,
		showClearCartDialog,
		showLogoutDialog,
		showItemSelectionDialog,
		showErrorDialog,
		//// Neoffice — customer-display dialog state exported for the cashier screen (912ef092,
		//// 2026-02-04).
		showCustomerCreatedDialog,
		isAnyDialogOpen,
		errorDialogTitle,
		errorDialogMessage,
		errorDetails,
		errorType,
		errorRetryAction,
		errorRetryActionData,
		lastInvoiceName,
		lastInvoiceTotal,
		lastPaidAmount,
		lastOfflinePrintDoc,
		initialCustomerName,
		//// Neoffice — the customer record created on the display, exported for the acknowledgement
		//// dialog (912ef092, 2026-02-04).
		customerCreatedData,
		mobileActiveTab,
		windowWidth,
		leftPanelWidth,
		isResizing,

		// Computed
		isDesktop,

		// Actions
		setLoading,
		setWindowWidth,
		setMobileTab,
		showError,
		clearError,
		showSuccess,
		setLastOfflinePrintDoc,
		clearLastOfflinePrintDoc,
		setInitialCustomerName,
		//// Neoffice — actions for that notification; no upstream equivalent (912ef092, 2026-02-04).
		showCustomerCreatedNotification,
		clearCustomerCreatedNotification,
		setLeftPanelWidth,
		setResizing,
		updateLayoutBounds,
		clampLeftPanelWidth,
		resetAllDialogs,
	}
})
