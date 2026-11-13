<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Move an appointment (NeoSalon, step 2, lot G4, plan « Le mode salon de la caisse », board 5): another person, another day, another hour; -->
	<!-- //// the planning lane says whether it fits before the cashier presses the button (it asks the engine again, under its lock, when she does), and the customer is warned (box ticked, to untick). -->
	<Dialog v-model="show" :options="{ title: __('Move the appointment'), size: 'lg' }">
		<template #body-content>
			<div class="space-y-4" data-test="move-dialog">
				<div class="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
					<div class="min-w-0 flex-1 leading-snug">
						<b dir="auto" class="block truncate text-[15px] text-gray-900 dark:text-gray-100">{{ appointment.customer_name || __("Walk-in") }} · {{ titleOf(appointment) }}</b>
						<span class="text-sm text-gray-600 dark:text-gray-300">{{ hourOf(appointment.starts_at) }} → {{ hourOf(appointment.ends_at) }} · {{ lengthOf(minutesLongOf(appointment)) }}</span>
					</div>
				</div>

				<!-- The person on a row of her own, the day and the hour side by side: three fields in a row overflowed the dialog (a date and a time input never shrink below their own width) -->
				<div class="grid grid-cols-2 gap-3">
					<label class="col-span-2 flex min-w-0 flex-col gap-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
						{{ __("With") }}
						<select v-model="person" data-test="move-person" class="min-h-[44px] w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-[15px] font-normal dark:border-gray-600 dark:bg-gray-800">
							<option v-for="option in movable" :key="option.sales_person" :value="option.sales_person">{{ option.sales_person_name }}</option>
						</select>
					</label>
					<label class="flex min-w-0 flex-col gap-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
						{{ __("Day") }}
						<input v-model="day" type="date" data-test="move-day" class="min-h-[44px] w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-[15px] font-normal dark:border-gray-600 dark:bg-gray-800" />
					</label>
					<label class="flex min-w-0 flex-col gap-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
						{{ __("Time") }}
						<input v-model="time" type="time" step="300" data-test="move-time" class="min-h-[44px] w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-[15px] font-normal dark:border-gray-600 dark:bg-gray-800" />
					</label>
				</div>

				<p v-if="verdict" class="rounded-xl px-4 py-3 text-sm leading-snug" :class="verdict.ok ? 'bg-green-50 text-green-800 dark:bg-green-400/15 dark:text-green-100' : 'bg-yellow-50 text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-100'" data-test="move-verdict">
					<b>{{ verdict.ok ? __("This hour is free.") : __("This hour is not possible.") }}</b>
					<span v-if="verdict.why"> {{ verdict.why }}</span>
				</p>

				<label class="flex items-start gap-3 text-[15px] text-gray-900 dark:text-gray-100">
					<input v-model="notify" type="checkbox" data-test="move-notify" class="mt-1 h-5 w-5 rounded border-gray-400" />
					<span><b>{{ __("Warn the customer") }}</b><span class="block text-sm text-gray-500 dark:text-gray-400">{{ __("The new time is sent by SMS and e-mail. Untick if the customer has already been told.") }}</span></span>
				</label>

				<div class="flex items-center justify-end gap-3 pt-1">
					<button type="button" data-test="move-cancel" class="min-h-[48px] rounded-xl px-4 text-[15px] font-semibold text-red-700 dark:text-red-300" @click="show = false">{{ __("Cancel") }}</button>
					<button type="button" data-test="move-confirm" class="min-h-[48px] rounded-xl bg-gray-900 px-5 text-[15px] font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900" :disabled="working || !canMove" @click="submit">{{ working ? __("Loading...") : __("Move the appointment") }}</button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
/**
 * Move an appointment. emits `update:modelValue` and `moved` once the planning lane has moved it (the agenda is read again before).
 */
import { Dialog } from "frappe-ui"
import { computed, ref, watch } from "vue"
import { useAppointment } from "@/composables/useAppointment"
import { useAppointmentsStore } from "@/stores/appointments"
import { firstStepOf, hourOf, isOff, lengthOf, minutesLongOf, titleOf } from "@/utils/appointments"

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	appointment: { type: Object, required: true },
})
const emit = defineEmits(["update:modelValue", "moved"])

const store = useAppointmentsStore()
const { checkMove, move } = useAppointment()

const show = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) })
const person = ref(null)
const day = ref("")
const time = ref("")
const notify = ref(true)
const verdict = ref(null)
const working = ref(false)
let asking = null

// The people she may be moved to: those who work that day, and the one she is with
const movable = computed(() => store.people.filter((option) => option.sales_person && (!isOff(option) || option.sales_person === person.value)))
const whenText = computed(() => (day.value && time.value ? `${day.value} ${time.value}:00` : ""))
const canMove = computed(() => Boolean(whenText.value) && verdict.value?.ok !== false)

watch(
	() => [props.modelValue, props.appointment?.key],
	([open]) => {
		if (!open) return
		const step = firstStepOf(props.appointment)
		person.value = step.sales_person || null
		day.value = String(props.appointment.starts_at || "").slice(0, 10)
		time.value = hourOf(props.appointment.starts_at)
		notify.value = true
		verdict.value = null
	},
	{ immediate: true },
)

// Whether it fits is asked a moment after the last change, and said before the button is pressed
watch([person, day, time], () => {
	clearTimeout(asking)
	verdict.value = null
	if (!props.modelValue || !whenText.value || !store.capabilities.check_move) return
	asking = setTimeout(async () => {
		const answer = await checkMove(props.appointment.booking, whenText.value, person.value)
		verdict.value = answer ? { ok: Boolean(answer.ok), why: answer.why || "" } : null
	}, 300)
})

async function submit() {
	if (working.value || !canMove.value) return
	working.value = true
	const sameOne = person.value === (firstStepOf(props.appointment).sales_person || null)
	const done = await move(props.appointment.booking, whenText.value, { salesPerson: sameOne ? null : person.value, notify: notify.value })
	working.value = false
	if (!done) return
	await store.refresh()
	emit("moved", done)
	show.value = false
}
</script>
