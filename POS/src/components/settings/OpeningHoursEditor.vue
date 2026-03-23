<template>
	<div class="flex flex-col gap-3">
		<div v-for="day in DAYS" :key="day" class="bg-gray-50 rounded-lg p-3">
			<div class="flex items-center justify-between mb-2">
				<span class="text-sm font-semibold text-gray-700 w-24">{{ __(day) }}</span>
				<button
					@click="addSlot(day)"
					class="text-xs text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1 transition-colors"
				>
					<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
					</svg>
					{{ __("Add slot") }}
				</button>
			</div>

			<div v-if="getSlotsForDay(day).length === 0" class="text-xs text-gray-400 italic pl-1">
				{{ __("Closed") }}
			</div>

			<div v-for="(slot, idx) in getSlotsForDay(day)" :key="idx"
				class="flex items-center gap-2 mb-1.5 last:mb-0 flex-wrap sm:flex-nowrap">
				<input
					type="time"
					:value="slot.from_time"
					@input="updateSlot(day, idx, 'from_time', $event.target.value)"
					class="text-sm border border-gray-300 rounded-md px-2 py-1 w-[106px] focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
				/>
				<span class="text-gray-400 text-xs">→</span>
				<input
					type="time"
					:value="slot.to_time"
					@input="updateSlot(day, idx, 'to_time', $event.target.value)"
					class="text-sm border border-gray-300 rounded-md px-2 py-1 w-[106px] focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
				/>
				<input
					type="text"
					:value="slot.label"
					@input="updateSlot(day, idx, 'label', $event.target.value)"
					:placeholder="__('Label')"
					class="text-sm border border-gray-300 rounded-md px-2 py-1 w-20 focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
				/>
				<select
					:value="slot.restaurant_card || ''"
					@change="updateSlot(day, idx, 'restaurant_card', $event.target.value || null)"
					class="text-sm border border-gray-300 rounded-md px-2 py-1 flex-1 min-w-0 focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
					:class="slot.restaurant_card ? 'text-gray-900' : 'text-gray-400'"
				>
					<option value="">{{ __("No card") }}</option>
					<option v-for="card in cards" :key="card.name" :value="card.name">
						{{ card.card_name }}
					</option>
				</select>
				<button
					@click="removeSlot(day, idx)"
					class="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
// Default slot presets: first slot = Lunch, subsequent = Dinner, then custom
const SLOT_PRESETS = [
	{ from_time: "09:00", to_time: "14:00", label: "Lunch" },
	{ from_time: "18:00", to_time: "23:00", label: "Dinner" },
]

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const props = defineProps({
	modelValue: {
		type: Array,
		default: () => [],
	},
	cards: {
		type: Array,
		default: () => [],
	},
})

const emit = defineEmits(["update:modelValue"])

function getSlotsForDay(day) {
	return props.modelValue.filter(s => s.day_of_week === day)
}

function addSlot(day) {
	const existing = getSlotsForDay(day)
	let newSlot

	if (existing.length < SLOT_PRESETS.length) {
		const preset = SLOT_PRESETS[existing.length]
		newSlot = { day_of_week: day, ...preset, restaurant_card: null }
	} else {
		const lastSlot = existing[existing.length - 1]
		const lastEnd = lastSlot.to_time || "23:00"
		const [h, m] = lastEnd.split(":").map(Number)
		const nextH = Math.min(h + 1, 23)
		const nextEndH = Math.min(nextH + 4, 23)
		newSlot = {
			day_of_week: day,
			from_time: `${String(nextH).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
			to_time: `${String(nextEndH).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
			label: "",
			restaurant_card: null,
		}
	}

	emit("update:modelValue", [...props.modelValue, newSlot])
}

function removeSlot(day, idx) {
	let count = 0
	const updated = props.modelValue.filter(s => {
		if (s.day_of_week === day) {
			if (count === idx) {
				count++
				return false
			}
			count++
		}
		return true
	})
	emit("update:modelValue", updated)
}

function updateSlot(day, idx, field, value) {
	let count = 0
	const updated = props.modelValue.map(s => {
		if (s.day_of_week === day) {
			if (count === idx) {
				count++
				return { ...s, [field]: value }
			}
			count++
		}
		return s
	})
	emit("update:modelValue", updated)
}
</script>
