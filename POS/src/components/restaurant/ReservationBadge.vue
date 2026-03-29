<template>
	<div
		v-if="reservation"
		class="reservation-badge"
		:class="statusClass"
		:title="tooltipText"
	>
		<span class="badge-time">{{ formattedTime }}</span>
		<span class="badge-name">{{ reservation.guest_name }}</span>
		<span class="badge-guests">{{ reservation.no_of_guests }}p</span>
	</div>
</template>

<script setup>
import { computed } from "vue"

const props = defineProps({
	reservation: {
		type: Object,
		default: null,
	},
})

const formattedTime = computed(() => {
	if (!props.reservation?.reservation_time) return ""
	// Show HH:MM only
	return props.reservation.reservation_time.slice(0, 5)
})

const statusClass = computed(() => {
	if (!props.reservation) return ""
	return `badge-${props.reservation.status?.toLowerCase().replace(" ", "-")}`
})

const tooltipText = computed(() => {
	if (!props.reservation) return ""
	const r = props.reservation
	let text = `${r.guest_name} - ${r.no_of_guests} ${__("guests")}`
	if (r.phone) text += `\n${r.phone}`
	if (r.notes) text += `\n${r.notes}`
	return text
})
</script>

<style scoped>
.reservation-badge {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 2px 6px;
	border-radius: 4px;
	font-size: 10px;
	line-height: 1.2;
	white-space: nowrap;
	overflow: hidden;
	max-width: 100%;
	background: var(--yellow-100, #fef3c7);
	color: var(--yellow-800, #92400e);
	border: 1px solid var(--yellow-300, #fcd34d);
}

.badge-time {
	font-weight: 600;
}

.badge-name {
	overflow: hidden;
	text-overflow: ellipsis;
}

.badge-guests {
	opacity: 0.7;
	flex-shrink: 0;
}

.badge-confirmed {
	background: var(--blue-100, #dbeafe);
	color: var(--blue-800, #1e40af);
	border-color: var(--blue-300, #93c5fd);
}

.badge-pending {
	background: var(--orange-100, #ffedd5);
	color: var(--orange-800, #9a3412);
	border-color: var(--orange-300, #fdba74);
}

.badge-seated {
	background: var(--green-100, #dcfce7);
	color: var(--green-800, #166534);
	border-color: var(--green-300, #86efac);
}
</style>
