<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The sheet of an appointment (NeoSalon, step 2, lot G4, plan « Le mode salon de la caisse », board 3): who, when, what, how much, and the -->
	<!-- //// gestures of the salon mode (start, pause, finish, collect, move, cancel). It offers only what `can` says, and keeps a gesture the site does not have off the screen; one filled button, the one -->
	<!-- //// the person almost always makes at this point. It never shows a cost, a margin or a name the cashier may not read: the site decides, the sheet displays. -->
	<aside class="flex h-full min-h-0 flex-col bg-white dark:bg-gray-900" data-test="appointment-sheet" :aria-label="__('Appointment')">
		<div class="flex items-center gap-3 px-4 py-3">
			<button type="button" data-test="sheet-close" class="inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" @click="emit('close')">
				<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m15 18-6-6 6-6" /></svg>
				{{ __("Agenda") }}
			</button>
			<span class="flex-1" />
			<span class="rounded-full px-3 py-1 text-xs font-medium" :class="PILLS[stands]" data-test="sheet-state">{{ stateText }}</span>
		</div>

		<div class="flex-1 min-h-0 overflow-y-auto">
			<!-- Booked before the salon closed that day, and not begun: nothing cancels it by itself, the cashier decides with the customer -->
			<div v-if="stands === 'to_handle'" class="mx-4 mt-3 mb-1 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:bg-yellow-400/15 dark:text-yellow-100" data-test="sheet-to-handle">
				{{ appointment.to_handle === "away" ? __("The person is away that day. Nothing is cancelled by itself: move this appointment to another person or day, or cancel it with the customer.") : __("The salon is closed that day. Nothing is cancelled by itself: move this appointment, or cancel it with the customer.") }}
			</div>
			<div class="flex flex-col gap-0.5 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
				<b dir="auto" class="text-3xl leading-tight text-gray-900 dark:text-gray-100" style="font-family: Forum, Georgia, serif" data-test="sheet-customer">{{ appointment.customer_name || __("Walk-in") }}</b>
				<span class="text-sm text-gray-500 dark:text-gray-400">{{ whenText }}</span>
			</div>

			<div class="flex flex-col gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
				<div class="text-xs font-semibold uppercase tracking-wider text-gray-500">{{ __("Services") }}</div>
				<div v-for="(step, at) in appointment.steps" :key="at" class="flex items-center gap-3 text-[15px]" :data-test="`sheet-step-${at}`">
					<span class="w-11 flex-none text-xs tabular-nums text-gray-500">{{ hourOf(step.starts_at) }}</span>
					<span class="min-w-0 flex-1">
						<span dir="auto" class="block truncate text-gray-900 dark:text-gray-100">{{ step.label || step.item_code }}</span>
						<span v-if="optionsText(step)" class="block truncate text-xs text-gray-500">{{ optionsText(step) }}</span>
					</span>
					<span v-if="step.sales_person" class="inline-flex flex-none items-center gap-2 rounded-full bg-gray-100 py-0.5 pe-3 ps-1 text-[13px] font-medium text-gray-900 dark:bg-gray-700 dark:text-gray-100">
						<span class="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold text-white" :style="{ background: avatarColorOf(step.sales_person_name || step.sales_person) }" aria-hidden="true">{{ initialsOf(step.sales_person_name || step.sales_person) }}</span>
						{{ step.sales_person_name || step.sales_person }}
					</span>
					<span v-else class="inline-flex flex-none items-center rounded-full border border-dashed border-gray-400 px-3 py-0.5 text-[13px] text-gray-600 dark:text-gray-300">{{ __("To assign") }}</span>
				</div>
			</div>

			<div v-if="showsTime" class="flex flex-col gap-1 border-t border-gray-100 px-4 py-3 text-sm dark:border-gray-800" data-test="sheet-time">
				<div class="text-xs font-semibold uppercase tracking-wider text-gray-500">{{ __("Time") }}</div>
				<div class="flex items-baseline justify-between">
					<span class="text-gray-600 dark:text-gray-300">{{ clockText }}</span>
					<b class="text-xl tabular-nums text-gray-900 dark:text-gray-100" data-test="sheet-active-time">{{ activeTimeOf(appointment.clock.active_seconds) }}</b>
				</div>
				<!-- Only when another appointment of the same person took the time (the clock says which): a pause pressed on this one has nothing to explain -->
				<div v-if="appointment.clock.state === 'paused' && appointment.clock.paused_by" class="text-xs text-gray-500" data-test="sheet-paused-by">{{ __("In pause: the time runs on the other appointment.") }}</div>
			</div>

			<div class="flex flex-col gap-1.5 border-t border-gray-100 px-4 py-3 text-[15px] dark:border-gray-800">
				<div class="flex justify-between"><span class="text-gray-600 dark:text-gray-300">{{ __("Announced") }}</span><b>{{ money(appointment.amount) }}</b></div>
				<div v-if="appointment.paid_amount > 0" class="flex justify-between text-green-700 dark:text-green-300" data-test="sheet-paid">
					<span>{{ __("Already paid online") }}</span><b>− {{ money(appointment.paid_amount) }}</b>
				</div>
				<div v-if="appointment.invoice && appointment.state === 'paid'" class="text-xs text-gray-500" data-test="sheet-invoice">{{ __("Invoice {0}", [appointment.invoice]) }}</div>
				<div class="text-xs text-gray-500">{{ __("The till prices the services again at today's prices when you collect.") }}</div>
			</div>
		</div>

		<div class="flex flex-col gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800" data-test="sheet-gestures">
			<button v-if="primary" type="button" :data-test="`sheet-${primary.key}`" class="min-h-[52px] rounded-xl bg-gray-900 text-base font-semibold text-white disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900" :disabled="busy || primary.off" @click="primary.run()">{{ primary.label }}</button>
			<div class="grid gap-2" :style="{ gridTemplateColumns: `repeat(${secondary.length || 1}, minmax(0, 1fr))` }">
				<button v-for="gesture in secondary" :key="gesture.key" type="button" :data-test="`sheet-${gesture.key}`" class="min-h-[48px] rounded-xl border px-2 text-[15px] font-medium disabled:opacity-50" :class="gesture.danger ? 'border-red-200 text-red-700 dark:border-red-400/40 dark:text-red-300' : 'border-gray-300 text-gray-900 dark:border-gray-500 dark:text-gray-100'" :disabled="busy || gesture.off" @click="gesture.run()">{{ gesture.label }}</button>
			</div>
		</div>
	</aside>
</template>

<script setup>
/**
 * The sheet of one appointment of the agenda (a row of the store).
 *
 * emits `close`, `collect` (take it over into the cart), `move` and `cancel` (the dialogs are the page's). The gestures of the time are asked here: the
 * server reads its clock, and the agenda is read again after each.
 */
import { computed, ref } from "vue"
import { useAppointment } from "@/composables/useAppointment"
import { useAppointmentsStore } from "@/stores/appointments"
import { usePOSShiftStore } from "@/stores/posShift"
import { activeTimeOf, avatarColorOf, hourOf, initialsOf, lengthOf, minutesLongOf, standsAs } from "@/utils/appointments"
import { formatCurrency } from "@/utils/currency"

const props = defineProps({
	appointment: { type: Object, required: true },
})
const emit = defineEmits(["close", "collect", "move", "cancel", "repeat"])

const store = useAppointmentsStore()
const shiftStore = usePOSShiftStore()
const { clock } = useAppointment()
const busy = ref(false)

const PILLS = {
	booked: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
	started: "bg-blue-50 text-blue-700 dark:bg-blue-400/20 dark:text-blue-100",
	finished: "bg-orange-50 text-orange-700 dark:bg-orange-400/20 dark:text-orange-100",
	in_the_till: "bg-blue-50 text-blue-700 dark:bg-blue-400/20 dark:text-blue-100",
	to_handle: "bg-yellow-100 text-yellow-800 dark:bg-yellow-400/20 dark:text-yellow-100",
	paid: "bg-green-50 text-green-700 dark:bg-green-400/20 dark:text-green-100",
	absent: "bg-red-50 text-red-700 dark:bg-red-400/20 dark:text-red-100",
}

const money = (amount) => formatCurrency(amount, shiftStore.profileCurrency || undefined)
const stands = computed(() => standsAs(props.appointment))
const can = computed(() => props.appointment.can || {})
const state = computed(() => props.appointment.clock?.state || "idle")
const stateText = computed(() => {
	switch (stands.value) {
		case "started":
			return state.value === "paused" ? __("In pause") : __("In progress")
		case "finished":
			return __("To collect")
		case "in_the_till":
			return __("In the till")
		case "to_handle":
			return __("To handle")
		case "paid":
			return __("Paid")
		case "absent":
			return __("Absent")
		default:
			return __("Booked")
	}
})
const whenText = computed(() => {
	const length = minutesLongOf(props.appointment)
	return `${hourOf(props.appointment.starts_at)} → ${hourOf(props.appointment.ends_at)}${length ? ` · ${lengthOf(length)}` : ""}`
})
const showsTime = computed(() => store.capabilities.clock && !["paid", "absent"].includes(props.appointment.state) && (state.value !== "idle" || can.value.clock))
const clockText = computed(() => {
	const clockState = props.appointment.clock || {}
	if (clockState.state === "done") return __("Finished at {0}", [hourOf(clockState.ended_at)])
	if (clockState.state === "idle") return __("Not started")
	return __("Started at {0}", [hourOf(clockState.started_at)])
})

/** The options a line carries, « Length: Mid, Level: 7 », from the JSON the line holds. */
function optionsText(step) {
	if (!step?.options) return ""
	try {
		const groups = JSON.parse(step.options)
		return (Array.isArray(groups) ? groups : [])
			.map((group) => {
				const chosen = (group?.options || []).map((option) => option?.name || option?.label).filter(Boolean)
				return chosen.length ? `${group?.group || group?.name || ""}${group?.group || group?.name ? ": " : ""}${chosen.join(", ")}` : ""
			})
			.filter(Boolean)
			.join(" · ")
	} catch {
		return ""
	}
}

async function timeGesture(action) {
	if (busy.value) return
	busy.value = true
	const done = await clock(props.appointment.booking, action)
	busy.value = false
	if (done) await store.refresh()
}

/** The gestures, by where the appointment stands: one filled button, the others with an outline, the dangerous one in red. */
const collect = computed(() => ({ key: "collect", label: stands.value === "in_the_till" ? __("Resume") : __("Collect"), off: !can.value.collect, run: () => emit("collect", props.appointment) }))
const primary = computed(() => {
	const row = props.appointment
	if (row.state === "paid" || row.state === "absent") return null
	// The salon is closed that day: what the cashier does first is move it (or, when it can no longer be moved, cancel it below)
	if (stands.value === "to_handle" && store.capabilities.move && can.value.move) return { key: "move", label: __("Move"), run: () => emit("move", row) }
	if (store.capabilities.clock && can.value.clock) {
		if (state.value === "idle") return { key: "start", label: __("Start"), run: () => timeGesture("start") }
		if (state.value === "running") return { key: "finish", label: __("Finish"), run: () => timeGesture("finish") }
		if (state.value === "paused") return { key: "start", label: __("Resume the time"), run: () => timeGesture("start") }
	}
	return can.value.collect ? collect.value : null
})
/** Coming back: any appointment the site can repeat, a paid one too (the customer's next visit), never an absent one. */
const repeating = computed(() => ({ key: "repeat", label: __("Repeat"), run: () => emit("repeat", props.appointment) }))
const canRepeat = computed(() => Boolean(store.capabilities.repeat) && Boolean(props.appointment.booking) && props.appointment.state !== "absent")
const secondary = computed(() => {
	const row = props.appointment
	if (row.state === "paid") return canRepeat.value ? [repeating.value] : []
	if (row.state === "absent") return []
	const list = []
	if (primary.value && primary.value.key !== "collect" && can.value.collect) list.push(collect.value)
	if (store.capabilities.clock && can.value.clock && state.value === "running") list.push({ key: "pause", label: __("Pause"), run: () => timeGesture("pause") })
	if (store.capabilities.move && primary.value?.key !== "move") list.push({ key: "move", label: __("Move"), off: !can.value.move, run: () => emit("move", row) })
	if (store.capabilities.cancel) list.push({ key: "cancel", label: __("Cancel"), danger: true, off: !can.value.cancel, run: () => emit("cancel", row) })
	if (canRepeat.value) list.push(repeating.value)
	return list
})
</script>
