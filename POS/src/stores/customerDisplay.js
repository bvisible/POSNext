//// Neoffice — added file (no upstream equivalent). Upstream POSNext has one screen, the
//// cashier's. Swiss counters must show the customer what is being rung up, so this store
//// drives a second, customer-facing screen: API-key pairing, cart mirrored over Socket.IO
//// with a 5 s polling fallback for flaky counter Wi-Fi, an idle In-App Ads carousel, and
//// the TWINT payment QR mirrored full-screen so the customer scans from their own side. It
//// pins the launching POS's exact shift (?opening= & ?profile=) instead of guessing "the
//// most recent open shift on this profile", and can create a customer — with the structured
//// street + N° fields of ADR-002 — from the customer's side. (185c3c50 2026-02-03;
//// 912ef092 2026-02-04; 87f168fe + bcc36a22 2026-03-20/25; 9a807f74 + 14a49016 2026-06-01;
//// 34ad77fe 2026-06-02; d7584e7b 2026-07-17)
/**
 * Customer Display Store
 *
 * Manages state and logic for the customer-facing display screen.
 * Handles authentication, cart synchronization, and customer creation.
 *
 * Features:
 * - API key authentication
 * - Real-time cart updates via Socket.IO
 * - Polling fallback for unreliable connections
 * - Customer creation from display
 */

import { createResource } from "frappe-ui"
import { defineStore } from "pinia"
import { computed, ref, watch } from "vue"
import { logger } from "@/utils/logger"

const log = logger.create("CustomerDisplay")

// Local storage keys
const STORAGE_KEY_API_KEY = "pos_display_api_key"
const STORAGE_KEY_POS_PROFILE = "pos_display_pos_profile"
const STORAGE_KEY_POS_OPENING = "pos_display_pos_opening"

// Polling interval for fallback (5 seconds)
const POLLING_INTERVAL_MS = 5000

export const useCustomerDisplayStore = defineStore("customerDisplay", () => {
	// ========================================================================
	// STATE
	// ========================================================================

	// Authentication state
	const apiKey = ref(localStorage.getItem(STORAGE_KEY_API_KEY) || "")
	const isAuthenticated = ref(false)
	const user = ref(null)
	const authError = ref(null)

	// POS session state
	const posProfile = ref(localStorage.getItem(STORAGE_KEY_POS_PROFILE) || "")
	const posProfiles = ref([])
	const posOpeningEntry = ref(
		localStorage.getItem(STORAGE_KEY_POS_OPENING) || "",
	)
	const sessionInfo = ref(null)

	// Launch params (?opening=…&profile=…) — set when the display is opened
	// from a POS so it follows that exact cashier's shift instead of guessing
	// "the most recent open shift on this profile".
	const _launchParams = new URLSearchParams(window.location.search)
	const pinnedOpeningEntry = ref(_launchParams.get("opening") || "")
	const pinnedProfile = ref(_launchParams.get("profile") || "")

	// Cart state
	const cartData = ref({
		items: [],
		customer: null,
		customer_name: null,
		subtotal: 0,
		total_tax: 0,
		discount_amount: 0,
		grand_total: 0,
		currency: "EUR",
		_updated_at: null,
	})

	// Connection state
	const isConnected = ref(false)
	const isPolling = ref(false)
	const lastUpdateTime = ref(null)
	const connectionError = ref(null)

	// UI state
	const showThankYou = ref(false)
	const lastSaleAmount = ref(0)
	const isLoading = ref(false)

	// Payment QR shown full-screen while a QR-bridge payment (TWINT) awaits the
	// customer's scan. Shape: {pairing_token, amount, currency, mode_of_payment,
	// provider} or null when none is active.
	const paymentQR = ref(null)

	// In-App Ads shown on the idle (empty-cart) screen. Empty array → keep the
	// default "waiting for items" placeholder; one → still image; several →
	// auto-scrolling carousel.
	const ads = ref([])

	// Display settings (from POS Settings)
	const displaySettings = ref({
		enableCustomerDisplay: false,
		enableAccountCreation: false,
		showAddressFields: false,
		hasLoyaltyProgram: false,
	})

	// Polling timer
	let pollingTimer = null
	let realtimeCleanup = null

	// ========================================================================
	// RESOURCES
	// ========================================================================

	// Note: We use fetch directly for validate_api_key because it's a guest endpoint
	// and frappe-ui's createResource may have issues with CSRF tokens for guest requests

	const getPosProfilesResource = createResource({
		url: "pos_next.api.customer_display.get_pos_profiles",
		auto: false,
	})

	const getPosOpeningEntryResource = createResource({
		url: "pos_next.api.customer_display.get_pos_opening_entry",
		auto: false,
	})

	const getCurrentCartResource = createResource({
		url: "pos_next.api.customer_display.get_current_cart",
		auto: false,
	})

	const createCustomerResource = createResource({
		url: "pos_next.api.customer_display.create_customer_from_display",
		auto: false,
	})

	const getDisplaySettingsResource = createResource({
		url: "pos_next.api.customer_display.get_display_settings",
		auto: false,
	})

	const getAdsResource = createResource({
		url: "pos_next.api.customer_display.get_in_app_ads",
		auto: false,
	})

	// ========================================================================
	// COMPUTED
	// ========================================================================

	const itemCount = computed(() => cartData.value.items?.length || 0)
	const hasItems = computed(() => itemCount.value > 0)
	const hasCustomer = computed(() => !!cartData.value.customer)

	const formattedTotal = computed(() => {
		const currency = cartData.value.currency || "EUR"
		const amount = cartData.value.grand_total || 0
		return new Intl.NumberFormat("fr-FR", {
			style: "currency",
			currency: currency,
		}).format(amount)
	})

	const connectionStatus = computed(() => {
		if (!isAuthenticated.value) return "disconnected"
		if (connectionError.value) return "error"
		if (isConnected.value) return "connected"
		if (isPolling.value) return "polling"
		return "connecting"
	})

	// ========================================================================
	// AUTHENTICATION
	// ========================================================================

	/**
	 * Validate API key and authenticate
	 * Uses direct fetch to avoid CSRF issues with guest endpoints
	 * @param {string} key - API key in format api_key:api_secret
	 * @returns {Promise<boolean>} Success status
	 */
	async function authenticate(key) {
		isLoading.value = true
		authError.value = null

		try {
			// Use direct fetch for guest endpoint to avoid CSRF issues
			const response = await fetch(
				"/api/method/pos_next.api.customer_display.validate_api_key",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Accept: "application/json",
					},
					body: new URLSearchParams({
						api_key_string: key,
					}),
				},
			)

			const data = await response.json()

			if (data.exc_type) {
				// Frappe error response
				throw new Error(
					data._server_messages
						? JSON.parse(data._server_messages)[0]
						: data.exc_type,
				)
			}

			const result = data.message
			if (result && result.success) {
				apiKey.value = key
				user.value = {
					name: result.user,
					full_name: result.full_name,
					email: result.email,
				}
				isAuthenticated.value = true

				// Save to localStorage
				localStorage.setItem(STORAGE_KEY_API_KEY, key)

				// Load POS profiles
				await loadPosProfiles()

				log.info("Authentication successful", { user: result.user })
				return true
			} else {
				throw new Error("Authentication failed")
			}
		} catch (error) {
			// Parse error message if it's JSON
			let errorMessage = error.message || "Authentication failed"
			try {
				if (errorMessage.startsWith("{")) {
					const parsed = JSON.parse(errorMessage)
					errorMessage = parsed.message || errorMessage
				}
			} catch {
				// Keep original message
			}
			authError.value = errorMessage
			log.error("Authentication failed", error)
		} finally {
			isLoading.value = false
		}

		return false
	}

	/**
	 * Load available POS profiles
	 */
	async function loadPosProfiles() {
		try {
			const profiles = await getPosProfilesResource.fetch()
			posProfiles.value = profiles || []

			// If saved profile exists and is valid, use it
			if (
				posProfile.value &&
				profiles.some((p) => p.name === posProfile.value)
			) {
				await selectPosProfile(posProfile.value)
			}
		} catch (error) {
			log.error("Failed to load POS profiles", error)
		}
	}

	/**
	 * Load display settings from POS Settings
	 * @param {string} profileName - POS Profile name
	 */
	async function loadDisplaySettings(profileName) {
		try {
			const settings = await getDisplaySettingsResource.fetch({
				pos_profile: profileName,
			})

			if (settings) {
				displaySettings.value = {
					enableCustomerDisplay: settings.enable_customer_display || false,
					enableAccountCreation: settings.enable_account_creation || false,
					showAddressFields: settings.show_address_fields || false,
					hasLoyaltyProgram: settings.has_loyalty_program || false,
				}
				log.info("Display settings loaded", displaySettings.value)
			}
		} catch (error) {
			log.error("Failed to load display settings", error)
			// Keep default settings on error
		}
	}

	/**
	 * Load the enabled In-App Ads for the idle carousel.
	 */
	async function loadAds() {
		try {
			const result = await getAdsResource.fetch()
			ads.value = Array.isArray(result) ? result : []
			log.info("In-App Ads loaded", { count: ads.value.length })
		} catch (error) {
			log.error("Failed to load In-App Ads", error)
			ads.value = []
		}
	}

	/**
	 * Select a POS profile and find active session
	 * @param {string} profileName - POS Profile name
	 */
	async function selectPosProfile(profileName, opening = null) {
		posProfile.value = profileName
		localStorage.setItem(STORAGE_KEY_POS_PROFILE, profileName)

		// Pinned opening entry: prefer the explicit arg, else the one captured
		// from the launch URL (?opening=…). This makes the display follow the
		// exact cashier that opened it, not "the most recent open shift".
		const pinnedOpening = opening || pinnedOpeningEntry.value || null

		try {
			// Load display settings for this profile
			await loadDisplaySettings(profileName)

			// Load the In-App Ads for the idle carousel (best-effort).
			loadAds()

			const entry = await getPosOpeningEntryResource.fetch({
				pos_profile: profileName,
				opening: pinnedOpening,
			})

			if (entry) {
				posOpeningEntry.value = entry.pos_opening_entry
				sessionInfo.value = entry
				localStorage.setItem(STORAGE_KEY_POS_OPENING, entry.pos_opening_entry)

				// Start listening for cart updates
				await startCartSync()
			} else {
				posOpeningEntry.value = ""
				sessionInfo.value = null
				localStorage.removeItem(STORAGE_KEY_POS_OPENING)
				connectionError.value = "No active POS session found"
			}
		} catch (error) {
			log.error("Failed to get POS opening entry", error)
			connectionError.value = error.message
		}
	}

	/**
	 * Logout and clear credentials
	 */
	function logout() {
		stopCartSync()

		apiKey.value = ""
		isAuthenticated.value = false
		user.value = null
		posProfile.value = ""
		posOpeningEntry.value = ""
		sessionInfo.value = null
		cartData.value = {
			items: [],
			customer: null,
			customer_name: null,
			subtotal: 0,
			total_tax: 0,
			discount_amount: 0,
			grand_total: 0,
			currency: "EUR",
			_updated_at: null,
		}

		localStorage.removeItem(STORAGE_KEY_API_KEY)
		localStorage.removeItem(STORAGE_KEY_POS_PROFILE)
		localStorage.removeItem(STORAGE_KEY_POS_OPENING)

		log.info("Logged out")
	}

	// ========================================================================
	// CART SYNCHRONIZATION
	// ========================================================================

	/**
	 * Start cart synchronization (realtime + polling fallback)
	 */
	async function startCartSync() {
		if (!posOpeningEntry.value) {
			log.warn("Cannot start cart sync without POS opening entry")
			return
		}

		// Stop any existing sync
		stopCartSync()

		// Fetch initial cart data
		await fetchCurrentCart()

		// Try to setup realtime listener
		setupRealtimeListener()

		// Start polling as fallback
		startPolling()

		log.info("Cart sync started", { posOpeningEntry: posOpeningEntry.value })
	}

	/**
	 * Stop cart synchronization
	 */
	function stopCartSync() {
		// Clean up realtime listener
		if (realtimeCleanup) {
			realtimeCleanup()
			realtimeCleanup = null
		}

		// Stop polling
		stopPolling()

		isConnected.value = false
		log.info("Cart sync stopped")
	}

	/**
	 * Setup Socket.IO realtime listener
	 */
	function setupRealtimeListener() {
		if (!window.frappe?.realtime) {
			log.warn("Socket.IO not available, using polling only")
			return
		}

		const cartEventName = `pos_cart_updated_${posOpeningEntry.value}`
		const saleEventName = `pos_sale_complete_${posOpeningEntry.value}`
		const customerEventName = `customer_created_${posOpeningEntry.value}`
		const paymentQREventName = `pos_payment_qr_${posOpeningEntry.value}`
		const paymentQRClearedEventName = `pos_payment_qr_cleared_${posOpeningEntry.value}`

		// Cart update handler
		const handleCartUpdate = (data) => {
			log.debug("Received cart update via realtime", data)
			updateCartData(data)
			isConnected.value = true
			connectionError.value = null
		}

		// Sale complete handler
		const handleSaleComplete = (data) => {
			log.info("Sale complete", data)
			paymentQR.value = null // retire any lingering payment QR
			showThankYouMessage(data.grand_total)
		}

		// Payment QR handlers (TWINT etc.)
		const handlePaymentQR = (data) => {
			log.debug("Received payment QR via realtime", data)
			paymentQR.value = data && data.pairing_token ? data : null
			isConnected.value = true
			connectionError.value = null
		}

		const handlePaymentQRCleared = () => {
			log.debug("Payment QR cleared via realtime")
			paymentQR.value = null
		}

		// Customer created handler (from main POS)
		const handleCustomerCreated = (data) => {
			log.info("Customer created notification", data)
			// Update displayed customer if created from display
			if (data.created_from === "customer_display") {
				cartData.value.customer = data.name
				cartData.value.customer_name = data.customer_name
			}
		}

		// Subscribe to events
		window.frappe.realtime.on(cartEventName, handleCartUpdate)
		window.frappe.realtime.on(saleEventName, handleSaleComplete)
		window.frappe.realtime.on(customerEventName, handleCustomerCreated)
		window.frappe.realtime.on(paymentQREventName, handlePaymentQR)
		window.frappe.realtime.on(paymentQRClearedEventName, handlePaymentQRCleared)

		// Store cleanup function
		realtimeCleanup = () => {
			window.frappe.realtime.off(cartEventName, handleCartUpdate)
			window.frappe.realtime.off(saleEventName, handleSaleComplete)
			window.frappe.realtime.off(customerEventName, handleCustomerCreated)
			window.frappe.realtime.off(paymentQREventName, handlePaymentQR)
			window.frappe.realtime.off(paymentQRClearedEventName, handlePaymentQRCleared)
		}

		log.info("Realtime listener setup complete")
	}

	/**
	 * Start polling for cart updates
	 */
	function startPolling() {
		if (pollingTimer) {
			return
		}

		isPolling.value = true
		pollingTimer = setInterval(async () => {
			await fetchCurrentCart()
		}, POLLING_INTERVAL_MS)

		log.info("Polling started", { interval: POLLING_INTERVAL_MS })
	}

	/**
	 * Stop polling
	 */
	function stopPolling() {
		if (pollingTimer) {
			clearInterval(pollingTimer)
			pollingTimer = null
		}
		isPolling.value = false
	}

	/**
	 * Fetch current cart data from server
	 */
	async function fetchCurrentCart() {
		if (!posOpeningEntry.value) {
			return
		}

		try {
			const data = await getCurrentCartResource.fetch({
				pos_opening_entry: posOpeningEntry.value,
			})

			if (data) {
				updateCartData(data)
				connectionError.value = null
			}
		} catch (error) {
			log.error("Failed to fetch cart", error)
			connectionError.value = error.message
		}
	}

	/**
	 * Update cart data from received payload
	 * @param {Object} data - Cart data
	 */
	function updateCartData(data) {
		if (!data) return

		// Sync the payment QR on the polling-fallback path: get_current_cart
		// always includes a `_payment_qr` key (object or null), whereas the
		// realtime cart event does not carry it (the QR has its own events).
		if ("_payment_qr" in data) {
			paymentQR.value = data._payment_qr || null
		}

		// Check if this is a "cleared" cart event
		if (data._cleared) {
			cartData.value = {
				items: [],
				customer: null,
				customer_name: null,
				subtotal: 0,
				total_tax: 0,
				discount_amount: 0,
				grand_total: 0,
				currency: data.currency || "EUR",
				_updated_at: data._updated_at,
			}
			return
		}

		cartData.value = {
			items: data.items || [],
			customer: data.customer || null,
			customer_name: data.customer_name || null,
			subtotal: data.subtotal || 0,
			total_tax: data.total_tax || 0,
			discount_amount: data.discount_amount || 0,
			grand_total: data.grand_total || 0,
			currency: data.currency || "EUR",
			_updated_at: data._updated_at || null,
		}

		lastUpdateTime.value = new Date()
	}

	// ========================================================================
	// CUSTOMER CREATION
	// ========================================================================

	/**
	 * Create a new customer from the display
	 * @param {Object} customerData - Customer data including optional address fields
	 * @returns {Promise<Object>} Created customer
	 */
	async function createCustomer(customerData) {
		if (!posOpeningEntry.value) {
			throw new Error("No active POS session")
		}

		isLoading.value = true

		try {
			const result = await createCustomerResource.fetch({
				customer_name: customerData.customer_name,
				customer_type: customerData.customer_type || "Individual",
				email: customerData.email || null,
				mobile_no: customerData.mobile_no || null,
				// Address fields
				address_line1: customerData.address_line1 || null,
				house_number: customerData.house_number || null,
				city: customerData.city || null,
				pincode: customerData.pincode || null,
				country: customerData.country || null,
				pos_opening_entry: posOpeningEntry.value,
			})

			if (result.success) {
				log.info("Customer created", result.customer)
				return result.customer
			}

			throw new Error("Failed to create customer")
		} catch (error) {
			log.error("Failed to create customer", error)
			throw error
		} finally {
			isLoading.value = false
		}
	}

	// ========================================================================
	// UI HELPERS
	// ========================================================================

	/**
	 * Show thank you message after sale
	 * @param {number} amount - Sale amount
	 */
	function showThankYouMessage(amount = 0) {
		lastSaleAmount.value = amount
		showThankYou.value = true

		// Auto-hide after 5 seconds
		setTimeout(() => {
			showThankYou.value = false
			lastSaleAmount.value = 0
		}, 5000)
	}

	/**
	 * Manually refresh cart data
	 */
	async function refreshCart() {
		await fetchCurrentCart()
	}

	/**
	 * Try to restore session from localStorage
	 */
	async function tryRestoreSession() {
		const savedApiKey = localStorage.getItem(STORAGE_KEY_API_KEY)
		const savedProfile = localStorage.getItem(STORAGE_KEY_POS_PROFILE)

		if (savedApiKey) {
			const success = await authenticate(savedApiKey)
			// Prefer the profile pinned via the launch URL over the last-used one.
			const profile = pinnedProfile.value || savedProfile
			if (success && profile) {
				await selectPosProfile(profile, pinnedOpeningEntry.value || null)
			}
			return success
		}

		return false
	}

	// ========================================================================
	// RETURN
	// ========================================================================

	return {
		// Auth state
		apiKey,
		isAuthenticated,
		user,
		authError,

		// POS session state
		posProfile,
		posProfiles,
		posOpeningEntry,
		sessionInfo,

		// Cart state
		cartData,
		itemCount,
		hasItems,
		hasCustomer,
		formattedTotal,

		// Connection state
		isConnected,
		isPolling,
		lastUpdateTime,
		connectionError,
		connectionStatus,

		// UI state
		showThankYou,
		lastSaleAmount,
		isLoading,
		paymentQR,
		ads,
		loadAds,

		// Display settings (from POS Settings)
		displaySettings,

		// Auth actions
		authenticate,
		logout,
		loadPosProfiles,
		selectPosProfile,
		tryRestoreSession,

		// Cart sync actions
		startCartSync,
		stopCartSync,
		refreshCart,

		// Customer actions
		createCustomer,

		// UI helpers
		showThankYouMessage,
	}
})
