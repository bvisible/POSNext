<template>
	<!-- //// Neoffice — added file (no upstream equivalent). QR self-ordering at the -->
	<!-- //// table: the guest scans the code on the table, lands on /pos/guest/:token -->
	<!-- //// with no account, browses the menu, orders and pays from their own phone. -->
	<!-- //// Upstream POSNext is cashier-only and has no guest surface at all (3939a848, -->
	<!-- //// 2026-03-28 "QR self-ordering and takeaway web ordering"). The nine fixes of -->
	<!-- //// 2026-03-29 folded in here are one story — what the guest sees when the -->
	<!-- //// payment provider bounces them back: a thank-you page even on an expired -->
	<!-- //// token (abc084dd, f0c3bc64), a way out of the error page (a0e06b68, -->
	<!-- //// 685da596), the amount and the lock once paid (2e00caf8, d213abb2), and not -->
	<!-- //// losing the cart afterwards (89b67857, 3b805c88, d5a11720). -->
	<div class="flex flex-col h-screen bg-gray-50 overflow-hidden" style="max-height: 100dvh;">
		<!-- Loading State -->
		<div v-if="isValidating" class="flex-1 flex flex-col items-center justify-center p-8">
			<svg class="w-10 h-10 text-blue-500 animate-spin mb-4" fill="none" viewBox="0 0 24 24">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
				<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
			</svg>
			<p class="text-gray-600">{{ __('Loading menu...') }}</p>
		</div>

		<!-- Payment success on expired token (returned from Wallee after table was cleared) -->
		<div v-else-if="tokenError && paymentReturnStatus === 'success'" class="flex-1 flex items-center justify-center p-4 bg-gray-50">
			<div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
				<div class="w-16 h-16 rounded-full bg-green-100 mx-auto mb-4 flex items-center justify-center">
					<svg class="w-9 h-9 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
					</svg>
				</div>
				<h3 class="text-lg font-bold text-gray-900 mb-2">{{ __('Thank you!') }}</h3>
				<p class="text-sm text-gray-600">{{ __('Your payment has been recorded.') }}</p>
				<p class="text-sm text-green-600 font-medium mt-2">{{ __('Thank you for your visit, we hope to see you again soon!') }}</p>
				<p class="text-xs text-gray-400 mt-4">{{ __('This page will close automatically.') }}</p>
			</div>
		</div>

		<!-- Error / Invalid Token State -->
		<div v-else-if="tokenError" class="flex-1 flex flex-col items-center justify-center p-8 text-center">
			<div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
				<svg class="w-9 h-9 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
				</svg>
			</div>
			<h2 class="text-xl font-bold text-gray-900 mb-2">{{ __('Invalid or expired link') }}</h2>
			<p class="text-sm text-gray-500">{{ __('Please ask your server to generate a new QR code.') }}</p>
			<button
				@click="$router.back()"
				class="mt-6 px-6 py-3 bg-gray-200 text-gray-700 font-medium rounded-xl active:bg-gray-300 transition-colors"
			>{{ __('Back') }}</button>
		</div>

		<!-- Main Content (loaded) -->
		<template v-else>
			<!-- Header -->
			<div class="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<!-- Restaurant logo -->
						<img
							v-if="siteLogo"
							:src="siteLogo"
							class="w-8 h-8 object-contain rounded"
							alt="Logo"
						/>
						<div>
							<h1 class="text-base font-bold text-gray-900">
								{{ tableInfo?.table_name || __('Order') }}
							</h1>
							<p v-if="tableInfo" class="text-xs text-gray-500">
								{{ tableInfo.area_name || '' }}
							</p>
						</div>
					</div>
					<!-- Cart badge shortcut -->
					<button
						v-if="activeTab !== 'cart' && !isOrderLocked"
						@click="activeTab = 'cart'"
						class="relative p-2"
					>
						<svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
						</svg>
						<span
							v-if="guestStore.cartItemCount > 0"
							class="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
						>
							{{ guestStore.cartItemCount > 9 ? '9+' : guestStore.cartItemCount }}
						</span>
					</button>
				</div>
			</div>

			<!-- Tab Content -->
			<div class="flex-1 overflow-hidden">
				<GuestMenuView v-show="activeTab === 'menu'" />
				<GuestCart
					v-show="activeTab === 'cart'"
					@order-sent="handleOrderSent"
				/>
				<GuestCheckout v-show="activeTab === 'pay'" />
			</div>

			<!-- Bottom Navigation -->
			<div class="bg-white border-t border-gray-200 flex-shrink-0 safe-area-bottom">
				<div class="flex">
					<!-- Menu tab -->
					<button
						@click="isOrderLocked ? null : (activeTab = 'menu')"
						:class="[
							'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
							isOrderLocked ? 'text-gray-300 cursor-not-allowed' : activeTab === 'menu' ? 'text-blue-600' : 'text-gray-500',
						]"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
						</svg>
						{{ __('Menu') }}
					</button>

					<!-- Cart tab -->
					<button
						@click="isOrderLocked ? null : (activeTab = 'cart')"
						:class="[
							'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors relative',
							isOrderLocked ? 'text-gray-300 cursor-not-allowed' : activeTab === 'cart' ? 'text-blue-600' : 'text-gray-500',
						]"
					>
						<div class="relative">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
							</svg>
							<span
								v-if="guestStore.cartItemCount > 0 && !isOrderLocked"
								class="absolute -top-1.5 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
							>
								{{ guestStore.cartItemCount > 9 ? '9+' : guestStore.cartItemCount }}
							</span>
						</div>
						{{ __('Cart') }}
					</button>

					<!-- Pay tab -->
					<button
						@click="activeTab = 'pay'"
						:class="[
							'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
							activeTab === 'pay' ? 'text-blue-600' : 'text-gray-500',
						]"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
						</svg>
						<!-- Remaining amount or checkmark -->
						<template v-if="guestStore.isFullyPaid">
							<span class="text-green-600">{{ __('Paid') }} ✓</span>
						</template>
						<template v-else-if="guestStore.orderTotal > 0">
							<span class="text-orange-600 font-semibold">{{ formatPrice(guestStore.remainingAmount) }}</span>
						</template>
						<template v-else>
							{{ __('Pay') }}
						</template>
					</button>
				</div>
			</div>
		</template>

		<!-- Order Sent Confirmation Dialog -->
		<div v-if="showOrderSentDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div class="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 text-center">
				<div class="w-14 h-14 rounded-full bg-green-100 mx-auto mb-4 flex items-center justify-center">
					<svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
					</svg>
				</div>
				<h3 class="text-lg font-bold text-gray-900 mb-1">{{ __('Order sent!') }}</h3>
				<p class="text-sm text-gray-600">{{ __('Your order has been sent to the kitchen. You can continue browsing the menu.') }}</p>
				<button
					@click="showOrderSentDialog = false"
					class="mt-5 w-full py-3 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 transition-colors"
				>{{ __('OK') }}</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue"
import { useRoute } from "vue-router"
import { useGuestOrderStore } from "@/stores/guestOrder"
import GuestMenuView from "@/components/guest/GuestMenuView.vue"
import GuestCart from "@/components/guest/GuestCart.vue"
import GuestCheckout from "@/components/guest/GuestCheckout.vue"

const route = useRoute()
const guestStore = useGuestOrderStore()

// Auto-switch to Pay tab if returning from Wallee payment
const urlParams = new URLSearchParams(window.location.search)
const paymentReturnStatus = urlParams.get("payment") // 'success' | 'failed' | null
const activeTab = ref(paymentReturnStatus ? "pay" : "menu")
const isValidating = ref(true)
const tokenError = ref(false)

const tableInfo = computed(() => guestStore.tableInfo)

// Lock ordering when fully paid (table settled)
const isOrderLocked = computed(() => guestStore.isFullyPaid)

// Get company logo from API
const siteLogo = computed(() => guestStore.companyLogo)

function formatPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: guestStore.currency || "CHF",
		minimumFractionDigits: 2,
	}).format(amount)
}

onMounted(async () => {
	const token = route.params.token
	if (!token) {
		tokenError.value = true
		isValidating.value = false
		return
	}

	try {
		await guestStore.validateToken(token)
		await guestStore.fetchMenu()
		await guestStore.refreshOrderStatus()
		// Auto-switch to Pay tab if already fully paid
		if (guestStore.isFullyPaid) {
			activeTab.value = "pay"
		}
		// Subscribe to realtime updates after validation
		guestStore.subscribeToRealtime()
	} catch {
		tokenError.value = true
		// Auto-close tab after 5s if returning from successful payment on expired token
		if (paymentReturnStatus === "success") {
			setTimeout(() => { window.close() }, 5000)
		}
	} finally {
		isValidating.value = false
	}
})

onUnmounted(() => {
	guestStore.reset()
})

const showOrderSentDialog = ref(false)

function handleOrderSent() {
	// Show confirmation popup and stay on cart
	showOrderSentDialog.value = true
}

</script>

<style scoped>
.safe-area-bottom {
	padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>
