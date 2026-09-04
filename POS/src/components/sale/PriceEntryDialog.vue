<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Open-price items (plat du jour, -->
	<!-- //// weighed goods) reach the cart at 0. Upstream reopens the full EditItemDialog for -->
	<!-- //// that, far too heavy on a touch screen, so this asks for the price on a numpad -->
	<!-- //// and nothing else — and only once the modifiers have left the price at 0. -->
	<!-- //// (Added by f23daabe 2026-03-27; the flow it serves is described by 1ff2fba2 the -->
	<!-- //// same day, "add dedicated price entry numpad dialog for zero-price items".) -->
	<Dialog
		v-model="show"
		:options="{ title: itemName, size: 'md' }"
	>
		<template #body-content>
			<div class="space-y-4">
				<!-- Subtitle -->
				<p class="text-sm text-gray-500 text-center">
					{{ __("This item has no price. Please enter the selling price.") }}
				</p>

				<!-- Amount Display -->
				<div class="bg-gray-100 rounded-xl p-3">
					<div dir="ltr" class="font-bold text-gray-900 text-center text-2xl flex items-center justify-center gap-2">
						<span>{{ currencySymbol }}</span>
						<span class="font-mono tracking-wider">{{ numpadDisplay || '0.00' }}</span>
					</div>
				</div>

				<!-- Numpad Grid (4 columns) -->
				<div class="grid grid-cols-4 gap-1.5">
					<!-- Row 1: 7, 8, 9, Backspace -->
					<button
						v-for="num in ['7', '8', '9']"
						:key="num"
						@click="numpadInput(num)"
						class="h-14 text-xl font-semibold rounded-xl bg-gray-50 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-800 transition-all active:scale-95"
					>
						{{ num }}
					</button>
					<button
						@click="numpadBackspace"
						class="h-14 text-lg font-semibold rounded-xl bg-red-50 border-2 border-red-200 hover:border-red-400 hover:bg-red-100 text-red-600 transition-all active:scale-95 flex items-center justify-center"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z"/>
						</svg>
					</button>

					<!-- Row 2: 4, 5, 6, Clear -->
					<button
						v-for="num in ['4', '5', '6']"
						:key="num"
						@click="numpadInput(num)"
						class="h-14 text-xl font-semibold rounded-xl bg-gray-50 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-800 transition-all active:scale-95"
					>
						{{ num }}
					</button>
					<button
						@click="numpadClear"
						class="h-14 text-lg font-semibold rounded-xl bg-orange-50 border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-100 text-orange-600 transition-all active:scale-95"
					>
						C
					</button>

					<!-- Row 3: 1, 2, 3, Confirm (spans 2 rows) -->
					<button
						v-for="num in ['1', '2', '3']"
						:key="num"
						@click="numpadInput(num)"
						class="h-14 text-xl font-semibold rounded-xl bg-gray-50 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-800 transition-all active:scale-95"
					>
						{{ num }}
					</button>
					<button
						@click="confirmPrice"
						:disabled="numpadValue <= 0"
						:class="[
							'row-span-2 text-base font-bold rounded-xl transition-all active:scale-95',
							numpadValue <= 0
								? 'bg-gray-100 border-2 border-gray-200 text-gray-400 cursor-not-allowed'
								: 'bg-blue-600 border-2 border-blue-600 hover:bg-blue-700 text-white'
						]"
					>
						{{ __('Add to Cart') }}
					</button>

					<!-- Row 4: 00, 0, . -->
					<button
						@click="numpadInput('00')"
						class="h-14 text-xl font-semibold rounded-xl bg-gray-50 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-800 transition-all active:scale-95"
					>
						00
					</button>
					<button
						@click="numpadInput('0')"
						class="h-14 text-xl font-semibold rounded-xl bg-gray-50 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-800 transition-all active:scale-95"
					>
						0
					</button>
					<button
						@click="numpadInput('.')"
						:disabled="numpadDisplay.includes('.')"
						:class="[
							'h-14 text-xl font-semibold rounded-xl transition-all active:scale-95',
							numpadDisplay.includes('.')
								? 'bg-gray-100 border-2 border-gray-200 text-gray-400 cursor-not-allowed'
								: 'bg-gray-50 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-800'
						]"
					>
						.
					</button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { ref, computed } from "vue"
import { Dialog } from "frappe-ui"
import { usePaymentNumpad } from "@/composables/usePaymentNumpad"
import { usePOSShiftStore } from "@/stores/posShift"
import { getCurrencySymbol } from "@/utils/currency"

const emit = defineEmits(["price-confirmed"])

const show = ref(false)
const currentItem = ref(null)

const shiftStore = usePOSShiftStore()
const currencySymbol = computed(() =>
	getCurrencySymbol(shiftStore.profileCurrency),
)

const itemName = computed(() => currentItem.value?.item_name || __("Set Price"))

const {
	numpadDisplay,
	numpadValue,
	numpadInput,
	numpadBackspace,
	numpadClear,
} = usePaymentNumpad({
	isEnabled: computed(() => show.value),
	onEnter: confirmPrice,
})

function open(item) {
	currentItem.value = item
	numpadClear()
	show.value = true
}

function confirmPrice() {
	if (numpadValue.value <= 0) return
	emit("price-confirmed", { item: currentItem.value, price: numpadValue.value })
	show.value = false
}

defineExpose({ open })
</script>
