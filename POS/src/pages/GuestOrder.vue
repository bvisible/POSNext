<template>
	<div class="flex flex-col h-screen bg-gray-50 overflow-hidden" style="max-height: 100dvh;">
		<!-- Loading State -->
		<div v-if="isValidating" class="flex-1 flex flex-col items-center justify-center p-8">
			<svg class="w-10 h-10 text-blue-500 animate-spin mb-4" fill="none" viewBox="0 0 24 24">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
				<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
			</svg>
			<p class="text-gray-600">{{ __('Loading menu...') }}</p>
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
		</div>

		<!-- Main Content (loaded) -->
		<template v-else>
			<!-- Header -->
			<div class="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
				<div class="flex items-center justify-between">
					<div>
						<h1 class="text-base font-bold text-gray-900">
							{{ tableInfo?.table_name || __('Order') }}
						</h1>
						<p v-if="tableInfo" class="text-xs text-gray-500">
							{{ tableInfo.area_name || '' }}
						</p>
					</div>
					<!-- Cart badge shortcut -->
					<button
						v-if="activeTab !== 'cart'"
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
						@click="activeTab = 'menu'"
						:class="[
							'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
							activeTab === 'menu' ? 'text-blue-600' : 'text-gray-500',
						]"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
						</svg>
						{{ __('Menu') }}
					</button>

					<!-- Cart tab -->
					<button
						@click="activeTab = 'cart'"
						:class="[
							'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors relative',
							activeTab === 'cart' ? 'text-blue-600' : 'text-gray-500',
						]"
					>
						<div class="relative">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
							</svg>
							<span
								v-if="guestStore.cartItemCount > 0"
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
						<div class="relative">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
							</svg>
							<!-- Remaining amount badge -->
							<span
								v-if="guestStore.orderTotal > 0 && !guestStore.isFullyPaid"
								class="absolute -top-1.5 -right-2 w-4 h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
							>
								!
							</span>
						</div>
						{{ __('Pay') }}
					</button>
				</div>
			</div>
		</template>
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
const activeTab = ref(urlParams.get("payment") ? "pay" : "menu")
const isValidating = ref(true)
const tokenError = ref(false)

const tableInfo = computed(() => guestStore.tableInfo)

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
		// Subscribe to realtime updates after validation
		guestStore.subscribeToRealtime()
	} catch {
		tokenError.value = true
	} finally {
		isValidating.value = false
	}
})

onUnmounted(() => {
	guestStore.reset()
})

function handleOrderSent() {
	// After sending order, switch to Pay tab
	activeTab.value = "pay"
}
</script>

<style scoped>
.safe-area-bottom {
	padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>
