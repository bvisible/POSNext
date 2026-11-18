<template>
	<!-- //// Neoffice — added file (no upstream equivalent). « Repeat this appointment » (NeoSalon, lots G14, board 4 of the plan « Forfaits et rendez-vous réguliers »): every so many weeks, so many times (or until a day), -->
	<!-- //// each date checked one by one by the reservation (free, moved to the nearest free hour of the same day, skipped, or beyond the booking horizon), a date changeable by hand. The reservation asks again at the -->
	<!-- //// moment of the booking, and gives back what it took when one fails: the till shows what it answers and decides nothing. The audit of 18.11 (voie 4): sizes of the touch surface (§ 7 of the design system), -->
	<!-- //// what a field refuses said instead of corrected in silence, the reason of a refusal, and a booking that got no answer says so. -->
	<Dialog v-model="show" :options="{ title: __('Repeat this appointment'), size: '2xl' }">
		<template #body-content>
			<div class="space-y-4" data-test="repeat-dialog">
				<div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 leading-snug dark:border-gray-700 dark:bg-gray-800">
					<b dir="auto" class="block break-words text-base text-gray-900 dark:text-gray-100" data-test="repeat-subject">{{ appointment.customer_name || __("Walk-in") }} · {{ titleOf(appointment) }}</b>
					<span class="text-[15px] text-gray-700 dark:text-gray-300">{{ whenText }}</span>
				</div>

				<template v-if="!result">
					<div>
						<div class="mb-2 text-[14px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">{{ __("Every") }}</div>
						<div class="flex flex-wrap items-center gap-2">
							<button v-for="weeks in RHYTHMS" :key="weeks" type="button" :data-test="`repeat-every-${weeks}`" class="min-h-[48px] rounded-full border px-4 text-base font-semibold" :class="chipClass(!otherRhythm && everyWeeks === weeks)" @click="pickRhythm(weeks)">{{ __("{0} weeks", [weeks]) }}</button>
							<button type="button" data-test="repeat-every-other" class="min-h-[48px] rounded-full border px-4 text-base font-semibold" :class="chipClass(otherRhythm)" @click="pickOtherRhythm()">{{ __("Other") }}</button>
							<label v-if="otherRhythm" class="flex items-center gap-2 text-base text-gray-800 dark:text-gray-100">
								<input v-model.number="otherText" type="number" min="1" max="52" step="1" inputmode="numeric" data-test="repeat-every-number" :aria-invalid="Boolean(otherProblem)" class="min-h-[48px] w-24 rounded-lg border bg-white px-3 text-base dark:bg-gray-800" :class="otherProblem ? 'border-red-600 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'" />
								{{ __("weeks") }}
							</label>
						</div>
						<p v-if="otherProblem" role="alert" class="mt-2 text-[14px] text-red-700 dark:text-red-300" data-test="repeat-every-problem">{{ otherProblem }}</p>
					</div>

					<div>
						<div class="mb-2 text-[14px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">{{ __("How many times") }}</div>
						<div class="flex flex-wrap items-center gap-2">
							<button v-for="times in COUNTS" :key="times" type="button" :data-test="`repeat-count-${times}`" class="min-h-[48px] min-w-[48px] rounded-full border px-4 text-base font-semibold" :class="chipClass(!untilMode && count === times)" @click="count = times; untilMode = false">{{ times }}</button>
							<button type="button" data-test="repeat-count-until" class="min-h-[48px] rounded-full border px-4 text-base font-semibold" :class="chipClass(untilMode)" @click="untilMode = true">{{ __("Until…") }}</button>
							<input v-if="untilMode" v-model="until" type="date" :min="firstDay" data-test="repeat-until" :aria-invalid="Boolean(untilProblem)" class="min-h-[48px] rounded-lg border bg-white px-3 text-base dark:bg-gray-800" :class="untilProblem ? 'border-red-600 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'" />
						</div>
						<p v-if="untilMode && !until" class="mt-2 text-[14px] text-gray-700 dark:text-gray-300" data-test="repeat-until-hint">{{ __("Choose the last day.") }}</p>
						<p v-else-if="untilProblem" role="alert" class="mt-2 text-[14px] text-red-700 dark:text-red-300" data-test="repeat-until-problem">{{ untilProblem }}</p>
					</div>

					<p v-if="changesReset" class="rounded-lg bg-yellow-50 px-3 py-2 text-[14px] text-yellow-900 dark:bg-yellow-400/15 dark:text-yellow-100" data-test="repeat-changes-reset">{{ __("The rhythm changed: the dates changed by hand were put back.") }}</p>

					<div>
						<div class="mb-1 text-[14px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">{{ __("The dates, checked one by one") }}</div>
						<p v-if="loading && !dates.length" class="py-3 text-base text-gray-700 dark:text-gray-300" data-test="repeat-loading">{{ __("Loading...") }}</p>
						<div v-else-if="failed" role="alert" class="py-3" data-test="repeat-failed-box">
							<p class="text-base text-red-700 dark:text-red-300" data-test="repeat-failed">{{ failedReason || __("The dates could not be read.") }}</p>
							<!-- //// Neoffice — a refusal, a network that came back or an answer that never came asked nothing again: the cashier had to touch a chip (the audit of 18.11) -->
							<button type="button" data-test="repeat-retry" class="mt-2 min-h-[44px] rounded-lg border border-gray-300 px-4 text-base font-semibold text-gray-800 dark:border-gray-600 dark:text-gray-100" @click="preview()">{{ __("Try again") }}</button>
						</div>
						<!-- //// Neoffice — a valid last day before the first repetition left an empty list and a button « Nothing to book » with no word why (the audit of 18.11) -->
						<p v-else-if="answered && !dates.length" class="py-3 text-base text-gray-700 dark:text-gray-200" data-test="repeat-no-dates">{{ untilMode ? __("No repetition falls on or before that day.") : __("No date to propose.") }}</p>
						<ul v-else class="max-h-72 overflow-y-auto" :class="loading ? 'opacity-60' : ''" data-test="repeat-dates">
							<li v-for="row in dates" :key="row.index" class="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-gray-100 px-1 py-3 sm:grid-cols-[88px_minmax(0,1fr)_auto] dark:border-gray-800" :data-test="`repeat-date-${row.index}`">
								<div class="rounded-xl border border-gray-300 py-1 text-center dark:border-gray-600">
									<!-- //// Neoffice — the weekday, the day, then the month and the year: three short lines that do not break at 375 px (the audit of 18.11: « JANV. JEU. » broke in two, the month came before the weekday) -->
									<div class="whitespace-nowrap text-[14px] font-semibold text-gray-700 dark:text-gray-300">{{ dayWords(row.date).weekday }}</div>
									<div class="text-2xl leading-tight text-gray-900 dark:text-gray-100" style="font-family: Forum, Georgia, serif">{{ dayWords(row.date).day }}</div>
									<div class="whitespace-nowrap text-[14px] text-gray-700 dark:text-gray-300">{{ dayWords(row.date).monthYear }}</div>
								</div>
								<div class="min-w-0">
									<template v-if="row.state === 'free' || row.state === 'shifted'">
										<b class="block break-words text-base text-gray-900 dark:text-gray-100">
											{{ hourOf(changedTo(row) || row.starts_at) }}<template v-if="personName"> · {{ personName }}</template>
											<span v-if="row.state === 'shifted' && row.was && !changedTo(row)" class="ms-1 text-[15px] font-normal text-gray-700 line-through dark:text-gray-300">{{ row.was }}</span>
										</b>
										<span class="block text-[15px] text-gray-700 dark:text-gray-300">{{ row.why || underTheHour(row) }}</span>
									</template>
									<template v-else>
										<b class="block text-base text-gray-900 dark:text-gray-100">{{ row.state === "beyond" ? __("Beyond the booking horizon") : row.why || __("No free slot") }}</b>
										<span class="block text-[15px] text-gray-700 dark:text-gray-300">{{ row.state === "beyond" ? row.why || __("This date is not proposed.") : __("This date is skipped.") }}</span>
									</template>
									<div v-if="row.state !== 'beyond' && editing === row.index" class="mt-2">
										<div class="flex flex-wrap items-center gap-2">
											<input v-model="editValue" type="datetime-local" step="300" :data-test="`repeat-edit-${row.index}`" :aria-invalid="Boolean(editProblem)" class="min-h-[48px] min-w-0 rounded-lg border bg-white px-3 text-base dark:bg-gray-800" :class="editProblem ? 'border-red-600 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'" />
											<button type="button" :data-test="`repeat-edit-ok-${row.index}`" class="min-h-[48px] rounded-lg bg-gray-900 px-4 text-base font-semibold text-white dark:bg-gray-100 dark:text-gray-900" @click="applyEdit(row)">{{ __("Check") }}</button>
											<button type="button" class="min-h-[48px] rounded-lg px-3 text-base text-gray-700 dark:text-gray-200" @click="closeEdit()">{{ __("Cancel") }}</button>
										</div>
										<p v-if="editProblem" role="alert" class="mt-2 text-[14px] text-red-700 dark:text-red-300" data-test="repeat-edit-problem">{{ editProblem }}</p>
									</div>
									<button v-else-if="row.state !== 'beyond'" type="button" :data-test="`repeat-edit-open-${row.index}`" class="mt-1 min-h-[44px] text-base font-semibold text-orange-800 dark:text-orange-300" @click="openEdit(row)">{{ changedTo(row) ? __("Changed by hand") : __("Change this date") }}</button>
								</div>
								<span class="col-start-2 inline-flex items-center gap-2 justify-self-start rounded-full px-3 py-1 text-[14px] font-medium sm:col-start-auto" :class="PILLS[row.state]" :data-test="`repeat-state-${row.index}`"><span class="h-2 w-2 shrink-0 rounded-full" :class="DOTS[row.state]" aria-hidden="true" />{{ STATE_WORDS[row.state]() }}</span>
							</li>
						</ul>
					</div>

					<p v-if="submitProblem" role="alert" class="rounded-lg bg-red-50 px-3 py-2 text-[15px] text-red-800 dark:bg-red-400/15 dark:text-red-100" data-test="repeat-submit-problem">{{ submitProblem }}</p>

					<div class="flex flex-wrap items-center justify-end gap-3 pt-1">
						<button type="button" data-test="repeat-cancel" class="min-h-[48px] rounded-xl px-4 text-base font-semibold text-gray-700 dark:text-gray-200" @click="show = false">{{ __("Cancel") }}</button>
						<button type="button" data-test="repeat-confirm" class="min-h-[48px] whitespace-nowrap rounded-xl bg-gray-900 px-5 text-base font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900" :disabled="working || loading || !bookable" @click="submit()">{{ bookable === 1 ? __("Book 1 appointment") : bookable ? __("Book {0} appointments", [bookable]) : __("Nothing to book") }}</button>
					</div>
				</template>

				<template v-else>
					<div class="rounded-xl bg-green-50 px-4 py-3 text-base text-green-800 dark:bg-green-400/15 dark:text-green-100" data-test="repeat-done">
						<b>{{ result.booked.length === 1 ? __("1 appointment booked.") : __("{0} appointments booked.", [result.booked.length]) }}</b>
						<ul class="mt-1 text-[15px]">
							<li v-for="row in result.booked" :key="row.booking">{{ dayOf(row.starts_at) }} · {{ hourOf(row.starts_at) }}<span v-if="row.state === 'shifted'"> · {{ __("Moved") }}</span></li>
						</ul>
					</div>
					<div v-if="skippedRows.length" class="rounded-xl bg-yellow-50 px-4 py-3 text-[15px] text-yellow-900 dark:bg-yellow-400/15 dark:text-yellow-100" data-test="repeat-skipped">
						<b>{{ __("Skipped, to book by hand:") }}</b>
						<ul class="mt-1">
							<li v-for="row in skippedRows" :key="row.index">{{ dayOf(row.date) }}<span v-if="row.why"> · {{ row.why }}</span></li>
						</ul>
					</div>
					<div v-if="beyondRows.length" class="rounded-xl bg-gray-100 px-4 py-3 text-[15px] text-gray-800 dark:bg-gray-700 dark:text-gray-100" data-test="repeat-beyond">
						<b>{{ __("Not proposed, beyond the booking horizon:") }}</b>
						<ul class="mt-1">
							<li v-for="row in beyondRows" :key="row.index">{{ dayOf(row.date) }}</li>
						</ul>
					</div>
					<div class="flex justify-end pt-1">
						<button type="button" data-test="repeat-close" class="min-h-[48px] rounded-xl bg-gray-900 px-5 text-base font-semibold text-white dark:bg-gray-100 dark:text-gray-900" @click="show = false">{{ __("Close") }}</button>
					</div>
				</template>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
/**
 * Repeat an appointment every so many weeks. emits `update:modelValue` and `booked` once the reservation has booked the dates (the agenda is read again before).
 * The reservation says which dates are free: the preview is asked a moment after the last change, and again, by the reservation, when the button is pressed.
 */
import { Dialog } from "frappe-ui"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useAppointment } from "@/composables/useAppointment"
import { useAppointmentsStore } from "@/stores/appointments"
import { offlineState } from "@/utils/offline/offlineState"
import { firstStepOf, hourOf, lengthOf, minutesLongOf, titleOf } from "@/utils/appointments"

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	appointment: { type: Object, required: true },
})
const emit = defineEmits(["update:modelValue", "booked"])

const RHYTHMS = [2, 4, 6, 8]
const COUNTS = [3, 4, 6]
const MOST_WEEKS = 52
const PILLS = {
	free: "bg-green-50 text-green-800 dark:bg-green-400/20 dark:text-green-100",
	shifted: "bg-yellow-100 text-yellow-900 dark:bg-yellow-400/20 dark:text-yellow-100",
	skipped: "bg-orange-50 text-orange-800 dark:bg-orange-400/20 dark:text-orange-100",
	beyond: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
}
const DOTS = {
	free: "bg-green-600 dark:bg-green-300",
	shifted: "bg-yellow-600 dark:bg-yellow-300",
	skipped: "bg-orange-600 dark:bg-orange-300",
	beyond: "bg-gray-500 dark:bg-gray-300",
}
const STATE_WORDS = {
	free: () => __("Free date"),
	shifted: () => __("Moved"),
	skipped: () => __("Skipped"),
	beyond: () => __("Too far"),
}

const store = useAppointmentsStore()
const { repeat, refusal } = useAppointment()

const show = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) })
const everyWeeks = ref(6)
const otherRhythm = ref(false)
// What is typed in the field of another rhythm, kept as it was typed: it is said when it is not a whole number of weeks, never corrected behind the cashier's back
const otherText = ref("")
const count = ref(4)
const untilMode = ref(false)
const until = ref("")
// The dates changed by hand, by their number: `{ 1: "2026-12-30T11:00" }` as the date field writes them
const changes = ref({})
const changesReset = ref(false)
const editing = ref(null)
const editValue = ref("")
const editProblem = ref("")
const dates = ref([])
const loading = ref(false)
const failed = ref(false)
// The reservation has answered the question in front of the cashier (an empty list is then « nothing to propose », not « not asked yet »)
const answered = ref(false)
const working = ref(false)
const result = ref(null)
const submitProblem = ref("")
let asking = null
let asked = 0

const personName = computed(() => firstStepOf(props.appointment).sales_person_name || firstStepOf(props.appointment).sales_person || "")
const firstDay = computed(() => String(props.appointment.starts_at || "").slice(0, 10))
const whenText = computed(() => {
	const when = new Date(String(props.appointment.starts_at || "").replace(" ", "T"))
	const day = Number.isNaN(when.getTime()) ? firstDay.value : when.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
	const length = minutesLongOf(props.appointment)
	return `${day} · ${hourOf(props.appointment.starts_at)}${personName.value ? ` · ${personName.value}` : ""}${length ? ` · ${lengthOf(length)}` : ""}`
})
/** How many appointments the button books: the free dates and the moved ones (a date changed by hand that the reservation then finds taken says so in the list). */
const bookable = computed(() => dates.value.filter((row) => row.state === "free" || row.state === "shifted").length)
const chipClass = (on) => (on ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900" : "border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100")
/** The reservation's own words when it refused the dates (useAppointment keeps the last one). */
const failedReason = computed(() => (refusal && refusal.value) || "")

const wholeWeeks = (typed) => {
	const weeks = typeof typed === "number" ? typed : typed === "" || typed === null || typed === undefined ? Number.NaN : Number(typed)
	return Number.isInteger(weeks) && weeks >= 1 && weeks <= MOST_WEEKS ? weeks : 0
}
const otherProblem = computed(() => (otherRhythm.value && !wholeWeeks(otherText.value) ? __("Choose a whole number of weeks, from 1 to 52.") : ""))
const untilProblem = computed(() => (untilMode.value && until.value && until.value <= firstDay.value ? __("The last day must come after the appointment.") : ""))

function pickRhythm(weeks) {
	everyWeeks.value = weeks
	otherRhythm.value = false
}

function pickOtherRhythm() {
	otherRhythm.value = true
	otherText.value = String(everyWeeks.value || 6)
}

// The number typed in the field gives the rhythm only when it is a whole number of weeks; otherwise nothing is asked until it is
watch(otherText, (typed) => {
	if (otherRhythm.value) everyWeeks.value = wholeWeeks(typed)
})

/** `Wed, 30/12/2026`: one way to write a day wherever one is read (the list, the report, the field of the last day). */
function dayOf(moment) {
	const when = new Date(`${String(moment || "").slice(0, 10)}T12:00:00`)
	if (Number.isNaN(when.getTime())) return String(moment || "").slice(0, 10)
	return when.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
}

function dayWords(moment) {
	const when = new Date(`${String(moment || "").slice(0, 10)}T12:00:00`)
	if (Number.isNaN(when.getTime())) return { weekday: "", day: String(moment || "").slice(0, 10), monthYear: "" }
	return {
		weekday: when.toLocaleDateString(undefined, { weekday: "short" }),
		day: String(when.getDate()).padStart(2, "0"),
		monthYear: `${when.toLocaleDateString(undefined, { month: "short" })} ${when.getFullYear()}`,
	}
}

/** What stands under the hour of a date the reservation gave no reason for: the moment chosen by hand, the nearest free hour, or the same hour (with the same person when one is named). */
function underTheHour(row) {
	if (changedTo(row)) return __("The moment you chose.")
	if (row.state === "shifted") return __("The nearest free hour that day.")
	return personName.value ? __("Same hour, same person") : __("Same hour")
}

/** The moment a date was changed to by hand (`YYYY-MM-DD HH:MM`), or null. */
function changedTo(row) {
	const kept = changes.value[row.index]
	return kept ? kept.replace("T", " ") : null
}

function openEdit(row) {
	editing.value = row.index
	editProblem.value = ""
	editValue.value = changes.value[row.index] || String(row.starts_at || `${row.date} ${hourOf(props.appointment.starts_at)}`).replace(" ", "T").slice(0, 16)
}

function closeEdit() {
	editing.value = null
	editProblem.value = ""
}

/** Why a moment typed for a date cannot be asked: not a whole day and hour, or not after the appointment it repeats; "" when it can. */
function problemOfEdit(typed) {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(typed || ""))) return __("Choose a day and an hour.")
	if (String(typed).slice(0, 16).replace("T", " ") <= String(props.appointment.starts_at || "").slice(0, 16)) return __("Choose a moment after the appointment.")
	return ""
}

function applyEdit(row) {
	const problem = problemOfEdit(editValue.value)
	if (problem) {
		// The field stays open with what was typed, and says why it was not taken
		editProblem.value = problem
		return
	}
	changesReset.value = false
	changes.value = { ...changes.value, [row.index]: editValue.value.slice(0, 16) }
	closeEdit()
}

/** What the reservation is asked: the rhythm, how many (or until when), and the dates changed by hand. */
function args(confirm) {
	return {
		everyWeeks: Math.min(Math.max(Number(everyWeeks.value) || 0, 1), MOST_WEEKS),
		count: untilMode.value ? null : count.value,
		until: untilMode.value ? until.value || null : null,
		changes: Object.fromEntries(Object.entries(changes.value).map(([index, moment]) => [index, moment.replace("T", " ")])),
		confirm,
	}
}

const askable = computed(() => Boolean(props.modelValue && props.appointment?.booking && (untilMode.value ? until.value && !untilProblem.value : count.value) && everyWeeks.value))

async function preview() {
	if (!askable.value) {
		dates.value = []
		failed.value = false
		return
	}
	const mine = ++asked
	loading.value = true
	failed.value = false
	answered.value = false
	const answer = await repeat(props.appointment.booking, args(false))
	// An answer that comes after a newer question is not the one the cashier is looking at
	if (mine !== asked) return
	loading.value = false
	if (!answer || answer.mode !== "preview") {
		failed.value = true
		dates.value = []
		return
	}
	dates.value = answer.dates
	answered.value = true
}

watch(
	() => [props.modelValue, props.appointment?.key],
	([open]) => {
		if (!open) return
		everyWeeks.value = 6
		otherRhythm.value = false
		otherText.value = ""
		count.value = 4
		untilMode.value = false
		until.value = ""
		changes.value = {}
		changesReset.value = false
		closeEdit()
		dates.value = []
		answered.value = false
		result.value = null
		failed.value = false
		submitProblem.value = ""
	},
	{ immediate: true },
)

// A date changed by hand belongs to the series as it was drawn: another rhythm, another number or another last day make other dates, and the hand-made ones
// would go on to book at the old rhythm (a series of 8 weeks with a date of 6). They are put back, and the cashier is told.
watch([everyWeeks, count, untilMode, until], () => {
	if (Object.keys(changes.value).length) {
		changes.value = {}
		changesReset.value = true
	}
	closeEdit()
})

// The dates are asked a moment after the last change, and said before the button is pressed. Also when the dialog is mounted already open (the page mounts it
// for the appointment it was opened on).
watch(
	[() => props.modelValue, everyWeeks, count, untilMode, until, changes],
	() => {
		clearTimeout(asking)
		submitProblem.value = ""
		if (!props.modelValue) return
		asking = setTimeout(preview, 300)
	},
	{ immediate: true },
)

// The network back: a window that could not read the dates asks again by itself
let stopFollowingTheNetwork = null
onMounted(() => {
	if (typeof offlineState.subscribe === "function")
		stopFollowingTheNetwork = offlineState.subscribe((state) => {
			if (state?.transition === "went-online" && props.modelValue && failed.value) preview()
		})
})
onBeforeUnmount(() => stopFollowingTheNetwork?.())

async function submit() {
	if (working.value || !bookable.value) return
	working.value = true
	submitProblem.value = ""
	const done = await repeat(props.appointment.booking, args(true))
	working.value = false
	if (!done || done.mode !== "booked") {
		// Nothing was said back: the reservation may have booked some of the dates all the same. Its reason when it gave one, else the agenda is read again and the cashier told to look
		submitProblem.value = (refusal && refusal.value) || __("No answer came. The agenda was read again: check which appointments exist before trying again.")
		await store.refresh()
		return
	}
	result.value = done
	await store.refresh()
	emit("booked", done)
}

// A date of the report the reservation did not propose (beyond its horizon) is not a skipped one: nothing was refused for it
const beyondIndexes = computed(() => new Set(dates.value.filter((row) => row.state === "beyond").map((row) => row.index)))
const skippedRows = computed(() => (result.value?.skipped || []).filter((row) => !beyondIndexes.value.has(row.index)))
const beyondRows = computed(() => (result.value?.skipped || []).filter((row) => beyondIndexes.value.has(row.index)))
</script>
