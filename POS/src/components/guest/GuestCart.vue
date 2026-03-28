<template>
	<div class="flex flex-col h-full bg-gray-50 overflow-hidden">
		<!-- Empty State -->
		<div v-if="cart.length === 0" class="flex-1 flex flex-col items-center justify-center p-8 text-gray-400">
			<svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
			</svg>
			<p class="text-base font-medium text-gray-500">{{ __('Your cart is empty') }}</p>
			<p class="text-sm text-gray-400 mt-1">{{ __('Add items from the menu') }}</p>
		</div>

		<!-- Cart Items -->
		<div v-else class="flex-1 overflow-y-auto p-3 space-y-2">
			<div
				v-for="(entry, index) in cart"
				:key="index"
				class="bg-white rounded-xl border border-gray-200 p-3 shadow-sm"
			>
				<div class="flex items-start gap-3">
					<!-- Item Info -->
					<div class="flex-1 min-w-0">
						<p class="text-sm font-semibold text-gray-900 leading-tight">
							{{ entry.item.item_name }}
						</p>
						<!-- Modifiers -->
						<div v-if="entry.modifiers && entry.modifiers.length" class="mt-0.5 space-y-0.5">
							<p
								v-for="mod in entry.modifiers"
								:key="mod.option"
								class="text-xs text-gray-500"
							>
								+ {{ mod.option_name }}
								<span v-if="mod.additional_price"> (+{{ formatPrice(mod.additional_price) }})</span>
							</p>
						</div>
						<p class="text-sm font-semibold text-blue-600 mt-1">
							{{ formatPrice(entry.price * entry.qty) }}
						</p>
					</div>

					<!-- Qty Controls + Remove -->
					<div class="flex flex-col items-end gap-2 flex-shrink-0">
						<!-- Remove button -->
						<button
							@click="guestStore.removeFromCart(index)"
							class="text-gray-400 hover:text-red-500 transition-colors"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
						<!-- Qty controls -->
						<div class="flex items-center gap-2">
							<button
								@click="guestStore.updateCartQty(index, entry.qty - 1)"
								class="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 active:bg-gray-100"
							>
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4"/>
								</svg>
							</button>
							<span class="text-sm font-bold text-gray-900 w-5 text-center">{{ entry.qty }}</span>
							<button
								@click="guestStore.updateCartQty(index, entry.qty + 1)"
								class="w-7 h-7 rounded-full border border-blue-400 flex items-center justify-center text-blue-600 active:bg-blue-50"
							>
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
								</svg>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Footer: Total + Send Order -->
		<div v-if="cart.length > 0" class="bg-white border-t border-gray-200 p-4 flex-shrink-0">
			<!-- Subtotal -->
			<div class="flex items-center justify-between mb-3">
				<span class="text-sm text-gray-600">{{ __('Total') }}</span>
				<span class="text-lg font-bold text-gray-900">{{ formatPrice(guestStore.cartTotal) }}</span>
			</div>

			<!-- Error -->
			<div v-if="guestStore.error" class="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
				<p class="text-xs text-red-600">{{ guestStore.error }}</p>
			</div>

			<!-- Send Order button (hidden for takeaway where payment comes first) -->
			<button
				v-if="!props.hideSendOrder"
				@click="handleSendOrder"
				:disabled="guestStore.isLoading || cart.length === 0"
				class="w-full py-3.5 bg-green-600 text-white font-semibold rounded-xl active:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
			>
				<svg v-if="guestStore.isLoading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
				</svg>
				<span>{{ __('Send Order') }}</span>
			</button>
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue"
import { useGuestOrderStore } from "@/stores/guestOrder"

const props = defineProps({
	hideSendOrder: {
		type: Boolean,
		default: false,
	},
})

const emit = defineEmits(["order-sent"])

const guestStore = useGuestOrderStore()
const cart = computed(() => guestStore.cart)

function formatPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: window.frappe?.boot?.sysdefaults?.currency || "EUR",
		minimumFractionDigits: 2,
	}).format(amount)
}

async function handleSendOrder() {
	try {
		await guestStore.submitOrder()
		emit("order-sent")
	} catch {
		// Error is stored in guestStore.error
	}
}
</script>
