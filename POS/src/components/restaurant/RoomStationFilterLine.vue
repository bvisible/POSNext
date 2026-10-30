<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The one line of filters the runner and the kitchen screen -->
	<!-- //// share (NeoRestau lot 1, task 9c): the rooms on the left, the preparation stations on the right. They were two -->
	<!-- //// rows on the runner and the kitchen had no room filter at all; the product owner asked for one line on both -->
	<!-- //// screens, with the same behaviour. A screen hands over what it counts and keeps the choice; this component only -->
	<!-- //// draws the chips and says what was chosen. It does not give a count a meaning: by default a count is plain text -->
	<!-- //// in parentheses in the tone of its chip, and a screen that counts something with a meaning of its own (the -->
	<!-- //// runner: the dishes that are READY, in green) draws its counts itself, through the slots. -->
	<!-- //// Neoffice — an optional `end` slot closes the line (NeoRestau lot 1, task 23): the kitchen screen puts the switch of -->
	<!-- //// its layout (bands or side by side) there, on the line it already has, instead of on a row of its own that would -->
	<!-- //// cost a row of tickets. The runner passes nothing, so its line is what it was. -->
	<div
		v-if="hasRooms || hasStations || $slots.end"
		data-test="filter-line"
		class="bg-white dark:bg-gray-800 border-b px-4 py-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 flex-shrink-0"
	>
		<!-- Rooms, on the left -->
		<div
			v-if="hasRooms"
			data-test="rooms"
			role="group"
			:aria-label="__('Filter by room')"
			class="flex flex-wrap items-center gap-x-2 gap-y-1"
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
				<!-- Not a slot fallback: a screen whose count draws nothing (no dish ready) must get nothing, not the default -->
				<slot v-if="$slots['room-count']" name="room-count" :room="room" :selected="selectedRoom === room.name" />
				<span v-else-if="room.count != null" data-test="room-count">({{ room.count }})</span>
			</button>
		</div>

		<!-- Stations, on the right (even alone on a row) -->
		<div
			v-if="hasStations"
			data-test="stations"
			role="group"
			:aria-label="__('Filter by station')"
			class="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 ml-auto"
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
				<slot v-if="$slots['station-count']" name="station-count" :station="station" :selected="selectedStation === station.name" />
				<span v-else-if="station.count != null" data-test="station-count">({{ station.count }})</span>
			</button>
		</div>

		<!-- A screen's own control, at the end of the line (the stations keep the right edge, it follows them) -->
		<div
			v-if="$slots.end"
			data-test="filter-end"
			class="flex items-center gap-2 flex-shrink-0"
			:class="{ 'ml-auto': !hasStations }"
		>
			<slot name="end" />
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue"

/**
 * The line of filters of the two service screens.
 *
 * rooms:    [{ name, label, count? }]
 * stations: [{ name, label, color, count? }]
 * allCount: the number on the "All" chip of the stations (none: no number)
 *
 * A count (a number, 0 included; none: nothing is shown) reads "Label (n)" by default: plain text in the tone of its
 * chip, as the kitchen's station chips always did. A screen draws its counts its own way through the slots
 * `room-count` ({ room, selected }) and `station-count` ({ station, selected }): the runner counts the dishes that are
 * READY and says it with a green pill, a meaning this component must not give to a count of the kitchen's open tickets.
 *
 * The `end` slot closes the line with a control of the screen's own, after the stations, on the same row (the kitchen
 * screen puts the switch of its layout there). A screen that passes nothing gets the two groups it always had.
 *
 * It is controlled: the screen holds the choice (selectedRoom "" is every room, selectedStation null is every station)
 * and hears what was chosen. A station chosen again is taken back, as on the runner.
 *
 * It is as short as it can be (chips 32 px high, 4 px of padding: Ruling 44, see CHIP below): every pixel it saves is a
 * pixel of tickets on a 768 px high screen.
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

// Ruling 44: a chip is 32 px high (h-8, text-sm) and the line pads 4 px above and below it, so that the line is 41 px
// with its border and the tickets get the rest of the screen. The product owner prefers ticket space to the 44 px touch
// guideline of the design system (NeoPOS, section 7) for THESE chips: the guideline stays for the rest of the till. The
// chips keep their width (px-4) and the room between them, so they stay easy to hit. The colours are the screens' own.
const CHIP =
	"inline-flex items-center gap-1.5 h-8 px-4 text-sm font-medium rounded-lg transition-colors whitespace-nowrap touch-manipulation"
const ACTIVE = "bg-gray-800 text-white dark:bg-white dark:text-gray-800"
const IDLE =
	"bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
</script>
