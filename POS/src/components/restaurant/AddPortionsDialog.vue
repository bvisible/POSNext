<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The dialog that adds portions to a counted product (NeoResto lot 1, Daniel, 02.11.2026: -->
	<!-- //// « la cuisine dit tu peux encore en faire 2, 3, 5 »): a few quick quantities and a field for another one. It opens from a sold-out tile and -->
	<!-- //// from the « + » of a counted tile; whoever works at the till may add, the kitchen tells the room. -->
	<div
		v-if="item"
		data-test="add-portions-dialog"
		role="dialog"
		aria-modal="true"
		:aria-label="__('Add portions')"
		class="fixed inset-0 z-[var(--z-dialog-content,500)] flex items-center justify-center bg-black/40 p-4"
		@click.self="emit('close')"
	>
		<div class="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 shadow-xl">
			<div class="border-b border-gray-200 px-4 py-4 dark:border-gray-700">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100" data-test="add-portions-title">
					{{ item.name }}
				</h3>
				<p
					class="mt-1 text-sm"
					:class="soldOut ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400'"
					data-test="add-portions-left"
				>
					{{ soldOut ? __("Sold out") : __("{0} left", [item.left]) }}
				</p>
				<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
					{{ __("How many more portions can the kitchen make?") }}
				</p>
			</div>
			<div class="px-4 py-4">
				<div class="grid grid-cols-5 gap-2">
					<button
						v-for="choice in ADD_CHOICES"
						:key="choice"
						type="button"
						:data-test="`add-portions-choice-${choice}`"
						:disabled="busy"
						class="rounded-lg border border-gray-300 px-2 py-3 min-h-target text-base font-semibold text-gray-900 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700 touch-manipulation"
						@click="add(choice)"
					>
						+{{ choice }}
					</button>
				</div>
				<form class="mt-3 flex items-center gap-2" @submit.prevent="add(custom)">
					<input
						v-model="custom"
						type="number"
						min="1"
						step="1"
						inputmode="numeric"
						data-test="add-portions-other"
						:placeholder="__('Another number')"
						class="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 min-h-target text-base dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
					/>
					<button
						type="submit"
						data-test="add-portions-confirm"
						:disabled="busy || wholePortions(custom) === null"
						class="rounded-lg bg-gray-900 px-4 py-2 min-h-target text-sm font-semibold text-white disabled:opacity-40 touch-manipulation"
					>
						{{ __("Add") }}
					</button>
				</form>
				<p v-if="error" class="mt-2 text-sm text-red-600" data-test="add-portions-error">{{ error }}</p>
			</div>
			<div class="flex justify-end border-t border-gray-200 px-4 py-3 dark:border-gray-700">
				<button
					type="button"
					data-test="add-portions-close"
					class="rounded-lg px-4 py-2 min-h-target text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 touch-manipulation"
					@click="emit('close')"
				>
					{{ __("Close") }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, ref, watch } from "vue"
import { usePortionsStore } from "@/stores/portions"
import { ADD_CHOICES, wholePortions } from "@/utils/portions"

const props = defineProps({
	// The product: { code, name, left } (left: what may still be sold, the cart's quantity taken off)
	item: { type: Object, default: null },
})
const emit = defineEmits(["close", "added"])

const store = usePortionsStore()
const custom = ref("")
const busy = ref(false)
const error = ref("")
const soldOut = computed(() => props.item && Number(props.item.left) <= 0)

watch(
	() => props.item,
	() => {
		custom.value = ""
		error.value = ""
	}
)

async function add(quantity) {
	const number = wholePortions(quantity)
	if (number === null || busy.value || !props.item) return
	busy.value = true
	error.value = ""
	try {
		await store.add(props.item.code, number)
		emit("added", { code: props.item.code, quantity: number })
		emit("close")
	} catch (failure) {
		error.value = failure?.message || __("The portions could not be added")
	} finally {
		busy.value = false
	}
}
</script>
