<template>
	<div class="h-full flex flex-col bg-white">
		<!-- Header -->
		<div class="px-3 py-2 border-b bg-gradient-to-r from-emerald-50 to-teal-50 flex-shrink-0">
			<h3 class="font-bold text-sm text-gray-800">{{ __('Badges & Allergens') }}</h3>
			<p class="text-xs text-gray-500 mt-0.5 truncate">{{ itemName }}</p>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex-1 flex items-center justify-center">
			<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
		</div>

		<!-- Content -->
		<div v-else class="flex-1 overflow-y-auto p-2 space-y-3" style="min-height: 0;">
			<!-- Spice Level -->
			<div>
				<label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{{ __('Spice Level') }}</label>
				<div class="flex gap-1 mt-1">
					<button
						v-for="level in 4"
						:key="level - 1"
						@click="spiceLevel = level - 1"
						class="w-7 h-7 rounded-md flex items-center justify-center text-sm transition-all"
						:style="level - 1 === spiceLevel
							? (level === 1 ? { backgroundColor: '#e5e7eb', outline: '2px solid #9ca3af' } : { backgroundColor: '#ef4444', color: '#fff', outline: '2px solid #dc2626', transform: 'scale(1.05)' })
							: { backgroundColor: '#f3f4f6' }"
					>
						{{ level === 1 ? '○' : '🌶' }}
					</button>
				</div>
			</div>

			<!-- Badge sections by type -->
			<div v-for="group in badgeGroups" :key="group.type">
				<label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{{ __(group.label) }}</label>
				<div class="grid grid-cols-2 gap-1 mt-1">
					<button
						v-for="badge in group.badges"
						:key="badge.name"
						@click="toggleBadge(badge.name)"
						class="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-all"
						:style="selectedBadges.has(badge.name)
							? { backgroundColor: badge.color || '#10b981', color: '#fff', fontWeight: '700', border: '2px solid ' + (badge.color || '#10b981') }
							: { backgroundColor: '#f9fafb', color: '#4b5563', border: '2px solid transparent' }"
					>
						<img
							v-if="badge.icon"
							:src="getBadgeIconUrl(badge.icon)"
							:alt="badge.badge_name"
							class="w-3.5 h-3.5 flex-shrink-0"
							:style="selectedBadges.has(badge.name) ? { filter: 'brightness(0) invert(1)' } : {}"
						/>
						<span class="truncate">{{ badge.badge_name }}</span>
					</button>
				</div>
			</div>
		</div>

		<!-- Footer - always visible -->
		<div class="px-2 py-2 border-t bg-gray-50 flex-shrink-0">
			<div v-if="saveError" class="text-[10px] text-red-500 mb-1">{{ saveError }}</div>
			<button
				@click="save"
				:disabled="saving"
				class="w-full px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
			>
				{{ saving ? __('Saving...') : __('Save Badges') }}
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
	loadMenuBadges,
	loadItemBadges,
	saveItemBadges,
	getBadgesByType,
	getBadgeIconUrl,
} = useBadges()
const { showSuccess, showError } = useToast()

const loading = ref(true)
const saving = ref(false)
const saveError = ref("")
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
	saveError.value = ""
	try {
		await loadMenuBadges()
		const data = await loadItemBadges(props.itemCode)
		spiceLevel.value = data.spice_level || 0
		selectedBadges.value = new Set(data.badges.map((b) => b.menu_badge))
	} catch (e) {
		console.error("[ItemBadgePanel] Load failed:", e)
		saveError.value = String(e)
	}
	loading.value = false
}

async function save() {
	saving.value = true
	saveError.value = ""
	try {
		const badgeArray = Array.from(selectedBadges.value)
		console.log(
			"[ItemBadgePanel] Saving:",
			props.itemCode,
			badgeArray,
			spiceLevel.value,
		)
		const ok = await saveItemBadges(
			props.itemCode,
			badgeArray,
			spiceLevel.value,
		)
		if (ok) {
			showSuccess(__("Badges saved"))
			emit("saved")
		} else {
			saveError.value = "Save returned false"
			showError(__("Failed to save badges"))
		}
	} catch (e) {
		console.error("[ItemBadgePanel] Save error:", e)
		saveError.value = String(e)
		showError(__("Failed to save badges"))
	}
	saving.value = false
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
