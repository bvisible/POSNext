<template>
	<!-- //// Neoffice — added file (no upstream equivalent). « Repeat this appointment » (NeoSalon, lots G14, board 4 of the plan « Forfaits et rendez-vous réguliers »): every so many weeks, so many times (or until a day), -->
	<!-- //// each date checked one by one by the reservation (free, moved to the nearest free hour of the same day, skipped, or beyond the booking horizon), a date changeable by hand. The reservation asks again at the -->
	<!-- //// moment of the booking, and gives back what it took when one fails: the till shows what it answers and decides nothing. -->
	<Dialog v-model="show" :options="{ title: __('Repeat this appointment'), size: '2xl' }">
		<template #body-content>
			<div class="space-y-4" data-test="repeat-dialog">
				<div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-snug dark:border-gray-700 dark:bg-gray-800">
					<b dir="auto" class="block truncate text-[15px] text-gray-900 dark:text-gray-100" data-test="repeat-subject">{{ appointment.customer_name || __("Walk-in") }} · {{ titleOf(appointment) }}</b>
					<span class="text-gray-600 dark:text-gray-300">{{ whenText }}</span>
				</div>

				<template v-if="!result">
					<div>
						<div class="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">{{ __("Every") }}</div>
						<div class="flex flex-wrap items-center gap-2">
							<button v-for="weeks in RHYTHMS" :key="weeks" type="button" :data-test="`repeat-every-${weeks}`" class="min-h-[40px] rounded-full border px-4 text-sm font-semibold" :class="chipClass(!otherRhythm && everyWeeks === weeks)" @click="everyWeeks = weeks; otherRhythm = false">{{ __("{0} weeks", [weeks]) }}</button>
							<button type="button" data-test="repeat-every-other" class="min-h-[40px] rounded-full border px-4 text-sm font-semibold" :class="chipClass(otherRhythm)" @click="otherRhythm = true">{{ __("Other") }}</button>
							<label v-if="otherRhythm" class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
								<input v-model.number="everyWeeks" type="number" min="1" max="52" data-test="repeat-every-number" class="min-h-[40px] w-20 rounded-lg border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-800" />
								{{ __("weeks") }}
							</label>
						</div>
					</div>

					<div>
						<div class="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">{{ __("How many times") }}</div>
						<div class="flex flex-wrap items-center gap-2">
							<button v-for="times in COUNTS" :key="times" type="button" :data-test="`repeat-count-${times}`" class="min-h-[40px] rounded-full border px-4 text-sm font-semibold" :class="chipClass(!untilMode && count === times)" @click="count = times; untilMode = false">{{ times }}</button>
							<button type="button" data-test="repeat-count-until" class="min-h-[40px] rounded-full border px-4 text-sm font-semibold" :class="chipClass(untilMode)" @click="untilMode = true">{{ __("Until…") }}</button>
							<input v-if="untilMode" v-model="until" type="date" :min="firstDay" data-test="repeat-until" class="min-h-[40px] rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-800" />
						</div>
					</div>

					<div>
						<div class="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">{{ __("The dates, checked one by one") }}</div>
						<p v-if="loading && !dates.length" class="py-3 text-sm text-gray-500" data-test="repeat-loading">{{ __("Loading...") }}</p>
						<p v-else-if="failed" class="py-3 text-sm text-red-700 dark:text-red-300" data-test="repeat-failed">{{ __("The dates could not be read.") }}</p>
						<ul v-else class="max-h-72 overflow-y-auto" :class="loading ? 'opacity-60' : ''" data-test="repeat-dates">
							<li v-for="row in dates" :key="row.index" class="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 border-b border-gray-100 px-1 py-3 dark:border-gray-800" :data-test="`repeat-date-${row.index}`">
								<div class="rounded-xl border border-gray-300 py-1 text-center dark:border-gray-600">
									<div class="text-[11px] font-bold uppercase tracking-wider text-gray-500">{{ dayWords(row.date).top }}</div>
									<div class="text-2xl leading-tight text-gray-900 dark:text-gray-100" style="font-family: Forum, Georgia, serif">{{ dayWords(row.date).day }}</div>
								</div>
								<div class="min-w-0">
									<template v-if="row.state === 'free' || row.state === 'shifted'">
										<b class="block truncate text-[15px] text-gray-900 dark:text-gray-100">
											{{ hourOf(changedTo(row) || row.starts_at) }} · {{ personName }}
											<span v-if="row.state === 'shifted' && row.was && !changedTo(row)" class="ms-1 text-sm font-normal text-gray-400 line-through">{{ row.was }}</span>
										</b>
										<span class="block text-sm text-gray-500 dark:text-gray-400">{{ row.why || __("Same hour, same person") }}</span>
									</template>
									<template v-else>
										<b class="block text-[15px] text-gray-900 dark:text-gray-100">{{ row.state === "beyond" ? __("Too far ahead") : __("Skipped") }}</b>
										<span class="block text-sm text-gray-500 dark:text-gray-400">{{ row.why || (row.state === "beyond" ? __("Beyond what the salon takes bookings for: this date is not proposed.") : "") }}</span>
									</template>
									<div v-if="row.state !== 'beyond' && editing === row.index" class="mt-2 flex items-center gap-2">
										<input v-model="editValue" type="datetime-local" step="300" :data-test="`repeat-edit-${row.index}`" class="min-h-[40px] min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-800" />
										<button type="button" :data-test="`repeat-edit-ok-${row.index}`" class="min-h-[40px] rounded-lg bg-gray-900 px-3 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900" @click="applyEdit(row)">{{ __("Check") }}</button>
										<button type="button" class="min-h-[40px] rounded-lg px-3 text-sm text-gray-600 dark:text-gray-300" @click="editing = null">{{ __("Cancel") }}</button>
									</div>
									<button v-else-if="row.state !== 'beyond'" type="button" :data-test="`repeat-edit-open-${row.index}`" class="mt-1 text-sm font-semibold text-orange-700 dark:text-orange-300" @click="openEdit(row)">{{ changedTo(row) ? __("Changed by hand") : __("Change this date") }}</button>
								</div>
								<span class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium" :class="PILLS[row.state]" :data-test="`repeat-state-${row.index}`">{{ STATE_WORDS[row.state]() }}</span>
							</li>
						</ul>
					</div>

					<div class="flex items-center justify-end gap-3 pt-1">
						<button type="button" data-test="repeat-cancel" class="min-h-[48px] rounded-xl px-4 text-[15px] font-semibold text-gray-700 dark:text-gray-200" @click="show = false">{{ __("Cancel") }}</button>
						<button type="button" data-test="repeat-confirm" class="min-h-[48px] rounded-xl bg-gray-900 px-5 text-[15px] font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900" :disabled="working || loading || !bookable" @click="submit()">{{ bookable ? __("Book {0} appointments", [bookable]) : __("Nothing to book") }}</button>
					</div>
				</template>

				<template v-else>
					<div class="rounded-xl bg-green-50 px-4 py-3 text-[15px] text-green-800 dark:bg-green-400/15 dark:text-green-100" data-test="repeat-done">
						<b>{{ __("{0} appointments booked.", [result.booked.length]) }}</b>
						<ul class="mt-1 text-sm">
							<li v-for="row in result.booked" :key="row.booking">{{ dayWords(row.starts_at).top }} {{ dayWords(row.starts_at).day }} · {{ hourOf(row.starts_at) }}</li>
						</ul>
					</div>
					<div v-if="result.skipped.length" class="rounded-xl bg-yellow-50 px-4 py-3 text-sm text-yellow-900 dark:bg-yellow-400/15 dark:text-yellow-100" data-test="repeat-skipped">
						<b>{{ __("Skipped, to book by hand:") }}</b>
						<ul class="mt-1">
							<li v-for="row in result.skipped" :key="row.index">{{ dayWords(row.date).top }} {{ dayWords(row.date).day }}<span v-if="row.why"> · {{ row.why }}</span></li>
						</ul>
					</div>
					<div class="flex justify-end pt-1">
						<button type="button" data-test="repeat-close" class="min-h-[48px] rounded-xl bg-gray-900 px-5 text-[15px] font-semibold text-white dark:bg-gray-100 dark:text-gray-900" @click="show = false">{{ __("Close") }}</button>
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
import { computed, ref, watch } from "vue"
import { useAppointment } from "@/composables/useAppointment"
import { useAppointmentsStore } from "@/stores/appointments"
import { firstStepOf, hourOf, lengthOf, minutesLongOf, titleOf } from "@/utils/appointments"

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	appointment: { type: Object, required: true },
})
const emit = defineEmits(["update:modelValue", "booked"])

const RHYTHMS = [2, 4, 6, 8]
const COUNTS = [3, 4, 6]
const PILLS = {
	free: "bg-green-50 text-green-700 dark:bg-green-400/20 dark:text-green-100",
	shifted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-400/20 dark:text-yellow-100",
	skipped: "bg-orange-50 text-orange-700 dark:bg-orange-400/20 dark:text-orange-100",
	beyond: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
}
const STATE_WORDS = {
	free: () => __("Free"),
	shifted: () => __("Moved"),
	skipped: () => __("Skipped"),
	beyond: () => __("Too far"),
}

const store = useAppointmentsStore()
const { repeat } = useAppointment()

const show = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) })
const everyWeeks = ref(6)
const otherRhythm = ref(false)
const count = ref(4)
const untilMode = ref(false)
const until = ref("")
// The dates changed by hand, by their number: `{ 1: "2026-12-30T11:00" }` as the date field writes them
const changes = ref({})
const editing = ref(null)
const editValue = ref("")
const dates = ref([])
const loading = ref(false)
const failed = ref(false)
const working = ref(false)
const result = ref(null)
let asking = null
let asked = 0

const personName = computed(() => firstStepOf(props.appointment).sales_person_name || firstStepOf(props.appointment).sales_person || "")
const firstDay = computed(() => String(props.appointment.starts_at || "").slice(0, 10))
const whenText = computed(() => {
	const when = new Date(String(props.appointment.starts_at || "").replace(" ", "T"))
	const day = Number.isNaN(when.getTime()) ? firstDay.value : when.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
	const length = minutesLongOf(props.appointment)
	return `${day} · ${hourOf(props.appointment.starts_at)}${personName.value ? ` · ${personName.value}` : ""}${length ? ` · ${lengthOf(length)}` : ""}`
})
/** How many appointments the button books: the free dates and the moved ones (a date changed by hand that the reservation then finds taken says so in the list). */
const bookable = computed(() => dates.value.filter((row) => row.state === "free" || row.state === "shifted").length)
const chipClass = (on) => (on ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900" : "border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100")

function dayWords(moment) {
	const when = new Date(`${String(moment || "").slice(0, 10)}T12:00:00`)
	if (Number.isNaN(when.getTime())) return { top: "", day: String(moment || "").slice(0, 10) }
	return { top: when.toLocaleDateString(undefined, { weekday: "short", month: "short" }), day: String(when.getDate()).padStart(2, "0") }
}

/** The moment a date was changed to by hand (`YYYY-MM-DD HH:MM`), or null. */
function changedTo(row) {
	const kept = changes.value[row.index]
	return kept ? kept.replace("T", " ") : null
}

function openEdit(row) {
	editing.value = row.index
	editValue.value = changes.value[row.index] || String(row.starts_at || `${row.date} ${hourOf(props.appointment.starts_at)}`).replace(" ", "T").slice(0, 16)
}

function applyEdit(row) {
	if (editValue.value) changes.value = { ...changes.value, [row.index]: editValue.value.slice(0, 16) }
	editing.value = null
}

/** What the reservation is asked: the rhythm, how many (or until when), and the dates changed by hand. */
function args(confirm) {
	return {
		everyWeeks: Math.min(Math.max(Number(everyWeeks.value) || 0, 1), 52),
		count: untilMode.value ? null : count.value,
		until: untilMode.value ? until.value || null : null,
		changes: Object.fromEntries(Object.entries(changes.value).map(([index, moment]) => [index, moment.replace("T", " ")])),
		confirm,
	}
}

const askable = computed(() => Boolean(props.modelValue && props.appointment?.booking && (untilMode.value ? until.value : count.value) && everyWeeks.value))

async function preview() {
	if (!askable.value) {
		dates.value = []
		return
	}
	const mine = ++asked
	loading.value = true
	failed.value = false
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
}

watch(
	() => [props.modelValue, props.appointment?.key],
	([open]) => {
		if (!open) return
		everyWeeks.value = 6
		otherRhythm.value = false
		count.value = 4
		untilMode.value = false
		until.value = ""
		changes.value = {}
		editing.value = null
		dates.value = []
		result.value = null
		failed.value = false
	},
	{ immediate: true },
)

// The dates are asked a moment after the last change, and said before the button is pressed. Also when the dialog is mounted already open (the page mounts it
// for the appointment it was opened on).
watch(
	[() => props.modelValue, everyWeeks, count, untilMode, until, changes],
	() => {
		clearTimeout(asking)
		if (!props.modelValue) return
		asking = setTimeout(preview, 300)
	},
	{ immediate: true },
)

async function submit() {
	if (working.value || !bookable.value) return
	working.value = true
	const done = await repeat(props.appointment.booking, args(true))
	working.value = false
	if (!done || done.mode !== "booked") return
	result.value = done
	await store.refresh()
	emit("booked", done)
}
</script>
