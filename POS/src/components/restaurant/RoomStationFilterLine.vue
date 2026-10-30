<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The one line of filters the runner and the kitchen screen -->
	<!-- //// share (NeoRestau lot 1, task 9c): the rooms on the left, the preparation stations on the right. They were two -->
	<!-- //// rows on the runner and the kitchen had no room filter at all; the product owner asked for one line on both -->
	<!-- //// screens, with the same behaviour. A screen hands over what it counts (the runner the dishes that are ready, -->
	<!-- //// the kitchen its tickets) and keeps the choice; this component only draws the chips and says what was chosen. -->
	<div
		v-if="hasRooms || hasStations"
		data-test="filter-line"
		class="bg-white dark:bg-gray-800 border-b px-4 py-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 flex-shrink-0"
	>
		<!-- Rooms, on the left -->
		<div
			v-if="hasRooms"
			data-test="rooms"
			role="group"
			:aria-label="__('Filter by room')"
			class="flex flex-wrap items-center gap-2"
		>
			<button
				type="button"
				:class="[CHIP, !selectedRoom ? ACTIVE : IDLE]"
				:aria-pressed="!selectedRoom"
				@click="emit('update:selectedRoom', '')"
			>{{ __("All Areas") }}</button>
			<button
				v-for="room in rooms"
				:key="room.name"
				type="button"
				:class="[CHIP, selectedRoom === room.name ? ACTIVE : IDLE]"
				:aria-pressed="selectedRoom === room.name"
				@click="emit('update:selectedRoom', room.name)"
			>
				{{ room.label }}
				<span
					v-if="room.count > 0"
					data-test="room-count"
					class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-green-500 rounded-full"
				>{{ room.count }}</span>
			</button>
		</div>

		<!-- Stations, on the right (even alone on a row) -->
		<div
			v-if="hasStations"
			data-test="stations"
			role="group"
			:aria-label="__('Filter by station')"
			class="flex flex-wrap items-center justify-end gap-2 ml-auto"
		>
			<button
				type="button"
				:class="[CHIP, !selectedStation ? ACTIVE : IDLE]"
				:aria-pressed="!selectedStation"
				@click="emit('update:selectedStation', null)"
			>{{ allLabel }}</button>
			<button
				v-for="station in stations"
				:key="station.name"
				type="button"
				:class="[CHIP, selectedStation === station.name ? 'text-white' : IDLE]"
				:style="selectedStation === station.name ? { backgroundColor: station.color } : {}"
				:aria-pressed="selectedStation === station.name"
				@click="emit('update:selectedStation', selectedStation === station.name ? null : station.name)"
			>
				<span
					data-test="station-dot"
					class="w-2 h-2 rounded-full flex-shrink-0"
					:style="{ backgroundColor: station.color }"
				></span>
				{{ station.label }}
				<span
					v-if="station.count > 0"
					data-test="station-count"
					class="text-xs font-bold px-1.5 py-0.5 rounded"
					:style="selectedStation === station.name
						? { backgroundColor: 'rgba(255,255,255,0.3)' }
						: { backgroundColor: station.color + '20', color: station.color }"
				>{{ station.countLabel ?? station.count }}</span>
			</button>
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue"

/**
 * The line of filters of the two service screens.
 *
 * rooms:    [{ name, label, count? }]  count: shown on the chip when above 0 (the runner: dishes ready; the kitchen: tickets)
 * stations: [{ name, label, color, count?, countLabel? }]  countLabel: what the count reads as ("2✓" on the runner)
 * allCount: the number on the "All" chip of the stations (none: no number)
 *
 * It is controlled: the screen holds the choice (selectedRoom "" is every room, selectedStation null is every station)
 * and hears what was chosen. A station chosen again is taken back, as on the runner.
 */
const props = defineProps({
	rooms: { type: Array, default: () => [] },
	selectedRoom: { type: String, default: "" },
	stations: { type: Array, default: () => [] },
	selectedStation: { type: String, default: null },
	allCount: { type: Number, default: undefined },
})
const emit = defineEmits(["update:selectedRoom", "update:selectedStation"])

const hasRooms = computed(() => props.rooms.length > 0)
const hasStations = computed(() => props.stations.length > 0)
const allLabel = computed(() =>
	props.allCount == null
		? __("All")
		: `${__("All")} (${props.allCount})`,
)

// A touch surface: a chip is at least 44 px high (NeoPOS, design system §7). The colours are the screens' own.
const CHIP =
	"inline-flex items-center gap-1.5 min-h-[44px] px-4 text-sm font-medium rounded-lg transition-colors whitespace-nowrap touch-manipulation"
const ACTIVE = "bg-gray-800 text-white dark:bg-white dark:text-gray-800"
const IDLE =
	"bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
</script>
