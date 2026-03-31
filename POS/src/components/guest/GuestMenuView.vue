<template>
	<div class="flex flex-col h-full overflow-hidden" style="background-color: var(--neo-bg, #f3f4f6)">
		<!-- Category sub-filters -->
		<div class="px-1.5 sm:px-3 py-1 bg-white border-b border-gray-100 flex-shrink-0">
			<div class="flex items-center gap-1 overflow-x-auto scrollbar-hide">
				<button
					@click="selectedCategory = null"
					class="px-2 py-1 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap transition-colors"
					:class="!selectedCategory
						? 'bg-amber-100 text-amber-800'
						: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'"
				>{{ __("All") }}</button>
				<button
					v-for="cat in categories"
					:key="cat"
					@click="selectedCategory = cat"
					class="px-2 py-1 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap transition-colors"
					:class="selectedCategory === cat
						? 'bg-amber-100 text-amber-800'
						: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'"
				>{{ cat }}</button>
			</div>
		</div>

		<!-- Search + view toggle -->
		<div class="px-1.5 sm:px-3 py-1.5 sm:py-2 bg-white border-b border-gray-200 flex-shrink-0">
			<div class="flex items-center gap-1 sm:gap-2">
				<div class="flex-1 relative min-w-0">
					<svg class="absolute start-2 sm:start-3 top-1/2 -translate-y-1/2 w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
					<input
						v-model="searchQuery"
						type="text"
						:placeholder="__('Search in menu...')"
						class="w-full text-[11px] sm:text-sm border border-gray-300 rounded-neo-sm px-2 sm:px-3 py-2 ps-7 sm:ps-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
					/>
				</div>
				<div class="flex items-center gap-0.5 bg-gray-100 rounded-neo-sm p-0.5 flex-shrink-0">
					<button @click="viewMode = 'grid'" class="p-1.5 sm:p-2 rounded transition-[background-color,box-shadow] duration-75 touch-manipulation" :class="viewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'">
						<svg class="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
					</button>
					<button @click="viewMode = 'list'" class="p-1.5 sm:p-2 rounded transition-[background-color,box-shadow] duration-75 touch-manipulation" :class="viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'">
						<svg class="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Items display -->
		<div class="flex-1 overflow-y-auto p-1.5 sm:p-3">
			<div v-if="filteredGroups.length === 0" class="flex flex-col items-center justify-center h-48 text-gray-400">
				<svg class="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
				</svg>
				<p class="text-sm">{{ __('No items found') }}</p>
			</div>

			<!-- Grid view -->
			<template v-else-if="viewMode === 'grid'">
				<template v-for="(group, gi) in filteredGroups" :key="'g'+gi">
					<div v-if="group.category && !selectedCategory" class="bg-white border-b border-gray-200 px-3 py-1.5 mt-3 first:mt-0 rounded-t-lg">
						<h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{{ group.category }}</h3>
					</div>
					<div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2.5" :class="!selectedCategory && group.category ? 'mt-1' : 'mt-0'">
						<div
							v-for="(item, ii) in group.items"
							:key="ii"
							@click="!isOutOfStock(item) && openItemModal(item)"
							:class="[
								'group relative bg-white border border-gray-200 rounded-neo-md p-1.5 sm:p-2.5 touch-manipulation transition-[border-color,box-shadow] duration-100',
								isOutOfStock(item) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400 hover:shadow-neo-md'
							]"
						>
							<div v-if="isOutOfStock(item)" class="absolute inset-0 z-5 flex items-end justify-center rounded-neo-md pb-8">
								<span class="text-[10px] font-bold text-red-600 bg-white/90 px-2 py-1 rounded shadow-sm">{{ __('Unavailable') }}</span>
							</div>
							<div class="relative aspect-square rounded-neo-sm mb-1.5 sm:mb-2 overflow-hidden bg-gray-100">
								<img v-if="item.image" :src="item.image" class="w-full h-full object-cover" />
								<div v-else class="w-full h-full flex items-center justify-center p-2">
									<span class="text-[9px] sm:text-[10px] font-bold text-gray-500 text-center leading-tight">
										{{ item.item_name }}
									</span>
								</div>
							</div>
							<div class="min-w-0">
								<p class="text-[10px] sm:text-xs font-semibold text-gray-900 truncate mb-0.5 leading-tight">{{ item.item_name }}</p>
								<div class="text-[9px] sm:text-[10px] leading-tight">
									<span class="font-semibold text-blue-600">{{ formatPrice(item.price || 0) }}</span>
								</div>
							</div>
						</div>
					</div>
				</template>
			</template>

			<!-- List view -->
			<template v-else>
				<template v-for="(group, gi) in filteredGroups" :key="'l'+gi">
					<div v-if="group.category && !selectedCategory" class="bg-white border-b border-gray-200 px-3 py-1.5 mt-3 first:mt-0 rounded-t-lg">
						<h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{{ group.category }}</h3>
					</div>
					<div
						v-for="(item, li) in group.items"
						:key="li"
						@click="!isOutOfStock(item) && openItemModal(item)"
						:class="[
							'flex items-center gap-3 px-2 py-2 border-b border-gray-100 bg-white transition-colors',
							isOutOfStock(item) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'
						]"
					>
						<div class="relative flex-shrink-0">
							<img v-if="item.image" :src="item.image" class="w-10 h-10 rounded-lg object-cover" />
							<div v-else class="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
								<span class="text-[7px] font-bold text-gray-500 leading-tight text-center px-0.5">
									{{ (item.item_name || '').substring(0, 6) }}
								</span>
							</div>
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-xs font-semibold text-gray-900 truncate">{{ item.item_name }}</p>
							<p v-if="item.description && !isOutOfStock(item)" class="text-[10px] text-gray-500 truncate">{{ item.description }}</p>
							<span v-if="isOutOfStock(item)" class="text-[9px] font-bold text-red-500">{{ __('Unavailable') }}</span>
						</div>
						<span class="text-xs font-bold text-blue-600 flex-shrink-0">{{ formatPrice(item.price || 0) }}</span>
					</div>
				</template>
			</template>
		</div>

		<!-- Item Detail Modal (for modifiers / qty) -->
		<Transition name="slide-up">
			<div
				v-if="selectedItem"
				class="fixed inset-0 z-50 flex items-end bg-black/50"
				@click.self="closeItemModal"
			>
				<div class="bg-white w-full rounded-t-2xl max-h-[85vh] flex flex-col overflow-hidden">
					<!-- Item header -->
					<div class="flex items-start gap-3 p-4 border-b border-gray-100">
						<img v-if="selectedItem.image" :src="selectedItem.image" class="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
						<div class="flex-1 min-w-0">
							<h2 class="text-lg font-bold text-gray-900">{{ selectedItem.item_name }}</h2>
							<p class="text-base font-semibold text-blue-600">{{ formatPrice(selectedItem.price || 0) }}</p>
							<p v-if="selectedItem.description" class="text-sm text-gray-500 mt-0.5">{{ selectedItem.description }}</p>
						</div>
						<button @click="closeItemModal" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
							<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>

					<!-- Modifier Groups -->
					<div v-if="(selectedItem.product_options || []).length > 0" class="flex-1 overflow-y-auto p-4">
						<div v-for="group in selectedItem.product_options" :key="group.group_name" class="mb-4 last:mb-0">
							<h3 class="text-sm font-semibold text-gray-800 mb-2">
								{{ group.group_name }}
								<span v-if="group.required" class="text-red-500 text-xs ml-1">*</span>
							</h3>
							<div class="space-y-1.5">
								<label
									v-for="option in group.options || []"
									:key="option.option_name"
									class="flex items-center justify-between p-2.5 border border-gray-200 rounded-lg cursor-pointer transition-colors"
									:class="isOptionSelected(group.group_name, option.option_name) ? 'border-blue-500 bg-blue-50' : ''"
								>
									<div class="flex items-center gap-2.5">
										<input
											v-if="group.selection_type === 'Multiple'"
											type="checkbox"
											:checked="isOptionSelected(group.group_name, option.option_name)"
											@change="toggleOption(group, option)"
											class="w-4 h-4 text-blue-600 rounded"
										/>
										<input
											v-else
											type="radio"
											:name="`group-${group.group_name}`"
											:checked="isOptionSelected(group.group_name, option.option_name)"
											@change="selectOption(group, option)"
											class="w-4 h-4 text-blue-600"
										/>
										<span class="text-sm text-gray-800">{{ option.option_name }}</span>
									</div>
									<span v-if="option.price_adjustment" class="text-xs text-gray-500">
										+{{ formatPrice(option.price_adjustment) }}
									</span>
								</label>
							</div>
						</div>
					</div>

					<!-- Footer: Qty + Add to Cart -->
					<div class="p-4 border-t border-gray-200 flex-shrink-0">
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
						<button
							@click="addToCartAndClose"
							:disabled="!isOptionsValid"
							class="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
const searchQuery = ref("")
const viewMode = ref("list")
const selectedItem = ref(null)
const itemQty = ref(1)
const selectedOptions = ref({})

const menuItems = computed(() => guestStore.menuItems)
const menuCategories = computed(() => guestStore.menuCategories)

// Extract unique category names
const categories = computed(() => {
	return menuCategories.value
		.map((c) => c.label)
		.filter((c) => c)
})

// Group items by category, with search filtering
const filteredGroups = computed(() => {
	const query = searchQuery.value.toLowerCase().trim()
	const groups = []

	for (const cat of menuCategories.value) {
		let items = cat.menu_items || []

		// Filter by search
		if (query) {
			items = items.filter(
				(i) =>
					(i.item_name || "").toLowerCase().includes(query) ||
					(i.description || "").toLowerCase().includes(query),
			)
		}

		// Filter by category
		if (selectedCategory.value && cat.label !== selectedCategory.value) {
			continue
		}

		if (items.length > 0) {
			groups.push({ category: cat.label, items })
		}
	}
	return groups
})

const itemTotal = computed(() => {
	if (!selectedItem.value) return 0
	const base = selectedItem.value.price || 0
	const extras = Object.values(selectedOptions.value).reduce((sum, opts) => {
		return (
			sum +
			[...opts].reduce((s, optName) => {
				const group = (selectedItem.value.product_options || []).find((g) =>
					(g.options || []).some((o) => o.option_name === optName),
				)
				const opt = group?.options?.find((o) => o.option_name === optName)
				return s + (opt?.price_adjustment || 0)
			}, 0)
		)
	}, 0)
	return (base + extras) * itemQty.value
})

function formatPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: guestStore.currency || "CHF",
		minimumFractionDigits: 2,
	}).format(amount)
}

function isOutOfStock(item) {
	return item.is_stock_item && item.actual_qty != null && item.actual_qty <= 0
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
	if (!selectedOptions.value[group.group_name]) {
		selectedOptions.value[group.group_name] = new Set()
	}
	const set = selectedOptions.value[group.group_name]
	if (set.has(option.option_name)) {
		set.delete(option.option_name)
	} else {
		set.add(option.option_name)
	}
	selectedOptions.value = { ...selectedOptions.value }
}

function selectOption(group, option) {
	selectedOptions.value = {
		...selectedOptions.value,
		[group.group_name]: new Set([option.option_name]),
	}
}

const isOptionsValid = computed(() => {
	if (!selectedItem.value?.product_options) return true
	for (const group of selectedItem.value.product_options) {
		if (group.required) {
			const sel = selectedOptions.value[group.group_name]
			if (!sel || sel.size === 0) return false
		}
	}
	return true
})

function addToCartAndClose() {
	if (!selectedItem.value) return
	const modifiers = []
	for (const [groupName, optSet] of Object.entries(selectedOptions.value)) {
		const group = (selectedItem.value.product_options || []).find(
			(g) => g.group_name === groupName,
		)
		for (const optName of optSet) {
			const opt = group?.options?.find((o) => o.option_name === optName)
			if (opt) {
				modifiers.push({
					group: groupName,
					group_name: groupName,
					option: optName,
					option_name: opt.option_name,
					additional_price: opt.price_adjustment || 0,
				})
			}
		}
	}
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
