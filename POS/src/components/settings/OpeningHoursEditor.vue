<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Weekly opening-hours grid where each -->
	<!-- //// slot names the restaurant card served during it: that is what makes a lunch card and -->
	<!-- //// an evening card show different items on the same till at different hours. Upstream -->
	<!-- //// POSNext sells one catalogue all day. (32f2415d, 2026-03-23 "add Restaurant Settings -->
	<!-- //// with opening hours and time-based card availability"; 102b1208 moves the card -->
	<!-- //// assignment off Restaurant Card and onto the slots, 9ae00441 the Lunch and Dinner -->
	<!-- //// slot defaults.) -->
	<!-- //// Neoffice — one line per day since NeoRestau lot 1, task 13: the day, its slots, « Add slot » (mockup v2), -->
	<!-- //// so that the week fits the till's settings screen at 1366 x 768; the design system's sand and clay. -->
	<div class="flex flex-col">
		<div
			v-for="day in DAYS"
			:key="day"
			class="grid grid-cols-[88px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-pos-line py-[5px]"
			:data-day="day"
		>
			<span class="pt-1.5 text-[13.5px] font-bold text-pos-ink">{{ __(day) }}</span>

			<div class="flex min-w-0 flex-col gap-[5px]">
				<div v-if="getGroupedSlotsForDay(day).length === 0" class="pt-1.5 text-[13px] italic text-pos-muted">
					{{ __("Closed") }}
				</div>

				<div
					v-for="(group, gIdx) in getGroupedSlotsForDay(day)"
					:key="gIdx"
					class="flex min-w-0 flex-wrap items-center gap-1.5"
				>
					<!-- Time range -->
					<input
						type="time"
						:value="group.from_time"
						@input="updateGroupField(day, gIdx, 'from_time', $event.target.value)"
						:aria-label="__('From')"
						class="h-[30px] w-[88px] rounded-lg border border-pos-line bg-white px-1.5 text-[13px] tabular-nums focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
					/>
					<span class="text-[12px] text-pos-muted" aria-hidden="true">→</span>
					<input
						type="time"
						:value="group.to_time"
						@input="updateGroupField(day, gIdx, 'to_time', $event.target.value)"
						:aria-label="__('To')"
						class="h-[30px] w-[88px] rounded-lg border border-pos-line bg-white px-1.5 text-[13px] tabular-nums focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
					/>
					<!-- Label -->
					<input
						type="text"
						:value="group.label"
						@input="updateGroupField(day, gIdx, 'label', $event.target.value)"
						:placeholder="__('Label')"
						class="h-[30px] w-[72px] rounded-lg border border-pos-line bg-white px-2 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
					/>
					<!-- Cards of the slot -->
					<span
						v-for="cardName in group.cards"
						:key="cardName"
						class="inline-flex max-w-[11rem] items-center gap-1 rounded-xl border border-blue-100 bg-pos-action-soft px-2 py-0.5 text-[12px] text-pos-action-hover"
					>
						<span class="truncate">{{ getCardLabel(cardName) }}</span>
						<button
							type="button"
							@click="removeCardFromGroup(day, gIdx, cardName)"
							class="text-pos-action hover:text-pos-action-hover"
							:aria-label="__('Remove {0}', [getCardLabel(cardName)])"
						>
							×
						</button>
					</span>
					<select
						v-if="availableCardsForGroup(group).length"
						@change="addCardToGroup(day, gIdx, $event.target.value); $event.target.value = ''"
						class="h-[26px] max-w-[9rem] cursor-pointer rounded-xl border border-dashed border-pos-line bg-transparent py-0 pl-2 pr-6 text-[12px] text-pos-muted"
						:aria-label="__('Add a card')"
					>
						<option value="">{{ group.cards.length === 0 ? __("Select cards...") : __("+ card") }}</option>
						<option v-for="card in availableCardsForGroup(group)" :key="card.name" :value="card.name">
							{{ card.card_name }}
						</option>
					</select>
					<!-- Remove slot -->
					<button
						type="button"
						@click="removeGroup(day, gIdx)"
						class="ms-auto px-1 text-[16px] text-pos-muted transition-colors hover:text-pos-danger"
						:aria-label="__('Remove the slot')"
					>
						×
					</button>
				</div>
			</div>

			<button
				type="button"
				@click="addSlot(day)"
				class="whitespace-nowrap pt-[7px] text-end text-[12.5px] font-bold text-pos-action-hover hover:underline"
			>
				{{ __("+ Slot") }}
			</button>
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue"

const SLOT_PRESETS = [
	{ from_time: "09:00", to_time: "14:00", label: "Lunch" },
	{ from_time: "18:00", to_time: "23:00", label: "Dinner" },
]

const DAYS = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
]

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
	const rows = props.modelValue.filter((s) => s.day_of_week === day)
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
	const card = props.cards.find((c) => c.name === name)
	return card?.card_name || name
}

function availableCardsForGroup(group) {
	return props.cards.filter((c) => !group.cards.includes(c.name))
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
	const updated = props.modelValue.filter((s) => {
		if (
			!found &&
			s.day_of_week === day &&
			s.from_time === group.from_time &&
			s.to_time === group.to_time &&
			(s.label || "") === group.label &&
			s.restaurant_card === cardName
		) {
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
	const updated = props.modelValue.map((s) => {
		if (
			s.day_of_week === day &&
			s.from_time === group.from_time &&
			s.to_time === group.to_time &&
			(s.label || "") === group.label
		) {
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
	const updated = props.modelValue.filter((s) => {
		return !(
			s.day_of_week === day &&
			s.from_time === group.from_time &&
			s.to_time === group.to_time &&
			(s.label || "") === group.label
		)
	})
	emit("update:modelValue", updated)
}
</script>
