<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Asks what a price change means before -->
	<!-- //// it is written: this card only, or the global Item Price and therefore every other -->
	<!-- //// card that serves the dish. Upstream POSNext has a single price and never has to -->
	<!-- //// ask. (Introduced by 37746a8f, 2026-03-26, whose subject is about PDF margins and -->
	<!-- //// not about this file; the intent is ed3361f5, 2026-03-27 "redesign item edit panel -->
	<!-- //// with card/global price, active toggle, header cleanup".) -->
	<Dialog v-model="show" :options="{ title: dialogTitle, size: 'sm' }">
		<template #body-content>
			<div class="space-y-3">
				<!-- Global price changed -->
				<template v-if="mode === 'price'">
					<p class="text-sm text-gray-600">
						{{ __("You changed the global price. Do you also want to update the price on all other cards that use this item?") }}
					</p>
					<div class="space-y-2">
						<button
							@click="$emit('confirm', { action: 'price', scope: 'global' })"
							class="w-full flex items-start gap-3 p-3 rounded-lg border-2 transition-all hover:border-blue-400 hover:bg-blue-50 text-left border-gray-200"
						>
							<div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
							</div>
							<div>
								<span class="font-medium text-sm text-gray-800">{{ __("Yes, update all cards") }}</span>
								<p class="text-xs text-gray-500 mt-0.5">
									{{ __("Set the new price on all cards that use this item.") }}
								</p>
							</div>
						</button>

						<button
							@click="$emit('confirm', { action: 'price', scope: 'only_global' })"
							class="w-full flex items-start gap-3 p-3 rounded-lg border-2 transition-all hover:border-gray-400 hover:bg-gray-50 text-left border-gray-200"
						>
							<div class="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0 mt-0.5">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
							</div>
							<div>
								<span class="font-medium text-sm text-gray-800">{{ __("No, only update the price list") }}</span>
								<p class="text-xs text-gray-500 mt-0.5">
									{{ __("Other cards keep their current prices.") }}
								</p>
							</div>
						</button>
					</div>
				</template>

				<!-- Active/inactive changed -->
				<template v-else-if="mode === 'active'">
					<p class="text-sm text-gray-600">
						{{ isDisabling
							? __("You are disabling this item. Apply to all cards or just this one?")
							: __("You are enabling this item. Apply to all cards or just this one?")
						}}
					</p>
					<div class="space-y-2">
						<button
							@click="$emit('confirm', { action: 'active', scope: 'all' })"
							class="w-full flex items-start gap-3 p-3 rounded-lg border-2 transition-all hover:border-blue-400 hover:bg-blue-50 text-left border-gray-200"
						>
							<div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
							</div>
							<div>
								<span class="font-medium text-sm text-gray-800">{{ __("All cards") }}</span>
								<p class="text-xs text-gray-500 mt-0.5">
									{{ isDisabling
										? __("Disable this item on every card.")
										: __("Enable this item on every card.")
									}}
								</p>
							</div>
						</button>

						<button
							@click="$emit('confirm', { action: 'active', scope: 'local' })"
							class="w-full flex items-start gap-3 p-3 rounded-lg border-2 transition-all hover:border-amber-400 hover:bg-amber-50 text-left border-gray-200"
						>
							<div class="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 mt-0.5">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
							</div>
							<div>
								<span class="font-medium text-sm text-gray-800">{{ __("This card only") }}</span>
								<p class="text-xs text-gray-500 mt-0.5">
									{{ __("Only affects '{0}'.", [cardName]) }}
								</p>
							</div>
						</button>
					</div>
				</template>
			</div>
		</template>
		<template #actions>
			<Button variant="subtle" @click="show = false">{{ __("Cancel") }}</Button>
		</template>
	</Dialog>
</template>

<script setup>
import { computed } from "vue"
import { Button, Dialog } from "frappe-ui"

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	cardName: { type: String, default: "" },
	mode: { type: String, default: "price" }, // "price" or "active"
	isDisabling: { type: Boolean, default: false },
})

const emit = defineEmits(["update:modelValue", "confirm"])

const show = computed({
	get: () => props.modelValue,
	set: (v) => emit("update:modelValue", v),
})

const dialogTitle = computed(() => {
	if (props.mode === "price") return __("Update Global Price")
	return props.isDisabling ? __("Disable Item") : __("Enable Item")
})
</script>
