<template>
	<div class="h-full flex flex-col bg-white">
		<!-- Header -->
		<div class="px-4 py-3 border-b bg-gradient-to-r from-emerald-50 to-teal-50 flex-shrink-0">
			<h3 class="font-bold text-sm text-gray-800">{{ __('Badges & Allergens') }}</h3>
			<p class="text-xs text-gray-500 mt-0.5 truncate">{{ itemName }}</p>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex-1 flex items-center justify-center">
			<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
		</div>

		<!-- Content -->
		<div v-else class="flex-1 overflow-y-auto p-3 space-y-4">
			<!-- Spice Level -->
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ __('Spice Level') }}</label>
				<div class="flex gap-1 mt-1.5">
					<button
						v-for="level in 4"
						:key="level - 1"
						@click="spiceLevel = level - 1"
						class="w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all"
						:class="(level - 1) <= spiceLevel && spiceLevel > 0
							? 'bg-red-100 scale-110'
							: 'bg-gray-100 hover:bg-gray-200 opacity-40'"
					>
						{{ level === 1 ? '○' : '🌶' }}
					</button>
				</div>
				<p class="text-[10px] text-gray-400 mt-1">
					{{ spiceLevel === 0 ? __('Not spicy') : spiceLevel === 1 ? __('Mild') : spiceLevel === 2 ? __('Medium') : __('Hot') }}
				</p>
			</div>

			<!-- Badge sections by type -->
			<div v-for="group in badgeGroups" :key="group.type">
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ __(group.label) }}</label>
				<div class="grid grid-cols-2 gap-1.5 mt-1.5">
					<button
						v-for="badge in group.badges"
						:key="badge.name"
						@click="toggleBadge(badge.name)"
						class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-all border"
						:class="selectedBadges.has(badge.name)
							? 'border-emerald-400 bg-emerald-50 text-emerald-800'
							: 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'"
					>
						<img
							v-if="badge.icon"
							:src="getBadgeIconUrl(badge.icon)"
							:alt="badge.badge_name"
							class="w-4 h-4 flex-shrink-0"
							:style="{ color: badge.color }"
						/>
						<span class="truncate">{{ badge.badge_name }}</span>
					</button>
				</div>
			</div>
		</div>

		<!-- Footer -->
		<div class="px-3 py-2 border-t flex-shrink-0">
			<button
				@click="save"
				:disabled="saving"
				class="w-full px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
			>
				{{ saving ? __('Saving...') : __('Save') }}
			</button>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { useBadges } from "@/composables/useBadges"
import { useToast } from "@/composables/useToast"

const props = defineProps({
	itemCode: { type: String, required: true },
	itemName: { type: String, default: "" },
})

const emit = defineEmits(["saved", "close"])

const {
	menuBadges,
	loadMenuBadges,
	loadItemBadges,
	saveItemBadges,
	getBadgesByType,
	getBadgeIconUrl,
} = useBadges()
const { showSuccess, showError } = useToast()

const loading = ref(true)
const saving = ref(false)
const spiceLevel = ref(0)
const selectedBadges = ref(new Set())

const badgeGroups = computed(() =>
	[
		{
			type: "Allergen",
			label: "Allergens",
			badges: getBadgesByType("Allergen"),
		},
		{ type: "Dietary", label: "Dietary", badges: getBadgesByType("Dietary") },
		{ type: "Quality", label: "Quality", badges: getBadgesByType("Quality") },
	].filter((g) => g.badges.length > 0),
)

function toggleBadge(badgeName) {
	const s = new Set(selectedBadges.value)
	if (s.has(badgeName)) {
		s.delete(badgeName)
	} else {
		s.add(badgeName)
	}
	selectedBadges.value = s
}

async function loadData() {
	loading.value = true
	await loadMenuBadges()
	const data = await loadItemBadges(props.itemCode)
	spiceLevel.value = data.spice_level || 0
	selectedBadges.value = new Set(data.badges.map((b) => b.menu_badge))
	loading.value = false
}

async function save() {
	saving.value = true
	const ok = await saveItemBadges(
		props.itemCode,
		Array.from(selectedBadges.value),
		spiceLevel.value,
	)
	saving.value = false
	if (ok) {
		showSuccess(__("Badges saved"))
		emit("saved")
	} else {
		showError(__("Failed to save badges"))
	}
}

watch(
	() => props.itemCode,
	() => {
		if (props.itemCode) loadData()
	},
)

onMounted(() => {
	if (props.itemCode) loadData()
})
</script>
