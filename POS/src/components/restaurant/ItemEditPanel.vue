<template>
	<div class="bg-white" style="display: flex; flex-direction: column; height: 100%; max-height: 100%; overflow: hidden;">
		<!-- Header -->
		<div class="px-3 py-2 border-b bg-gradient-to-r from-blue-50 to-indigo-50" style="flex-shrink: 0;">
			<div class="flex items-center justify-between">
				<div class="min-w-0">
					<h3 class="font-bold text-xs text-gray-800 truncate">{{ __('Edit Item') }}</h3>
					<p class="text-[10px] text-gray-500 truncate">{{ itemName }}</p>
				</div>
				<div class="flex gap-1.5 flex-shrink-0">
					<button
						@click="handleSave"
						:disabled="saving || !hasChanges"
						class="px-3 py-1 text-white text-xs font-bold rounded-md transition-colors"
						:style="{ backgroundColor: saving ? '#9ca3af' : !hasChanges ? '#d1d5db' : '#3b82f6' }"
					>
						{{ saving ? '...' : __('Save') }}
					</button>
					<button @click="$emit('close')" class="text-gray-400 hover:text-gray-600">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-8">
			<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
		</div>

		<!-- Content -->
		<div v-else class="p-2.5 space-y-3" style="flex: 1; overflow-y: auto; min-height: 0;">

			<!-- Price -->
			<div>
				<label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{{ __('Global Price') }}</label>
				<div class="flex items-center gap-2 mt-1">
					<input
						v-model.number="editData.price"
						type="number"
						step="0.01"
						class="w-full px-2.5 py-1.5 border rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-400 focus:outline-none"
					/>
				</div>
				<div v-if="localPrice && localPrice !== editData.price" class="text-[9px] text-amber-600 mt-0.5">
					{{ __("Card price: {0} (local override)", [localPrice]) }}
				</div>
			</div>

			<!-- Description -->
			<div>
				<label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{{ __('Description') }}</label>
				<textarea
					v-model="editData.description"
					rows="2"
					maxlength="500"
					class="w-full px-2.5 py-1.5 border rounded-lg text-xs mt-1 resize-none focus:ring-2 focus:ring-blue-400 focus:outline-none"
					:placeholder="__('Short description...')"
				></textarea>
				<div class="text-[9px] text-gray-400 text-right">{{ (editData.description || '').length }}/500</div>
			</div>

			<!-- Image -->
			<div>
				<label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{{ __('Image') }}</label>
				<div class="mt-1">
					<div v-if="editData.image" class="relative inline-block">
						<img :src="editData.image" class="w-16 h-16 rounded-lg object-cover border border-gray-200" />
						<button @click="editData.image = ''"
							class="absolute -top-1.5 -right-1.5 p-0.5 bg-white rounded-full shadow border border-gray-200 hover:bg-red-50"
							type="button">
							<svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
					<div v-else class="flex gap-1.5">
						<label class="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
							{{ __("Upload") }}
							<input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
						</label>
						<button
							v-if="originalData.has_image_search"
							@click="showImageSearch = true"
							class="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
							type="button"
						>
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
							{{ __("Search") }}
						</button>
					</div>
				</div>
			</div>

			<!-- Color -->
			<div>
				<label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{{ __('Display Color') }}</label>
				<div class="flex flex-wrap gap-1.5 mt-1">
					<button
						v-for="c in colorPalette"
						:key="c.hex"
						@click="editData.color = (editData.color === c.hex ? '' : c.hex)"
						:class="[
							'w-6 h-6 rounded-full border-2 transition-all duration-100',
							editData.color === c.hex
								? 'border-gray-900 scale-110 ring-2 ring-offset-1 ring-gray-400'
								: 'border-transparent hover:scale-105'
						]"
						:style="{ backgroundColor: c.hex }"
						:title="__(c.name)"
						type="button"
					/>
					<button
						v-if="editData.color"
						@click="editData.color = ''"
						class="w-6 h-6 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-gray-600"
						:title="__('Clear color')"
						type="button"
					>
						<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Stock (read-only) -->
			<div v-if="originalData.is_stock_item && originalData.stock?.length">
				<label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{{ __('Stock') }}</label>
				<div class="mt-1 space-y-0.5">
					<div v-for="(bin, i) in originalData.stock" :key="i"
						class="flex justify-between text-[10px] px-2 py-0.5 rounded"
						:class="bin.qty <= 0 ? 'text-red-600 bg-red-50' : 'text-gray-600 bg-gray-50'">
						<span>{{ bin.warehouse.split(' - ')[0] }}</span>
						<span class="font-medium">{{ bin.qty }}</span>
					</div>
				</div>
			</div>

			<!-- Production Options -->
			<div v-if="originalData.all_option_groups?.length">
				<label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{{ __('Product Options') }}</label>
				<div class="flex flex-wrap gap-1 mt-1">
					<button
						v-for="g in originalData.all_option_groups"
						:key="g.name"
						@click="toggleOptionGroup(g.name)"
						:class="[
							'px-2 py-1 rounded-md text-[10px] font-medium border transition-all',
							editData.option_groups.includes(g.name)
								? 'bg-blue-50 border-blue-400 text-blue-700'
								: 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
						]"
						type="button"
					>
						{{ g.group_name }}
						<span v-if="g.required" class="text-red-400 ml-0.5">*</span>
					</button>
				</div>
			</div>

			<!-- Divider -->
			<hr class="border-gray-200" />

			<!-- Spice Level -->
			<div>
				<label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{{ __('Spice Level') }}</label>
				<div class="flex gap-1 mt-1">
					<button
						v-for="level in 4"
						:key="level - 1"
						@click="editData.spice_level = level - 1"
						class="w-6 h-6 rounded-md flex items-center justify-center text-xs transition-all"
						:style="level - 1 === editData.spice_level
							? (level === 1 ? { backgroundColor: '#e5e7eb', outline: '2px solid #9ca3af' } : { backgroundColor: '#ef4444', color: '#fff', outline: '2px solid #dc2626', transform: 'scale(1.05)' })
							: { backgroundColor: '#f3f4f6' }"
					>
						{{ level === 1 ? '○' : '🌶' }}
					</button>
				</div>
			</div>

			<!-- Badges -->
			<div v-for="group in badgeGroups" :key="group.type">
				<label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{{ __(group.label) }}</label>
				<div class="grid grid-cols-2 gap-1 mt-1">
					<button
						v-for="badge in group.badges"
						:key="badge.name"
						@click="toggleBadge(badge.name)"
						class="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-all"
						:style="editData.badges.has(badge.name)
							? { backgroundColor: badge.color || '#10b981', color: '#fff', fontWeight: '700', border: '2px solid ' + (badge.color || '#10b981') }
							: { backgroundColor: '#f9fafb', color: '#4b5563', border: '2px solid transparent' }"
					>
						<img
							v-if="badge.icon"
							:src="getBadgeIconUrl(badge.icon)"
							:alt="badge.badge_name"
							class="w-3 h-3 flex-shrink-0"
							:style="editData.badges.has(badge.name) ? { filter: 'brightness(0) invert(1)' } : {}"
						/>
						<span class="truncate">{{ badge.badge_name }}</span>
					</button>
				</div>
			</div>
		</div>

		<!-- Image Search Dialog -->
		<ImageSearchDialog
			v-model="showImageSearch"
			:initial-query="itemName"
			@image-selected="onImageSelected"
		/>

		<!-- Save Confirm Dialog -->
		<ItemSaveConfirmDialog
			v-model="showSaveConfirm"
			:card-name="cardDisplayName"
			@confirm="onSaveConfirm"
		/>
	</div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import { useBadges } from "@/composables/useBadges"
import { usePOSShiftStore } from "@/stores/posShift"
import { ITEM_COLOR_PALETTE } from "@/utils/itemColors"
import ImageSearchDialog from "./ImageSearchDialog.vue"
import ItemSaveConfirmDialog from "./ItemSaveConfirmDialog.vue"

const colorPalette = ITEM_COLOR_PALETTE

const props = defineProps({
	itemCode: { type: String, required: true },
	itemName: { type: String, default: "" },
	localPrice: { type: Number, default: 0 },
	cardName: { type: String, default: "" },
	cardDisplayName: { type: String, default: "" },
})

const emit = defineEmits(["saved", "close"])

const { loadMenuBadges, getBadgesByType, getBadgeIconUrl } = useBadges()
const { showSuccess, showError } = useToast()
const shiftStore = usePOSShiftStore()

const loading = ref(true)
const saving = ref(false)
const showImageSearch = ref(false)
const showSaveConfirm = ref(false)

const originalData = ref({})
const editData = ref({
	price: 0,
	description: "",
	image: "",
	color: "",
	spice_level: 0,
	badges: new Set(),
	option_groups: [],
})

// Track original values for change detection
const originalEditSnapshot = ref(null)

const badgeGroups = computed(() =>
	[
		{ type: "Allergen", label: "Allergens", badges: getBadgesByType("Allergen") },
		{ type: "Dietary", label: "Dietary", badges: getBadgesByType("Dietary") },
		{ type: "Quality", label: "Quality", badges: getBadgesByType("Quality") },
	].filter((g) => g.badges.length > 0),
)

const hasChanges = computed(() => {
	if (!originalEditSnapshot.value) return false
	const snap = originalEditSnapshot.value
	return (
		editData.value.price !== snap.price ||
		editData.value.description !== snap.description ||
		editData.value.image !== snap.image ||
		editData.value.color !== snap.color ||
		editData.value.spice_level !== snap.spice_level ||
		!setsEqual(editData.value.badges, snap.badges) ||
		JSON.stringify(editData.value.option_groups.sort()) !== JSON.stringify(snap.option_groups.sort())
	)
})

const priceChanged = computed(() => {
	if (!originalEditSnapshot.value) return false
	return editData.value.price !== originalEditSnapshot.value.price
})

function setsEqual(a, b) {
	if (a.size !== b.size) return false
	for (const item of a) if (!b.has(item)) return false
	return true
}

function toggleBadge(badgeName) {
	const s = new Set(editData.value.badges)
	if (s.has(badgeName)) s.delete(badgeName)
	else s.add(badgeName)
	editData.value.badges = s
}

function toggleOptionGroup(name) {
	const idx = editData.value.option_groups.indexOf(name)
	if (idx >= 0) editData.value.option_groups.splice(idx, 1)
	else editData.value.option_groups.push(name)
}

async function loadData() {
	loading.value = true
	try {
		await loadMenuBadges()
		const data = await call("pos_next.api.restaurant.get_item_edit_data", {
			item_code: props.itemCode,
			pos_profile: shiftStore.profileName,
		})
		originalData.value = data

		editData.value = {
			price: data.price_list_rate || data.standard_rate || 0,
			description: data.description || "",
			image: data.image || "",
			color: data.custom_color || "",
			spice_level: data.spice_level || 0,
			badges: new Set(data.badges.map(b => b.menu_badge)),
			option_groups: [...(data.linked_option_groups || [])],
		}

		// Snapshot for change detection
		originalEditSnapshot.value = {
			price: editData.value.price,
			description: editData.value.description,
			image: editData.value.image,
			color: editData.value.color,
			spice_level: editData.value.spice_level,
			badges: new Set(editData.value.badges),
			option_groups: [...editData.value.option_groups],
		}
	} catch (e) {
		console.error("[ItemEditPanel] Load failed:", e)
		showError(__("Failed to load item data"))
	}
	loading.value = false
}

function handleSave() {
	if (priceChanged.value) {
		showSaveConfirm.value = true
	} else {
		doSave("none")
	}
}

async function onSaveConfirm(scope) {
	showSaveConfirm.value = false
	await doSave(scope)
}

async function doSave(priceScope) {
	saving.value = true
	try {
		// Save item details (description, image, color, badges, option groups)
		await call("pos_next.api.restaurant.update_item_details", {
			item_code: props.itemCode,
			description: editData.value.description,
			image: editData.value.image,
			color: editData.value.color,
			badges: JSON.stringify(Array.from(editData.value.badges)),
			spice_level: editData.value.spice_level,
			option_groups: JSON.stringify(editData.value.option_groups),
		})

		// Save price if changed
		if (priceChanged.value && priceScope !== "none") {
			await call("pos_next.api.restaurant.update_item_price", {
				item_code: props.itemCode,
				price: editData.value.price,
				scope: priceScope,
				card_name: props.cardName,
				pos_profile: shiftStore.profileName,
			})
		}

		showSuccess(__("Item updated"))
		emit("saved", {
			price: editData.value.price,
			priceScope,
			description: editData.value.description,
			image: editData.value.image,
			color: editData.value.color,
		})
	} catch (e) {
		console.error("[ItemEditPanel] Save error:", e)
		showError(__("Failed to save item"))
	}
	saving.value = false
}

function onImageSelected(imageUrl) {
	editData.value.image = imageUrl
}

async function handleImageUpload(event) {
	const file = event.target.files?.[0]
	if (!file) return
	try {
		const formData = new FormData()
		formData.append("file", file)
		formData.append("is_private", "0")
		formData.append("doctype", "Item")
		formData.append("docname", props.itemCode)
		const res = await fetch("/api/method/upload_file", {
			method: "POST",
			body: formData,
			headers: { "X-Frappe-CSRF-Token": window.csrf_token },
		})
		const data = await res.json()
		if (data.message?.file_url) {
			editData.value.image = data.message.file_url
		}
	} catch (err) {
		showError(__("Failed to upload image"))
	}
	event.target.value = ""
}

watch(
	() => props.itemCode,
	() => { if (props.itemCode) loadData() },
)

onMounted(() => {
	if (props.itemCode) loadData()
})
</script>
