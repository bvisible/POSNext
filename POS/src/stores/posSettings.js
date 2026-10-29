import { createResource } from "frappe-ui";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useBootstrapStore } from "./bootstrap";
//// Neoffice — added import, for the restaurant-mode toggle that first persisted through the
//// API (8aa35c29, 2026-03-20 "Phase 1 restaurant module"). 82fcc1bf (2026-03-20) then made the
//// toggle a localStorage write so it switches instantly and stays per-terminal, which left
//// this import UNUSED — the next upstream merge can simply drop it.
//// Phase 1 restaurant module - header toggle, UI cleanup, multi-room tabs — 8aa35c2 + 82fcc1b
import { call } from "@/utils/apiWrapper";

export const usePOSSettingsStore = defineStore("posSettings", () => {
	// State
	const settings = ref({
		pos_profile: "",
		enabled: 0,
		// Wallet & Loyalty Settings
		enable_loyalty_program: 0,
		default_loyalty_program: "",
		wallet_account: "",
		auto_create_wallet: 1,
		loyalty_to_wallet: 1,
		magento_loyalty_available: 0,
		miraaya_installed: 0,
		// General Settings
		max_discount_allowed: 0,
		use_percentage_discount: 0,
		allow_user_to_edit_additional_discount: 0,
		allow_user_to_edit_item_discount: 1, // Allow item-level discounts
		allow_user_to_edit_rate: 0, // Allow rate editing in edit dialog
		disable_rounded_total: 1, // Disable rounding for accurate totals
		allow_credit_sale: 0,
		allow_customer_credit_payment: 0,
		allow_return: 0,
		allow_write_off_change: 0,
		allow_partial_payment: 0,
		use_exact_amount: 0,
		// Display Settings
		default_card_view: 0,
		display_item_code: 0,
		show_customer_balance: 0,
		hide_expected_amount: 0,
		display_discount_percentage: 0,
		display_discount_amount: 0,
		show_variants_as_items: 0,
		cart_lifo: 0,
		// Operations
		allow_sales_order: 0,
		allow_select_sales_order: 0,
		create_only_sales_order: 0,
		allow_return_without_invoice: 0,
		allow_free_batch_return: 0,
		allow_print_draft_invoices: 0,
		// Pricing & Display
		decimal_precision: "2",
		// Customer Settings
		allow_customer_purchase_order: 0,
		allow_duplicate_customer_names: 0,
		fetch_coupon: 0,
		// Printing
		allow_print_last_invoice: 0,
		silent_print: 0,
		// Delivery
		use_delivery_charges: 0,
		auto_set_delivery_charges: 0,
		// Advanced Settings
		use_limit_search: 0,
		search_limit: 1000,
		allow_submissions_in_background_job: 0,
		allow_delete_offline_invoice: 0,
		allow_change_posting_date: 0,
		// Miscellaneous
		input_qty: 0,
		allow_negative_stock: 0,
		// Sales Persons
		enable_sales_persons: "Disabled",
		//// Neoffice — defaults for settings upstream does not have: the customer-facing second screen
		//// (turn it on, let the customer create their own account on it, show the address fields on
		//// that form), and restaurant mode with its default dining area. They must exist in this seed
		//// object or the store has no shape before the API answers (8bffb770, 2026-02-04 "add address
		//// fields to customer creation form"; 912ef092, 2026-02-04 customer display; 8aa35c29,
		//// 2026-03-20 restaurant mode).
		//// add address fields to customer creation form — 8bffb77 + 458d81a (+1 more)
		// Customer Display Settings
		enable_customer_display: 0,
		enable_customer_display_account_creation: 0,
		customer_display_show_address_fields: 0,
		// Restaurant Settings
		enable_restaurant_mode: 0,
		//// Neoffice — the restaurant this till works for and its label (NeoRestau lot 1, task 2), sent by the
		//// bootstrap with the till's settings.
		restaurant: "",
		restaurant_name: "",
		//// Neoffice — what the user may manage of that restaurant, sent with the settings (NeoRestau lot 1, task 3):
		//// nothing until the server says so.
		restaurant_can: {},
		default_restaurant_area: "",
		// Security
		enable_session_lock: 0,
		session_lock_timeout: 5,
		//// Neoffice — the Journal Entry Template used to book the cash the cashier takes out of the
		//// drawer at shift close, and to suggest the next opening balance. Upstream closes a shift
		//// without moving any money, which does not match Swiss cash practice (5783eb27, 2026-03-28
		//// "cash withdrawal at shift closing with suggested opening balance").
		//// cash withdrawal at shift closing with suggested opening balance — 5783eb2
		// Cash Management
		closing_withdrawal_template: "",
	});

	const isLoading = ref(false);
	const isLoaded = ref(false);

	// Computed - Wallet & Loyalty Settings
	const enableLoyaltyProgram = computed(() => Boolean(settings.value.enable_loyalty_program));
	//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a + 897793e
	const defaultLoyaltyProgram = computed(() => settings.value.default_loyalty_program || "");
	//// Neoffice — the whole file went through our Biome formatter pass (458d81a9,
	//// 2026-03-20 "remove BrainWise branding, add restaurant mode, and code formatting"):
	//// tabs, double quotes, trailing commas, parenthesised arrow params, 80-column rewrap.
	//// Upstream runs no formatter, so most hunks below are that pass and change no
	//// behaviour — every marker reading "Biome reformat only" is one of them. At the next
	//// upstream merge, take their code and re-run Biome instead of resolving these by hand.
	const walletAccount = computed(() => settings.value.wallet_account || "");
	const autoCreateWallet = computed(() => Boolean(settings.value.auto_create_wallet));
	const loyaltyToWallet = computed(() => Boolean(settings.value.loyalty_to_wallet));
	const magentoLoyaltyAvailable = computed(() => Boolean(settings.value.magento_loyalty_available));
	const miraayaInstalled = computed(() => Boolean(settings.value.miraaya_installed));

	// Computed - General Settings
	const isEnabled = computed(() => Boolean(settings.value.enabled));
	const maxDiscountAllowed = computed(
		() => Number.parseFloat(settings.value.max_discount_allowed) || 0
	);
	const usePercentageDiscount = computed(() => Boolean(settings.value.use_percentage_discount));
	const allowAdditionalDiscount = computed(() =>
		Boolean(settings.value.allow_user_to_edit_additional_discount)
	);
	const allowItemDiscount = computed(() =>
		Boolean(settings.value.allow_user_to_edit_item_discount)
	);
	const allowUserToEditRate = computed(() => Boolean(settings.value.allow_user_to_edit_rate));
	const disableRoundedTotal = computed(() => Boolean(settings.value.disable_rounded_total));
	const allowCreditSale = computed(() => Boolean(settings.value.allow_credit_sale));
	const allowCustomerCreditPayment = computed(() =>
		Boolean(settings.value.allow_customer_credit_payment)
	);
	const allowReturn = computed(() => Boolean(settings.value.allow_return));
	const allowWriteOffChange = computed(() => Boolean(settings.value.allow_write_off_change));
	const allowPartialPayment = computed(() => Boolean(settings.value.allow_partial_payment));
	const useExactAmount = computed(() => Boolean(settings.value.use_exact_amount));

	// Computed - Display Settings
	const defaultCardView = computed(() => Boolean(settings.value.default_card_view));
	const displayItemCode = computed(() => Boolean(settings.value.display_item_code));
	const showCustomerBalance = computed(() => Boolean(settings.value.show_customer_balance));
	const hideExpectedAmount = computed(() => Boolean(settings.value.hide_expected_amount));
	const displayDiscountPercentage = computed(() =>
		Boolean(settings.value.display_discount_percentage)
	);
	const displayDiscountAmount = computed(() => Boolean(settings.value.display_discount_amount));
	const showVariantsAsItems = computed(() => Boolean(settings.value.show_variants_as_items));
	const cartLifo = computed(() => Boolean(settings.value.cart_lifo));

	// Computed - Operations
	const allowSalesOrder = computed(() => Boolean(settings.value.allow_sales_order));
	const allowSelectSalesOrder = computed(() => Boolean(settings.value.allow_select_sales_order));
	const createOnlySalesOrder = computed(() => Boolean(settings.value.create_only_sales_order));
	const allowReturnWithoutInvoice = computed(() =>
		Boolean(settings.value.allow_return_without_invoice)
	);
	const allowFreeBatchReturn = computed(() => Boolean(settings.value.allow_free_batch_return));
	const allowPrintDraftInvoices = computed(() =>
		Boolean(settings.value.allow_print_draft_invoices)
	);

	// Computed - Pricing & Display
	const decimalPrecision = computed(
		() => Number.parseInt(settings.value.decimal_precision) || 2
	);

	// Computed - Customer Settings
	const allowCustomerPurchaseOrder = computed(() =>
		Boolean(settings.value.allow_customer_purchase_order)
	);
	const allowDuplicateCustomerNames = computed(() =>
		Boolean(settings.value.allow_duplicate_customer_names)
	);
	const fetchCoupon = computed(() => Boolean(settings.value.fetch_coupon));

	// Computed - Printing
	const allowPrintLastInvoice = computed(() => Boolean(settings.value.allow_print_last_invoice));
	const silentPrint = computed(() => Boolean(settings.value.silent_print));

	// Computed - Delivery
	const useDeliveryCharges = computed(() => Boolean(settings.value.use_delivery_charges));
	const autoSetDeliveryCharges = computed(() =>
		Boolean(settings.value.auto_set_delivery_charges)
	);

	// Computed - Advanced Settings
	const useLimitSearch = computed(() => Boolean(settings.value.use_limit_search));
	const searchLimit = computed(() => Number.parseInt(settings.value.search_limit) || 1000);
	const allowSubmissionsInBackgroundJob = computed(() =>
		Boolean(settings.value.allow_submissions_in_background_job)
	);
	const allowDeleteOfflineInvoice = computed(() =>
		Boolean(settings.value.allow_delete_offline_invoice)
	);
	const allowChangePostingDate = computed(() =>
		Boolean(settings.value.allow_change_posting_date)
	);

	// Computed - Miscellaneous
	const inputQty = computed(() => Boolean(settings.value.input_qty));
	const allowNegativeStock = computed(() => Boolean(settings.value.allow_negative_stock));

	// Computed - Sales Persons
	//// Neoffice — Biome reformat only, no behaviour change (458d81a9, 2026-03-20).
	const enableSalesPersons = computed(() => settings.value.enable_sales_persons !== "Disabled");
	const salesPersonsMode = computed(() => settings.value.enable_sales_persons || "Disabled");
	//// Neoffice — Biome re-wrap of upstream's sales-person computeds, immediately followed by
	//// our restaurant block: upstream POSNext is a retail POS with no table service, so
	//// enableRestaurantMode has no upstream equivalent (458d81a9 / 8aa35c29, 2026-03-20).
	const isSingleSalesPerson = computed(() => settings.value.enable_sales_persons === "Single");
	const isMultipleSalesPersons = computed(
		() => settings.value.enable_sales_persons === "Multiple"
	);

	// Computed - Restaurant Settings
	const enableRestaurantMode = computed(() => Boolean(settings.value.enable_restaurant_mode));
	//// Neoffice — end of the Biome re-wrap, then two blocks upstream does not have: the default
	//// restaurant area (8aa35c29, 2026-03-20 "Phase 1 restaurant module") and the
	//// customer-facing display flags — enable, let the customer create their own account, and
	//// show the structured street + N° address fields on that form (8bffb770 2026-02-04,
	//// 912ef092 2026-02-04, d7584e7b 2026-07-17 ADR-002).
	const defaultRestaurantArea = computed(() => settings.value.default_restaurant_area || "");
	//// Neoffice — the customer-facing display has no upstream equivalent, so neither do these
	//// flags: turn the second screen on, and let the customer create their own account from it
	//// (8bffb770 2026-02-04; 912ef092 2026-02-04 "improve UX for customer creation flow").

	// Computed - Customer Display Settings
	const enableCustomerDisplay = computed(() => Boolean(settings.value.enable_customer_display));
	const enableCustomerDisplayAccountCreation = computed(() =>
		Boolean(settings.value.enable_customer_display_account_creation)
	);
	//// Neoffice — the display's customer form asks for street and house number as two fields
	//// (ADR-002); this flag is what shows them. Swiss addresses put the number after the street
	//// name, and a single free-text line does not survive a later mailing (d7584e7b, 2026-07-17
	//// "structured street + N° across POS Next").
	const showAddressFieldsInCustomerForm = computed(() =>
		Boolean(settings.value.customer_display_show_address_fields)
	);

	// Computed - Security
	const enableSessionLock = computed(() => Boolean(settings.value.enable_session_lock));
	const sessionLockTimeout = computed(
		() => Number.parseInt(settings.value.session_lock_timeout) || 5
	);

	//// Neoffice — Journal Entry Template used to book the cash the cashier takes out of the
	//// drawer when closing the shift; upstream closes a shift without moving money, which does
	//// not match Swiss accounting practice (5783eb27, 2026-03-28 "cash withdrawal at shift
	//// closing with suggested opening balance").
	// Computed - Cash Management
	const closingWithdrawalTemplate = computed(
		() => settings.value.closing_withdrawal_template || ""
	);

	// Resource
	const settingsResource = createResource({
		url: "pos_next.pos_next.doctype.pos_settings.pos_settings.get_pos_settings",
		onSuccess(data) {
			if (data) {
				Object.assign(settings.value, data);
				//// Neoffice — the loaded settings ARE the restaurant mode: no device override wins over them
				//// any more (it was restored here by 03449a57, 2026-03-23). This only forgets the key old
				//// devices still carry.
				initRestaurantMode();
				isLoaded.value = true;
			}
			isLoading.value = false;
		},
		onError(error) {
			isLoading.value = false;
		},
	});

	// Actions
	async function loadSettings(posProfile) {
		if (!posProfile) {
			return false;
		}

		isLoading.value = true;
		settings.value.pos_profile = posProfile;

		// OPTIMIZATION: Check if bootstrap has preloaded the settings
		try {
			const bootstrapStore = useBootstrapStore();
			const preloadedSettings = bootstrapStore.getPreloadedPOSSettings();
			if (preloadedSettings && Object.keys(preloadedSettings).length > 0) {
				Object.assign(settings.value, preloadedSettings);
				//// Neoffice — same forgetting on the bootstrap-preloaded path, which returns early: the
				//// preloaded settings are the restaurant mode, whatever an old device still stores
				//// (82fcc1bf, 2026-03-20 kept it here).
				initRestaurantMode();
				isLoaded.value = true;
				isLoading.value = false;
				return true;
			}
		} catch {
			// Bootstrap store may not be available, fall through to API call
		}

		// Fallback to API call
		try {
			await settingsResource.submit({ pos_profile: posProfile });
			//// Neoffice — same forgetting after the API fallback: the loaded settings are the mode.
			initRestaurantMode();
			return true;
		} catch {
			return false;
		}
	}

	function resetSettings() {
		settings.value = {
			pos_profile: "",
			enabled: 0,
			// Wallet & Loyalty Settings
			enable_loyalty_program: 0,
			default_loyalty_program: "",
			wallet_account: "",
			auto_create_wallet: 1,
			loyalty_to_wallet: 1,
			magento_loyalty_available: 0,
			miraaya_installed: 0,
			// General Settings
			max_discount_allowed: 0,
			use_percentage_discount: 0,
			allow_user_to_edit_additional_discount: 0,
			allow_user_to_edit_item_discount: 1,
			allow_user_to_edit_rate: 0,
			disable_rounded_total: 1,
			allow_credit_sale: 0,
			allow_customer_credit_payment: 0,
			allow_return: 0,
			allow_write_off_change: 0,
			allow_partial_payment: 0,
			use_exact_amount: 0,
			default_card_view: 0,
			display_item_code: 1,
			show_customer_balance: 0,
			hide_expected_amount: 0,
			display_discount_percentage: 0,
			display_discount_amount: 0,
			show_variants_as_items: 0,
			cart_lifo: 0,
			allow_sales_order: 0,
			allow_select_sales_order: 0,
			create_only_sales_order: 0,
			allow_return_without_invoice: 0,
			allow_free_batch_return: 0,
			allow_print_draft_invoices: 0,
			decimal_precision: "2",
			allow_customer_purchase_order: 0,
			allow_duplicate_customer_names: 0,
			fetch_coupon: 0,
			allow_print_last_invoice: 0,
			silent_print: 0,
			use_delivery_charges: 0,
			auto_set_delivery_charges: 0,
			use_limit_search: 0,
			search_limit: 1000,
			allow_submissions_in_background_job: 0,
			allow_delete_offline_invoice: 0,
			allow_change_posting_date: 0,
			input_qty: 0,
			allow_negative_stock: 0,
			enable_sales_persons: "Disabled",
			//// Neoffice — resetSettings has to zero OUR fields too, otherwise a logout left the previous
			//// terminal's customer-display and restaurant configuration in place for the next cashier
			//// (8bffb770 2026-02-04 customer display; 8aa35c29 2026-03-20 restaurant mode).
			// Customer Display Settings
			enable_customer_display: 0,
			enable_customer_display_account_creation: 0,
			customer_display_show_address_fields: 0,
			// Restaurant Settings
			enable_restaurant_mode: 0,
			//// Neoffice — the restaurant a till works for is zeroed with the rest (NeoRestau lot 1, task 2), and what
			//// the previous user could manage of it (task 3): the next cashier is told his own rights.
			restaurant: "",
			restaurant_name: "",
			restaurant_can: {},
			default_restaurant_area: "",
			// Security
			enable_session_lock: 0,
			session_lock_timeout: 5,
			//// Neoffice — same for the closing-withdrawal template (5783eb27, 2026-03-28).
			// Cash Management
			closing_withdrawal_template: "",
		};
		isLoaded.value = false;
	}

	/**
	 * Validate discount amount against max discount setting
	 * @param {number} discountPercentage - The discount percentage to validate
	 * @returns {boolean} - True if discount is allowed, false otherwise
	 */
	function validateDiscount(discountPercentage) {
		if (!isEnabled.value || maxDiscountAllowed.value === 0) {
			return true; // No restriction if settings disabled or max = 0
		}

		return discountPercentage <= maxDiscountAllowed.value;
	}

	/**
	 * Check if negative stock is allowed
	 * @returns {boolean} - True if negative stock is allowed
	 */
	function isNegativeStockAllowed() {
		return isEnabled.value && Boolean(settings.value.allow_negative_stock);
	}

	/**
	 * Check if stock validation should be enforced
	 * @returns {boolean} - True if stock validation should prevent negative stock
	 */
	function shouldEnforceStockValidation() {
		return isEnabled.value && !Boolean(settings.value.allow_negative_stock);
	}

	/**
	 * Force reload settings from server
	 * This is called when settings are changed in the settings dialog
	 * to ensure all components have the latest settings immediately
	 */
	async function reloadSettings() {
		if (!settings.value.pos_profile) {
			return false;
		}

		isLoading.value = true;

		try {
			// Use submit with pos_profile to ensure proper reload
			await settingsResource.submit({ pos_profile: settings.value.pos_profile });
			return true;
		} catch {
			return false;
		}
	}

	//// Neoffice — a till is a restaurant till or a counter till by its OWN POS Settings
	//// (enable_restaurant_mode, "Default Restaurant Mode" on its POS Profile), never by a switch on the
	//// device. The header switch and the per-device override it wrote (8aa35c29, 82fcc1bf, 2026-03-20)
	//// are gone: this only forgets the key old devices still carry, so a stale "1" or "0" can never
	//// win over the setting again.
	/**
	 * Forget the legacy per-device restaurant-mode override; the mode is settings.enable_restaurant_mode
	 */
	function initRestaurantMode() {
		//// Neoffice — only removes the old device override described above; nothing reads the key.
		try {
			localStorage.removeItem("pos_next_restaurant_mode");
		} catch {
			// Storage can be blocked (private mode); the key is a leftover that nothing reads
		}
	}

	return {
		// State
		settings,
		isLoading,
		isLoaded,

		// Computed - Wallet & Loyalty Settings
		enableLoyaltyProgram,
		defaultLoyaltyProgram,
		walletAccount,
		autoCreateWallet,
		loyaltyToWallet,
		magentoLoyaltyAvailable,
		miraayaInstalled,

		// Computed - General Settings
		isEnabled,
		maxDiscountAllowed,
		usePercentageDiscount,
		allowAdditionalDiscount,
		allowItemDiscount,
		allowUserToEditRate,
		disableRoundedTotal,
		allowCreditSale,
		allowCustomerCreditPayment,
		allowReturn,
		allowWriteOffChange,
		allowPartialPayment,
		useExactAmount,

		// Computed - Display Settings
		defaultCardView,
		displayItemCode,
		showCustomerBalance,
		hideExpectedAmount,
		displayDiscountPercentage,
		displayDiscountAmount,
		showVariantsAsItems,
		cartLifo,

		// Computed - Operations
		allowSalesOrder,
		allowSelectSalesOrder,
		createOnlySalesOrder,
		allowReturnWithoutInvoice,
		allowFreeBatchReturn,
		allowPrintDraftInvoices,

		// Computed - Pricing & Display
		decimalPrecision,

		// Computed - Customer Settings
		allowCustomerPurchaseOrder,
		allowDuplicateCustomerNames,
		fetchCoupon,

		// Computed - Printing
		allowPrintLastInvoice,
		silentPrint,

		// Computed - Delivery
		useDeliveryCharges,
		autoSetDeliveryCharges,

		// Computed - Advanced Settings
		useLimitSearch,
		searchLimit,
		allowSubmissionsInBackgroundJob,
		allowDeleteOfflineInvoice,
		allowChangePostingDate,

		// Computed - Miscellaneous
		inputQty,
		allowNegativeStock,

		// Computed - Sales Persons
		enableSalesPersons,
		salesPersonsMode,
		isSingleSalesPerson,
		isMultipleSalesPersons,

		//// Neoffice — exports for the restaurant and customer-display blocks above; no upstream
		//// equivalent (8aa35c29 2026-03-20; 8bffb770 2026-02-04).
		// Computed - Restaurant Settings
		enableRestaurantMode,
		defaultRestaurantArea,

		// Computed - Customer Display Settings
		enableCustomerDisplay,
		enableCustomerDisplayAccountCreation,
		showAddressFieldsInCustomerForm,

		// Computed - Security
		enableSessionLock,
		sessionLockTimeout,

		//// Neoffice — export for the closing-withdrawal template (5783eb27, 2026-03-28).
		// Computed - Cash Management
		closingWithdrawalTemplate,

		// Actions
		loadSettings,
		reloadSettings,
		resetSettings,
		validateDiscount,
		isNegativeStockAllowed,
		shouldEnforceStockValidation,
		//// Neoffice — no restaurant-mode toggle any more, the till's own setting decides; only the
		//// clean-up of the old device override stays exported (8aa35c29, 82fcc1bf, 2026-03-20).
		initRestaurantMode,
	};
});
