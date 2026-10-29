import { useDialog, useDialogState } from "@/composables/useDialogState";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const LEFT_PANEL_MIN = 320;
//// Neoffice — the right-hand cart panel's minimum width goes from upstream's 360px to 450px,
//// in step with the min-width: 450px the same commit sets on the cart column in POSSale.vue
//// (7e3f9458, 2026-03-31 "right panel minimum width 450px (was 360/300)"). TO REVIEW: the
//// commit records no rationale beyond the number itself.
//// right panel minimum width 450px (was 360/300) — 7e3f945
const RIGHT_PANEL_MIN = 450;
//// Neoffice — RIGHT_PANEL_MAX is the floor of the cart's cap, not the cap itself: upstream stops
//// the cart at a flat 520 px, which the develop merge brought back after our fork had let it grow
//// wider. The product owner wants a cap, but a generous one: the cart may take half the container,
//// never less than 520 px (rightPanelMaxWidth below), and the item grid keeps its own minimum.
// The cart's cap never drops below this; on wider screens it is half the container
export const RIGHT_PANEL_MAX = 520;
//// Neoffice — the cart's cap for a given container width (see the note above).
const RIGHT_PANEL_MAX_RATIO = 0.5;
function rightPanelMaxWidth(containerWidth) {
	return Math.max(RIGHT_PANEL_MAX, Math.round(containerWidth * RIGHT_PANEL_MAX_RATIO));
}
//// Neoffice — default split 80/20 instead of upstream's 0.62, and the split a cashier drags is
//// remembered per terminal (97d370df, 2026-03-31 "persist left panel width in localStorage,
//// default 80/20 ratio"). Upstream develop now keeps the split as a ratio of the container
//// (what our 1edd2aa1 did on resize), so the ratio is what is stored, under a new key.
const DEFAULT_LEFT_PANEL_RATIO = 0.8;
const LEFT_PANEL_RATIO_KEY = "pos_left_panel_ratio";

function readSavedLeftPanelRatio() {
	try {
		const saved = Number.parseFloat(localStorage.getItem(LEFT_PANEL_RATIO_KEY));
		return saved > 0 && saved < 1 ? saved : DEFAULT_LEFT_PANEL_RATIO;
	} catch {
		return DEFAULT_LEFT_PANEL_RATIO;
	}
}

export const usePOSUIStore = defineStore("posUI", () => {
	// Loading state
	const isLoading = ref(true);

	// Dialog states using the dialog composable
	const { isOpen: showPaymentDialog } = useDialog("payment");
	const { isOpen: showCustomerDialog } = useDialog("customer");
	const { isOpen: showSuccessDialog } = useDialog("success");
	const { isOpen: showOpenShiftDialog } = useDialog("openShift");
	const { isOpen: showCloseShiftDialog } = useDialog("closeShift");
	const { isOpen: showDraftDialog } = useDialog("draft");
	const { isOpen: showReturnDialog } = useDialog("return");
	const { isOpen: showExpenseDialog } = useDialog("expense");
	const { isOpen: showCouponDialog } = useDialog("coupon");
	const { isOpen: showOffersDialog } = useDialog("offers");
	const { isOpen: showBatchSerialDialog } = useDialog("batchSerial");
	const { isOpen: showHistoryDialog } = useDialog("history");
	const { isOpen: showOfflineInvoicesDialog } = useDialog("offlineInvoices");
	const { isOpen: showCreateCustomerDialog } = useDialog("createCustomer");
	const { isOpen: showClearCartDialog } = useDialog("clearCart");
	const { isOpen: showLogoutDialog } = useDialog("logout");
	const { isOpen: showItemSelectionDialog } = useDialog("itemSelection");
	const { isOpen: showErrorDialog } = useDialog("invoiceError");
	//// Neoffice — dialog state with no upstream equivalent: a customer can create their own
	//// account on the customer-facing display, and the cashier's screen has to acknowledge it —
	//// upstream has no second screen at all (912ef092, 2026-02-04 "improve UX for customer
	//// creation flow").
	//// improve UX for customer creation flow — 912ef09
	const { isOpen: showCustomerCreatedDialog } = useDialog("customerCreated");

	// Global dialog state
	const { isAnyDialogOpen } = useDialogState();

	//// Neoffice — the customer-facing display can create a customer on its own screen, so the
	//// cashier's side needs somewhere to hold that record until it is acknowledged; upstream
	//// has no second screen at all (912ef092, 2026-02-04 "improve UX for customer creation
	//// flow").
	// Customer created from display dialog state
	const customerCreatedData = ref(null);

	// Error dialog state
	const errorDialogTitle = ref("");
	const errorDialogMessage = ref("");
	const errorDetails = ref("");
	const errorType = ref("error"); // 'error', 'warning', 'validation'
	const errorRetryAction = ref(null);
	const errorRetryActionData = ref(null);

	// Success dialog state
	const lastInvoiceName = ref("");
	const lastInvoiceTotal = ref(0);
	const lastPaidAmount = ref(0);
	//// Neoffice — what the customer still owes on that invoice (credit or partial sale), shown
	//// under "Paid" by the success dialog. Read from the server's outstanding_amount.
	const lastDueAmount = ref(0);
	/** Full receipt payload for invoices not yet on the server (offline queue) */
	const lastOfflinePrintDoc = ref(null);

	// Customer dialog state
	const initialCustomerName = ref("");

	// Mobile responsiveness
	const mobileActiveTab = ref("items"); // 'items' or 'cart'
	const windowWidth = ref(typeof window !== "undefined" ? window.innerWidth : 1024);

	// Layout state: the split is a ratio of the container, so it follows window resizes
	//// Neoffice — restored from this terminal's last split (see readSavedLeftPanelRatio).
	const leftPanelRatio = ref(readSavedLeftPanelRatio());
	const containerWidth = ref(0);
	const leftPanelWidth = computed(() =>
		clampLeftPanelWidth(leftPanelRatio.value * containerWidth.value, containerWidth.value)
	);
	const isResizing = ref(false);

	// Computed
	const isDesktop = computed(() => windowWidth.value >= 1024);

	// Actions
	function setLoading(loading) {
		isLoading.value = loading;
	}

	function setWindowWidth(width) {
		windowWidth.value = width;
	}

	function setMobileTab(tab) {
		mobileActiveTab.value = tab;
	}

	function showError(title, message, details = "", retryAction = null, retryData = null) {
		errorDialogTitle.value = title;
		errorDialogMessage.value = message;
		errorDetails.value = details;
		errorRetryAction.value = retryAction;
		errorRetryActionData.value = retryData;
		showErrorDialog.value = true;
	}

	function clearError() {
		errorDialogTitle.value = "";
		errorDialogMessage.value = "";
		errorDetails.value = "";
		errorRetryAction.value = null;
		errorRetryActionData.value = null;
		showErrorDialog.value = false;
	}

	//// Neoffice — dueAmount added (the amount still owed, 0 for a paid or offline sale).
	function showSuccess(invoiceName, total, paidAmount = null, dueAmount = 0) {
		lastInvoiceName.value = invoiceName;
		lastInvoiceTotal.value = total;
		lastPaidAmount.value = paidAmount !== null ? paidAmount : total;
		//// Neoffice — see lastDueAmount above.
		lastDueAmount.value = Number(dueAmount) > 0 ? Number(dueAmount) : 0;
		showSuccessDialog.value = true;
	}

	function setLastOfflinePrintDoc(doc) {
		lastOfflinePrintDoc.value = doc;
	}

	function clearLastOfflinePrintDoc() {
		lastOfflinePrintDoc.value = null;
	}

	function setInitialCustomerName(name) {
		initialCustomerName.value = name;
	}

	//// Neoffice — raise / clear the "a customer just signed up on the display" notification.
	//// Same origin: no upstream customer display (912ef092, 2026-02-04).
	function showCustomerCreatedNotification(customerData) {
		customerCreatedData.value = customerData;
		showCustomerCreatedDialog.value = true;
	}

	function clearCustomerCreatedNotification() {
		customerCreatedData.value = null;
		showCustomerCreatedDialog.value = false;
	}

	// Layout actions
	// Items pane width kept between its minimum and the cart's min/max widths
	function clampLeftPanelWidth(width, containerWidth) {
		const safeContainerWidth =
			Number.isFinite(containerWidth) && containerWidth > 0
				? containerWidth
				: LEFT_PANEL_MIN + RIGHT_PANEL_MIN;
		const maxWidth = Math.max(LEFT_PANEL_MIN, safeContainerWidth - RIGHT_PANEL_MIN);
		const minWidth = Math.min(
			maxWidth,
			//// Neoffice — the cart's cap grows with the container (half of it, never under 520 px)
			//// instead of upstream's flat RIGHT_PANEL_MAX; see rightPanelMaxWidth at the top.
			Math.max(LEFT_PANEL_MIN, safeContainerWidth - rightPanelMaxWidth(safeContainerWidth))
		);
		const clampedWidth = Math.min(Math.max(width, minWidth), maxWidth);
		return Number.isFinite(clampedWidth) ? clampedWidth : LEFT_PANEL_MIN;
	}

	// Stores the dragged width as a ratio of the container
	function setLeftPanelWidth(width, newContainerWidth = null) {
		if (newContainerWidth) containerWidth.value = newContainerWidth;
		if (containerWidth.value > 0) {
			leftPanelRatio.value =
				clampLeftPanelWidth(width, containerWidth.value) / containerWidth.value;
			//// Neoffice — the panel split is a per-terminal habit (a 24" counter screen is not a 13"
			//// laptop), so it is persisted instead of resetting to the default ratio on every reload
			//// (97d370df, 2026-03-31).
			try {
				localStorage.setItem(LEFT_PANEL_RATIO_KEY, String(leftPanelRatio.value));
			} catch {
				/* storage unavailable: the split just does not survive a reload */
			}
		}
	}

	function setResizing(resizing) {
		isResizing.value = resizing;
	}

	// New container width: leftPanelWidth recomputes from the ratio and re-clamps
	function updateLayoutBounds(newContainerWidth) {
		if (newContainerWidth) {
			containerWidth.value = newContainerWidth;
		}
	}

	function resetAllDialogs() {
		// Close all dialogs on logout to prevent stale state
		showPaymentDialog.value = false;
		showCustomerDialog.value = false;
		showSuccessDialog.value = false;
		showOpenShiftDialog.value = false;
		showCloseShiftDialog.value = false;
		showDraftDialog.value = false;
		showReturnDialog.value = false;
		showExpenseDialog.value = false;
		showCouponDialog.value = false;
		showOffersDialog.value = false;
		showBatchSerialDialog.value = false;
		showHistoryDialog.value = false;
		showOfflineInvoicesDialog.value = false;
		showCreateCustomerDialog.value = false;
		showClearCartDialog.value = false;
		showLogoutDialog.value = false;
		showItemSelectionDialog.value = false;
		showErrorDialog.value = false;
		//// Neoffice — logout must also close the display's "customer created" dialog and drop the
		//// record it was showing, or the next cashier inherits it (912ef092, 2026-02-04).
		showCustomerCreatedDialog.value = false;
		clearError();
		//// Neoffice — logout must also drop the customer record the display dialog was showing, not
		//// merely hide the dialog, or the next cashier inherits it (912ef092, 2026-02-04).
		clearCustomerCreatedNotification();
		lastOfflinePrintDoc.value = null;
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
		showExpenseDialog,
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
		//// Neoffice — see lastDueAmount above.
		lastDueAmount,
		lastOfflinePrintDoc,
		initialCustomerName,
		//// Neoffice — the customer record created on the display, exported for the acknowledgement
		//// dialog (912ef092, 2026-02-04).
		customerCreatedData,
		mobileActiveTab,
		windowWidth,
		leftPanelWidth,
		leftPanelRatio,
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
	};
});
