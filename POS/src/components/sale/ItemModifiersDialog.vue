<template>
	<Dialog
		v-model="show"
		:options="{ title: item ? item.item_name : __('Modifiers'), size: 'lg' }"
	>
		<template #body-content>
			<div class="space-y-6 p-4 max-h-[60vh] overflow-y-auto">
				<!-- Modifier Groups -->
				<div v-for="group in applicableGroups" :key="group.name" class="space-y-2">
					<div class="flex items-center gap-2">
						<h3 class="text-sm font-bold text-gray-900">{{ group.group_name }}</h3>
						<span v-if="group.required" class="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{{ __("Required") }}</span>
						<span v-if="group.selection_type === 'Multiple'" class="text-[10px] text-gray-500">
							{{ __("Max {0}", [group.max_selections]) }}
						</span>
					</div>

					<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
						<button
							v-for="option in group.options"
							:key="option.option_name"
							@click="toggleOption(group, option)"
							class="relative px-3 py-2.5 text-sm font-medium rounded-lg border-2 transition-all text-left"
							:class="isSelected(group, option)
								? 'border-blue-500 bg-blue-50 text-blue-700'
								: 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'"
						>
							<span>{{ option.option_name }}</span>
							<span v-if="option.price_adjustment > 0" class="block text-[10px] font-bold text-green-600 mt-0.5">
								+{{ formatPrice(option.price_adjustment) }}
							</span>
							<!-- Checkmark for selected -->
							<svg v-if="isSelected(group, option)" class="absolute top-1 right-1 w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
							</svg>
						</button>
					</div>
				</div>

				<!-- No modifier groups -->
				<div v-if="applicableGroups.length === 0" class="text-center py-4 text-gray-500">
					<p class="text-sm">{{ __("No modifiers available for this item") }}</p>
				</div>

				<!-- Free text instructions -->
				<div class="pt-4 border-t">
					<label class="block text-sm font-medium text-gray-700 mb-2">{{ __("Special Instructions") }}</label>
					<textarea
						v-model="instructions"
						rows="2"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
						:placeholder="__('Enter any special requests...')"
					></textarea>
				</div>
			</div>
		</template>

		<template #actions>
			<div class="flex justify-between items-center w-full">
				<div v-if="totalPriceAdjustment > 0" class="text-sm font-bold text-green-700">
					+{{ formatPrice(totalPriceAdjustment) }}
				</div>
				<div v-else></div>
				<div class="flex gap-2">
					<Button @click="show = false" variant="subtle">{{ __("Cancel") }}</Button>
					<Button @click="saveModifiers" variant="solid" theme="blue" :disabled="!isValid">{{ __("Confirm") }}</Button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { ref, computed } from "vue"
import { Dialog, Button } from "frappe-ui"
import { usePOSCartStore } from "@/stores/posCart"
import { useRestaurantStore } from "@/stores/restaurant"
import { usePOSShiftStore } from "@/stores/posShift"
import { formatCurrency as formatCurrencyUtil } from "@/utils/currency"

const show = ref(false)
const item = ref(null)
const instructions = ref("")
const selections = ref({}) // { groupName: [optionName, ...] }

const cartStore = usePOSCartStore()
const restaurantStore = useRestaurantStore()
const shiftStore = usePOSShiftStore()

const applicableGroups = computed(() => {
	if (!item.value) return []
	return restaurantStore.getModifiersForItem(item.value.item_code)
})

const totalPriceAdjustment = computed(() => {
	let total = 0
	for (const [groupName, selectedOptions] of Object.entries(selections.value)) {
		const group = applicableGroups.value.find(g => g.group_name === groupName)
		if (!group) continue
		for (const optName of selectedOptions) {
			const opt = group.options.find(o => o.option_name === optName)
			if (opt) total += Number(opt.price_adjustment) || 0
		}
	}
	return total
})

const isValid = computed(() => {
	// Check all required groups have a selection
	for (const group of applicableGroups.value) {
		if (group.required) {
			const sel = selections.value[group.group_name]
			if (!sel || sel.length === 0) return false
		}
	}
	return true
})

function isSelected(group, option) {
	const sel = selections.value[group.group_name]
	return sel && sel.includes(option.option_name)
}

function toggleOption(group, option) {
	if (!selections.value[group.group_name]) {
		selections.value[group.group_name] = []
	}

	const sel = selections.value[group.group_name]
	const idx = sel.indexOf(option.option_name)

	if (group.selection_type === "Single") {
		// Single select: replace selection
		selections.value[group.group_name] = idx >= 0 ? [] : [option.option_name]
	} else {
		// Multiple select: toggle
		if (idx >= 0) {
			sel.splice(idx, 1)
		} else if (sel.length < (group.max_selections || 99)) {
			sel.push(option.option_name)
		}
	}

	// Force reactivity
	selections.value = { ...selections.value }
}

function formatPrice(amount) {
	return formatCurrencyUtil(amount, shiftStore.profileCurrency)
}

function open(cartItem) {
	item.value = cartItem

	// Parse existing modifiers if any
	let existingModNames = []
	try {
		const existing = cartItem.posa_item_modifiers ? JSON.parse(cartItem.posa_item_modifiers) : []
		const sel = {}
		for (const mod of existing) {
			const optNames = mod.options.map(o => o.name)
			sel[mod.group] = optNames
			existingModNames.push(...optNames)
		}
		selections.value = sel
	} catch {
		selections.value = {}
	}

	// Strip old modifier names from instructions (legacy cleanup)
	// Previously, modifier choices were stored in special_instructions as "Béarnaise · À point | Sans sel"
	let rawInstructions = cartItem.posa_special_instructions || ""
	if (existingModNames.length > 0 && rawInstructions) {
		// Remove the modifier summary prefix (everything before the last " | ")
		const parts = rawInstructions.split(" | ")
		if (parts.length > 1) {
			// Check if the first part is just modifier names
			const firstPart = parts[0]
			const allModNames = existingModNames.join(", ")
			const modSummary = firstPart.replace(/ · /g, ", ")
			if (modSummary === allModNames || existingModNames.some(n => firstPart.includes(n))) {
				rawInstructions = parts.slice(1).join(" | ")
			}
		} else if (existingModNames.every(n => rawInstructions.includes(n)) && !rawInstructions.replace(/[·,\s]/g, "").replace(new RegExp(existingModNames.join("|"), "g"), "")) {
			// Instructions is ONLY modifier names — clear it
			rawInstructions = ""
		}
	}
	instructions.value = rawInstructions

	// Pre-select defaults
	for (const group of applicableGroups.value) {
		if (!selections.value[group.group_name]) {
			const defaults = group.options.filter(o => o.is_default).map(o => o.option_name)
			if (defaults.length > 0) {
				selections.value[group.group_name] = defaults
			}
		}
	}

	show.value = true
}

function saveModifiers() {
	if (!item.value) return

	// Build structured modifier JSON
	const modifiers = []
	for (const [groupName, selectedOptions] of Object.entries(selections.value)) {
		if (selectedOptions.length === 0) continue
		const group = applicableGroups.value.find(g => g.group_name === groupName)
		if (!group) continue

		modifiers.push({
			group: groupName,
			options: selectedOptions.map(optName => {
				const opt = group.options.find(o => o.option_name === optName)
				return {
					name: optName,
					price_adjustment: Number(opt?.price_adjustment) || 0
				}
			})
		})
	}

	// Special Instructions = only the free text typed by the user (not modifier choices)
	// Modifier choices are stored separately in posa_item_modifiers JSON
	const freeTextOnly = instructions.value.trim()

	// Update cart item
	cartStore.updateItemModifiers(
		item.value.item_code,
		item.value.uom,
		JSON.stringify(modifiers),
		freeTextOnly,
		totalPriceAdjustment.value
	)

	show.value = false
}

defineExpose({ open })
</script>
