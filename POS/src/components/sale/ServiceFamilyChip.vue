<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The small chip on a cart line that says which course the line belongs
	     to (Boisson, Entrée, Plat, Dessert); a tap opens the four choices (« une entrée prise en plat », NeoRestau lot 1). A line the
	     kitchen already has keeps the family it was sent under: its chip is only a label. -->
	<div ref="root" class="relative inline-flex" @click.stop>
		<span
			v-if="!editable"
			class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 bg-gray-100 text-gray-700"
			data-service-family-chip
		>
			{{ familyLabel(family) }}
		</span>
		<button
			v-else
			type="button"
			class="relative inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 bg-gray-100 text-gray-700 hover:bg-gray-200 touch-manipulation before:absolute before:-inset-x-2 before:-inset-y-3 before:content-['']"
			data-service-family-chip
			aria-haspopup="true"
			:aria-expanded="open ? 'true' : 'false'"
			:aria-label="label"
			:title="label"
			@click="open = !open"
		>
			{{ familyLabel(family) }}
			<svg class="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
				<path
					fill-rule="evenodd"
					d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>

		<div
			v-if="editable && open"
			class="absolute start-0 top-full mt-2 z-30 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-neo-md"
			data-service-family-menu
		>
			<ServiceFamilyChoice
				:model-value="family"
				:columns="2"
				:hint="false"
				@update:model-value="pick"
			/>
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { familyLabel, serviceLabel } from "@/utils/serviceFamilies"
import ServiceFamilyChoice from "./ServiceFamilyChoice.vue"

const props = defineProps({
	// The family of the line
	family: { type: String, default: "" },
	// The line has not left for the kitchen: the waiter may change its family
	editable: { type: Boolean, default: true },
})
const emit = defineEmits(["change"])

const open = ref(false)
const root = ref(null)
// « Service : Plat » for a screen reader, which would otherwise read the bare course
const label = computed(() => `${serviceLabel()} : ${familyLabel(props.family)}`)

function pick(family) {
	open.value = false
	if (family !== props.family) emit("change", family)
}

function closeOnOutsideTap(event) {
	if (root.value && !root.value.contains(event.target)) open.value = false
}
function closeOnEscape(event) {
	if (event.key === "Escape") open.value = false
}

watch(open, (isOpen) => {
	if (isOpen) {
		document.addEventListener("click", closeOnOutsideTap)
		document.addEventListener("keydown", closeOnEscape)
	} else {
		document.removeEventListener("click", closeOnOutsideTap)
		document.removeEventListener("keydown", closeOnEscape)
	}
})
onBeforeUnmount(() => {
	document.removeEventListener("click", closeOnOutsideTap)
	document.removeEventListener("keydown", closeOnEscape)
})
</script>
