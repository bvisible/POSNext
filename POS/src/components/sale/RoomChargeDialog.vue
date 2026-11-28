<template>
	<!-- //// Neoffice — added file (no upstream equivalent). « On the room » (hotel restaurant): the cashier asks for a room number or a name, sees who is in it, and puts the whole sale on that stay's bill. -->
	<!-- //// The till knows nothing of hotels: what it asks and what it is told comes through pos_next.api.room_charge, and the hotel app behind it decides what may be charged. -->
	<Dialog v-model="show" :options="{ title: __('On the room'), size: 'md' }">
		<template #body-content>
			<div class="space-y-4" data-test="room-dialog">
				<p dir="auto" class="text-[15px] text-gray-800 dark:text-gray-100">
					<b>{{ money(total) }}</b> · {{ __("The whole sale goes on the bill of the guest. They pay it with the rest of their bill at the desk.") }}
				</p>

				<label class="block">
					<span class="mb-1 block text-sm font-semibold text-gray-800 dark:text-gray-100">{{ __("Room number, or the guest's name") }}</span>
					<input
						v-model="text"
						type="text"
						inputmode="search"
						autocomplete="off"
						data-test="room-search"
						class="min-h-[48px] w-full rounded-xl border border-gray-300 bg-white px-4 text-[17px] text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						placeholder="101"
						@input="search"
					/>
				</label>

				<p v-if="problem" class="rounded-xl bg-red-50 px-4 py-3 text-sm leading-snug text-red-800 dark:bg-red-400/15 dark:text-red-100" data-test="room-problem">{{ problem }}</p>

				<ul v-if="stays.length" class="space-y-2" data-test="room-results">
					<li v-for="stay in stays" :key="stay.reservation">
						<button
							type="button"
							:data-test="`room-${stay.room_number}`"
							:disabled="!stay.takes_charges"
							class="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border px-4 text-left text-[15px] disabled:opacity-60"
							:class="chosen && chosen.reservation === stay.reservation ? 'border-gray-900 bg-gray-100 dark:border-gray-100 dark:bg-gray-700' : 'border-gray-300 dark:border-gray-600'"
							@click="chosen = stay"
						>
							<span class="font-semibold text-gray-900 dark:text-gray-100">{{ stay.room_number }} · {{ stay.guest_name }}</span>
							<span class="text-sm text-gray-600 dark:text-gray-300">
								{{ stay.takes_charges ? __("Leaves {0}", [stay.check_out_date || "–"]) : __("This room takes no charge") }}
							</span>
						</button>
					</li>
				</ul>
				<p v-else-if="asked && !problem && !searching" class="text-sm text-gray-500 dark:text-gray-400" data-test="room-none">{{ __("Nobody in house for this room.") }}</p>

				<div class="flex items-center justify-end gap-3 pt-1">
					<button type="button" data-test="room-cancel" class="min-h-[48px] rounded-xl px-4 text-[15px] font-semibold text-gray-800 dark:text-gray-100" @click="show = false">{{ __("Cancel") }}</button>
					<button type="button" data-test="room-confirm" class="min-h-[48px] rounded-xl bg-gray-900 px-5 text-[15px] font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900" :disabled="!chosen" @click="confirm">
						{{ chosen ? __("Put on room {0}", [chosen.room_number]) : __("Choose a room") }}
					</button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
/**
 * « On the room »: the stay is looked up by room number or name (the hotel app answers, never the list of the house) and chosen; the dialog emits
 * `chosen` with `{ reservation, room_number, guest_name }` and the payment window submits the sale with it (`room_charge`).
 */
import { Dialog } from "frappe-ui"
import { computed, ref, watch } from "vue"
import { call } from "@/utils/apiWrapper"
import { parseError } from "@/utils/errorHandler"
import { formatCurrency } from "@/utils/currency"
import { usePOSShiftStore } from "@/stores/posShift"

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	total: { type: Number, default: 0 },
})
const emit = defineEmits(["update:modelValue", "chosen"])

const API = "pos_next.api.room_charge"
const shiftStore = usePOSShiftStore()
const show = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) })
const money = (amount) => formatCurrency(amount, shiftStore.profileCurrency || undefined)

const text = ref("")
const stays = ref([])
const chosen = ref(null)
const problem = ref("")
const asked = ref(false)
const searching = ref(false)
let timer = null
// A slow answer must not overwrite a newer one
let sequence = 0

watch(
	() => props.modelValue,
	(open) => {
		if (!open) return
		text.value = ""
		stays.value = []
		chosen.value = null
		problem.value = ""
		asked.value = false
	},
	{ immediate: true },
)

function search() {
	clearTimeout(timer)
	chosen.value = null
	const asking = text.value.trim()
	// A room number is one digit or more, a name two letters: the hotel app says the same, and refuses a shorter question
	if (!asking || (asking.length < 2 && !/^\d$/.test(asking))) {
		stays.value = []
		problem.value = ""
		asked.value = false
		return
	}
	timer = setTimeout(() => lookup(asking), 250)
}

async function lookup(asking) {
	const mine = ++sequence
	searching.value = true
	try {
		const answer = await call(`${API}.search_stays`, { text: asking })
		if (mine !== sequence) return
		stays.value = answer?.message ?? answer ?? []
		problem.value = ""
		asked.value = true
	} catch (error) {
		if (mine !== sequence) return
		stays.value = []
		problem.value = parseError(error)
		asked.value = true
	} finally {
		if (mine === sequence) searching.value = false
	}
}

function confirm() {
	if (!chosen.value) return
	const { reservation, room_number, guest_name } = chosen.value
	emit("chosen", { reservation, room_number, guest_name })
	show.value = false
}
</script>
