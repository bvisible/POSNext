<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Cancel an appointment, or mark the customer absent (NeoSalon, step 2, lot G4, plan « Le mode salon de la caisse », board 5): the -->
	<!-- //// reservation frees the slot, warns the customer when asked, and refunds what she paid online (the salon's decision of 10.11: automatically); the dialog says what it did. -->
	<Dialog v-model="show" :options="{ title: __('Cancel the appointment'), size: 'md' }">
		<template #body-content>
			<div class="space-y-4" data-test="cancel-dialog">
				<p dir="auto" class="text-[15px] text-gray-800 dark:text-gray-100"><b>{{ appointment.customer_name || __("Walk-in") }}</b> · {{ titleOf(appointment) }} · {{ hourOf(appointment.starts_at) }}</p>

				<fieldset class="space-y-2">
					<legend class="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{{ __("Why") }}</legend>
					<label v-for="option in REASONS" :key="option.value" class="flex min-h-[48px] items-center gap-3 rounded-xl border px-4 text-[15px]" :class="reason === option.value ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-400/15 dark:text-blue-100' : 'border-gray-300 text-gray-900 dark:border-gray-600 dark:text-gray-100'">
						<input v-model="reason" type="radio" name="cancel-reason" :value="option.value" :data-test="`cancel-${option.value}`" class="h-4 w-4" />
						{{ option.label }}
					</label>
				</fieldset>

				<p v-if="appointment.paid_amount > 0" class="rounded-xl bg-yellow-50 px-4 py-3 text-sm leading-snug text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-100" data-test="cancel-refund">
					<b>{{ __("She paid {0} online.", [money(appointment.paid_amount)]) }}</b> {{ refundSaid }}
				</p>

				<label class="flex items-start gap-3 text-[15px] text-gray-900 dark:text-gray-100">
					<input v-model="notify" type="checkbox" data-test="cancel-notify" class="mt-1 h-5 w-5 rounded border-gray-400" />
					<span><b>{{ __("Warn the customer") }}</b><span class="block text-sm text-gray-500 dark:text-gray-400">{{ __("The slot is free again in the agenda at once.") }}</span></span>
				</label>

				<div class="flex items-center justify-end gap-3 pt-1">
					<button type="button" data-test="cancel-keep" class="min-h-[48px] rounded-xl px-4 text-[15px] font-semibold text-gray-800 dark:text-gray-100" @click="show = false">{{ __("Keep the appointment") }}</button>
					<button type="button" data-test="cancel-confirm" class="min-h-[48px] rounded-xl bg-red-700 px-5 text-[15px] font-semibold text-white disabled:opacity-50" :disabled="working" @click="submit">{{ working ? __("Loading...") : confirmText }}</button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
/**
 * Cancel an appointment (the customer cancels) or mark it absent (she did not come). emits `update:modelValue` and `cancelled` with the answer.
 */
import { Dialog } from "frappe-ui"
import { computed, ref, watch } from "vue"
import { useAppointment } from "@/composables/useAppointment"
import { useToast } from "@/composables/useToast"
import { useAppointmentsStore } from "@/stores/appointments"
import { usePOSShiftStore } from "@/stores/posShift"
import { hourOf, titleOf } from "@/utils/appointments"
import { formatCurrency } from "@/utils/currency"

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	appointment: { type: Object, required: true },
})
const emit = defineEmits(["update:modelValue", "cancelled"])

const store = useAppointmentsStore()
const shiftStore = usePOSShiftStore()
const { cancel } = useAppointment()
const { showInfo, showWarning } = useToast()

const REASONS = [
	{ value: "cancelled", label: __("The customer cancels") },
	{ value: "no_show", label: __("She did not come (absent)") },
]
const show = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) })
const reason = ref("cancelled")
const notify = ref(true)
const working = ref(false)
const money = (amount) => formatCurrency(amount, shiftStore.profileCurrency || undefined)
const confirmText = computed(() => (reason.value === "no_show" ? __("Mark absent") : __("Cancel the appointment")))
//// Neoffice — what an absence keeps and gives back, before it is marked (12.11): the fee the scale asks for an absence is kept out of
//// what she paid, as compensation, and the rest goes back to her card. The dialog said « refunded automatically » for an absence too.
const refundSaid = computed(() => {
	if (reason.value !== "no_show") {
		//// Neoffice — a late cancellation keeps what the scale asks at this notice out of what she paid (12.11): « refunded automatically »
		//// was said whatever it kept. Nothing kept, or a reservation app that does not say: the sentence it always said.
		const kept = Number(props.appointment.cancel_kept || 0)
		const back = Number(props.appointment.cancel_refund || 0)
		if (!(kept > 0)) return __("It is refunded to her automatically.")
		if (back > 0) return __("Cancelled now, {0} is kept by the cancellation scale and {1} goes back to her card.", [money(kept), money(back)])
		return __("Cancelled now, all of it is kept by the cancellation scale: nothing goes back.")
	}
	// A reservation app that predates these amounts says nothing: no figure rather than a false « nothing goes back »
	if (props.appointment.absent_kept == null && props.appointment.absent_refund == null)
		return __("Marked absent, what the scale asks for an absence is kept and the rest goes back to her card.")
	const kept = Number(props.appointment.absent_kept || 0)
	const back = Number(props.appointment.absent_refund || 0)
	if (back > 0) return __("Marked absent, {0} is kept for the absence and {1} goes back to her card.", [money(kept), money(back)])
	return __("Marked absent, all of it is kept for the absence: nothing goes back.")
})

watch(
	() => props.modelValue,
	(open) => {
		if (!open) return
		reason.value = "cancelled"
		// Telling a customer who did not come that her appointment is cancelled is no courtesy
		notify.value = true
	},
	{ immediate: true },
)
watch(reason, (value) => {
	notify.value = value === "cancelled"
})

async function submit() {
	if (working.value) return
	working.value = true
	const done = await cancel(props.appointment.booking, { reason: reason.value, notify: notify.value })
	working.value = false
	if (!done) return
	if (done.refunded > 0) showInfo(__("{0} refunded to the customer.", [money(done.refunded)]))
	if (done.to_refund > 0) showWarning(__("{0} is still to be refunded to the customer.", [money(done.to_refund)]))
	await store.refresh()
	emit("cancelled", done)
	show.value = false
}
</script>
