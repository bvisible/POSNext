<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The appointment the cart was taken from, said above the cart (NeoSalon, step 2, lot G4, canvas « Rendez-vous 2 »): the cashier knows the cart is the appointment's. -->
	<div
		v-if="appointment"
		data-test="appointment-banner"
		class="mx-4 mt-3 flex flex-none items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 text-blue-700 dark:bg-blue-400/15 dark:text-blue-100"
		role="status"
	>
		<svg class="h-6 w-6 flex-none" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
			<rect x="3" y="4" width="18" height="18" rx="2" />
			<path d="M16 2v4M8 2v4M3 10h18" />
		</svg>
		<div class="min-w-0 flex-1 leading-snug">
			<b dir="auto" class="block truncate text-base font-semibold">{{ title }}</b>
			<div class="text-sm text-blue-900 dark:text-blue-50">{{ hours }}{{ __("Add a product or change a service; the payment ends the appointment.") }}</div>
			<div v-if="!appointment.invoice" class="text-xs text-blue-900 dark:text-blue-50" data-test="appointment-banner-offline">{{ __("No network: the appointment is marked paid when the till is back online.") }}</div>
		</div>
	</div>
</template>

<script setup>
/**
 * The appointment in the cart (cartStore.appointment, set by useAppointment.takeAppointment), or nothing.
 */
import { computed } from "vue"
import { usePOSCartStore } from "@/stores/posCart"
import { hourOf } from "@/utils/appointments"

const cartStore = usePOSCartStore()
const appointment = computed(() => cartStore.appointment)

const title = computed(() => {
	const customer = appointment.value?.customer_name
	return customer ? __("Appointment of {0} collected", [customer]) : __("Appointment collected")
})
const hours = computed(() => {
	const from = hourOf(appointment.value?.starts_at)
	const to = hourOf(appointment.value?.ends_at)
	return from && to ? `${from} → ${to} · ` : ""
})
</script>
