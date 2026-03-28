<template>
	<div class="flex flex-col h-full bg-[var(--neo-bg)]">
		<!-- Empty cart state -->
		<div v-if="!displayStore.hasItems" class="flex-1 flex flex-col items-center justify-center">
			<div class="bg-white rounded-neo-lg shadow-neo p-12 text-center max-w-md">
				<div class="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
					<FeatherIcon name="shopping-bag" class="w-10 h-10 text-blue-400" />
				</div>
				<p class="text-xl font-semibold text-gray-800 mb-2">{{ __("Waiting for items") }}</p>
				<p class="text-sm text-gray-400">{{ __("Your items will appear here as they are scanned") }}</p>
			</div>
		</div>

		<!-- Cart with items -->
		<div v-else class="flex-1 flex flex-col overflow-hidden">
			<!-- Items list -->
			<div class="flex-1 overflow-y-auto p-5">
				<transition-group
					name="cart-item"
					tag="div"
					class="space-y-3"
				>
					<div
						v-for="(item, index) in reversedItems"
						:key="item.item_code + '-' + index"
						class="cart-item bg-white rounded-neo-md p-4 flex items-center gap-4 shadow-neo border border-gray-100 hover:shadow-neo-md transition-shadow"
					>
						<!-- Item image -->
						<div class="w-16 h-16 flex-shrink-0 bg-gray-50 rounded-neo-sm overflow-hidden border border-gray-100">
							<img
								v-if="item.image"
								:src="item.image"
								:alt="item.item_name"
								class="w-full h-full object-cover"
							/>
							<div v-else class="w-full h-full flex items-center justify-center">
								<FeatherIcon name="package" class="w-7 h-7 text-gray-300" />
							</div>
						</div>

						<!-- Item details -->
						<div class="flex-1 min-w-0">
							<h3 class="text-base font-semibold text-gray-900 truncate">
								{{ item.item_name }}
							</h3>
							<p class="text-xs text-gray-400 mt-0.5">
								{{ formatCurrency(item.rate) }} / {{ item.uom || __("Unit") }}
							</p>
							<!-- Show discount if applied -->
							<span v-if="item.discount_percentage" class="inline-flex items-center mt-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-200">
								-{{ item.discount_percentage }}%
							</span>
						</div>

						<!-- Quantity -->
						<div class="flex items-center justify-center w-14 h-14 bg-blue-50 rounded-neo-sm border border-blue-100">
							<div class="text-center">
								<span class="text-2xl font-bold text-blue-700 leading-none">{{ item.qty }}</span>
							</div>
						</div>

						<!-- Price -->
						<div class="text-right min-w-[110px]">
							<p class="text-lg font-bold text-gray-900">
								{{ formatCurrency(item.amount) }}
							</p>
						</div>
					</div>
				</transition-group>
			</div>

			<!-- Totals section -->
			<div class="bg-white border-t border-gray-200 shadow-neo">
				<div class="max-w-3xl mx-auto px-6 py-4 space-y-2">
					<!-- Subtotal -->
					<div class="flex justify-between text-sm text-gray-500">
						<span>{{ __("Subtotal") }}</span>
						<span>{{ formatCurrency(displayStore.cartData.subtotal) }}</span>
					</div>

					<!-- Tax -->
					<div v-if="displayStore.cartData.total_tax" class="flex justify-between text-sm text-gray-500">
						<span>{{ __("Tax") }}</span>
						<span>{{ formatCurrency(displayStore.cartData.total_tax) }}</span>
					</div>

					<!-- Discount -->
					<div v-if="displayStore.cartData.discount_amount" class="flex justify-between text-sm text-green-600 font-medium">
						<span>{{ __("Discount") }}</span>
						<span>-{{ formatCurrency(displayStore.cartData.discount_amount) }}</span>
					</div>

					<!-- Grand Total -->
					<div class="flex justify-between items-baseline pt-3 border-t border-gray-200">
						<span class="text-lg font-bold text-gray-900">{{ __("Total") }}</span>
						<span class="text-3xl font-bold text-blue-600">{{ formatCurrency(displayStore.cartData.grand_total) }}</span>
					</div>

					<!-- Item count -->
					<div class="text-center pt-1">
						<span class="text-xs text-gray-400">
							{{ displayStore.itemCount }} {{ displayStore.itemCount === 1 ? __("item") : __("items") }}
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
import { computed } from "vue"
import { useCustomerDisplayStore } from "@/stores/customerDisplay"

const displayStore = useCustomerDisplayStore()

const reversedItems = computed(() =>
	[...(displayStore.cartData.items || [])].reverse(),
)

// Format currency
function formatCurrency(amount) {
	const currency = displayStore.cartData.currency || "EUR"
	return new Intl.NumberFormat("fr-FR", {
		style: "currency",
		currency: currency,
	}).format(amount || 0)
}
</script>

<style scoped>
/* Cart item transitions */
.cart-item-enter-active {
	transition: all 0.35s ease-out;
}

.cart-item-leave-active {
	transition: all 0.25s ease-in;
}

.cart-item-enter-from {
	opacity: 0;
	transform: translateY(-15px) scale(0.97);
}

.cart-item-leave-to {
	opacity: 0;
	transform: scale(0.95);
}

.cart-item-move {
	transition: transform 0.3s ease;
}

/* Smooth scrollbar */
::-webkit-scrollbar {
	width: 6px;
}

::-webkit-scrollbar-track {
	background: transparent;
}

::-webkit-scrollbar-thumb {
	background: #d1d5db;
	border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
	background: #9ca3af;
}
</style>
