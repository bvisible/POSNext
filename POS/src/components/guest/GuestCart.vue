<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The diner's own cart on their phone: -->
	<!-- //// they scan the QR on the table (or open the takeaway link) and order without a -->
	<!-- //// cashier. Upstream POSNext is a staffed retail till and has no guest-facing ordering -->
	<!-- //// at all. (3939a848, 2026-03-28 "QR self-ordering and takeaway web ordering"; eec958db -->
	<!-- //// adds order tracking, 89b67857 clears the cart once the order is fully paid, 14f151fc -->
	<!-- //// takes the currency from the POS Profile instead of a hardcoded EUR, e4769383 the -->
	<!-- //// clay retheme.) -->
	<div class="flex flex-col h-full bg-gray-50 overflow-hidden">
		<!-- Fully Paid State -->
		<div v-if="guestStore.isFullyPaid" class="flex-1 flex flex-col items-center justify-center p-8 text-gray-400">
			<div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
				<svg class="w-9 h-9 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
				</svg>
			</div>
			<p class="text-base font-medium text-green-700">{{ __('Order paid') }}</p>
			<p class="text-sm text-gray-400 mt-1">{{ __('Thank you for your visit!') }}</p>
		</div>

		<!-- Empty State (no cart items AND no ordered items) -->
		<div v-else-if="cart.length === 0 && orderItems.length === 0" class="flex-1 flex flex-col items-center justify-center p-8 text-gray-400">
			<svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
			</svg>
			<p class="text-base font-medium text-gray-500">{{ __('Your cart is empty') }}</p>
			<p class="text-sm text-gray-400 mt-1">{{ __('Add items from the menu') }}</p>
		</div>

		<div v-else class="flex-1 overflow-y-auto">
			<!-- Ordered Items (already sent to kitchen) -->
			<div v-if="orderItems.length > 0" class="p-3 pb-0">
				<h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
					{{ __('Ordered') }}
				</h3>
				<div class="space-y-1.5">
					<div
						v-for="(oItem, idx) in orderItems"
						:key="'o-' + idx"
						class="bg-white rounded-xl border border-gray-100 p-3 opacity-80"
					>
						<div class="flex items-center gap-3">
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-gray-700 leading-tight">
									{{ oItem.qty }}× {{ oItem.item_name }}
								</p>
								<p v-if="oItem.posa_special_instructions" class="text-xs text-gray-400 mt-0.5">
									{{ oItem.posa_special_instructions }}
								</p>
							</div>
							<div class="flex items-center gap-2 flex-shrink-0">
								<span class="text-xs text-gray-500">{{ formatPrice(oItem.amount ?? oItem.qty * oItem.rate) }}</span>
								<!-- KDS Status Badge -->
								<span
									class="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
									:style="getStatusStyle(oItem.kds_status)"
								>{{ getStatusLabel(oItem.kds_status) }}</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Cart Items (not yet sent) -->
			<div v-if="cart.length > 0" class="p-3">
				<h3 v-if="orderItems.length > 0" class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
					{{ __('New items') }}
				</h3>
				<div class="space-y-2">
					<div
						v-for="(entry, index) in cart"
						:key="'c-' + index"
						class="bg-white rounded-xl border border-blue-200 p-3 shadow-sm"
					>
						<div class="flex items-start gap-3">
							<div class="flex-1 min-w-0">
								<p class="text-sm font-semibold text-gray-900 leading-tight">
									{{ entry.item.item_name }}
								</p>
								<div v-if="entry.modifiers && entry.modifiers.length" class="mt-0.5 space-y-0.5">
									<p v-for="mod in entry.modifiers" :key="mod.option" class="text-xs text-gray-500">
										+ {{ mod.option_name }}
										<span v-if="mod.additional_price"> (+{{ formatPrice(mod.additional_price) }})</span>
									</p>
								</div>
								<p class="text-sm font-semibold text-blue-600 mt-1">
									{{ formatPrice(entry.price * entry.qty) }}
								</p>
							</div>
							<div class="flex flex-col items-end gap-2 flex-shrink-0">
								<button @click="guestStore.removeFromCart(index)" class="text-gray-400 hover:text-red-500 transition-colors">
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
									</svg>
								</button>
								<div class="flex items-center gap-2">
									<button @click="guestStore.updateCartQty(index, entry.qty - 1)"
										class="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 active:bg-gray-100">
										<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4"/>
										</svg>
									</button>
									<span class="text-sm font-bold text-gray-900 w-5 text-center">{{ entry.qty }}</span>
									<button @click="guestStore.updateCartQty(index, entry.qty + 1)"
										class="w-7 h-7 rounded-full border border-blue-400 flex items-center justify-center text-blue-600 active:bg-blue-50">
										<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
										</svg>
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Footer: Total + Send Order -->
		<div v-if="cart.length > 0" class="bg-white border-t border-gray-200 p-4 flex-shrink-0">
			<div class="flex items-center justify-between mb-3">
				<span class="text-sm text-gray-600">{{ __('New items') }}</span>
				<span class="text-lg font-bold text-gray-900">{{ formatPrice(guestStore.cartTotal) }}</span>
			</div>
			<div v-if="guestStore.error" class="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
				<p class="text-xs text-red-600">{{ guestStore.error }}</p>
			</div>
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
const orderItems = computed(() => guestStore.orderItems)

function formatPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: guestStore.currency || "CHF",
		minimumFractionDigits: 2,
	}).format(amount)
}

function getStatusLabel(status) {
	const labels = {
		"Pending": __("In queue"),
		"Waiting": __("Waiting"),
		"Preparing": __("Preparing"),
		"Ready": __("Ready"),
		"Delivered": __("Delivered"),
	}
	return labels[status] || status || __("Sent")
}

function getStatusStyle(status) {
	const styles = {
		"Pending": "background-color: #FEF3C7; color: #92400E;",
		"Waiting": "background-color: #E0E7FF; color: #3730A3;",
		"Preparing": "background-color: #DBEAFE; color: #a15a2e;",
		"Ready": "background-color: #D1FAE5; color: #065F46;",
		"Delivered": "background-color: #F3F4F6; color: #6B7280;",
	}
	return styles[status] || "background-color: #FEF3C7; color: #92400E;"
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
