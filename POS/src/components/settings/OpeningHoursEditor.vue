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

			<div v-if="getGroupedSlotsForDay(day).length === 0" class="text-xs text-gray-400 italic pl-1">
				{{ __("Closed") }}
			</div>

			<div v-for="(group, gIdx) in getGroupedSlotsForDay(day)" :key="gIdx"
				class="flex items-start gap-2 mb-2 last:mb-0">
				<!-- Time range -->
				<input
					type="time"
					:value="group.from_time"
					@input="updateGroupField(day, gIdx, 'from_time', $event.target.value)"
					class="text-sm border border-gray-300 rounded-md px-2 py-1 w-[106px] focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
				/>
				<span class="text-gray-400 text-xs mt-2">→</span>
				<input
					type="time"
					:value="group.to_time"
					@input="updateGroupField(day, gIdx, 'to_time', $event.target.value)"
					class="text-sm border border-gray-300 rounded-md px-2 py-1 w-[106px] focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
				/>
				<!-- Label -->
				<input
					type="text"
					:value="group.label"
					@input="updateGroupField(day, gIdx, 'label', $event.target.value)"
					:placeholder="__('Label')"
					class="text-sm border border-gray-300 rounded-md px-2 py-1 w-20 focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
				/>
				<!-- Cards multi-select -->
				<div class="flex-1 min-w-0">
					<div class="flex flex-wrap items-center gap-1 border border-gray-300 rounded-md px-2 py-1 min-h-[30px] bg-white">
						<!-- Selected card chips -->
						<span v-for="cardName in group.cards" :key="cardName"
							class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
							{{ getCardLabel(cardName) }}
							<button @click="removeCardFromGroup(day, gIdx, cardName)"
								class="text-amber-500 hover:text-amber-700">
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
								</svg>
							</button>
						</span>
						<!-- Add card dropdown -->
						<select
							@change="addCardToGroup(day, gIdx, $event.target.value); $event.target.value = ''"
							class="text-xs border-0 outline-none bg-transparent text-gray-400 cursor-pointer p-0 min-w-[80px]"
						>
							<option value="">{{ group.cards.length === 0 ? __('Select cards...') : '+' }}</option>
							<option v-for="card in availableCardsForGroup(group)" :key="card.name" :value="card.name">
								{{ card.card_name }}
							</option>
						</select>
					</div>
				</div>
				<!-- Remove slot -->
				<button
					@click="removeGroup(day, gIdx)"
					class="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
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
import { computed } from "vue"

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

// Group rows with same day + from_time + to_time + label into visual slots
function getGroupedSlotsForDay(day) {
	const rows = props.modelValue.filter(s => s.day_of_week === day)
	const groups = []
	const seen = new Map()

	for (const row of rows) {
		const key = `${row.from_time}|${row.to_time}|${row.label || ""}`
		if (seen.has(key)) {
			// Add card to existing group
			if (row.restaurant_card) {
				seen.get(key).cards.push(row.restaurant_card)
			}
		} else {
			const group = {
				from_time: row.from_time,
				to_time: row.to_time,
				label: row.label || "",
				cards: row.restaurant_card ? [row.restaurant_card] : [],
			}
			groups.push(group)
			seen.set(key, group)
		}
	}
	return groups
}

function getCardLabel(name) {
	const card = props.cards.find(c => c.name === name)
	return card?.card_name || name
}

function availableCardsForGroup(group) {
	return props.cards.filter(c => !group.cards.includes(c.name))
}

// Rebuild flat rows from groups
function rebuildRows() {
	const allRows = []
	for (const day of DAYS) {
		const groups = getGroupedSlotsForDay(day)
		for (const group of groups) {
			if (group.cards.length === 0) {
				// Keep one row with no card
				allRows.push({
					day_of_week: day,
					from_time: group.from_time,
					to_time: group.to_time,
					label: group.label,
					restaurant_card: null,
				})
			} else {
				// One row per card
				for (const cardName of group.cards) {
					allRows.push({
						day_of_week: day,
						from_time: group.from_time,
						to_time: group.to_time,
						label: group.label,
						restaurant_card: cardName,
					})
				}
			}
		}
	}
	return allRows
}

function addCardToGroup(day, gIdx, cardName) {
	if (!cardName) return
	const groups = getGroupedSlotsForDay(day)
	const group = groups[gIdx]
	if (!group || group.cards.includes(cardName)) return

	// Add a new row for this card with same time/label
	const newRow = {
		day_of_week: day,
		from_time: group.from_time,
		to_time: group.to_time,
		label: group.label,
		restaurant_card: cardName,
	}
	emit("update:modelValue", [...props.modelValue, newRow])
}

function removeCardFromGroup(day, gIdx, cardName) {
	const groups = getGroupedSlotsForDay(day)
	const group = groups[gIdx]
	if (!group) return

	// Remove the row matching this day + time + label + card
	let found = false
	const updated = props.modelValue.filter(s => {
		if (!found && s.day_of_week === day &&
			s.from_time === group.from_time &&
			s.to_time === group.to_time &&
			(s.label || "") === group.label &&
			s.restaurant_card === cardName) {
			found = true
			return false
		}
		return true
	})
	emit("update:modelValue", updated)
}

function updateGroupField(day, gIdx, field, value) {
	const groups = getGroupedSlotsForDay(day)
	const group = groups[gIdx]
	if (!group) return

	// Update all rows matching this group
	const updated = props.modelValue.map(s => {
		if (s.day_of_week === day &&
			s.from_time === group.from_time &&
			s.to_time === group.to_time &&
			(s.label || "") === group.label) {
			return { ...s, [field]: value }
		}
		return s
	})
	emit("update:modelValue", updated)
}

function addSlot(day) {
	const existing = getGroupedSlotsForDay(day)
	let newSlot

	if (existing.length < SLOT_PRESETS.length) {
		const preset = SLOT_PRESETS[existing.length]
		newSlot = { day_of_week: day, ...preset, restaurant_card: null }
	} else {
		const lastGroup = existing[existing.length - 1]
		const lastEnd = lastGroup?.to_time || "23:00"
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

function removeGroup(day, gIdx) {
	const groups = getGroupedSlotsForDay(day)
	const group = groups[gIdx]
	if (!group) return

	// Remove ALL rows matching this group (all cards for this time slot)
	const updated = props.modelValue.filter(s => {
		return !(s.day_of_week === day &&
			s.from_time === group.from_time &&
			s.to_time === group.to_time &&
			(s.label || "") === group.label)
	})
	emit("update:modelValue", updated)
}
</script>
