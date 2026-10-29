import {
	allowsAutoDiscountStacking,
	getProductStrategyForOffer,
	getStrategyForOffer,
	offerStrategyOrder,
} from "@/utils/offerStrategies";
import { useInvoice } from "@/composables/useInvoice";
import {
	COUPON_DISCOUNT_SOURCE,
	fixedCouponLineDiscount,
	hasFixedCouponDiscount,
	isCouponLine,
	preCouponDiscount,
	restorePreCouponDiscount,
	stashPreCouponDiscount,
} from "@/utils/couponLines";
import { getPrecision } from "@/utils/currency";
import { promoApi } from "@/utils/promoApi";
import { usePOSOffersStore } from "@/stores/posOffers";
import { usePOSSettingsStore } from "@/stores/posSettings";
import { usePOSShiftStore } from "@/stores/posShift";
import { parseError } from "@/utils/errorHandler";
import {
	shouldValidateItemStock,
	checkStockAvailability,
	getCartStockQtyForItem,
	rowStockQty,
} from "@/utils/stockValidator";
import {
	resolveFreeItemMinQty,
	syncCartFreeItems,
	withCarvedQtyRestored,
} from "@/utils/gwpSameItemFreeRows";
import { offlineState } from "@/utils/offline/offlineState";
//// Neoffice — added import. CHF has no coin below 0.05, so the cart computes a rounded grand
//// total plus the rounding-adjustment line shown beside it; upstream charges the raw total
//// (4fdb5df4, 2026-04-04 "rounding total, tips visibility, cash quick amounts"). roundCurrency
//// also serves the gift-card base capped on the net total after pricing rules (8e06bb9c,
//// 2026-01-16).
//// rounding total, tips visibility, cash quick amounts — 4fdb5df + 8e06bb9
import { roundTotal, roundCurrency } from "@/utils/currency";
import {
	isFreePromoRow,
	scaleRateForUomChange,
	shouldPreserveRateOnUomChange,
} from "@/utils/uomPricingLock";
import { useToast } from "@/composables/useToast";
import { call } from "frappe-ui";
import { defineStore } from "pinia";
import { computed, nextTick, ref, toRaw, watch } from "vue";

//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
/**
 * Creates an async task queue that ensures only one operation runs at a time.
 * Subsequent calls while processing will be queued and the latest one executed.
 */
function createAsyncQueue() {
	let isProcessing = false;
	let pendingTask = null;
	let currentAbortController = null;

	return {
		/**
		 * Enqueue a task. If already processing, replaces any pending task.
		 * @param {Function} taskFn - Async function to execute
		 * @returns {Promise} Resolves when task completes or is superseded
		 */
		async enqueue(taskFn) {
			// If currently processing, queue this as the next task (replacing any pending)
			if (isProcessing) {
				pendingTask = taskFn;
				return;
			}

			isProcessing = true;
			currentAbortController = new AbortController();

			try {
				await taskFn(currentAbortController.signal);
			} finally {
				isProcessing = false;
				currentAbortController = null;

				// Process pending task if any
				if (pendingTask) {
					const next = pendingTask;
					pendingTask = null;
					await this.enqueue(next);
				}
			}
		},

		/**
		 * Cancel current operation and clear pending tasks
		 */
		cancel() {
			if (currentAbortController) {
				currentAbortController.abort();
			}
			pendingTask = null;
		},

		/**
		 * Check if queue is currently processing
		 */
		get isProcessing() {
			return isProcessing;
		},

		/**
		 * Check if there's a pending task
		 */
		get hasPending() {
			return pendingTask !== null;
			//// Neoffice — the whole file went through our Biome formatter pass (458d81a9,
			//// 2026-03-20 "remove BrainWise branding, add restaurant mode, and code formatting"):
			//// tabs, double quotes, trailing commas, parenthesised arrow params, 80-column rewrap.
			//// Upstream runs no formatter, so most hunks below are that pass and change no
			//// behaviour — every marker reading "Biome reformat only" is one of them. At the next
			//// upstream merge, take their code and re-run Biome instead of resolving these by hand.
		},
	};
}

export const usePOSCartStore = defineStore("posCart", () => {
	// Use the existing invoice composable for core functionality
	const {
		invoiceItems,
		customer,
		subtotal,
		totalTax,
		totalDiscount,
		grandTotal,
		//// Neoffice — pulled out of useInvoice for the coupon / gift-card dialog: a gift card must be
		//// capped on the total AFTER item-level pricing rules, not on the raw subtotal, or a card
		//// worth more than the discounted price made ERPNext refuse the invoice (8e06bb9c, 2026-01-16
		//// "calculate discount on net total after pricing rules").
		//// calculate discount on net total after pricing rules — 8e06bb9
		netTotalBeforeAdditionalDiscount,
		posProfile,
		posOpeningShift,
		payments,
		salesTeam,
		additionalDiscount,
		//// Neoffice — upstream knows a single header discount: the manual/coupon
		//// additionalDiscount. An ERPNext Pricing Rule with apply_on=Transaction also returns a
		//// header-level amount, and letting it write additionalDiscount would inflate
		//// posa_gift_card_amount_used. These three refs keep the rule amount apart, with a
		//// per-ticket bypass so the cashier can still override it (44ea4e9a, 2026-07-09
		//// "apply transaction-level rule discount in the cart"; 4d61216b, same day, adds the UI).
		ruleHeaderDiscount,
		bypassRuleDiscount,
		effectiveHeaderDiscount,
		taxInclusive,
		isSubmitting,
		addItem: addItemToInvoice,
		//// Neoffice — destructured so the store can expose it: reloading a table's order from the
		//// server has to reproduce the server's lines verbatim rather than go through addItem's dedup
		//// (472293d7, 2026-04-01; the function itself is 707a330c, 2026-04-01).
		//// destructure replaceAllItems from useInvoice in posCart store — 472293d
		replaceAllItems,
		removeItem,
		updateItemQuantity: baseUpdateItemQuantity,
		submitInvoice: baseSubmitInvoice,
		clearCart: clearInvoiceCart,
		//// Neoffice — useInvoice keeps its own restaurantTable ref and the store mirrors every change
		//// into it (setRestaurantTable below), because submit_invoice reads the table from the
		//// payload: without it the backend never released the table, which stayed Occupied after the
		//// ticket was paid (45435e47, 2026-03-24).
		//// pass restaurant_table to submit_invoice via useInvoice (was missing,… — 45435e4
		restaurantTable: baseRestaurantTable,
		loadTaxRules,
		setTaxInclusive,
		setDefaultCustomer,
		applyDiscount,
		removeDiscount,
		couponCode,
		applyOffersResource,
		getItemDetailsResource,
		resolveUomPricing,
		recalculateItem,
		rebuildIncrementalCache,
		formatItemsForSubmission,
	} = useInvoice();

	const offersStore = usePOSOffersStore();
	const settingsStore = usePOSSettingsStore();

	//// Neoffice — upstream charges the raw grand total. Swiss cash has no coin below CHF
	//// 0.05, so what is actually collected is rounded to the currency's smallest fraction
	//// (read from the Currency doctype through the bootstrap API) and the difference is shown
	//// as its own line in the cart — unless the profile disables rounding (4fdb5df4,
	//// 2026-04-04 "rounding total, tips visibility, cash quick amounts").
	// Rounded grand total (applies currency fraction rounding when enabled)
	const roundedGrandTotal = computed(() => {
		if (settingsStore.disableRoundedTotal) return grandTotal.value;
		return roundTotal(grandTotal.value);
	});

	const roundingAdjustment = computed(() => {
		return roundCurrency(roundedGrandTotal.value - grandTotal.value);
	});

	// Additional cart state
	const pendingItem = ref(null);
	const pendingItemQty = ref(1);
	const appliedOffers = ref([]);
	const appliedCoupon = ref(null);
	const selectionMode = ref("uom"); // 'uom' or 'variant'
	const currentDraftId = ref(null);
	const targetDoctype = ref("Sales Invoice");

	// Offer processing state management
	const offerProcessingState = ref({
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		isProcessing: false, // True while any offer operation is running
		isAutoProcessing: false, // True during automatic offer processing
		lastProcessedAt: 0, // Timestamp of last successful processing
		lastCartHash: "", // Hash of cart state when last processed
		error: null, // Last error if any
		retryCount: 0, // Number of consecutive failures
	});

	// Generation counter to track cart changes and invalidate stale operations
	let cartGeneration = 0;

	// Async queue for sequential offer processing
	const offerQueue = createAsyncQueue();

	// Computed for backward compatibility and UI binding
	//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
	const isProcessingOffers = computed(() => offerProcessingState.value.isProcessing);

	/**
	 * Generates a comprehensive hash of the current cart state.
	 * Used to detect ANY change that might affect offer eligibility.
	 */
	/**
	 * Offers-loop guard. Signature of what decides offer eligibility from the
	 * cashier's side (paid lines + customer) — deliberately excludes discounts,
	 * free rows and appliedOffers, which the offer engine itself rewrites.
	 */
	function offerCartSignature() {
		const paid = withCarvedQtyRestored(invoiceItems.value)
			.filter((i) => !i.is_free_item)
			.map((i) => `${i.item_code}:${i.quantity}:${i.uom || ""}:${i.price_list_rate || i.rate || 0}`)
			.join("|");
		return `${paid}::${customer.value?.name || customer.value || "none"}`;
	}

	// offer code -> offerCartSignature() at the moment it was removed as no
	// longer eligible. Auto-apply skips it until the cart really changes, so a
	// removal can never be undone by the very next pass on the same cart.
	const removedOfferSignatures = new Map();

	function rememberRemovedOffers(offers) {
		const sig = offerCartSignature();
		for (const o of offers || []) {
			const code = o?.code || o?.name;
			if (code) removedOfferSignatures.set(code, sig);
		}
	}

	function wasRemovedForCurrentCart(code) {
		const sig = removedOfferSignatures.get(code);
		if (sig === undefined) return false;
		if (sig === offerCartSignature()) return true;
		removedOfferSignatures.delete(code);
		return false;
	}

	function generateCartHash() {
		const items = invoiceItems.value;
		const parts = [
			// Item details: code, quantity, uom, discount
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			items
				.map(
					(i) =>
						`${i.item_code}:${i.quantity}:${i.uom || ""}:${i.discount_percentage || 0}`
				)
				.join("|"),
			// Total item count
			items.length.toString(),
			// Subtotal (rounded to avoid floating point issues)
			Math.round((subtotal.value || 0) * 100).toString(),
			// Customer
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			customer.value?.name || customer.value || "none",
			// Applied offers count
			appliedOffers.value.length.toString(),
		];
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		return parts.join("::");
	}

	// Toast composable
	const { showSuccess, showError, showWarning } = useToast();

	// Computed
	const itemCount = computed(() => invoiceItems.value.length);
	const isEmpty = computed(() => invoiceItems.value.length === 0);
	const hasCustomer = computed(() => !!customer.value);

	// Actions
	function addItem(item, qty = 1, _autoAdd = false, currentProfile = null) {
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		if (
			currentProfile &&
			settingsStore.shouldEnforceStockValidation() &&
			shouldValidateItemStock(item)
		) {
			// Only this SKU (paid + free rows of the same item). A free gift of a
			// different product must not inflate requested qty (Iphone 17 x6 +
			// Aqua Water free x1 is 6 phones, not 7).
			const totalQty =
				getCartStockQtyForItem(invoiceItems.value, item.item_code) + rowStockQty(item, qty);
			const warehouse = item.warehouse || currentProfile.warehouse;

			const check = checkStockAvailability(item, totalQty, warehouse);
			if (!check.available) {
				throw new Error(check.error);
			}
		}

		addItemToInvoice(item, qty);
		//// Neoffice — restaurant editing of a cart line, none of which upstream has. hasUnsentChanges
		//// tracks what has not yet been fired to the kitchen (8aa35c29, 2026-03-20), and the two
		//// functions below write the free-text instruction and the structured modifier JSON,
		//// re-applying the modifier price adjustment in place so a second edit replaces the first
		//// instead of stacking (4df0caf1, 2026-03-21 Phase 4A; 87b37ffd, 2026-03-23, recalculates so
		//// the Grand Total follows; c6c81bf1, 2026-03-27, quantity from an option; f1b2c434,
		//// 2026-03-31, addresses the row by index since duplicates of a dish are legitimate).
		//// Phase 4A - structured item modifiers with groups, options, and price… — 4df0caf + 458d81a (+6 more)
		hasUnsentChanges.value = true;
	}

	/**
	 * Update special instructions on an item (restaurant mode).
	 */
	function updateItemInstructions(itemCode, uom, instructions) {
		const item = uom
			? invoiceItems.value.find((i) => i.item_code === itemCode && i.uom === uom)
			: invoiceItems.value.find((i) => i.item_code === itemCode);

		if (item) {
			item.posa_special_instructions = instructions;
			hasUnsentChanges.value = true;
		}
	}

	/**
	 * Update item modifiers with structured JSON and adjust price.
	 */
	function updateItemModifiers(
		itemCode,
		uom,
		modifiersJson,
		instructions,
		priceAdjustment,
		quantityValue = 0,
		itemIndex = -1
	) {
		// Use index if provided (avoids matching wrong item when duplicates exist)
		const item =
			itemIndex >= 0 && itemIndex < invoiceItems.value.length
				? invoiceItems.value[itemIndex]
				: uom
				? invoiceItems.value.find((i) => i.item_code === itemCode && i.uom === uom)
				: invoiceItems.value.find((i) => i.item_code === itemCode);

		if (item) {
			item.posa_item_modifiers = modifiersJson;
			item.posa_special_instructions = instructions;
			// Adjust rate with modifier price
			if (priceAdjustment > 0 && !item._modifiers_applied) {
				item.rate = (item.rate || 0) + priceAdjustment;
				item.price_list_rate = item.rate;
				item._modifiers_applied = priceAdjustment;
			} else if (item._modifiers_applied) {
				// Remove old adjustment and apply new one
				item.rate = (item.rate || 0) - item._modifiers_applied + priceAdjustment;
				item.price_list_rate = item.rate;
				item._modifiers_applied = priceAdjustment;
			}
			// Apply quantity from option if set
			if (quantityValue > 0) {
				item.quantity = quantityValue;
			}
			// Recalculate item totals and rebuild cache so Grand Total updates immediately
			recalculateItem(item);
			rebuildIncrementalCache();
			hasUnsentChanges.value = true;
		}
	}

	/**
	 * Update item quantity with stock validation.
	 * Wraps useInvoice.updateItemQuantity to enforce stock limits
	 * when the user clicks +/- or types a new quantity.
	 * The quantity is the paid units. Same-SKU gifts are added ON TOP as a
	 * separate free row (never carved); only legacy carved rows
	 * (gwp_same_item_row === 1, from older drafts) are folded back in here.
	 */
	function updateItemQuantity(itemCode, quantity, uom = null) {
		const item = uom
			? invoiceItems.value.find(
					(i) => i.item_code === itemCode && i.uom === uom && !i.is_free_item
				)
			: invoiceItems.value.find((i) => i.item_code === itemCode && !i.is_free_item);

		if (!item) return;

		const newQty = Number.parseFloat(quantity) || 1;
		// Same-item gift rows carved out of this line
		const carved = invoiceItems.value.filter(
			(i) =>
				i.is_free_item &&
				Number(i.gwp_same_item_row) === 1 &&
				i.item_code === itemCode &&
				i.uom === item.uom
		);
		const lineQty =
			item.quantity + carved.reduce((sum, i) => sum + (Number.parseFloat(i.quantity) || 0), 0);

		// Only validate when quantity is increasing
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		if (
			newQty > lineQty &&
			settingsStore.shouldEnforceStockValidation() &&
			shouldValidateItemStock(item)
		) {
			const otherLinesQty =
				getCartStockQtyForItem(invoiceItems.value, item.item_code) - rowStockQty(item, lineQty);
			const totalQty = otherLinesQty + rowStockQty(item, newQty);
			const check = checkStockAvailability(item, totalQty);
			if (!check.available) {
				showWarning(check.error);
				return;
			}
		}

		// Typed qty replaces a legacy carved split; the next offer pass adds the gift on top
		if (carved.length) {
			invoiceItems.value = invoiceItems.value.filter((i) => !carved.includes(i));
		}
		baseUpdateItemQuantity(itemCode, quantity, uom);
		hasUnsentChanges.value = true;
	}

	//// Neoffice — money ALREADY taken from the customer by a terminal or QR
	//// payment whose sale is not yet booked. It lives in the store, not in the
	//// payment dialog, because every way out of a sale must be able to see it:
	//// closing the payment dialog, clearing the cart, starting a new sale. It
	//// used to live only in the dialog, so closing that dialog made the money
	//// invisible — 18.08: two payments collected, no sale, no warning
	//// anywhere. Reproduced on osiris the next morning (PI-2026-00000075).
	const collectedUnbooked = ref([]);
	const collectedUnbookedTotal = computed(() =>
		roundCurrency(collectedUnbooked.value.reduce((sum, e) => sum + (e.amount || 0), 0))
	);
	function noteCollected(entry) {
		collectedUnbooked.value.push(entry);
	}
	/** Call once the money is accounted for — booked, cancelled or refunded. */
	function clearCollected() {
		collectedUnbooked.value = [];
	}

	// A cart loaded from a draft leaves its serials held by that draft
	//// Neoffice — this function is async in our fork (see the note inside): upstream called
	//// clearCart fire-and-forget, and selecting a table then loading its draft raced that
	//// un-awaited cleanup (2f0b4b8f, 2026-03-21 "table draft loading fails silently due to async
	//// clearCart race"). Upstream develop's returnSerials option is kept.
	//// table draft loading fails silently due to async clearCart race — 2f0b4b8
	async function clearCart({ returnSerials = !currentDraftId.value } = {}) {
		// Cancel any pending offer processing
		debouncedProcessOffers.cancel();
		offerQueue.cancel();

		//// Neoffice — upstream calls clearCart() fire-and-forget. Selecting a table and then
		//// loading its draft raced that un-awaited cleanup: the draft was wiped right after being
		//// loaded, silently. clearCart is async now and every caller awaits it (2f0b4b8f,
		//// 2026-03-21 "table draft loading fails silently due to async clearCart race").
		//// No `customer.value = null` after it either: useInvoice's clearCart puts the POS
		//// Profile's default customer back, and nulling it here raced that restore (6269ceec,
		//// 2026-04-05 "restore default customer after completing a sale").
		await clearInvoiceCart({ returnSerials });
		offerHeaderDiscount.value = 0;

		offersStore.clearOneTimeContext();
		appliedOffers.value = [];
		appliedCoupon.value = null;
		currentDraftId.value = null;
		targetDoctype.value = "Sales Invoice";
		//// Neoffice — restaurant / takeaway / guest-order state has no upstream equivalent, so
		//// upstream's clearCart leaves it behind and the NEXT ticket inherits the previous table,
		//// its KDS status and whatever a guest had already paid by QR (458d81a9 2026-03-20
		//// restaurant mode; 644ad918 2026-03-26 takeaway; 6d7195f4 2026-03-30 guest paid amount;
		//// 1c05e7c7 2026-04-01 tips shown separately).
		//// Neoffice — the table goes through its setter: useInvoice keeps a mirror of it (see
		//// setRestaurantTable) and submit_invoice reads THAT copy, so clearing only the store's own
		//// ref let the ticket after a paid table ticket be saved on the same table.
		setRestaurantTable(null);
		isTakeaway.value = false;
		takeawayNumber.value = "";
		kdsStatus.value = "Pending";
		hasUnsentChanges.value = false;
		guestPaidAmount.value = 0;
		guestTipAmount.value = 0;

		// Reset offer processing state
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		offerProcessingState.value.lastCartHash = "";
		offerProcessingState.value.error = null;
		offerProcessingState.value.retryCount = 0;

		// Sync the empty snapshot
		syncOfferSnapshot();
	}

	function setTargetDoctype(doctype) {
		targetDoctype.value = doctype;
	}

	const deliveryDate = ref("");
	const writeOffAmount = ref(0);
	//// Neoffice — cart state upstream has none of: the tip and the loyalty redemption chosen in
	//// the payment dialog, the restaurant table the ticket belongs to, takeaway mode and its
	//// number, the KDS status, the "not yet sent to the kitchen" flag, and what the guests already
	//// settled from their phones (104959e6, 2026-03-19; e9d1622a, 2026-03-23; 8aa35c29,
	//// 2026-03-20; 644ad918, 2026-03-26 takeaway; 6d7195f4 / 214125e5, 2026-03-30 guest payments).
	//// The two setters below exist because the production bundle turns the destructured
	//// posProfile / posOpeningShift into const bindings, so assigning them from a component threw
	//// at the till while dev mode worked (b44f194b, 2026-03-21).
	//// use setter functions for posProfile/posOpeningShift to avoid const as… — b44f194 + 458d81a (+6 more)
	const tipAmount = ref(0);
	const loyaltyData = ref(null);
	const restaurantTable = ref(null);
	const isTakeaway = ref(false);
	const takeawayNumber = ref("");
	const kdsStatus = ref("Pending");
	const hasUnsentChanges = ref(false);
	const guestPaidAmount = ref(0);
	const guestTipAmount = ref(0);

	function setPosProfile(profile) {
		posProfile.value = profile;
	}

	function setPosOpeningShift(shift) {
		posOpeningShift.value = shift;
	}

	function setDeliveryDate(date) {
		deliveryDate.value = date;
	}

	function setWriteOffAmount(amount) {
		writeOffAmount.value = amount || 0;
	}

	//// Neoffice — setters for cart state upstream does not carry: ERPNext-native loyalty
	//// redemption chosen in the payment dialog (104959e6, 2026-03-19), the restaurant table
	//// the ticket belongs to — mirrored into useInvoice so submit_invoice can release it
	//// (45435e47, 2026-03-24) — and the per-ticket KDS status plus the "changes not yet sent
	//// to the kitchen" flag (8aa35c29 / e005b94b, 2026-03-20/21).
	function setLoyaltyData(data) {
		loyaltyData.value = data || null;
	}

	function setRestaurantTable(table) {
		restaurantTable.value = table;
		baseRestaurantTable.value = table;
	}

	function setKdsStatus(status) {
		kdsStatus.value = status;
	}

	function markChangesSent() {
		hasUnsentChanges.value = false;
	}

	async function submitInvoice(options = {}) {
		if (invoiceItems.value.length === 0) {
			showWarning(__("Cart is empty"));
			return;
		}
		if (!customer.value) {
			showWarning(__("Please select a customer"));
			return;
		}

		// Capture one-time offer redemptions before submission can clear the cart.
		const customerName = customer.value?.name || customer.value || null;
		const oneTimeRuleNames = appliedOffers.value
			.filter((o) => o.offer?.one_time_per_customer)
			.map((o) => o.code)
			.filter(Boolean);
		const wasOffline = offlineState.isOffline;

		//// Neoffice — upstream submits with (doctype, deliveryDate, writeOff) only. Loyalty points
		//// redeemed at payment time and the restaurant tip are decided inside the payment dialog,
		//// so they must travel the whole chain down to submit_invoice or they are silently dropped
		//// from the invoice (104959e6 2026-03-19 loyalty; e9d1622a 2026-03-23 "pass tip_amount
		//// through full payment chain").
		const result = await baseSubmitInvoice(
			targetDoctype.value,
			deliveryDate.value,
			writeOffAmount.value,
			//// Neoffice — loyalty redemption and restaurant tip travel with the submit (see above).
			loyaltyData.value,
			tipAmount.value,
			Boolean(options.isCreditSale),
			options.receivableAccount || null
		);
		// Reset write-off amount and loyalty after successful submission
		if (result) {
			writeOffAmount.value = 0;
			//// Neoffice — the loyalty redemption and the tip are one-shot: leaving them set after a
			//// successful submit would re-apply the previous customer's points and re-charge their tip on
			//// the next ticket (104959e6, 2026-03-19; e9d1622a, 2026-03-23).
			//// native loyalty points redemption in POS payment dialog — 104959e + e9d1622
			loyaltyData.value = null;
			tipAmount.value = 0;
		}
		return result;
	}

	async function createSalesOrder() {
		return await submitInvoice();
	}
	//// submit sales order on checkout. — 257a5c2

	function syncOneTimeContextForCurrentCustomer() {
		const shiftStore = usePOSShiftStore();
		const customerName = customer.value?.name || customer.value || null;
		const defaultCustomer = shiftStore.currentProfile?.customer;
		const isWalkIn = !customerName || customerName === defaultCustomer;

		return offersStore.loadOneTimeContextForCustomer(customerName, { isWalkIn });
	}

	async function setCustomer(selectedCustomer) {
		customer.value = selectedCustomer;
		//// Neoffice — removing the customer must drop the transaction-rule header discount: the rule
		//// is customer-group driven and the offer recompute is skipped when there is no customer, so
		//// the amount lingered as a phantom discount on the ticket. Found in live testing on osiris
		//// with a B2B 10% rule (a377b2c4, 2026-07-09 "clear transaction-rule header discount when the
		//// customer is removed").
		//// clear stale transaction-rule header discount on customer removal — feature b
		// A customer-group pricing rule can't qualify without a customer, and the
		// offer recompute is skipped when there is none — so drop the rule discount
		// here to avoid a phantom header discount lingering in the cart. A newly
		// selected customer recomputes offers normally and re-applies if eligible.
		if (!selectedCustomer) {
			ruleHeaderDiscount.value = 0;
			rebuildIncrementalCache();
		}
		await syncOneTimeContextForCurrentCustomer();
	}

	async function loadDefaultCustomer() {
		const shiftStore = usePOSShiftStore();
		const profileCustomer =
			shiftStore.currentProfile?.customer || shiftStore.profileCustomer || null;
		await setDefaultCustomer(profileCustomer);
		await syncOneTimeContextForCurrentCustomer();
	}

	function setPendingItem(item, qty = 1, mode = "uom") {
		pendingItem.value = item;
		pendingItemQty.value = qty;
		selectionMode.value = mode;
	}

	function clearPendingItem() {
		pendingItem.value = null;
		pendingItemQty.value = 1;
		selectionMode.value = "uom";
	}

	// Discount & Offer Management
	// An order discount and a whole-cart coupon share the header, so only one applies at a time
	//// Neoffice — stays 0 in our fork: the transaction-rule discount lives in ruleHeaderDiscount
	//// (applyHeaderDiscountFromServer below). While a rule applies its amount is the header discount
	//// (useInvoice's effectiveHeaderDiscount), and a whole-cart coupon or gift card stays applied and
	//// stored in additionalDiscount, back in force when the rule stops or the cashier bypasses it.
	//// Upstream's "remove the coupon / refuse it" guards built on this ref therefore never fire here
	//// (merge of 2026-10-28).
	const offerHeaderDiscount = ref(0);

	function isWholeCartCoupon(coupon) {
		return Boolean(coupon) && !isLineLevelCoupon(coupon);
	}

	function applyDiscountToCart(discount) {
		if (isLineLevelCoupon(discount)) {
			if (appliedCoupon.value && !isLineLevelCoupon(appliedCoupon.value)) {
				removeDiscount();
			}
			const amount = applyCouponLineUpdates(discount.code, discount.line_updates, discount.coupon);
			couponCode.value = discount.code;
			appliedCoupon.value = { ...discount, amount };
			showSuccess(__("{0} applied successfully", [discount.name]));
			return;
		}
		if (offerHeaderDiscount.value > 0) {
			showWarning(__("{0} can't be combined with the order discount already applied", [discount.name]));
			return false;
		}
		clearCouponLines();
		applyDiscount(discount);
		appliedCoupon.value = discount;
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		showSuccess(__("{0} applied successfully", [discount.name]));
	}

	//// restore draggable divider functionality in POS layout — 2aafa99
	function removeDiscountFromCart() {
		appliedOffers.value = [];
		if (isLineLevelCoupon(appliedCoupon.value)) {
			clearCouponLines();
			couponCode.value = null;
		} else {
			removeDiscount();
		}
		appliedCoupon.value = null;
		showSuccess(__("Discount has been removed from cart"));
	}

	// Line-level coupons (priced by posnext_promotions) discount only their eligible lines.
	// Those lines are tagged so the server can re-check them on submit.
	const COUPON_REVALIDATE_MAX_WAIT_MS = 5000;
	let couponRevalidateTimer = null;
	let couponRevalidateSeq = 0;

	function isLineLevelCoupon(coupon) {
		return Boolean(coupon?.line_level);
	}

	// The coupon is always priced against the lines as they are without it.
	function buildCouponItemsPayload() {
		return toRaw(invoiceItems.value).map((item) => {
			const pre = preCouponDiscount(item);
			return {
				item_code: item.item_code,
				item_group: item.item_group,
				brand: item.brand,
				qty: item.quantity,
				uom: item.uom,
				price_list_rate: item.price_list_rate || item.rate,
				rate: item.rate,
				amount: item.amount,
				discount_percentage: pre.discount_percentage || 0,
				discount_amount: pre.discount_amount || 0,
				pricing_rules: normalizePricingRules(item.pricing_rules).join(","),
				is_free_item: item.is_free_item || 0,
				is_already_discounted: pre.is_already_discounted || 0,
				discount_source: pre.discount_source || "",
				coupon_code: "",
			};
		});
	}

	function dropCouponFromLine(item) {
		restorePreCouponDiscount(item);
		item.coupon_code = null;
		item.coupon_fixed_discount = null;
		item.coupon_percentage_cap = null;
		recalculateItem(item);
	}

	function clearCouponLines() {
		let changed = false;
		for (const item of invoiceItems.value) {
			if (item.discount_source !== COUPON_DISCOUNT_SOURCE) continue;
			dropCouponFromLine(item);
			changed = true;
		}
		if (changed) rebuildIncrementalCache();
	}

	/**
	 * Apply server line_updates (from validate_coupon) to the cart.
	 * line_key is the 0-based index of the line in the items payload.
	 * @returns {number} total coupon discount now on the cart
	 */
	function applyCouponLineUpdates(code, lineUpdates, coupon) {
		clearCouponLines();
		const couponPercentage =
			coupon?.discount_type === "Percentage" ? Number(coupon.discount_percentage) || 0 : 0;
		let total = 0;
		for (const update of lineUpdates || []) {
			const item = invoiceItems.value[update.line_key];
			// Cart changed while the request was in flight; the revalidation watcher catches up.
			if (!item || item.item_code !== update.item_code) continue;
			const percentage = Number.parseFloat(update.discount_percentage) || 0;
			const fixedAmount = percentage > 0 ? 0 : Number.parseFloat(update.discount_amount) || 0;
			// A stacked line's discount includes what it already had, so the coupon % is no cap for it.
			const stacked = Boolean(update.stacked);
			stashPreCouponDiscount(item);
			item.discount_percentage = percentage;
			item.discount_amount = fixedAmount;
			item.coupon_fixed_discount = percentage > 0 ? null : fixedAmount;
			item.coupon_percentage_cap = percentage > 0 || stacked ? null : couponPercentage || null;
			item.discount_source = COUPON_DISCOUNT_SOURCE;
			item.coupon_code = code;
			recalculateItem(item);
			// The server names the coupon's own share coupon_only_discount (older builds: coupon_discount_amount)
			const couponPart = Number.parseFloat(update.coupon_only_discount ?? update.coupon_discount_amount);
			total += Number.isFinite(couponPart) ? couponPart : item.discount_amount;
		}
		rebuildIncrementalCache();
		return total;
	}

	// Keep fixed coupon lines within their allocation after a local quantity/UOM change.
	function capFixedCouponLines() {
		const { currency } = getPrecision();
		let changed = false;
		for (const item of invoiceItems.value) {
			if (!hasFixedCouponDiscount(item)) continue;
			const allowed = fixedCouponLineDiscount(item, currency);
			if (Math.abs((item.discount_amount || 0) - allowed) < 1e-9) continue;
			item.discount_percentage = 0;
			item.discount_amount = allowed;
			recalculateItem(item);
			changed = true;
		}
		if (changed) rebuildIncrementalCache();
	}

	/**
	 * Re-attach a scoped coupon saved with a held cart, or drop its line discounts
	 * when the coupon itself was not saved (they must never outlive the coupon).
	 */
	function restoreLineCoupon(coupon) {
		const code = coupon?.code;
		const hasLines = Boolean(code) && invoiceItems.value.some((item) => isCouponLine(item) && item.coupon_code === code);
		if (isLineLevelCoupon(coupon) && hasLines) {
			for (const item of invoiceItems.value) {
				if (isCouponLine(item) && item.coupon_code !== code) {
					dropCouponFromLine(item);
				}
			}
			appliedCoupon.value = coupon;
			couponCode.value = code;
			capFixedCouponLines();
			rebuildIncrementalCache();
			scheduleCouponRevalidation();
			return;
		}
		clearCouponLines();
		if (isLineLevelCoupon(appliedCoupon.value)) {
			appliedCoupon.value = null;
			couponCode.value = null;
		}
	}

	function scheduleCouponRevalidation() {
		if (couponRevalidateTimer) clearTimeout(couponRevalidateTimer);
		couponRevalidateTimer = setTimeout(() => {
			couponRevalidateTimer = null;
			revalidateLineCoupon();
		}, 400);
	}

	async function revalidateLineCoupon() {
		const coupon = appliedCoupon.value;
		// Offline carts keep their tagged lines; the server re-checks them when the invoice syncs.
		if (!isLineLevelCoupon(coupon) || offlineState.isOffline) return;

		const seq = ++couponRevalidateSeq;
		const waitUntil = Date.now() + COUPON_REVALIDATE_MAX_WAIT_MS;
		while (offerProcessingState.value.isProcessing && Date.now() < waitUntil) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			if (seq !== couponRevalidateSeq) return;
		}

		try {
			const result = await call(promoApi.validateCoupon(), {
				coupon_code: coupon.code,
				customer: customer.value?.name || customer.value,
				company: usePOSShiftStore().currentProfile?.company,
				items: JSON.stringify(buildCouponItemsPayload()),
			});
			if (seq !== couponRevalidateSeq || appliedCoupon.value?.code !== coupon.code) return;

			if (!result?.valid) {
				clearCouponLines();
				couponCode.value = null;
				appliedCoupon.value = null;
				showWarning(
					__("Coupon {0} removed: {1}", [
						coupon.code,
						result?.message || __("Cart no longer meets requirements"),
					])
				);
				return;
			}

			const amount = applyCouponLineUpdates(coupon.code, result.line_updates, coupon.coupon);
			appliedCoupon.value = { ...appliedCoupon.value, amount, line_updates: result.line_updates };
		} catch (error) {
			console.error("Error re-validating coupon:", error);
			showWarning(
				__("Could not re-check coupon {0}. It will be validated again on payment.", [
					coupon.code,
				])
			);
		}
	}

	//// Neoffice — our gift cards are coupons whose amount can cover the whole ticket. When the
	//// coupon came back from restored state, additionalDiscount did not come with it and the
	//// payment dialog refused to finalise a zero grand total. This watcher re-syncs the
	//// discount once Vue has settled — flush "post" + nextTick, because running earlier hits a
	//// store that is not built yet (d151bfd5, 2026-01-12 "allow payment completion when
	//// discount covers total").
	// Watch appliedCoupon to ensure additionalDiscount stays in sync
	// This handles cases where appliedCoupon is restored from state but additionalDiscount is lost
	// Using flush: 'post' to ensure the watcher runs after Vue updates and store is fully initialized
	watch(
		appliedCoupon,
		(newCoupon) => {
			//// Neoffice — a line-level coupon (upstream develop, priced by posnext_promotions) already
			//// discounts its lines: copying its amount into the header discount would count it twice.
			if (newCoupon && !isLineLevelCoupon(newCoupon) && newCoupon.amount > 0) {
				// Always sync the discount to ensure consistency
				// Use nextTick to ensure the store and composable are ready
				nextTick(() => {
					if (additionalDiscount.value !== newCoupon.amount) {
						applyDiscount(newCoupon);
					}
				});
			} else if (!newCoupon && additionalDiscount.value > 0) {
				// Clear the discount if coupon is removed
				removeDiscount();
			}
		},
		{ immediate: true, flush: "post" }
	);

	function buildOfferEvaluationPayload(currentProfile) {
		// Use toRaw() to ensure we get current, non-reactive values (prevents stale cached quantities)
		// Carved same-SKU free units count as paid demand (see withCarvedQtyRestored)
		const rawItems = withCarvedQtyRestored(toRaw(invoiceItems.value));

		return {
			doctype: "Sales Invoice",
			pos_profile: posProfile.value,
			customer: customer.value?.name || customer.value || currentProfile?.customer,
			company: currentProfile?.company,
			//// Neoffice — the offer-evaluation payload carries the restaurant context so a Pricing Rule
			//// can be scoped to dine-in versus takeaway; upstream's payload is retail-only (458d81a9
			//// 2026-03-20 restaurant mode; 644ad918 2026-03-26 "takeaway module").
			restaurant_table: restaurantTable.value?.name,
			is_takeaway: isTakeaway.value ? 1 : 0,
			takeaway_number: takeawayNumber.value || "",
			kds_status: kdsStatus.value,
			selling_price_list: currentProfile?.selling_price_list,
			currency: currentProfile?.currency,
			// A whole-cart coupon's amount is not sent, so the server can't echo it back as an order discount
			discount_amount: isWholeCartCoupon(appliedCoupon.value) ? 0 : additionalDiscount.value || 0,
			coupon_code: appliedCoupon.value?.name || "",
			// Offers see coupon lines without the coupon; otherwise its discount reads as a manual one.
			items: rawItems.map((item) => {
				const pre = preCouponDiscount(item);
				return {
					item_code: item.item_code,
					item_name: item.item_name,
					qty: item.quantity,
					rate: item.rate,
					uom: item.uom,
					warehouse: item.warehouse,
					conversion_factor: item.conversion_factor || 1,
					//// Neoffice — per-line restaurant data (free-text instructions, the structured product
					//// options with their price adjustments, the preparation station, the KDS status) has to
					//// ride with the item into offer evaluation: dropping it here made a re-validated line lose
					//// its modifiers and its kitchen state (4df0caf1 2026-03-21 modifiers; e005b94b 2026-03-21
					//// stations; f3e620c2 2026-03-22 "preserve item kds_status on re-validation").
					posa_special_instructions: item.posa_special_instructions || "",
					posa_item_modifiers: item.posa_item_modifiers || "",
					preparation_station: item.preparation_station || "",
					kds_status: item.kds_status || "Pending",
					price_list_rate: item.price_list_rate || item.rate,
					discount_percentage: pre.discount_percentage || 0,
					discount_amount: pre.discount_amount || 0,
					pricing_rules: item.pricing_rules || "",
					is_already_discounted: pre.is_already_discounted || 0,
					discount_source: pre.discount_source || "",
					coupon_code: "",
					item_group: item.item_group,
					brand: item.brand,
					amount: item.amount,
					is_free_item: item.is_free_item || 0,
				};
			}),
		};
	}

	/** @returns {boolean} true when the line is a coupon line (handled here, its coupon kept) */
	function dropPromotionUnderCoupon(item) {
		if (!isCouponLine(item)) return false;
		if (hasPricingRules(item.pricing_rules)) {
			item.pricing_rules = [];
			item.is_accumulative_discount = 0;
			updatePreCouponDiscount(item, {
				discount_percentage: 0,
				discount_amount: 0,
				discount_source: "",
				is_already_discounted: 0,
			});
		}
		return true;
	}

	/**
	 * Offers changed the discount under a coupon line: keep the coupon on it and
	 * re-price the coupon against the line's new pre-coupon discount.
	 */
	function updatePreCouponDiscount(item, next) {
		const pre = preCouponDiscount(item);
		const changed =
			Number(pre.discount_percentage || 0) !== Number(next.discount_percentage || 0) ||
			(next.discount_percentage > 0
				? false
				: Number(pre.discount_amount || 0) !== Number(next.discount_amount || 0)) ||
			(pre.discount_source || "") !== (next.discount_source || "") ||
			Number(pre.is_already_discounted || 0) !== Number(next.is_already_discounted || 0);
		item.pre_coupon_discount = { ...next };
		if (changed) scheduleCouponRevalidation();
	}

	/**
	 * Check if pricing_rules has a value (handles string or array).
	 */
	function hasPricingRules(value) {
		if (!value) return false;
		if (Array.isArray(value)) return value.length > 0;
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		return typeof value === "string" && value.trim().length > 0;
	}

	/**
	 * Normalize pricing_rules to an array. The server echoes it back as a
	 * comma-separated string (see useInvoice.js#stringifyPricingRules) —
	 * spreading a string directly (`[...str]`) splits it into individual
	 * characters instead of rule names, corrupting the field for offline
	 * stacking / merge logic below.
	 */
	function normalizePricingRules(value) {
		if (Array.isArray(value)) return [...value];
		if (typeof value === "string" && value.trim()) {
			return value
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
		}
		return [];
	}

	/**
	 * Sync discounts from server response to cart items.
	 * Server returns items in same order as sent (handles duplicate SKUs).
	 */
	function applyDiscountsFromServer(serverItems) {
		if (!Array.isArray(serverItems)) return false;

		let hasDiscounts = false;

		invoiceItems.value.forEach((item, index) => {
			const serverItem = serverItems[index] || {};
			const discountPct = Number.parseFloat(serverItem.discount_percentage) || 0;
			const discountAmt = Number.parseFloat(serverItem.discount_amount) || 0;
			const serverDiscounted =
				hasPricingRules(serverItem.pricing_rules) || discountPct > 0 || discountAmt > 0;

			if (isCouponLine(item)) {
				if (serverDiscounted) {
					updatePreCouponDiscount(item, {
						discount_percentage: discountPct,
						discount_amount: discountAmt,
						discount_source: serverItem.discount_source || "",
						is_already_discounted: serverItem.is_already_discounted ? 1 : 0,
					});
				} else if (hasPricingRules(item.pricing_rules)) {
					// The promotion under the coupon no longer applies.
					updatePreCouponDiscount(item, {
						discount_percentage: 0,
						discount_amount: 0,
						discount_source: "",
						is_already_discounted: 0,
					});
				}
				item.pricing_rules = normalizePricingRules(serverItem.pricing_rules);
				item.free_qty = Number.parseFloat(serverItem.free_qty) || 0;
				item.gwp_free_qty = Number.parseFloat(serverItem.gwp_free_qty) || 0;
				item.is_accumulative_discount =
					serverItem.discount_source === "accumulative_promotion" ? 1 : 0;
				return;
			}

			// Only update if server applied a pricing rule or discount
			if (serverDiscounted) {
				item.discount_percentage = discountPct;
				item.discount_amount = discountAmt;
				item.pricing_rules = normalizePricingRules(serverItem.pricing_rules);
				item.discount_source = serverItem.discount_source || item.discount_source;
				item.free_qty = Number.parseFloat(serverItem.free_qty) || 0;
				item.gwp_free_qty = Number.parseFloat(serverItem.gwp_free_qty) || 0;
				hasDiscounts = discountPct > 0 || discountAmt > 0;
			} else if (!item.is_free_item && hasPricingRules(item.pricing_rules)) {
				// The server is the authority for promotion discounts. A line whose
				// promotion (pricing_rules) the server no longer applies must drop it,
				// otherwise the client keeps a stale % and computes min_amt on a
				// different total than the server just used (offers-loop fix).
				item.discount_percentage = 0;
				item.discount_amount = 0;
				item.pricing_rules = [];
				item.is_already_discounted = 0;
			}
			// Otherwise preserve existing manual discount

			if (serverItem.is_already_discounted !== undefined) {
				item.is_already_discounted = serverItem.is_already_discounted ? 1 : 0;
			}
			item.is_accumulative_discount =
				serverItem.discount_source === "accumulative_promotion" ? 1 : 0;

			recalculateItem(item);
		});

		rebuildIncrementalCache();
		return hasDiscounts;
	}

	/**
	 * Processes free items from backend offer response.
	 *
	 * ERPNext represents product discounts as separate SI rows: paid line(s) plus
	 * one or more rows with is_free_item=1 (see pricing_rule tests for same_item).
	 * We always add a dedicated free row so formatItemsForSubmission sends qty > 0
	 * for stock and accounting; annotating only free_qty on the paid line never
	 * reaches Sales Invoice Item (there is no free_qty field server-side).
	 *
	 * @param {Array} freeItems - Array of free items from backend (e.g., [{item_code, qty, uom, item_name}])
	 * @returns {void}
	 */
	function processFreeItems(freeItems) {
		// Restore qty previously carved into same-SKU free rows, then rebuild.
		// See syncCartFreeItems — gwp_same_item_row is client-only; skipping this
		// undercharges scanned units.
		// Same-SKU gifts are added on top of paid qty (never carved); min_qty kept for reference
		const withMinQty = (freeItems || []).map((free) => ({
			...free,
			min_qty:
				free.min_qty ??
				resolveFreeItemMinQty(free, offersStore.availableOffers, appliedOffers.value),
		}));
		invoiceItems.value = syncCartFreeItems(invoiceItems.value, withMinQty, {
			recalculateItem,
		});
		rebuildIncrementalCache();
	}

	/**
	 * Extracts and normalizes the offer response from backend
	 *
	 * @param {Object} response - Raw API response from backend
	 * @returns {Object} Normalized response with items, freeItems, appliedRules,
	 *                   and headerDiscount (transaction-scope discount).
	 *
	 * IMPORTANT: No fallback for appliedRules - we trust the backend's response.
	 * If backend returns empty applied_pricing_rules, it means NO offers were applied.
	 * Previously we had a fallback that caused false "applied" status.
	 */
	function parseOfferResponse(response) {
		const payload = response?.message || response || {};

		return {
			items: Array.isArray(payload.items) ? payload.items : [],
			freeItems: Array.isArray(payload.free_items) ? payload.free_items : [],
			// CRITICAL: Only trust explicitly returned rules - NO FALLBACK
			// If backend doesn't return applied_pricing_rules, NO offers were applied
			//// Neoffice — from here down to setBypassRuleDiscount: apply_offers also returns a
			//// transaction-scope (apply_on=Transaction) header discount, already resolved to an amount
			//// server-side. parseOfferResponse surfaces it, applyHeaderDiscountFromServer writes it into
			//// ruleHeaderDiscount — never into the coupon-driven additionalDiscount — and
			//// setBypassRuleDiscount hands the header discount to the cashier for one ticket and gives it
			//// back to the rule on the next recompute (44ea4e9a, 2026-07-09 "apply transaction-level rule
			//// discount in the cart"; 4d61216b, same day, adds the checkbox). The re-wrap of appliedRules
			//// itself is the Biome pass (458d81a9, 2026-03-20).
			appliedRules: Array.isArray(payload.applied_pricing_rules)
				? payload.applied_pricing_rules
				: [],
			// Header-level (transaction-scope) discount surfaced by the server when an
			// apply_on=Transaction Price rule fires. discountAmount is the resolved
			// SAR amount (already computed from % if the rule is percentage-based).
			// Zero/empty when no such rule applies.
			headerDiscount: {
				discountAmount: Number.parseFloat(payload.discount_amount) || 0,
				applyDiscountOn: payload.apply_discount_on || null,
			},
		};
	}

	//// Neoffice — upstream v2.0.0 ships the same transaction-rule header discount (8e6bc21c,
	//// 2026-05-14), but writes it into additionalDiscount — the field a coupon, a gift card or a
	//// manual discount also lives in — so the rule wiped what the cashier had typed. Ours keeps the
	//// rule amount in its own ruleHeaderDiscount, which is the header discount while the rule
	//// applies (useInvoice's effectiveHeaderDiscount; the coupon stays stored underneath), and
	//// lets the cashier hand the ticket back to a manual discount (setBypassRuleDiscount below;
	//// 44ea4e9a and 4d61216b, 2026-07-09). Upstream develop still writes it into additionalDiscount
	//// (through offerHeaderDiscount) and now drops a whole-cart coupon when a rule fires; ours keeps
	//// the coupon applied underneath the rule, so offerHeaderDiscount stays 0 here (see its
	//// declaration).
	//// apply the transaction-level rule discount (feature b) into its own ref
	// so it never collides with the coupon-driven additionalDiscount. When the
	// cashier has bypassed the rule on this ticket, we ignore the server value
	// and leave their manual/coupon additionalDiscount in charge.
	function applyHeaderDiscountFromServer(headerDiscount) {
		//// Neoffice — feat(offers): apply transaction-level rule discount in the cart (feature b, core) (44ea4e9a, 2026-07-09).
		if (bypassRuleDiscount.value) {
			// Cashier owns the header discount on this ticket — never overwrite.
			return;
		}
		//// Neoffice — feat(offers): apply transaction-level rule discount in the cart (feature b, core) (44ea4e9a, 2026-07-09).
		const amount = Number.parseFloat(headerDiscount?.discountAmount) || 0;
		if (ruleHeaderDiscount.value !== amount) {
			ruleHeaderDiscount.value = amount;
			rebuildIncrementalCache();
		}
	}

	//// Neoffice — feat(offers): apply transaction-level rule discount in the cart (feature b, core) (44ea4e9a, 2026-07-09).
	// Toggle the per-ticket "cashier may override the rule discount" flag. When
	// enabled the transaction rule stops driving the header discount and the
	// cashier's manual/coupon additionalDiscount takes over; when disabled the
	// rule regains control on the next offer recompute.
	function setBypassRuleDiscount(enabled) {
		bypassRuleDiscount.value = !!enabled;
		if (bypassRuleDiscount.value) {
			// Hand control to the cashier: drop the rule-driven amount so their
			// manual/coupon additionalDiscount takes over.
			ruleHeaderDiscount.value = 0;
			rebuildIncrementalCache();
		} else if (invoiceItems.value.length > 0) {
			// Rule regains control: recompute offers so it re-applies immediately.
			triggerOfferProcessing(true);
		} else {
			rebuildIncrementalCache();
		}
	}
	//// Neoffice — a deletion git aligns here: upstream develop ends applyHeaderDiscountFromServer with
	//// `additionalDiscount.value = offerHeaderDiscount.value`, not taken — the rule's amount never goes
	//// into the coupon / manual additionalDiscount (see applyHeaderDiscountFromServer above).

	function getAppliedOfferCodes() {
		return appliedOffers.value.map((entry) => entry.code);
	}

	function filterActiveOffers(appliedRuleNames = []) {
		if (!Array.isArray(appliedRuleNames) || appliedRuleNames.length === 0) {
			appliedOffers.value = [];
			return;
		}

		appliedOffers.value = appliedOffers.value.filter((entry) =>
			appliedRuleNames.includes(entry.code)
		);
	}

	async function applyOffer(offer, currentProfile, offersDialogRef = null) {
		if (!offer) {
			console.error("No offer provided");
			offersDialogRef?.resetApplyingState();
			return false;
		}

		const offerCode = offer.name;
		const existingCodes = getAppliedOfferCodes();
		const alreadyApplied = existingCodes.includes(offerCode);

		if (alreadyApplied) {
			return await removeOffer(offerCode, currentProfile, offersDialogRef);
		}

		if (!posProfile.value || invoiceItems.value.length === 0) {
			showWarning(__("Add items to the cart before applying an offer."));
			offersDialogRef?.resetApplyingState();
			return false;
		}

		// Cancel any pending auto-processing since user is manually applying
		debouncedProcessOffers.cancel();
		offerQueue.cancel();

		let result = false;

		await offerQueue.enqueue(async (signal) => {
			// Check if operation was cancelled
			if (signal?.aborted) return;

			try {
				offerProcessingState.value.isProcessing = true;
				offerProcessingState.value.error = null;

				const invoiceData = buildOfferEvaluationPayload(currentProfile);
				const offerNames = [...new Set([...existingCodes, offerCode])];

				const response = await applyOffersResource.submit({
					invoice_data: invoiceData,
					selected_offers: offerNames,
				});

				// Check if cancelled during API call
				if (signal?.aborted) return;

				//// Neoffice — headerDiscount added to the destructuring: the apply-offer path has to read the
				//// transaction-rule amount back out of the response and push it into ruleHeaderDiscount, or
				//// the rule fires server-side and the cart shows no discount at all (44ea4e9a, 2026-07-09).
				//// The re-wrap of the destructuring itself is the Biome pass (458d81a9, 2026-03-20).
				const {
					items: responseItems,
					freeItems,
					appliedRules,
					headerDiscount,
				} = parseOfferResponse(response);
				//// Resolve race condition causing offer applied but cart not updating — 248de8f

				applyDiscountsFromServer(responseItems);
				processFreeItems(freeItems);
				applyHeaderDiscountFromServer(headerDiscount);
				filterActiveOffers(appliedRules);

				const offerApplied = appliedRules.includes(offerCode);

				if (!offerApplied) {
					// No new offer applied - restore previous state without new offer
					if (existingCodes.length) {
						try {
							const rollbackResponse = await applyOffersResource.submit({
								invoice_data: invoiceData,
								selected_offers: existingCodes,
							});
							const {
								items: rollbackItems,
								freeItems: rollbackFreeItems,
								appliedRules: rollbackRules,
								headerDiscount: rollbackHeaderDiscount,
							} = parseOfferResponse(rollbackResponse);

							applyDiscountsFromServer(rollbackItems);
							processFreeItems(rollbackFreeItems);
							applyHeaderDiscountFromServer(rollbackHeaderDiscount);
							filterActiveOffers(rollbackRules);
						} catch (rollbackError) {
							console.error("Error rolling back offers:", rollbackError);
						}
					}

					//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
					showWarning(__("Your cart doesn't meet the requirements for this offer."));
					offersDialogRef?.resetApplyingState();
					result = false;
					return;
				}

				const offerRuleCodes = appliedRules.includes(offerCode)
					? appliedRules.filter((ruleName) => ruleName === offerCode)
					: [offerCode];

				const updatedEntries = appliedOffers.value.filter(
					(entry) => entry.code !== offerCode
				);
				updatedEntries.push({
					name: offer.title || offer.name,
					code: offerCode,
					offer, // Store full offer object for validation
					source: "manual",
					applied: true,
					rules: offerRuleCodes,
					// Store constraints for quick validation
					min_qty: offer.min_qty,
					max_qty: offer.max_qty,
					min_amt: offer.min_amt,
					max_amt: offer.max_amt,
				});
				appliedOffers.value = updatedEntries;

				offerProcessingState.value.lastProcessedAt = Date.now();

				// Wait for Vue reactivity to propagate before showing toast
				await nextTick();

				//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
				showSuccess(__("{0} applied successfully", [offer.title || offer.name]));
				result = true;
			} catch (error) {
				if (signal?.aborted) return;
				console.error("Error applying offer:", error);
				offerProcessingState.value.error = error.message;
				showError(__("Failed to apply offer. Please try again."));
				offersDialogRef?.resetApplyingState();
				result = false;
			} finally {
				offerProcessingState.value.isProcessing = false;
			}
		});

		return result;
	}

	async function removeOffer(offer, currentProfile = null, offersDialogRef = null) {
		const offerCode = typeof offer === "string" ? offer : offer?.name || offer?.code;

		// Cancel any pending auto-processing
		debouncedProcessOffers.cancel();

		if (!offerCode) {
			// Remove all offers - immediate operation, no queue needed
			offerQueue.cancel();

			appliedOffers.value = [];
			processFreeItems([]); // Remove all free items
			//// Neoffice — clearing the offers must also drop the transaction-rule discount, or the
			//// header amount survives with no rule behind it (44ea4e9a, 2026-07-09). Through
			//// applyHeaderDiscountFromServer(null) like upstream develop, which clears our
			//// ruleHeaderDiscount and leaves a coupon, gift card or manual discount in place:
			//// the removeDiscount() we kept here wiped them too (merge of 2026-10-28).
			applyHeaderDiscountFromServer(null);
			await nextTick();
			showSuccess(__("Offer has been removed from cart"));
			offersDialogRef?.resetApplyingState();
			return true;
		}

		const remainingOffers = appliedOffers.value.filter((entry) => entry.code !== offerCode);
		const remainingCodes = remainingOffers.map((entry) => entry.code);

		if (remainingCodes.length === 0) {
			// All offers removed - immediate operation
			offerQueue.cancel();

			appliedOffers.value = [];
			processFreeItems([]); // Remove all free items
			//// Neoffice — same on the "last offer removed" path: no rule left, no rule discount
			//// (44ea4e9a, 2026-07-09), and the coupon / manual discount stays (see above).
			applyHeaderDiscountFromServer(null);
			await nextTick();
			showSuccess(__("Offer has been removed from cart"));
			offersDialogRef?.resetApplyingState();
			return true;
		}

		let result = false;

		await offerQueue.enqueue(async (signal) => {
			if (signal?.aborted) return;

			try {
				offerProcessingState.value.isProcessing = true;
				offerProcessingState.value.error = null;

				const invoiceData = buildOfferEvaluationPayload(currentProfile);

				const response = await applyOffersResource.submit({
					invoice_data: invoiceData,
					selected_offers: remainingCodes,
				});

				if (signal?.aborted) return;

				//// Neoffice — parseOfferResponse now also returns the server's header discount
				//// (discount_amount / apply_discount_on), which upstream's response shape ignored
				//// (44ea4e9a, 2026-07-09). The re-wrap of the destructuring is the Biome pass.
				const {
					items: responseItems,
					freeItems,
					appliedRules,
					headerDiscount,
				} = parseOfferResponse(response);

				applyDiscountsFromServer(responseItems);
				processFreeItems(freeItems);
				applyHeaderDiscountFromServer(headerDiscount);
				filterActiveOffers(appliedRules);

				appliedOffers.value = appliedOffers.value.filter((entry) =>
					remainingCodes.includes(entry.code)
				);

				offerProcessingState.value.lastProcessedAt = Date.now();

				await nextTick();
				showSuccess(__("Offer has been removed from cart"));
				offersDialogRef?.resetApplyingState();
				result = true;
			} catch (error) {
				if (signal?.aborted) return;
				console.error("Error removing offer:", error);
				offerProcessingState.value.error = error.message;
				showError(__("Failed to update cart after removing offer."));
				offersDialogRef?.resetApplyingState();
				result = false;
			} finally {
				offerProcessingState.value.isProcessing = false;
			}
		});

		return result;
	}

	//// Refactor reapplyOffer fn to Do everything in ONE synchronized pipeline — 752af25
	/**
	 * Validates applied offers and removes invalid ones when cart changes.
	 * This function is called from processOffersInternal - it does NOT manage
	 * @param {Object} currentProfile - Current POS profile
	 * @param {AbortSignal} signal - Optional abort signal for cancellation
	 * @returns {boolean} True if any offers were removed
	 */
	async function reapplyOffer(currentProfile, signal = null) {
		// Clear offers if cart is empty
		if (invoiceItems.value.length === 0 && appliedOffers.value.length) {
			appliedOffers.value = [];
			processFreeItems([]); // Remove all free items when cart is empty
			//// Neoffice — an empty cart has no rule to apply, so the rule discount goes with the
			//// offers (44ea4e9a, 2026-07-09).
			ruleHeaderDiscount.value = 0; // clear any transaction-rule header discount
			return true;
		}

		// Only validate if there are applied offers
		if (appliedOffers.value.length === 0 || invoiceItems.value.length === 0) {
			return false;
		}

		// Check if operation was cancelled
		if (signal?.aborted) return false;

		try {
			// Build current cart snapshot for validation
			const cartSnapshot = buildCartSnapshot();

			// Check each applied offer against current cart state
			const invalidOffers = [];
			for (const appliedOffer of appliedOffers.value) {
				const offer = appliedOffer.offer;
				if (!offer) continue;

				// Use offersStore to check eligibility
				offersStore.updateCartSnapshot(cartSnapshot);
				const { eligible, reason } = offersStore.checkOfferEligibility(offer);

				if (!eligible) {
					invalidOffers.push({
						...appliedOffer,
						//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
						reason,
					});
				}
			}

			// Check for cancellation
			if (signal?.aborted) return false;

			// If any offers are invalid, remove them and reapply remaining
			if (invalidOffers.length > 0) {
				const validOfferCodes = appliedOffers.value
					//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
					.filter((o) => !invalidOffers.find((inv) => inv.code === o.code))
					.map((o) => o.code);

				if (validOfferCodes.length === 0) {
					// All offers invalid - clear everything
					appliedOffers.value = [];
					processFreeItems([]);
					//// Neoffice — when every applied offer turns out invalid the rule discount is invalid too
					//// (44ea4e9a, 2026-07-09).
					ruleHeaderDiscount.value = 0; // clear any transaction-rule header discount

					// Reset all item rates to original (remove discounts)
					//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
					invoiceItems.value.forEach((item) => {
						if (dropPromotionUnderCoupon(item)) return;
						if (item.pricing_rules && item.pricing_rules.length > 0) {
							item.discount_percentage = 0;
							item.discount_amount = 0;
							item.pricing_rules = [];
							item.is_already_discounted = 0;
							item.is_accumulative_discount = 0;
							recalculateItem(item);
						}
					});
					rebuildIncrementalCache();
				} else {
					// Reapply only valid offers
					const invoiceData = buildOfferEvaluationPayload(currentProfile);
					const response = await applyOffersResource.submit({
						invoice_data: invoiceData,
						selected_offers: validOfferCodes,
					});

					if (signal?.aborted) return false;

					//// Neoffice — headerDiscount read from the re-validation response as well; the re-wrap of
					//// the destructuring itself is the Biome pass (44ea4e9a, 2026-07-09).
					const {
						items: responseItems,
						freeItems,
						appliedRules,
						headerDiscount,
					} = parseOfferResponse(response);

					applyDiscountsFromServer(responseItems);
					processFreeItems(freeItems);
					applyHeaderDiscountFromServer(headerDiscount);
					filterActiveOffers(appliedRules);

					// Update appliedOffers to only include valid ones
					//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
					appliedOffers.value = appliedOffers.value.filter((entry) =>
						appliedRules.includes(entry.code)
					);
				}

				// Wait for Vue to update before showing toast
				await nextTick();

				// The line's saving row disappears; the offers popup lists what the cart lacks
				rememberRemovedOffers(invalidOffers);
				return true;
			}
			return false;
		} catch (error) {
			if (signal?.aborted) return false;
			console.error("Error validating offers:", error);
			offerProcessingState.value.error = error.message;
			return false;
		}
	}

	/**
	 * Apply offers when offline using cached offer data.
	 * Calculates discounts client-side based on offer rules.
	 *
	 * In offline mode, we:
	 * 1. Check eligibility using posOffers.checkOfferEligibility
	 * 2. Apply discount percentage/amount directly to cart items
	 * 3. Handle free items (product discounts) via dedicated is_free_item rows (same as online)
	 * 4. Mark offers as applied (with source: "offline")
	 *
	 * Supports:
	 * - Discount Percentage (e.g., 10% off)
	 * - Discount Amount (e.g., $5 off)
	 * - Free Items (e.g., Buy 2 Get 1 Free)
	 */
	function applyOffersOffline() {
		// Skip if cart is empty or no offers available
		if (invoiceItems.value.length === 0 || !offersStore.hasFetched) {
			return;
		}

		// Verify we're actually offline
		if (!offlineState.isOffline) {
			return; // Use online mode instead
		}

		try {
			// Build current cart snapshot
			const cartSnapshot = buildCartSnapshot();
			offersStore.updateCartSnapshot(cartSnapshot);

			// Get eligible auto offers
			const eligibleOffers = offersStore.autoEligibleOffers;

			if (eligibleOffers.length === 0) {
				return;
			}

			// Find new offers to apply (both price and product discounts)
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			const appliedOfferCodes = new Set(appliedOffers.value.map((o) => o.code));
			const newOffers = eligibleOffers.filter((offer) => !appliedOfferCodes.has(offer.name));

			if (newOffers.length === 0) {
				return;
			}

			const newlyAppliedOffers = [];

			const orderedOffers = [...newOffers].sort(
				(a, b) => offerStrategyOrder(b) - offerStrategyOrder(a)
			);

			for (const offer of orderedOffers) {
				// Determine offer type: "Item Price" (discount) or "Give Product" (free item)
				//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
				const isProductDiscount = offer.offer === "Give Product";

				// Find eligible items based on offer.apply_on
				let eligibleItems = [];

				//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
				if (offer.apply_on === "Item Code") {
					const eligibleCodes = offer.eligible_items || [];
					eligibleItems = invoiceItems.value.filter((item) =>
						eligibleCodes.includes(item.item_code)
					);
					//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
				} else if (offer.apply_on === "Item Group") {
					const eligibleGroups = offer.eligible_item_groups || [];
					eligibleItems = eligibleGroups.includes("All Item Groups")
						? invoiceItems.value
						: invoiceItems.value.filter((item) =>
								eligibleGroups.includes(item.item_group)
							);
				} else if (offer.apply_on === "Brand") {
					const eligibleBrands = offer.eligible_brands || [];
					eligibleItems = invoiceItems.value.filter((item) =>
						eligibleBrands.includes(item.brand)
					);
					//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
				} else if (offer.apply_on === "Transaction") {
					// Transaction-level discount applies to all items
					eligibleItems = invoiceItems.value;
				}

				if (eligibleItems.length === 0) continue;

				let offerApplied = false;

				if (isProductDiscount) {
					// === PRODUCT DISCOUNT (FREE ITEMS) ===
					// Paid lines only: free gift rows must not qualify for (or seed) more gifts
					offerApplied = applyOfflineFreeItem(
						offer,
						eligibleItems.filter((item) => !item.is_free_item)
					);
				} else {
					// === PRICE DISCOUNT ===
					offerApplied = applyOfflinePriceDiscount(offer, eligibleItems);
				}

				if (offerApplied) {
					// Mark offer as applied
					appliedOffers.value.push({
						name: offer.title || offer.name,
						code: offer.name,
						offer,
						source: "offline",
						applied: true,
						rules: [offer.name],
						min_qty: offer.min_qty,
						max_qty: offer.max_qty,
						min_amt: offer.min_amt,
						max_amt: offer.max_amt,
					});

					newlyAppliedOffers.push(offer.title || offer.name);
				}
			}

			// Rebuild cache after bulk changes
			if (newlyAppliedOffers.length > 0) {
				rebuildIncrementalCache();
				//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
				showSuccess(__("Offline: {0} applied", [newlyAppliedOffers.join(", ")]));
			}
		} catch (error) {
			console.error("Error applying offers offline:", error);
		}
	}

	/**
	 * Apply price discount (percentage or amount) to eligible items offline
	 * @param {Object} offer - The offer to apply
	 * @param {Array} eligibleItems - Items eligible for the discount
	 * @returns {boolean} True if discount was applied
	 */
	function applyOfflinePriceDiscount(offer, eligibleItems) {
		const strategy = getStrategyForOffer(offer);
		if (strategy) {
			return strategy.apply(offer, eligibleItems, { recalculateItem });
		}

		const discountType = offer.discount_type || offer.rate_or_discount;
		const discountPercentage = Number.parseFloat(offer.discount_percentage) || 0;
		const discountAmount = Number.parseFloat(offer.discount_amount) || 0;
		const rate = Number.parseFloat(offer.rate) || 0;

		let applied = false;

		for (const item of eligibleItems) {
			const stacks =
				offer.promotion_type === "Auto Discount" && allowsAutoDiscountStacking(item);

			if (offer.promotion_type === "Auto Discount" && item.is_already_discounted && !stacks) {
				continue;
			}

			// Only apply if no existing pricing rule
			if (item.pricing_rules && item.pricing_rules.length > 0 && !stacks) continue;

			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			if (discountType === "Discount Percentage" && discountPercentage > 0) {
				if (stacks) {
					const base = Number.parseFloat(item.discount_percentage) || 0;
					const itemMax = Number.parseFloat(item.max_discount) || 0;
					const total = base + discountPercentage;
					item.discount_percentage = Math.min(total, itemMax > 0 ? itemMax : 100, 100);
					item.pricing_rules = [...(item.pricing_rules || []), offer.name];
				} else {
					item.discount_percentage = discountPercentage;
					item.pricing_rules = [offer.name];
				}
				recalculateItem(item);
				applied = true;
				//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			} else if (discountType === "Discount Amount" && discountAmount > 0) {
				if (stacks) {
					// Accumulate, capped at the line's own value (never discount below zero).
					const effectiveRate =
						item.is_rate_manually_edited === 1
							? item.rate
							: item.price_list_rate || item.rate;
					const baseAmount =
						(Number.parseFloat(item.quantity) || 0) * (Number.parseFloat(effectiveRate) || 0);
					const existing = Number.parseFloat(item.discount_amount) || 0;
					item.discount_amount = Math.min(existing + discountAmount, baseAmount);
					item.pricing_rules = [...(item.pricing_rules || []), offer.name];
				} else {
					item.discount_amount = discountAmount;
					item.pricing_rules = [offer.name];
				}
				recalculateItem(item);
				applied = true;
				//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			} else if (discountType === "Rate" && rate > 0) {
				if (stacks) {
					// Two fixed-rate overrides can't be added together — combining them
					// means the customer keeps whichever is more favorable (lower).
					const currentRate = Number.parseFloat(item.rate);
					item.rate = Number.isFinite(currentRate) ? Math.min(currentRate, rate) : rate;
					item.pricing_rules = [...(item.pricing_rules || []), offer.name];
				} else {
					item.rate = rate;
					item.pricing_rules = [offer.name];
				}
				recalculateItem(item);
				applied = true;
			}
		}

		return applied;
	}

	/**
	 * Apply free item (product discount) offer offline
	 * Handles: same_item (free item = purchased item) or specific free_item
	 *
	 * Satellite product types (Gift Pool, GWP) register via offerStrategies —
	 * this host only owns the plain free-item paths.
	 *
	 * Recursive logic:
	 * - recurse_for: Give free item for every N quantity
	 * - apply_recursion_over: Qty for which recursion isn't applicable
	 * - Example: recurse_for=2, apply_recursion_over=0, free_qty=1
	 *   -> For 6 items: (6-0)/2 * 1 = 3 free items
	 *
	 * @param {Object} offer - The offer to apply
	 * @param {Array} eligibleItems - Items eligible for the free item
	 * @returns {boolean} True if free item was applied
	 */
	function applyOfflineFreeItem(offer, eligibleItems) {
		const strategy = getProductStrategyForOffer(offer);
		if (strategy) {
			return strategy.apply(offer, eligibleItems, {
				recalculateItem,
				invoiceItems: invoiceItems.value,
			});
		}
		const freeQty = Number.parseFloat(offer.free_qty) || 0;
		const sameItem = offer.same_item === 1;
		const isRecursive = offer.is_recursive === 1;
		const recurseFor = Number.parseFloat(offer.recurse_for) || 0;
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		const applyRecursionOver = Number.parseFloat(offer.apply_recursion_over) || 0;
		const freeItemCode = offer.free_item;

		if (freeQty <= 0) return false;

		let applied = false;

		if (sameItem) {
			// Free item is the same as the purchased item
			// E.g., "Buy 2 Get 1 Free" - the free item is the same item
			for (const item of eligibleItems) {
				let freeItemsToGive = freeQty;
				const minQty = Number.parseFloat(offer.min_qty) || 0;

				// Mirrors posnext_promotions get_gwp_same_item_free_qty: paid qty must
				// meet min_qty; the gift is added on top (never carved from paid qty).
				if (minQty > 0 && item.quantity < minQty) {
					freeItemsToGive = 0;
				} else if (isRecursive && recurseFor > 0) {
					// Recursive: for every recurseFor quantity, give freeQty free
					// Formula: floor((qty - apply_recursion_over) / recurse_for) * free_qty
					// E.g., Buy 2 Get 1 Free: recurse_for=2, free_qty=1
					//   For 6 items: floor((6-0)/2) * 1 = 3 free items
					const effectiveQty = Math.max(0, item.quantity - applyRecursionOver);
					const multiplier = Math.floor(effectiveQty / recurseFor);
					freeItemsToGive = multiplier * freeQty;
				} else if (!isRecursive && offer.min_qty > 0) {
					// Non-recursive: just check if min_qty is met, give freeQty once
					// E.g., Buy 2 Get 1 Free (non-recursive): for 6 items, still give 1 free
					if (item.quantity >= offer.min_qty) {
						freeItemsToGive = freeQty;
					} else {
						freeItemsToGive = 0;
					}
				}

				if (freeItemsToGive <= 0) {
					continue;
				}
				const uomKey = item.uom || item.stock_uom;
				const existingFreeRow = invoiceItems.value.find(
					(r) =>
						r.is_free_item &&
						r.item_code === item.item_code &&
						(r.uom || r.stock_uom) === uomKey
				);
				if (existingFreeRow) {
					existingFreeRow.quantity = freeItemsToGive;
					existingFreeRow.free_qty = freeItemsToGive;
					const prArr = normalizePricingRules(existingFreeRow.pricing_rules);
					if (!prArr.includes(offer.name)) prArr.push(offer.name);
					existingFreeRow.pricing_rules = prArr;
				} else {
					invoiceItems.value.push({
						item_code: item.item_code,
						item_name: item.item_name || item.item_code,
						rate: 0,
						price_list_rate: 0,
						quantity: freeItemsToGive,
						discount_amount: 0,
						discount_percentage: 0,
						tax_amount: 0,
						amount: 0,
						stock_qty: 0,
						uom: uomKey,
						stock_uom: item.stock_uom || uomKey,
						conversion_factor: item.conversion_factor || 1,
						is_free_item: 1,
						free_qty: freeItemsToGive,
						pricing_rules: [offer.name],
						warehouse: item.warehouse,
						sales_person: item.sales_person || null,
						sales_person_name: item.sales_person_name || null,
					});
				}
				applied = true;
			}
		} else if (freeItemCode) {
			// Free item is a specific different item
			// Find if the free item is already in the cart
			const freeItemInCart = invoiceItems.value.find(
				//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
				(item) => item.item_code === freeItemCode
			);

			if (freeItemInCart) {
				// Calculate free qty (same recursive logic applies)
				let freeItemsToGive = freeQty;

				if (isRecursive && recurseFor > 0) {
					// Calculate based on total eligible quantity
					const totalEligibleQty = eligibleItems.reduce(
						//// Neoffice — Biome reformat only: the reduce() call and the Math.max() below were
						//// re-wrapped, nothing changed (458d81a9, 2026-03-20).
						(sum, item) => sum + (item.quantity || 0),
						0
					);
					const effectiveQty = Math.max(
						0,
						totalEligibleQty - applyRecursionOver
						//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
					);
					const multiplier = Math.floor(effectiveQty / recurseFor);
					freeItemsToGive = multiplier * freeQty;
				}

				// Mark existing cart item as having free quantity
				//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
				if (
					freeItemsToGive > 0 &&
					(!freeItemInCart.free_qty || freeItemInCart.free_qty === 0)
				) {
					freeItemInCart.free_qty = freeItemsToGive;
					freeItemInCart.pricing_rules = freeItemInCart.pricing_rules || [];
					if (!freeItemInCart.pricing_rules.includes(offer.name)) {
						freeItemInCart.pricing_rules.push(offer.name);
					}
					applied = true;
				}
			}
			// Note: We don't add new items to cart offline - that would require
			// fetching item details. The free item will be added when back online.
		}

		return applied;
	}

	/**
	 * Gross and net amount of a single cart line, on the same basis the server
	 * uses when gating min_amt/max_amt.
	 *
	 * Mirrors buildOfferEvaluationPayload (which sends
	 * `price_list_rate: item.price_list_rate || item.rate`) and the net-rate
	 * derivation in apply_offers, which folds item discounts back into the
	 * pricing items as `price_list_rate * (1 - discount_percentage / 100)`
	 * before handing the cart total to ERPNext's transaction engine.
	 */
	function offerLineAmounts(item) {
		const qty = item.quantity || 0;
		const listRate = Number.parseFloat(item.price_list_rate || item.rate) || 0;
		const gross = qty * listRate;
		const discountPct = Number.parseFloat(item.discount_percentage) || 0;
		return { gross, net: gross * (1 - discountPct / 100) };
	}

	/** Cart total after item-level discounts — the server's `doc.total`. */
	function offerNetSubtotal(items) {
		return items.reduce((sum, item) => sum + offerLineAmounts(item).net, 0);
	}

	/**
	 * Builds cart snapshot for offer validation.
	 * Paid lines only — free gifts must not inflate min_qty/max_qty/min_amt checks.
	 */
	function buildCartSnapshot() {
		const items = withCarvedQtyRestored(invoiceItems.value).filter((item) => !item.is_free_item);
		const totalQty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		const itemCodes = items.map((item) => item.item_code);
		const itemGroups = items.map((item) => item.item_group).filter(Boolean);
		const brands = items.map((item) => item.brand).filter(Boolean);

		// Build quantity maps for accurate offer validation
		// itemQuantities: { item_code: total_qty } - quantity per item code
		const itemQuantities = {};
		// itemGroupQuantities: { item_group: total_qty } - quantity per item group
		const itemGroupQuantities = {};
		// brandQuantities: { brand: total_qty } - quantity per brand
		const brandQuantities = {};
		// Gross line amounts (qty * price_list_rate) per scope, for min_amt/max_amt
		const itemAmounts = {};
		const itemGroupAmounts = {};
		const brandAmounts = {};

		for (const item of items) {
			const qty = item.quantity || 0;
			const { gross } = offerLineAmounts(item);

			// Aggregate by item code
			if (item.item_code) {
				//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
				itemQuantities[item.item_code] = (itemQuantities[item.item_code] || 0) + qty;
				itemAmounts[item.item_code] = (itemAmounts[item.item_code] || 0) + gross;
			}

			// Aggregate by item group
			if (item.item_group) {
				//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
				itemGroupQuantities[item.item_group] =
					(itemGroupQuantities[item.item_group] || 0) + qty;
				itemGroupAmounts[item.item_group] =
					(itemGroupAmounts[item.item_group] || 0) + gross;
			}

			// Aggregate by brand
			if (item.brand) {
				brandQuantities[item.brand] = (brandQuantities[item.brand] || 0) + qty;
				brandAmounts[item.brand] = (brandAmounts[item.brand] || 0) + gross;
			}
		}

		return {
			subtotal: subtotal.value,
			itemCount: totalQty,
			itemCodes: [...new Set(itemCodes)],
			itemGroups: [...new Set(itemGroups)],
			brands: [...new Set(brands)],
			// Quantity maps for accurate min_qty/max_qty validation
			itemQuantities,
			itemGroupQuantities,
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			brandQuantities,
			// Amount bases for min_amt/max_amt validation
			netSubtotal: offerNetSubtotal(items),
			itemAmounts,
			itemGroupAmounts,
			brandAmounts,
		};
	}

	/**
	 * Find a cart item by item_code and optionally by UOM
	 * @param {string} itemCode - Item code to find
	 * @param {string|null} uom - Optional UOM to match
	 * @returns {Object|undefined} Cart item or undefined
	 */
	function findCartItem(itemCode, uom = null, isFreeItem = undefined) {
		return invoiceItems.value.find((item) => {
			if (item.item_code !== itemCode) return false;
			if (uom && item.uom !== uom) return false;
			// When same SKU has paid + free rows, match the intended line.
			if (
				isFreeItem !== undefined &&
				Boolean(item.is_free_item) !== Boolean(isFreeItem)
			) {
				return false;
			}
			return true;
		});
	}

	/**
	 * Find an existing cart item with target UOM (for merge detection)
	 * @param {string} itemCode - Item code
	 * @param {string} targetUom - Target UOM to find
	 * @param {Object} excludeItem - Item to exclude from search
	 * @returns {Object|undefined} Existing item or undefined
	 */
	function findItemWithUom(itemCode, targetUom, excludeItem = null) {
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		return invoiceItems.value.find(
			(item) =>
				item.item_code === itemCode &&
				item.uom === targetUom &&
				item !== excludeItem &&
				// Never merge a paid line into (or from) a free promo row
				!item.is_free_item &&
				!excludeItem?.is_free_item
		);
	}

	/**
	 * Remove an item from the cart
	 * @param {Object} cartItem - Item to remove
	 */
	function removeCartItem(cartItem) {
		const index = invoiceItems.value.indexOf(cartItem);
		if (index > -1) {
			invoiceItems.value.splice(index, 1);
		}
	}

	/**
	 * Merge source item into target item
	 * @param {Object} sourceItem - Item to merge from (will be removed)
	 * @param {Object} targetItem - Item to merge into
	 * @param {number} quantity - Quantity to add to target
	 * @returns {number} New total quantity
	 */
	function mergeItems(sourceItem, targetItem, quantity) {
		targetItem.quantity += quantity;
		recalculateItem(targetItem);
		removeCartItem(sourceItem);
		rebuildIncrementalCache();
		return targetItem.quantity;
	}

	/**
	 * Apply UOM metadata and pricing.
	 * Free / promo / manually-edited rates must NOT be replaced from the price
	 * list — that path bypasses the same lock as free-item rate editing (#1/#5).
	 * @param {Object} cartItem - Cart item to update
	 * @param {string} newUom - New UOM
	 * @param {number} qty - Quantity for pricing
	 */
	async function applyUomChange(cartItem, newUom, qty) {
		if (isFreePromoRow(cartItem)) {
			throw new Error(__("Free promotional items cannot be edited"));
		}

		const uomData = cartItem.item_uoms?.find((u) => u.uom === newUom);
		const conversionFactor = uomData?.conversion_factor || 1;
		const oldConversion = cartItem.conversion_factor || 1;

		cartItem.uom = newUom;
		cartItem.conversion_factor = conversionFactor;

		if (shouldPreserveRateOnUomChange(cartItem)) {
			cartItem.rate = scaleRateForUomChange(cartItem.rate, oldConversion, conversionFactor);
			cartItem.price_list_rate = scaleRateForUomChange(
				cartItem.price_list_rate,
				oldConversion,
				conversionFactor
			);
			return;
		}

		const pricing = await resolveUomPricing(cartItem, newUom, conversionFactor, qty);
		cartItem.rate = pricing.rate;
		cartItem.price_list_rate = pricing.price_list_rate;
	}

	/**
	 * Change item UOM - merges if target UOM already exists
	 * @param {string} itemCode - Item code
	 * @param {string} newUom - New UOM to change to
	 * @param {string|null} currentUom - Current UOM (required when same item has multiple UOMs)
	 */
	async function changeItemUOM(itemCode, newUom, currentUom = null) {
		try {
			const cartItem = findCartItem(itemCode, currentUom, false);
			if (!cartItem || cartItem.uom === newUom) return;
			if (isFreePromoRow(cartItem)) {
				showError(__("Free promotional items cannot be edited"));
				return;
			}

			// Check for existing item to merge with
			const existingItem = findItemWithUom(itemCode, newUom, cartItem);
			if (existingItem) {
				const totalQty = mergeItems(cartItem, existingItem, cartItem.quantity);
				//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
				showSuccess(__("Merged into {0} (Total: {1})", [newUom, totalQty]));
				return;
			}

			// Apply UOM change
			await applyUomChange(cartItem, newUom, cartItem.quantity);
			recalculateItem(cartItem);
			rebuildIncrementalCache();
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			showSuccess(__("Unit changed to {0}", [newUom]));
		} catch (error) {
			console.error("Error changing UOM:", error);
			showError(parseError(error) || __("Failed to update UOM. Please try again."));
		}
	}

	/**
	 * Update item details - handles UOM changes with merging
	 * @param {string} itemCode - Item code
	 * @param {Object} updates - Updated details
	 * @param {string|null} currentUom - Current UOM (required when same item has multiple UOMs)
	 */
	async function updateItemDetails(itemCode, updates, currentUom = null) {
		try {
			const cartItem = findCartItem(itemCode, currentUom, updates?.is_free_item);
			if (!cartItem) {
				throw new Error("Item not found in cart");
			}

			// Free / GWP rows are owned by the promotion engine — refuse
			// cashier edits that would inflate free qty or change rate/UOM.
			if (cartItem.is_free_item) {
				throw new Error(__("Free promotional items cannot be edited"));
			}

			// Handle UOM change with potential merge
			if (updates.uom && updates.uom !== cartItem.uom) {
				const existingItem = findItemWithUom(itemCode, updates.uom, cartItem);
				if (existingItem) {
					const qtyToMerge = updates.quantity ?? cartItem.quantity;
					const totalQty = mergeItems(cartItem, existingItem, qtyToMerge);
					//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
					showSuccess(__("Merged into {0} (Total: {1})", [updates.uom, totalQty]));
					return true;
				}

				// Apply UOM change with new rate
				try {
					//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
					await applyUomChange(
						cartItem,
						updates.uom,
						updates.quantity ?? cartItem.quantity
					);
				} catch {
					// Fallback: just change UOM without rate update
					cartItem.uom = updates.uom;
				}
			}

			// Validate stock if quantity is being increased
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			if (
				updates.quantity !== undefined &&
				updates.quantity > cartItem.quantity &&
				settingsStore.shouldEnforceStockValidation() &&
				shouldValidateItemStock(cartItem)
			) {
				const otherLinesQty =
					getCartStockQtyForItem(invoiceItems.value, cartItem.item_code) -
					rowStockQty(cartItem);
				const totalQty = otherLinesQty + rowStockQty(cartItem, updates.quantity);
				const check = checkStockAvailability(cartItem, totalQty);
				if (!check.available) {
					throw new Error(check.error);
				}
			}

			// Apply other updates
			if (updates.quantity !== undefined) cartItem.quantity = updates.quantity;
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			if (updates.warehouse !== undefined) cartItem.warehouse = updates.warehouse;
			if (updates.discount_percentage !== undefined)
				cartItem.discount_percentage = updates.discount_percentage;
			if (updates.discount_amount !== undefined)
				cartItem.discount_amount = updates.discount_amount;
			if (updates.rate !== undefined) cartItem.rate = updates.rate;
			//// Neoffice — a gift card is sold as a zero-price line whose amount the cashier types in, so
			//// the cart must accept a rate on a line whose price_list_rate is 0 and mirror it there, or
			//// the edit was recalculated straight back to zero (fd901f84, 2026-01-14 "allow rate update
			//// for zero-price items in cart store"). Upstream's one-line `if (updates.rate !== undefined)`
			//// just above is now redundant with this block.
			//// allow rate update for zero-price items in cart store — fd901f8 + 458d81a
			if (updates.price_list_rate !== undefined)
				cartItem.price_list_rate = updates.price_list_rate;
			if (updates.rate !== undefined) {
				// Update rate (for zero-price items like gift cards)
				cartItem.rate = updates.rate;
				// Also update price_list_rate to keep consistency
				if (cartItem.price_list_rate === 0) {
					cartItem.price_list_rate = updates.rate;
				}
			}
			if (updates.serial_no !== undefined) cartItem.serial_no = updates.serial_no;
			// Track manual rate edits for audit purposes
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			if (updates.is_rate_manually_edited !== undefined)
				cartItem.is_rate_manually_edited = updates.is_rate_manually_edited;
			if (updates.original_rate !== undefined)
				cartItem.original_rate = updates.original_rate;
			if (updates.sales_person !== undefined) {
				cartItem.sales_person = updates.sales_person || null;
				cartItem.sales_person_name = updates.sales_person
					? updates.sales_person_name || updates.sales_person
					: null;
			}

			recalculateItem(cartItem);
			rebuildIncrementalCache();
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			showSuccess(__("{0} updated", [cartItem.item_name]));
			return true;
		} catch (error) {
			console.error("Error updating item:", error);
			showError(parseError(error) || __("Failed to update item."));
			return false;
		}
	}

	// Performance: Cache previous item codes hash to avoid unnecessary recalculations
	let previousItemCodesHash = "";
	let cachedItemCodes = [];
	let cachedItemGroups = [];
	let cachedBrands = [];
	let cachedItemQuantities = {};
	let cachedItemGroupQuantities = {};
	let cachedBrandQuantities = {};
	let cachedItemAmounts = {};
	let cachedItemGroupAmounts = {};
	let cachedBrandAmounts = {};

	function syncOfferSnapshot() {
		// Only sync if values are initialized
		if (subtotal.value !== undefined && invoiceItems.value) {
			// Paid lines only — free gifts must not inflate min_qty/max_qty checks
			const paidItems = withCarvedQtyRestored(invoiceItems.value).filter(
				(item) => !item.is_free_item
			);

			// Create hash for paid item codes and quantities to detect actual changes.
			// price_list_rate is part of the key because the cached amount maps
			// below are money, not just counts — a price list change with an
			// otherwise identical cart must invalidate them.
			const currentHash = paidItems
				.map(
					(item) =>
						`${item.item_code}:${item.quantity}:${item.price_list_rate || item.rate}`
				)
				.join(",");

			// Only recalculate expensive operations if items actually changed
			if (currentHash !== previousItemCodesHash) {
				cachedItemCodes = paidItems.map((item) => item.item_code);
				cachedItemGroups = [
					...new Set(paidItems.map((item) => item.item_group).filter(Boolean)),
				];
				cachedBrands = [
					...new Set(paidItems.map((item) => item.brand).filter(Boolean)),
				];

				// Build quantity maps for accurate offer validation
				cachedItemQuantities = {};
				cachedItemGroupQuantities = {};
				cachedBrandQuantities = {};
				cachedItemAmounts = {};
				cachedItemGroupAmounts = {};
				cachedBrandAmounts = {};

				for (const item of paidItems) {
					const qty = item.quantity || 0;
					const { gross } = offerLineAmounts(item);

					if (item.item_code) {
						//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
						cachedItemQuantities[item.item_code] =
							(cachedItemQuantities[item.item_code] || 0) + qty;
						cachedItemAmounts[item.item_code] =
							(cachedItemAmounts[item.item_code] || 0) + gross;
					}
					if (item.item_group) {
						//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
						cachedItemGroupQuantities[item.item_group] =
							(cachedItemGroupQuantities[item.item_group] || 0) + qty;
						cachedItemGroupAmounts[item.item_group] =
							(cachedItemGroupAmounts[item.item_group] || 0) + gross;
					}
					if (item.brand) {
						//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
						cachedBrandQuantities[item.brand] =
							(cachedBrandQuantities[item.brand] || 0) + qty;
						cachedBrandAmounts[item.brand] =
							(cachedBrandAmounts[item.brand] || 0) + gross;
					}
				}

				previousItemCodesHash = currentHash;
			}

			// Calculate total quantity (sum of all paid item quantities, not line count)
			const totalQty = paidItems.reduce((sum, item) => {
				return sum + (item.quantity || 0);
			}, 0);

			offersStore.updateCartSnapshot({
				subtotal: subtotal.value,
				itemCount: totalQty, // Total quantity, not number of line items
				itemCodes: cachedItemCodes,
				itemGroups: cachedItemGroups,
				brands: cachedBrands,
				itemQuantities: cachedItemQuantities,
				itemGroupQuantities: cachedItemGroupQuantities,
				brandQuantities: cachedBrandQuantities,
				// Recomputed every sync, not cached with the maps above: item
				// discounts change without any item/qty/price change (the server
				// stamps them back onto the cart after apply_offers).
				netSubtotal: offerNetSubtotal(paidItems),
				itemAmounts: cachedItemAmounts,
				itemGroupAmounts: cachedItemGroupAmounts,
				brandAmounts: cachedBrandAmounts,
			});
		}
	}

	/**
	 * Core offer processing function that validates and auto-applies offers.
	 * Runs through the queue to ensure sequential execution.
	 * Uses offline mode when network is unavailable.
	 * @param {AbortSignal} signal - Abort signal for cancellation
	 * @param {number} generation - Cart generation when this was triggered
	 * @param {boolean} force - If true, process even if cart hash matches
	 * //// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
	 */
	async function processOffersInternal(signal = null, generation = 0, force = false) {
		// Check cancellation early
		if (signal?.aborted) return;

		// Check if this operation is stale (cart changed since this was queued)
		if (generation > 0 && generation < cartGeneration) {
			return; // Skip stale operation
		}

		// Only process offers if we have a POS profile
		// posProfile.value is the profile NAME (a string), not an object
		if (!posProfile.value) {
			return;
		}

		// Skip offer processing if POS Profile has ignore_pricing_rule enabled
		const shiftStore = usePOSShiftStore();
		if (shiftStore.currentProfile?.ignore_pricing_rule) {
			return;
		}

		// Ensure offers are fetched before processing
		// This is critical for mobile view where InvoiceCart may not be mounted yet
		// IMPORTANT: This must happen BEFORE hash check, because if offers weren't
		// fetched on previous runs, we need to re-process even if cart hash matches
		const wasFetched = offersStore.hasFetched;
		// posProfile.value is the profile name string directly
		const profileName = posProfile.value;
		await offersStore.ensureOffersFetched(profileName);

		// Check cancellation after fetch
		if (signal?.aborted) return;

		// One-time-per-customer eligibility depends on async context (server
		// redemptions + identified flag). Await here so we never evaluate offers
		// before the customer gate is ready — setCustomer() alone can lose the
		// race with the debounced cart/customer watcher below.
		await syncOneTimeContextForCurrentCustomer();

		// Check cancellation after one-time context fetch
		if (signal?.aborted) return;

		// Generate current cart hash
		const currentHash = generateCartHash();

		// Skip if cart hasn't changed since last successful processing (unless forced)
		// Also force re-processing if offers were just fetched for the first time
		const justFetched = !wasFetched && offersStore.hasFetched;
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		if (!force && !justFetched && currentHash === offerProcessingState.value.lastCartHash) {
			return;
		}

		// Update offer snapshot for eligibility checking
		syncOfferSnapshot();

		// === OFFLINE MODE ===
		// When offline, use cached offers and apply discounts client-side
		if (offlineState.isOffline) {
			applyOffersOffline();
			offerProcessingState.value.lastCartHash = generateCartHash();
			offerProcessingState.value.lastProcessedAt = Date.now();
			return;
		}

		// === ONLINE MODE ===
		// Get current profile from posProfile
		const currentProfile = {
			customer: customer.value?.name || customer.value,
			company: posProfile.value.company,
			selling_price_list: posProfile.value.selling_price_list,
			currency: posProfile.value.currency,
		};
		try {
			// 1. Identify invalid offers to remove (client-side check)
			const invalidOffers = [];

			for (const entry of appliedOffers.value) {
				if (entry.offer) {
					const { eligible } = offersStore.checkOfferEligibility(entry.offer);
					if (!eligible) invalidOffers.push(entry);
				}
			}

			// 2. Identify new eligible offers to apply (client-side check)
			const allEligibleOffers = offersStore.allEligibleOffers;
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			const currentAppliedCodes = new Set(appliedOffers.value.map((o) => o.code));
			const newOffers = allEligibleOffers.filter(
				(offer) =>
					!currentAppliedCodes.has(offer.name) && !wasRemovedForCurrentCart(offer.name)
			);

			// 3. Determine if we need to call the server
			// We MUST hit the server if:
			// - We have applied offers
			// - We have new auto-offers to apply
			// - We have invalid offers to remove
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			const invalidCodes = new Set(invalidOffers.map((o) => o.code));
			const validExistingCodes = appliedOffers.value
				.filter((o) => !invalidCodes.has(o.code))
				.map((o) => o.code);

			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			const newOfferCodes = newOffers.map((o) => o.name);
			const combinedCodes = [...new Set([...validExistingCodes, ...newOfferCodes])];

			// All applied offers became invalid and no new offers to apply.
			//// fix offerProcessingState updates inside try block, and prevent Unnece… — 3160a26
			if (combinedCodes.length === 0 && invalidOffers.length > 0) {
				appliedOffers.value = [];
				processFreeItems([]);
				//// Neoffice — all offers invalid and none to re-apply: the transaction-rule discount goes
				//// too, otherwise a header amount lingers with no rule behind it (44ea4e9a, 2026-07-09).
				//// The arrow-param parens on the next line are the Biome pass.
				ruleHeaderDiscount.value = 0; // clear any transaction-rule header discount
				invoiceItems.value.forEach((item) => {
					if (dropPromotionUnderCoupon(item)) return;
					if (item.pricing_rules && item.pricing_rules.length > 0) {
						item.discount_percentage = 0;
						item.discount_amount = 0;
						item.is_already_discounted = 0;
						item.is_accumulative_discount = 0;
						recalculateItem(item);
					}
				});
				// Also clear any transaction-level header discount the server
				// previously surfaced — if no offers remain, no header discount applies.
				applyHeaderDiscountFromServer(null);
				rebuildIncrementalCache();

				rememberRemovedOffers(invalidOffers);
			} else if (combinedCodes.length > 0) {
				const invoiceData = buildOfferEvaluationPayload(currentProfile);
				const response = await applyOffersResource.submit({
					invoice_data: invoiceData,
					selected_offers: combinedCodes,
				});

				// Check for cancellation or stale operation
				//// Neoffice — the main offer pipeline reads the server's header discount as well; the
				//// re-wrapped destructuring is the Biome pass (44ea4e9a, 2026-07-09).
				if (signal?.aborted || (generation > 0 && generation < cartGeneration)) return;

				//// Neoffice — headerDiscount is read out of the apply_offers response here too: it is the
				//// transaction-scope Pricing Rule amount that upstream's response shape never returned
				//// (44ea4e9a, 2026-07-09 "apply transaction-level rule discount in the cart").
				const {
					items: responseItems,
					freeItems,
					appliedRules,
					headerDiscount,
				} = parseOfferResponse(response);

				// 4. Update cart items with new discounts

				applyDiscountsFromServer(responseItems);
				processFreeItems(freeItems);
				applyHeaderDiscountFromServer(headerDiscount);

				// 5. Update appliedOffers list based on server confirmation
				const actuallyApplied = new Set(appliedRules);
				const nextAppliedOffers = [];

				// Handle existing ones
				for (const entry of appliedOffers.value) {
					//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
					if (
						!invalidOffers.find((inv) => inv.code === entry.code) &&
						actuallyApplied.has(entry.code)
					) {
						nextAppliedOffers.push(entry);
					}
				}

				// Handle new ones
				for (const offer of newOffers) {
					if (actuallyApplied.has(offer.name)) {
						nextAppliedOffers.push({
							name: offer.title || offer.name,
							code: offer.name,
							offer,
							source: "auto",
							applied: true,
							rules: [offer.name],
							min_qty: offer.min_qty,
							max_qty: offer.max_qty,
							min_amt: offer.min_amt,
							max_amt: offer.max_amt,
						});
					}
				}

				appliedOffers.value = nextAppliedOffers;

				// 6. UI Feedback
				if (invalidOffers.length > 0) {
					rememberRemovedOffers(invalidOffers);
				}
				// Newly applied offers show as savings on their cart lines
			} else if (invoiceItems.value.length === 0 && appliedOffers.value.length > 0) {
				// Cart cleared, reset offers
				appliedOffers.value = [];
				processFreeItems([]);
				//// Neoffice — the cart was emptied while offers were applied: drop the rule discount with
				//// them (44ea4e9a, 2026-07-09).
				ruleHeaderDiscount.value = 0; // clear any transaction-rule header discount
				rebuildIncrementalCache();
			}
			// Update last processed hash on success
			offerProcessingState.value.lastCartHash = generateCartHash();
			offerProcessingState.value.lastProcessedAt = Date.now();
			offerProcessingState.value.retryCount = 0;
		} catch (error) {
			if (signal?.aborted) return;
			console.error("Error in offer synchronization:", error);
			offerProcessingState.value.error = error.message;
		}
	}

	/**
	 * Triggers offer processing with proper state management.
	 * @param {boolean} force - If true, bypass hash check and force processing
	 */
	function triggerOfferProcessing(force = false) {
		// Increment generation to invalidate any in-flight operations
		const currentGen = ++cartGeneration;

		// Enqueue the processing task - queue handles concurrency
		offerQueue.enqueue(async (signal) => {
			try {
				offerProcessingState.value.isProcessing = true;
				offerProcessingState.value.isAutoProcessing = true;
				offerProcessingState.value.error = null;

				await processOffersInternal(signal, currentGen, force);
			} catch (error) {
				if (!signal?.aborted) {
					console.error("Error in offer processing:", error);
					offerProcessingState.value.error = error.message;
					offerProcessingState.value.retryCount++;

					// Auto-retry on failure (max 3 times)
					if (offerProcessingState.value.retryCount < 3) {
						setTimeout(() => {
							triggerOfferProcessing(true);
						}, 500 * offerProcessingState.value.retryCount);
					}
				}
			} finally {
				offerProcessingState.value.isProcessing = false;
				offerProcessingState.value.isAutoProcessing = false;
			}
		});
	}

	/**
	 * Force refresh offers - clears state and reprocesses from scratch.
	 * Call this when you suspect offers are out of sync.
	 */
	function forceRefreshOffers() {
		// Cancel any pending operations
		debouncedProcessOffers.cancel();
		offerQueue.cancel();

		// Clear the hash to force reprocessing
		//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		offerProcessingState.value.lastCartHash = "";
		offerProcessingState.value.error = null;
		offerProcessingState.value.retryCount = 0;

		// Trigger immediate processing
		triggerOfferProcessing(true);
	}

	/**
	 * Calculate dynamic debounce delay based on cart size.
	 * Small carts (1-3 items): 100ms - fast response
	 * Medium carts (4-10 items): 200ms - balanced
	 * Large carts (11+ items): 300ms - reduce API load
	 */
	function getDynamicDebounceDelay() {
		const itemCount = invoiceItems.value.length;
		if (itemCount <= 3) return 100;
		if (itemCount <= 10) return 200;
		return 300;
	}

	/**
	 * Debounced offer processing with dynamic delay based on cart size.
	 * Prevents race conditions while staying responsive for small carts.
	 */
	let debounceTimeoutId = null;
	function debouncedProcessOffers() {
		if (debounceTimeoutId) {
			clearTimeout(debounceTimeoutId);
		}
		debounceTimeoutId = setTimeout(() => {
			debounceTimeoutId = null;
			triggerOfferProcessing(false);
		}, getDynamicDebounceDelay());
	}

	// Add cancel and flush methods for compatibility
	debouncedProcessOffers.cancel = () => {
		if (debounceTimeoutId) {
			clearTimeout(debounceTimeoutId);
			debounceTimeoutId = null;
		}
	};

	debouncedProcessOffers.flush = () => {
		if (debounceTimeoutId) {
			clearTimeout(debounceTimeoutId);
			debounceTimeoutId = null;
			triggerOfferProcessing(false);
		}
	};

	// Watch for ANY cart changes that might affect offer eligibility
	// This includes: items, quantities, customer, subtotal, etc.
	watch(
		[
			// Watch item count (additions/removals)
			() => invoiceItems.value.length,
			// Watch item details (quantity, code, uom changes)
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
			() =>
				invoiceItems.value
					.map(
						(item) =>
							`${item.item_code}:${item.quantity}:${item.uom || ""}:${
								item.discount_percentage || 0
							}`
					)
					.join(","),
			// Watch subtotal changes
			subtotal,
			// Watch customer changes (some offers are customer-specific)
			() => customer.value?.name || customer.value,
		],
		(_newVals, oldVals) => {
			// Skip if this is initial render with empty cart
			if (!oldVals && invoiceItems.value.length === 0) {
				return;
			}

			// Use debounced processing to prevent race conditions
			// This batches rapid cart changes and ensures only one offer
			// processing operation runs at a time
			debouncedProcessOffers();
		},
		{ immediate: true, flush: "post" }
	);

	// Re-check a scoped coupon when the paid lines (qty, UOM, price, manual rate) or the customer change.
	watch(
		() =>
			isLineLevelCoupon(appliedCoupon.value)
				? `${invoiceItems.value
						.filter((item) => !item.is_free_item)
						.map(
							(item) =>
								`${item.item_code}:${item.quantity}:${item.uom || ""}:${item.price_list_rate || 0}:${
									item.is_rate_manually_edited ? item.rate : ""
								}`
						)
						.join(",")}::${customer.value?.name || customer.value || ""}`
				: null,
		(key, oldKey) => {
			if (!key || !oldKey || key === oldKey) return;
			capFixedCouponLines();
			scheduleCouponRevalidation();
		}
	);

	// An emptied cart drops its whole-cart coupon, which would otherwise push the total below zero
	watch(
		() => invoiceItems.value.some((item) => !item.is_free_item),
		(hasPaidItems) => {
			if (hasPaidItems || !appliedCoupon.value || isLineLevelCoupon(appliedCoupon.value)) return;
			removeDiscount();
			appliedCoupon.value = null;
		}
	);

	// Re-check a whole-cart coupon for the new customer; say why when it is dropped
	watch(
		() => customer.value?.name || customer.value || null,
		async (name, oldName) => {
			const coupon = appliedCoupon.value;
			if (!coupon || isLineLevelCoupon(coupon) || name === oldName) return;
			//// Neoffice — no verdict without a customer: our customer card clears the customer on every
			//// "change customer" tap (4a0dd461), and a gift card is a bearer card that our validate_coupon
			//// accepts with no customer at all. Upstream develop dropped the coupon or gift card right
			//// there ("No customer selected"). The next customer picked is re-checked by this watcher,
			//// and the server re-validates the coupon at submit.
			if (!name) return;
			const result = name
				? await call(promoApi.validateCoupon(), {
						coupon_code: coupon.code,
						customer: name,
						company: usePOSShiftStore().currentProfile?.company,
					}).catch(() => ({ valid: true }))
				: { valid: false, message: __("No customer selected") };
			if (result?.valid || appliedCoupon.value !== coupon) return;
			removeDiscount();
			appliedCoupon.value = null;
			showWarning(
				__("Coupon {0} removed: {1}", [
					coupon.code,
					result.message || __("Cart no longer meets requirements"),
				])
			);
		}
	);

	// Additional watcher for applied offers changes (to handle removal edge cases)
	watch(
		() => appliedOffers.value.length,
		(newLen, oldLen) => {
			// If offers were removed externally, sync the snapshot
			if (newLen < oldLen) {
				syncOfferSnapshot();
			}
			//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
		}
	);

	return {
		//// Neoffice — collected but not yet booked (see above)
		collectedUnbooked,
		collectedUnbookedTotal,
		noteCollected,
		clearCollected,

		// State
		invoiceItems,
		customer,
		subtotal,
		totalTax,
		totalDiscount,
		grandTotal,
		//// Neoffice — exposed to the cart and payment UI: the CHF 0.05-rounded total with its
		//// adjustment line (4fdb5df4, 2026-04-04), and the net total AFTER pricing rules, which is
		//// what a gift card must be capped on — capping on the raw subtotal let a card exceed the
		//// already discounted price and the invoice was refused (8e06bb9c, 2026-01-16).
		roundedGrandTotal,
		roundingAdjustment,
		netTotalBeforeAdditionalDiscount,
		posProfile,
		posOpeningShift,
		payments,
		salesTeam,
		additionalDiscount,
		//// Neoffice — the transaction-rule discount, its per-ticket bypass and the effective amount
		//// are exposed so the payment dialog can show the rule and let the cashier override it
		//// (44ea4e9a + 4d61216b, 2026-07-09).
		ruleHeaderDiscount,
		bypassRuleDiscount,
		effectiveHeaderDiscount,
		applyHeaderDiscountFromServer,
		setBypassRuleDiscount,
		taxInclusive,
		pendingItem,
		pendingItemQty,
		appliedOffers,
		appliedCoupon,
		selectionMode,
		currentDraftId,
		offerProcessingState, // Offer processing state for UI feedback

		// Computed
		itemCount,
		isEmpty,
		hasCustomer,
		isProcessingOffers, // True when any offer operation is in progress
		isSubmitting, // True when invoice submission is in progress (mutex protected)

		// Actions
		addItem,
		//// Neoffice — exported so the page can refill the cart from a table / guest order fetched from
		//// the server without going through addItem's dedup (707a330c, 2026-04-01).
		//// replaceAllItems bypasses addItem dedup, get_table_order returns kds_s… — 707a330
		replaceAllItems,
		removeItem,
		updateItemQuantity,
		clearCart,
		setCustomer,
		setDefaultCustomer: loadDefaultCustomer,
		setPendingItem,
		clearPendingItem,
		loadTaxRules,
		setTaxInclusive,
		submitInvoice,
		//// Neoffice — the production (minified) build turns the destructured posProfile /
		//// posOpeningShift into const bindings, so assigning them from a component threw at runtime
		//// while dev mode worked. The store exposes setters instead (b44f194b, 2026-03-21).
		setPosProfile,
		setPosOpeningShift,
		applyDiscountToCart,
		removeDiscountFromCart,
		buildCouponItemsPayload,
		restoreLineCoupon,
		applyOffer,
		removeOffer,
		reapplyOffer,
		changeItemUOM,
		updateItemDetails,
		getItemDetailsResource,
		resolveUomPricing,
		recalculateItem,
		rebuildIncrementalCache,
		applyOffersResource,
		buildOfferEvaluationPayload,
		formatItemsForSubmission,

		// Sales Order feature
		targetDoctype,
		setTargetDoctype,
		createSalesOrder,
		deliveryDate,
		setDeliveryDate,

		// Write-off feature
		writeOffAmount,
		//// Neoffice — the tip is exposed to the payment dialog, which sets it before submit; it is
		//// posted on an Income Account, not as sales (e9d1622a, 2026-03-23 "pass tip_amount through
		//// full payment chain"; d08c57e7, same day, sets the account type).
		//// pass tip_amount through full payment chain (PaymentDialog → POSSale →… — e9d1622
		tipAmount,
		setWriteOffAmount,
		//// Neoffice — from here down: the loyalty setter and the whole restaurant / takeaway surface
		//// the pages bind to — the table a ticket belongs to, takeaway mode and its number, the KDS
		//// status, the "not yet sent to the kitchen" flag, and the modifier / instruction editors.
		//// Upstream POSNext is a retail POS and has none of it (104959e6, 2026-03-19 loyalty;
		//// 8aa35c29, 2026-03-20 Phase 1 restaurant; e005b94b, 2026-03-21 preparation stations;
		//// 4df0caf1, 2026-03-21 modifiers; 644ad918, 2026-03-26 takeaway; 6d7195f4, 2026-03-30 guest
		//// payments).
		setLoyaltyData,

		// Restaurant features
		restaurantTable,
		isTakeaway,
		takeawayNumber,
		kdsStatus,
		hasUnsentChanges,
		guestPaidAmount,
		guestTipAmount,
		updateItemInstructions,
		updateItemModifiers,
		setRestaurantTable,
		setKdsStatus,
		markChangesSent,

		// Utilities
		cancelPendingOfferProcessing: () => {
			debouncedProcessOffers.cancel();
			offerQueue.cancel();
		},
		forceRefreshOffers, // Force reprocess offers from scratch
	};
});
