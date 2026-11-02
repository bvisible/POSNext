<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The « portions » of a product in the card editor (NeoResto lot 1, Daniel, 02.11.2026: -->
	<!-- //// « sur la carte, tous les produits ont cette option-là: quand on l'active, on peut mettre une quantité »). The kitchen counts the portions it -->
	<!-- //// makes; a product whose stock is managed is counted by its stock. Each change is saved at once: it is the kitchen's count, not the card's. -->
	<div data-test="item-portions">
		<label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{{ __("Portions") }}</label>
		<p v-if="state.managed_by_stock" class="mt-1 text-[10px] text-gray-500" data-test="portions-by-stock">
			{{ __("The stock of this product is managed: its stock counts it, not its portions.") }}
		</p>
		<div v-else class="mt-1 space-y-1.5">
			<label class="flex items-center gap-2 text-xs text-gray-700">
				<input
					type="checkbox"
					data-test="portions-counted"
					:checked="state.counted"
					:disabled="busy"
					@change="setCounted($event.target.checked)"
				/>
				{{ __("Count the portions the kitchen makes") }}
			</label>
			<div v-if="state.counted" class="space-y-1">
				<form class="flex items-center gap-1.5" @submit.prevent="setMade">
					<input
						v-model="made"
						type="number"
						min="0"
						step="1"
						inputmode="numeric"
						data-test="portions-made"
						:placeholder="__('Made today')"
						class="w-24 rounded-md border border-gray-300 px-2 py-1 text-xs"
					/>
					<button
						type="submit"
						data-test="portions-set"
						:disabled="busy || made === '' || Number(made) < 0"
						class="rounded-md bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
					>
						{{ __("Set") }}
					</button>
				</form>
				<p class="text-[10px]" :class="state.left !== null && state.left <= 0 ? 'text-red-600' : 'text-gray-500'" data-test="portions-left">
					{{
						state.left === null
							? __("No portions announced today: nothing limits this product.")
							: state.left <= 0
								? __("Sold out")
								: __("{0} left", [state.left])
					}}
				</p>
			</div>
		</div>
	</div>
</template>

<script setup>
import { onMounted, ref, watch } from "vue"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"

const props = defineProps({ itemCode: { type: String, required: true } })

const { showError } = useToast()
const state = ref({ counted: false, made: null, left: null, managed_by_stock: false })
const made = ref("")
const busy = ref(false)

function take(answer) {
	state.value = answer
	made.value = answer.made === null || answer.made === undefined ? "" : String(answer.made)
}

async function load() {
	try {
		take(await call("pos_next.api.portions.get_portion_setting", { item: props.itemCode }))
	} catch (error) {
		showError(error?.message || __("The portions could not be read"))
	}
}

async function save(counted, quantity) {
	busy.value = true
	try {
		take(await call("pos_next.api.portions.set_portions", { item: props.itemCode, counted: counted ? 1 : 0, made: quantity }))
	} catch (error) {
		showError(error?.message || __("The portions could not be saved"))
		await load()
	} finally {
		busy.value = false
	}
}

const setCounted = (counted) => save(counted, undefined)
const setMade = () => save(true, Number(made.value))

onMounted(load)
watch(() => props.itemCode, load)
</script>
