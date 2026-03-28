<template>
	<div class="flex flex-col h-full bg-gray-50 overflow-hidden">
		<!-- Category Tabs -->
		<div class="bg-white border-b border-gray-200 px-3 pt-3 pb-2 flex-shrink-0">
			<div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
				<!-- All tab -->
				<button
					@click="selectedCategory = null"
					:class="[
						'flex items-center px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors snap-start flex-shrink-0',
						selectedCategory === null
							? 'bg-blue-600 text-white shadow-sm'
							: 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300',
					]"
				>
					{{ __('All') }}
				</button>
				<button
					v-for="cat in menuCategories"
					:key="cat.name"
					@click="selectedCategory = cat.name"
					:class="[
						'flex items-center px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors snap-start flex-shrink-0',
						selectedCategory === cat.name
							? 'bg-blue-600 text-white shadow-sm'
							: 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300',
					]"
				>
					{{ cat.category_name || cat.name }}
				</button>
			</div>
		</div>

		<!-- Items Grid -->
		<div class="flex-1 overflow-y-auto p-3">
			<div v-if="filteredItems.length === 0" class="flex flex-col items-center justify-center h-48 text-gray-400">
				<svg class="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
				</svg>
				<p class="text-sm">{{ __('No items in this category') }}</p>
			</div>

			<div v-else class="grid grid-cols-2 gap-3">
				<div
					v-for="item in filteredItems"
					:key="item.item_code"
					@click="openItemModal(item)"
					class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm active:scale-95 transition-transform cursor-pointer"
				>
					<!-- Item Image -->
					<div class="aspect-square bg-gray-100 relative overflow-hidden">
						<img
							v-if="item.image"
							:src="item.image"
							:alt="item.item_name"
							class="w-full h-full object-cover"
						/>
						<div v-else class="w-full h-full flex items-center justify-center">
							<svg class="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
							</svg>
						</div>
					</div>
					<!-- Item Info -->
					<div class="p-2.5">
						<p class="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">
							{{ item.item_name }}
						</p>
						<p v-if="item.description" class="text-xs text-gray-500 mt-0.5 line-clamp-1">
							{{ item.description }}
						</p>
						<div class="flex items-center justify-between mt-2">
							<span class="text-sm font-bold text-blue-600">
								{{ formatPrice(item.price_with_tax ?? item.price ?? 0) }}
							</span>
							<div class="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
								<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
								</svg>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Item Detail Modal -->
		<Transition name="slide-up">
			<div
				v-if="selectedItem"
				class="fixed inset-0 z-50 flex items-end bg-black/50"
				@click.self="closeItemModal"
			>
				<div class="bg-white w-full rounded-t-2xl max-h-[85vh] flex flex-col overflow-hidden">
					<!-- Item Image -->
					<div class="aspect-video bg-gray-100 relative flex-shrink-0">
						<img
							v-if="selectedItem.image"
							:src="selectedItem.image"
							:alt="selectedItem.item_name"
							class="w-full h-full object-cover"
						/>
						<div v-else class="w-full h-full flex items-center justify-center bg-gray-100">
							<svg class="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
							</svg>
						</div>
						<!-- Close button -->
						<button
							@click="closeItemModal"
							class="absolute top-3 right-3 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center"
						>
							<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>

					<!-- Content -->
					<div class="flex-1 overflow-y-auto p-4">
						<h2 class="text-xl font-bold text-gray-900">{{ selectedItem.item_name }}</h2>
						<p class="text-lg font-semibold text-blue-600 mt-1">
							{{ formatPrice(selectedItem.price_with_tax ?? selectedItem.price ?? 0) }}
						</p>
						<p v-if="selectedItem.description" class="text-sm text-gray-600 mt-2">
							{{ selectedItem.description }}
						</p>

						<!-- Modifier Groups -->
						<div
							v-for="group in selectedItem.option_groups || []"
							:key="group.name"
							class="mt-4"
						>
							<h3 class="text-sm font-semibold text-gray-800 mb-2">
								{{ group.group_name }}
								<span v-if="group.is_required" class="text-red-500 text-xs ml-1">{{ __('Required') }}</span>
							</h3>
							<div class="space-y-2">
								<label
									v-for="option in group.options || []"
									:key="option.name"
									class="flex items-center justify-between p-3 border border-gray-200 rounded-xl cursor-pointer"
									:class="isOptionSelected(group.name, option.name) ? 'border-blue-500 bg-blue-50' : ''"
								>
									<div class="flex items-center gap-3">
										<input
											v-if="group.selection_type === 'Multiple'"
											type="checkbox"
											:checked="isOptionSelected(group.name, option.name)"
											@change="toggleOption(group, option)"
											class="w-4 h-4 text-blue-600 rounded"
										/>
										<input
											v-else
											type="radio"
											:name="`group-${group.name}`"
											:checked="isOptionSelected(group.name, option.name)"
											@change="selectOption(group, option)"
											class="w-4 h-4 text-blue-600"
										/>
										<span class="text-sm text-gray-800">{{ option.option_name }}</span>
									</div>
									<span v-if="option.additional_price" class="text-xs text-gray-500">
										+{{ formatPrice(option.additional_price) }}
									</span>
								</label>
							</div>
						</div>
					</div>

					<!-- Footer: Qty + Add to Cart -->
					<div class="p-4 border-t border-gray-200 flex-shrink-0">
						<!-- Quantity Selector -->
						<div class="flex items-center justify-center gap-4 mb-3">
							<button
								@click="itemQty = Math.max(1, itemQty - 1)"
								class="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center text-gray-600 active:bg-gray-100"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4"/>
								</svg>
							</button>
							<span class="text-2xl font-bold text-gray-900 w-8 text-center">{{ itemQty }}</span>
							<button
								@click="itemQty++"
								class="w-10 h-10 rounded-full border-2 border-blue-500 flex items-center justify-center text-blue-600 active:bg-blue-50"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
								</svg>
							</button>
						</div>
						<!-- Add to Cart Button -->
						<button
							@click="addToCartAndClose"
							class="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 transition-colors"
						>
							{{ __('Add to cart') }} — {{ formatPrice(itemTotal) }}
						</button>
					</div>
				</div>
			</div>
		</Transition>
	</div>
</template>

<script setup>
import { ref, computed } from "vue"
import { useGuestOrderStore } from "@/stores/guestOrder"

const guestStore = useGuestOrderStore()

const selectedCategory = ref(null)
const selectedItem = ref(null)
const itemQty = ref(1)
const selectedOptions = ref({}) // { [groupName]: Set of option names }

const menuCategories = computed(() => guestStore.menuCategories)
const menuItems = computed(() => guestStore.menuItems)

const filteredItems = computed(() => {
	if (!selectedCategory.value) return menuItems.value
	return menuItems.value.filter(
		(item) => item.category === selectedCategory.value,
	)
})

const itemTotal = computed(() => {
	if (!selectedItem.value) return 0
	const base =
		selectedItem.value.price_with_tax ?? selectedItem.value.price ?? 0
	const extras = Object.values(selectedOptions.value).reduce((sum, opts) => {
		return (
			sum +
			[...opts].reduce((s, optName) => {
				const group = (selectedItem.value.option_groups || []).find((g) =>
					(g.options || []).some((o) => o.name === optName),
				)
				const opt = group?.options?.find((o) => o.name === optName)
				return s + (opt?.additional_price || 0)
			}, 0)
		)
	}, 0)
	return (base + extras) * itemQty.value
})

function formatPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: window.frappe?.boot?.sysdefaults?.currency || "EUR",
		minimumFractionDigits: 2,
	}).format(amount)
}

function openItemModal(item) {
	selectedItem.value = item
	itemQty.value = 1
	selectedOptions.value = {}
}

function closeItemModal() {
	selectedItem.value = null
}

function isOptionSelected(groupName, optionName) {
	return selectedOptions.value[groupName]?.has(optionName) ?? false
}

function toggleOption(group, option) {
	if (!selectedOptions.value[group.name]) {
		selectedOptions.value[group.name] = new Set()
	}
	const set = selectedOptions.value[group.name]
	if (set.has(option.name)) {
		set.delete(option.name)
	} else {
		set.add(option.name)
	}
	// Trigger reactivity
	selectedOptions.value = { ...selectedOptions.value }
}

function selectOption(group, option) {
	selectedOptions.value = {
		...selectedOptions.value,
		[group.name]: new Set([option.name]),
	}
}

function addToCartAndClose() {
	if (!selectedItem.value) return
	// Build flat modifiers array from selected options
	const modifiers = []
	for (const [groupName, optSet] of Object.entries(selectedOptions.value)) {
		const group = (selectedItem.value.option_groups || []).find(
			(g) => g.name === groupName,
		)
		for (const optName of optSet) {
			const opt = group?.options?.find((o) => o.name === optName)
			if (opt) {
				modifiers.push({
					group: groupName,
					group_name: group.group_name,
					option: optName,
					option_name: opt.option_name,
					additional_price: opt.additional_price || 0,
				})
			}
		}
	}
	const unitPrice =
		(selectedItem.value.price_with_tax ?? selectedItem.value.price ?? 0) +
		modifiers.reduce((s, m) => s + m.additional_price, 0)

	guestStore.addToCart(selectedItem.value, itemQty.value, modifiers)
	closeItemModal()
}
</script>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
	display: none;
}
.scrollbar-hide {
	-ms-overflow-style: none;
	scrollbar-width: none;
}
.line-clamp-1 {
	display: -webkit-box;
	-webkit-line-clamp: 1;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.line-clamp-2 {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.slide-up-enter-active,
.slide-up-leave-active {
	transition: opacity 0.25s ease;
}
.slide-up-enter-active .bg-white,
.slide-up-leave-active .bg-white {
	transition: transform 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
	opacity: 0;
}
</style>
