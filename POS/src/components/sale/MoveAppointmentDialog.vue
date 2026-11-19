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

				<!-- //// Neoffice — the days of the business around the one chosen (NeoSalon, voie 4, 19.11.2026): a day the business is closed cannot be pressed, a day with other hours says so, and a dot says the
				     person is away that day. The reservation says it (the calendar of the till); the planning lane still says whether the hour fits. -->
				<div v-if="strip.length" class="flex items-center gap-1" data-test="move-strip">
					<button type="button" class="flex h-[44px] w-8 flex-none items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" :aria-label="__('Earlier days')" data-test="move-strip-back" @click="shiftStrip(-7)">‹</button>
					<div class="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="group" :aria-label="__('Days')">
						<button v-for="entry in strip" :key="entry.day" type="button" :data-test="`move-day-${entry.day}`" :disabled="entry.state === 'closed'" :aria-pressed="entry.day === day" :title="stripTitle(entry)" class="relative flex min-h-[48px] min-w-[48px] flex-none flex-col items-center justify-center rounded-lg border px-1 text-xs leading-tight" :class="stripClass(entry)" @click="day = entry.day">
							<span class="uppercase">{{ weekdayOf(entry.day) }}</span>
							<b class="text-[15px] tabular-nums">{{ dayNumberOf(entry.day) }}</b>
							<span v-if="entry.away" class="absolute end-1 top-1 h-2 w-2 rounded-full bg-orange-500" :data-test="`move-away-${entry.day}`" aria-hidden="true" />
						</button>
					</div>
					<button type="button" class="flex h-[44px] w-8 flex-none items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" :aria-label="__('Later days')" data-test="move-strip-next" @click="shiftStrip(7)">›</button>
				</div>

				<p v-if="verdict" class="rounded-xl px-4 py-3 text-sm leading-snug" :class="verdict.ok ? 'bg-green-50 text-green-800 dark:bg-green-400/15 dark:text-green-100' : 'bg-yellow-50 text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-100'" data-test="move-verdict">
					<b>{{ verdictText }}</b>
					<!-- //// Neoffice — what the move does to the cabin (NeoSalon, cabins level 2, 16.11.2026): said before the button, never a surprise after it -->
					<span v-if="cabinNote" class="mt-1 block" data-test="move-cabin">{{ cabinNote }}</span>
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
import { dayMoved, firstStepOf, hourOf, isOff, lengthOf, minutesLongOf, stripOfDays, titleOf } from "@/utils/appointments"

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	appointment: { type: Object, required: true },
	// what a drop in the agenda proposes: `{ person, day, time }` (NeoSalon B', 16.11.2026), else the appointment's own
	proposal: { type: Object, default: null },
})
const emit = defineEmits(["update:modelValue", "moved"])

const store = useAppointmentsStore()
const { checkMove, move, calendarOf } = useAppointment()

const show = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) })
const person = ref(null)
const day = ref("")
const time = ref("")
const notify = ref(true)
const verdict = ref(null)
const working = ref(false)
let asking = null
//// Neoffice — the strip of days (see below): its state lives up here, the window's opening reads it at once
const STRIP_DAYS = 14
const calendar = ref(null)
const stripStart = ref("")
const strip = computed(() => (calendar.value ? stripOfDays(stripStart.value, calendar.value, person.value, STRIP_DAYS) : []))
let calendarAsked = 0

// The people she may be moved to: those who work that day, and the one she is with
const movable = computed(() => store.people.filter((option) => option.sales_person && (!isOff(option) || option.sales_person === person.value)))
const whenText = computed(() => (day.value && time.value ? `${day.value} ${time.value}:00` : ""))
const canMove = computed(() => Boolean(whenText.value) && verdict.value?.ok !== false)
// One sentence: the lane's own reason when it refuses (« That time slot is no longer available. »), the general one only when it gives none.
// Both side by side said the same thing twice, and the template compiler dropped the space between them (16.11)
const verdictText = computed(() => {
	if (!verdict.value) return ""
	if (verdict.value.ok) return __("This hour is free.")
	return verdict.value.why || __("This hour is not possible.")
})

// What the move does to the cabin, when the reservation says it changes (the cabin is kept whenever it is free at the new hour)
const cabinNote = computed(() => {
	const cabin = verdict.value?.ok ? verdict.value.cabin : null
	if (!cabin?.changed || !cabin.to) return ""
	return cabin.from ? __("{0} instead of {1}.", [cabin.to.label, cabin.from.label]) : __("It goes in {0}.", [cabin.to.label])
})

watch(
	() => [props.modelValue, props.appointment?.key, props.proposal],
	([open]) => {
		if (!open) return
		const step = firstStepOf(props.appointment)
		const proposed = props.proposal || {}
		person.value = proposed.person || step.sales_person || null
		day.value = proposed.day || String(props.appointment.starts_at || "").slice(0, 10)
		time.value = proposed.time || hourOf(props.appointment.starts_at)
		notify.value = true
		verdict.value = null
		loadStrip(day.value)
		// a drop proposes another hour: whether it fits is asked at once, as for a change made here
		if (props.proposal) askFit()
	},
	{ immediate: true },
)

//// Neoffice — the days around the one chosen, from the calendar of the business (NeoSalon, voie 4, 19.11.2026). Asked when the window opens and when the strip moves; nothing without the network
//// or where the site has no calendar: the strip is then simply not there and the day is chosen in the field above, as before.
async function loadStrip(from) {
	const asked = ++calendarAsked
	stripStart.value = from
	if (!store.capabilities.calendar || !from) {
		calendar.value = null
		return
	}
	const answer = await calendarOf(from, dayMoved(from, STRIP_DAYS - 1))
	// An answer that comes after the strip moved again is of no use
	if (asked === calendarAsked) calendar.value = answer?.available ? answer : null
}
function shiftStrip(days) {
	loadStrip(dayMoved(stripStart.value, days))
}
// The strip follows a day chosen in the field when it is out of its range
watch(day, (chosen) => {
	if (!chosen || !calendar.value) return
	if (chosen < stripStart.value || chosen > dayMoved(stripStart.value, STRIP_DAYS - 1)) loadStrip(chosen)
})
const dayOf = (iso) => new Date(`${iso}T12:00:00`)
const weekdayOf = (iso) => dayOf(iso).toLocaleDateString(undefined, { weekday: "short" })
const dayNumberOf = (iso) => dayOf(iso).getDate()
const REASONS = {
	holiday: () => __("Public holiday"),
	closure: () => __("Closure"),
	weekly_off: () => __("Weekly day off"),
	special_hours: () => __("Special hours"),
	no_hours: () => __("No opening hours"),
}
function stripTitle(entry) {
	const parts = []
	if (entry.state === "closed") parts.push(__("Closed that day"))
	if (entry.state === "special") parts.push(__("Special hours"), (entry.periods || []).map(([from, to]) => `${from}–${to}`).join(" · "))
	parts.push(entry.label || (REASONS[entry.reason] ? REASONS[entry.reason]() : ""))
	if (entry.away) parts.push(__("{0} is away", [entry.away.sales_person_name]))
	return parts.filter(Boolean).join(" · ")
}
function stripClass(entry) {
	if (entry.day === day.value) return "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
	if (entry.state === "closed") return "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 line-through dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
	if (entry.state === "special") return "border-dashed border-yellow-500 bg-yellow-50 text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-100"
	return "border-gray-300 bg-white text-gray-900 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
}

// Whether it fits is asked a moment after the last change, and said before the button is pressed
function askFit() {
	clearTimeout(asking)
	verdict.value = null
	if (!props.modelValue || !whenText.value || !store.capabilities.check_move) return
	asking = setTimeout(async () => {
		const answer = await checkMove(props.appointment.booking, whenText.value, person.value)
		verdict.value = answer ? { ok: Boolean(answer.ok), why: answer.why || "", cabin: answer.cabin || null } : null
	}, 300)
}
watch([person, day, time], askFit)

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
