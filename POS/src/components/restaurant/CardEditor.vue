<template>
	<Transition name="fade">
		<div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 z-[300]" @click.self="handleClose">
			<div class="fixed inset-0 flex items-center justify-center p-4">
				<div class="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col">
					<div class="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-amber-50 to-orange-50">
						<h2 class="text-xl font-bold text-gray-800">{{ __('Restaurant Cards') }}</h2>
						<button @click="handleClose" class="text-gray-400 hover:text-gray-600">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
					<div class="flex-1 overflow-hidden p-6">
						<div class="flex gap-4 h-full overflow-hidden">
				<!-- Loading -->
				<div v-if="loading" class="flex justify-center py-8 w-full">
					<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
				</div>

				<template v-else>
					<!-- Left: Card list -->
					<div class="w-48 flex-shrink-0 space-y-2 overflow-y-auto">
						<!-- Normal cards -->
						<div v-for="card in normalCards" :key="card.name"
							@click="selectCard(card.name)"
							class="px-3 py-2 rounded-lg cursor-pointer transition-all text-sm"
							:class="selectedCard === card.name
								? 'bg-amber-100 text-amber-800 font-bold border border-amber-300'
								: 'hover:bg-gray-100 text-gray-700'">
							<div class="flex items-center justify-between">
								<span class="truncate">{{ card.card_name }}</span>
								<span v-if="card.is_active" class="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
							</div>
						</div>

						<!-- New card button -->
						<div v-if="!showNewCard" class="border-2 border-dashed border-gray-300 rounded-lg p-2 hover:border-gray-400 transition-colors">
							<button @click="showNewCard = true" class="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1 w-full justify-center">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
								</svg>
								{{ __("New Card") }}
							</button>
						</div>
						<div v-else class="space-y-2">
							<input v-model="newCardName" class="w-full px-2 py-1 border rounded text-sm" :placeholder="__('Card name')" />
							<div class="flex gap-1">
								<Button variant="subtle" size="sm" class="flex-1" @click="showNewCard = false">{{ __("Cancel") }}</Button>
								<Button variant="solid" size="sm" class="flex-1" @click="createCard" :disabled="!newCardName">{{ __("Create") }}</Button>
							</div>
						</div>

						<!-- Separator -->
						<div class="border-t border-gray-200 pt-2 mt-2">
							<span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-1">{{ __("Always available") }}</span>
						</div>

						<!-- Permanent card -->
						<div
							@click="selectOrCreatePermanentCard"
							class="px-3 py-2 rounded-lg cursor-pointer transition-all text-sm"
							:class="selectedCard === permanentCardName
								? 'bg-indigo-100 text-indigo-800 font-bold border border-indigo-300'
								: 'hover:bg-indigo-50 text-indigo-600 border border-dashed border-indigo-200'">
							<div class="flex items-center gap-1.5">
								<svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
								</svg>
								<span class="truncate">{{ __("Permanent items") }}</span>
							</div>
						</div>
					</div>

					<!-- Right: Card detail editor -->
					<div class="flex-1 border rounded-xl p-4 overflow-y-auto bg-gray-50/50">
						<div v-if="!selectedCard" class="flex flex-col items-center justify-center h-full text-gray-400 py-12">
							<svg class="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
							</svg>
							<p class="text-sm">{{ __("Select a card to edit") }}</p>
						</div>

						<div v-else-if="cardDetail">
							<!-- Card header -->
							<div class="mb-4 border-b pb-3">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<input v-if="editingName" v-model="cardDetail.card_name" ref="nameInput"
											@blur="finishRename" @keyup.enter="finishRename"
											class="font-bold text-lg border-b-2 border-amber-400 outline-none bg-transparent w-48" />
										<h3 v-else class="font-bold text-lg cursor-pointer hover:text-amber-700" @click="startRename">
											{{ cardDetail.card_name }}
										</h3>
										<template v-if="isPermanentCard">
										<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
											<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
											</svg>
											{{ __("Permanent") }}
										</span>
									</template>
									<template v-else>
										<span v-if="cardDetail.is_active"
											class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
											<span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
											{{ __("Active") }}
										</span>
										<span v-else
											class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">
											{{ __("Inactive") }}
										</span>
									</template>
									</div>
									<div class="flex items-center gap-2">
										<Button variant="solid" size="sm" @click="saveCard" :loading="saving">{{ __("Save") }}</Button>
										<button v-if="!isPermanentCard" @click="openDesigner"
											class="text-xs px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium transition-colors">
											{{ __("Designer & PDF") }}
										</button>
										<button v-if="!isPermanentCard" @click="duplicateCard"
											class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
											{{ __("Duplicate") }}
										</button>
										<button v-if="!isPermanentCard" @click="deleteCard"
											class="text-xs px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 transition-colors">
											{{ __("Delete") }}
										</button>
									</div>
								</div>
								<!-- Visibility summary - compact pills (hidden for permanent cards) -->
								<div v-if="!isPermanentCard" class="flex flex-wrap items-center gap-1 mt-2">
									<template v-if="cardSlots.length > 0">
										<span v-for="(slot, i) in cardSlots" :key="i"
											class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-600">
											{{ slot }}
										</span>
										<button @click="openScheduleSettings"
											class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] text-blue-600 hover:bg-blue-50 transition-colors">
											<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
											</svg>
											{{ __("Edit schedule") }}
										</button>
									</template>
									<template v-else>
										<span class="text-[10px] text-amber-600">
											{{ __("This card is not assigned to any time slot.") }}
										</span>
										<button @click="openScheduleSettings"
											class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] text-blue-600 hover:bg-blue-50 font-medium transition-colors">
											<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
											</svg>
											{{ __("Configure schedule in Settings") }}
										</button>
									</template>
									<label class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] cursor-pointer ml-auto"
										:class="cardDetail.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500'">
										<input type="checkbox" v-model="cardDetail.is_active"
											:true-value="true" :false-value="false"
											class="w-3 h-3 rounded" @change="toggleCardActive" />
										{{ cardDetail.is_active ? __("Card active") : __("Card inactive") }}
									</label>
								</div>
								<!-- Permanent card notice -->
								<div v-else class="mt-2">
									<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-700 font-medium">
										<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
										</svg>
										{{ __("Always visible in POS, regardless of time slots") }}
									</span>
								</div>
							</div>

							<!-- Card items -->
							<div class="space-y-1">
								<div v-for="(item, idx) in cardDetail.items" :key="idx"
									draggable="true"
									@dragstart="onDragStart(idx, $event)"
									@dragover.prevent="onDragOver(idx, $event)"
									@drop="onDrop(idx)"
									@dragend="dragIdx = null"
									@click="item.item_type === 'Item' && selectItemForBadges(item, idx)"
									class="flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer"
									:class="[
										item.item_type === 'Category'
											? 'bg-amber-50 border border-amber-200 font-bold text-amber-800 mt-3 first:mt-0'
											: 'bg-white border border-gray-100 hover:border-gray-200 ml-4',
										dragOverIdx === idx ? 'border-blue-400 border-2' : '',
										item.disabled ? 'opacity-40' : '',
										selectedBadgeItemIdx === idx ? 'ring-2 ring-emerald-400' : ''
									]">

									<!-- Drag handle -->
									<span class="text-gray-300 cursor-grab active:cursor-grabbing select-none">&#x2807;</span>

									<!-- Category or Item content -->
									<span v-if="item.item_type === 'Category'" class="text-amber-500 text-xs font-bold uppercase tracking-wider flex-1">
										{{ item.label || __("Category") }}
									</span>
									<template v-else>
										<!-- Active indicator -->
										<span class="w-2 h-2 rounded-full flex-shrink-0"
											:class="item.disabled ? 'bg-gray-300' : 'bg-green-500'"
											:title="item.disabled ? __('Disabled') : __('Active')"></span>
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-1.5">
												<span class="text-sm" :class="item.disabled ? 'text-gray-400 line-through' : ''">{{ item.label || item.item_name || item.item }}</span>
												<!-- Spice level -->
												<span v-if="itemExtraData[item.item]?.spice_level" class="flex gap-0 flex-shrink-0" :title="__('Spice level {0}', [itemExtraData[item.item].spice_level])">
													<span v-for="s in itemExtraData[item.item].spice_level" :key="s" class="text-[10px] leading-none">🌶</span>
												</span>
												<!-- Badges inline -->
												<div v-if="itemExtraData[item.item]?.badges?.length" class="flex gap-0.5 flex-shrink-0">
													<span
														v-for="badge in itemExtraData[item.item].badges.slice(0, 4)"
														:key="badge.badge_name"
														class="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
														:style="{ backgroundColor: badge.color || '#9ca3af' }"
														:title="badge.badge_name"
													>
														<img
															v-if="badge.icon"
															:src="`/assets/pos_next/icons/badges/${badge.icon}`"
															class="w-2.5 h-2.5"
															style="filter: brightness(0) invert(1);"
														/>
													</span>
													<span v-if="itemExtraData[item.item].badges.length > 4"
														class="text-[8px] text-gray-400 flex items-center">
														+{{ itemExtraData[item.item].badges.length - 4 }}
													</span>
												</div>
											</div>
											<!-- Description (1 line, truncated) -->
											<div v-if="itemExtraData[item.item]?.description" class="text-[10px] text-gray-400 mt-0.5 truncate max-w-[300px]">
												{{ itemExtraData[item.item].description }}
											</div>
											<!-- Stock display -->
											<div v-if="stockData[item.item]" class="text-[10px] text-gray-400 mt-0.5">
												<span v-for="(bin, bi) in stockData[item.item]" :key="bi"
													:class="bin.qty <= 0 ? 'text-red-500' : ''">
													{{ bin.warehouse.split(' - ')[0] }}: {{ bin.qty }}<span v-if="bi < stockData[item.item].length - 1"> | </span>
												</span>
												<span v-if="stockData[item.item].length === 0" class="text-red-500">{{ __("Out of stock") }}</span>
											</div>
										</div>
										<!-- Price as text -->
										<span class="text-sm font-medium text-gray-700 flex-shrink-0 tabular-nums">
											{{ item.price || 0 }}
										</span>
									</template>

									<!-- Delete -->
									<button @click="cardDetail.items.splice(idx, 1)" class="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
							</div>

							<!-- Add buttons -->
							<div class="flex gap-2 mt-4">
								<button @click="showCategoryDialog = true"
									class="flex-1 py-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg border border-dashed border-amber-300 hover:bg-amber-100 transition-colors flex items-center justify-center gap-1">
									<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
									</svg>
									{{ __("Category") }}
								</button>
								<button @click="showItemSearchDialog = true"
									class="flex-1 py-2 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg border border-dashed border-blue-300 hover:bg-blue-100 transition-colors flex items-center justify-center gap-1">
									<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
									</svg>
									{{ __("Item") }}
								</button>
							</div>
						</div>
					</div>

					<!-- Right: Item Edit Panel -->
					<div v-if="selectedBadgeItem" class="w-80 h-full flex-shrink-0 border rounded-xl overflow-hidden">
						<ItemEditPanel
							:item-code="selectedBadgeItem.item"
							:item-name="selectedBadgeItem.label || selectedBadgeItem.item_name || selectedBadgeItem.item"
							:local-price="selectedBadgeItem.price || 0"
							:card-name="cardDetail.name"
							:card-display-name="cardDetail.card_name"
							:is-disabled="!!selectedBadgeItem.disabled"
							@saved="onItemEditSaved"
							@close="selectedBadgeItemIdx = null; selectedBadgeItem = null"
						/>
					</div>
				</template>
						</div>
					</div>
				</div>
			</div>
		</div>
	</Transition>

	<!-- Menu Designer Dialog -->
	<MenuDesignerDialog
		v-if="showDesigner"
		:show="showDesigner"
		:card-name="selectedCard"
		:cards="cards"
		@close="showDesigner = false"
	/>

	<!-- Add Category Dialog -->
	<Dialog v-model="showCategoryDialog" :options="{ title: __('Add Category'), size: 'sm' }">
		<template #body-content>
			<div>
				<label class="block text-start text-sm font-medium text-gray-700 mb-1">
					{{ __("Category Name") }} <span class="text-red-500">*</span>
				</label>
				<Input
					v-model="newCategoryName"
					type="text"
					:placeholder="__('e.g. Desserts, Boissons...')"
				/>
			</div>
		</template>
		<template #actions>
			<div class="flex gap-2">
				<Button variant="subtle" @click="showCategoryDialog = false">{{ __("Cancel") }}</Button>
				<Button variant="solid" :disabled="!newCategoryName" @click="addCategory">{{ __("Add") }}</Button>
			</div>
		</template>
	</Dialog>

	<!-- Add Item Search Dialog -->
	<Dialog v-model="showItemSearchDialog" :options="{ title: __('Add Item'), size: 'md' }">
		<template #body-content>
			<div class="flex flex-col gap-3">
				<input
					v-model="itemSearchQuery"
					type="text"
					:placeholder="__('Search items by name...')"
					class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
				<div class="max-h-48 overflow-y-auto space-y-1">
					<div v-for="item in searchResults" :key="item.name"
						@click="addItem(item)"
						class="px-3 py-2 rounded-lg hover:bg-blue-50 cursor-pointer text-sm flex justify-between items-center border border-gray-100">
						<span class="font-medium">{{ item.item_name }}</span>
						<span class="text-xs text-gray-400">{{ item.standard_rate || 0 }}</span>
					</div>
					<div v-if="searchResults.length === 0 && itemSearchQuery && itemSearchQuery.length >= 2" class="text-center py-4">
						<p class="text-sm text-gray-400 mb-3">{{ __("No items found for '{0}'", [itemSearchQuery]) }}</p>
						<Button variant="solid" theme="green" size="sm" @click="openCreateItemFromSearch">
							<template #prefix>
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
								</svg>
							</template>
							{{ __("Create '{0}'", [itemSearchQuery]) }}
						</Button>
					</div>
				</div>
			</div>
		</template>
		<template #actions>
			<div class="flex justify-between w-full">
				<Button variant="subtle" size="sm" @click="openCreateItemFromSearch">
					<template #prefix>
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
					</template>
					{{ __("Create new item") }}
				</Button>
				<Button variant="subtle" @click="closeItemSearch">{{ __("Close") }}</Button>
			</div>
		</template>
	</Dialog>

	<!-- Create Item Dialog -->
	<CreateItemDialog
		v-model="showCreateItemDialog"
		:initial-name="itemSearchQuery"
		@item-created="handleItemCreated"
	/>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from "vue"
import { Button, Dialog, Input } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import CreateItemDialog from "@/components/restaurant/CreateItemDialog.vue"
import ItemEditPanel from "@/components/restaurant/ItemEditPanel.vue"
import MenuDesignerDialog from "@/components/restaurant/MenuDesignerDialog.vue"

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(["update:modelValue", "cards-updated", "open-settings"])

const show = computed({
	get: () => props.modelValue,
	set: (v) => emit("update:modelValue", v),
})

function handleClose() {
	show.value = false
	emit("cards-updated")
}

const { showSuccess, showError } = useToast()
const cards = ref([])
const cardDetail = ref(null)
const selectedCard = ref(null)
const loading = ref(true)
const saving = ref(false)
const showNewCard = ref(false)
const newCardName = ref("")
const stockData = ref({})
const itemExtraData = ref({})
const openingHours = ref([])
const editingName = ref(false)
const nameInput = ref(null)

// Computed: normal vs permanent cards
const normalCards = computed(() => cards.value.filter(c => !c.is_permanent))
const permanentCard = computed(() => cards.value.find(c => c.is_permanent))
const permanentCardName = computed(() => permanentCard.value?.name || null)
const isPermanentCard = computed(() => cardDetail.value && permanentCardName.value === cardDetail.value.name)

// Category dialog
const showCategoryDialog = ref(false)
const newCategoryName = ref("")

// Item search dialog
const showItemSearchDialog = ref(false)
const itemSearchQuery = ref("")
const searchResults = ref([])

// Create item dialog
const showCreateItemDialog = ref(false)

// Drag state
const dragIdx = ref(null)
const dragOverIdx = ref(null)

// Badge panel state
const selectedBadgeItem = ref(null)
const selectedBadgeItemIdx = ref(null)

// Designer dialog state
const showDesigner = ref(false)

// Auto-select first card when dialog opens
watch(show, (val) => {
	if (val) {
		loadCards()
		loadOpeningHours()
	}
})

// Visibility summary: which time slots use this card
function fmtTime(t) {
	if (!t) return ""
	const parts = t.split(":")
	return `${parts[0].padStart(2, "0")}:${parts[1] || "00"}`
}
const cardSlots = computed(() => {
	if (!selectedCard.value) return []
	return openingHours.value
		.filter(slot => slot.restaurant_card === selectedCard.value)
		.map(slot => `${slot.day_of_week} ${fmtTime(slot.from_time)}-${fmtTime(slot.to_time)}${slot.label ? " (" + slot.label + ")" : ""}`)
})

function selectCard(name) {
	selectedCard.value = name
	selectedBadgeItem.value = null
	selectedBadgeItemIdx.value = null
	loadCardDetail(name)
}

async function selectOrCreatePermanentCard() {
	if (permanentCard.value) {
		selectCard(permanentCard.value.name)
		return
	}
	// Auto-create permanent card
	try {
		const doc = await call("frappe.client.insert", {
			doc: {
				doctype: "Restaurant Card",
				card_name: __("Permanent items"),
				is_active: 1,
				is_permanent: 1,
				items: [],
			}
		})
		showSuccess(__("Permanent card created"))
		await loadCards()
		if (doc) selectCard(doc.name)
	} catch (error) {
		showError(__("Failed to create permanent card"))
	}
}

async function loadCards() {
	loading.value = true
	try {
		const res = await call("frappe.client.get_list", {
			doctype: "Restaurant Card",
			fields: ["name", "card_name", "is_active", "is_permanent"],
			order_by: "is_active desc, card_name asc",
			limit_page_length: 0
		})
		if (res) cards.value = res
		// Auto-select first card if none selected
		if (cards.value.length > 0 && !selectedCard.value) {
			selectCard(cards.value[0].name)
		}
	} catch (error) {
		showError(__("Failed to load cards"))
	} finally {
		loading.value = false
	}
}

async function loadOpeningHours() {
	try {
		const res = await call("frappe.client.get", {
			doctype: "Restaurant Settings", name: "Restaurant Settings"
		})
		openingHours.value = res?.opening_hours || []
	} catch { openingHours.value = [] }
}

async function loadCardDetail(name) {
	try {
		const doc = await call("frappe.client.get", { doctype: "Restaurant Card", name })
		if (doc) {
			cardDetail.value = {
				name: doc.name,
				card_name: doc.card_name,
				is_active: !!doc.is_active,
				items: (doc.items || []).map(i => ({
					item_type: i.item_type,
					label: i.label,
					item: i.item,
					item_name: i.item_name,
					menu: i.menu,
					price: i.price,
					sort_order: i.sort_order,
					disabled: !!i.disabled,
				}))
			}
			// Load stock data and extra data (description, badges)
			loadStockData(name)
			loadItemExtraData(name)
		}
	} catch (error) {
		showError(__("Failed to load card"))
	}
}

async function loadStockData(cardName) {
	try {
		const res = await call("pos_next.api.restaurant.get_card_items_stock", { card_name: cardName })
		stockData.value = res || {}
	} catch { stockData.value = {} }
}

async function loadItemExtraData(cardName) {
	try {
		const res = await call("pos_next.api.restaurant.get_card_items_extra", { card_name: cardName })
		itemExtraData.value = res || {}
	} catch { itemExtraData.value = {} }
}

function onItemEditSaved(changes) {
	// Refresh extra data and stock after item edit
	if (cardDetail.value?.name) {
		loadItemExtraData(cardDetail.value.name)
		loadStockData(cardDetail.value.name)
		// Update the item in the card detail with new values
		if (selectedBadgeItem.value) {
			if (changes?.cardPrice !== undefined) {
				selectedBadgeItem.value.price = changes.cardPrice
			}
			if (changes?.disabled !== undefined) {
				selectedBadgeItem.value.disabled = changes.disabled
			}
		}
		// Reload card detail to get fresh data
		loadCardDetail(cardDetail.value.name)
	}
	selectedBadgeItemIdx.value = null
	selectedBadgeItem.value = null
}

async function saveCard() {
	saving.value = true
	try {
		const doc = await call("frappe.client.get", { doctype: "Restaurant Card", name: cardDetail.value.name })
		doc.items = cardDetail.value.items.map((item, idx) => ({
			item_type: item.item_type,
			label: item.label,
			item: item.item,
			menu: item.menu,
			price: item.price || 0,
			sort_order: idx,
			disabled: item.disabled ? 1 : 0,
		}))
		await call("frappe.client.save", { doc })
		showSuccess(__("Card saved"))
		loadCards()
		emit("cards-updated")
	} catch (error) {
		showError(__("Failed to save card"))
	} finally {
		saving.value = false
	}
}

async function createCard() {
	try {
		const doc = await call("frappe.client.insert", {
			doc: { doctype: "Restaurant Card", card_name: newCardName.value, is_active: 1, items: [] }
		})
		showSuccess(__("Card created"))
		showNewCard.value = false
		newCardName.value = ""
		loadCards()
		if (doc) {
			selectCard(doc.name)
		}
	} catch (error) {
		showError(__("Failed to create card"))
	}
}

async function deleteCard() {
	try {
		await call("frappe.client.delete", { doctype: "Restaurant Card", name: cardDetail.value.name })
		showSuccess(__("Card deleted"))
		cardDetail.value = null
		selectedCard.value = null
		loadCards()
	} catch (error) {
		showError(__("Failed to delete card"))
	}
}

function selectItemForBadges(item, idx) {
	if (selectedBadgeItemIdx.value === idx) {
		selectedBadgeItem.value = null
		selectedBadgeItemIdx.value = null
	} else {
		selectedBadgeItem.value = item
		selectedBadgeItemIdx.value = idx
	}
}

function openDesigner() {
	showDesigner.value = true
}

function openScheduleSettings() {
	show.value = false
	emit("open-settings", "restaurant")
}

async function duplicateCard() {
	try {
		const res = await call("pos_next.api.restaurant.duplicate_card", { card_name: cardDetail.value.name })
		showSuccess(__("Card duplicated"))
		await loadCards()
		if (res) {
			selectCard(res.name)
		}
	} catch (error) {
		showError(__("Failed to duplicate card"))
	}
}

async function toggleCardActive() {
	try {
		await call("frappe.client.set_value", {
			doctype: "Restaurant Card", name: cardDetail.value.name,
			fieldname: "is_active", value: cardDetail.value.is_active ? 1 : 0
		})
		loadCards()
	} catch { /* silent */ }
}

function startRename() {
	editingName.value = true
	nextTick(() => {
		nameInput.value?.focus()
		nameInput.value?.select()
	})
}

async function finishRename() {
	editingName.value = false
	if (!cardDetail.value.card_name) return
	const oldName = cardDetail.value.name
	const newName = cardDetail.value.card_name.trim()
	if (oldName === newName) return
	try {
		await call("frappe.client.rename_doc", {
			doctype: "Restaurant Card",
			old_name: oldName,
			new_name: newName,
		})
		cardDetail.value.name = newName
		selectedCard.value = newName
		await loadCards()
		showSuccess(__("Card renamed"))
	} catch (error) {
		showError(__("Failed to rename card"))
		cardDetail.value.card_name = oldName
	}
}

function addCategory() {
	if (newCategoryName.value) {
		cardDetail.value.items.push({ item_type: "Category", label: newCategoryName.value, item: null, menu: null, price: 0, disabled: false })
		newCategoryName.value = ""
		showCategoryDialog.value = false
	}
}

function addItem(item) {
	cardDetail.value.items.push({
		item_type: "Item",
		label: item.item_name,
		item: item.name,
		menu: null,
		price: item.standard_rate || 0,
		disabled: false,
	})
	closeItemSearch()
}

function closeItemSearch() {
	showItemSearchDialog.value = false
	itemSearchQuery.value = ""
	searchResults.value = []
}

async function openCreateItemFromSearch() {
	showItemSearchDialog.value = false
	await nextTick()
	showCreateItemDialog.value = true
}

function handleItemCreated(item) {
	addItem(item)
	showCreateItemDialog.value = false
}

let searchTimeout = null
function searchItems() {
	clearTimeout(searchTimeout)
	searchTimeout = setTimeout(async () => {
		if (!itemSearchQuery.value || itemSearchQuery.value.length < 2) {
			searchResults.value = []
			return
		}
		try {
			const res = await call("frappe.client.get_list", {
				doctype: "Item",
				filters: [["item_name", "like", `%${itemSearchQuery.value}%`]],
				fields: ["name", "item_name", "standard_rate"],
				limit_page_length: 10
			})
			searchResults.value = res || []
		} catch {
			searchResults.value = []
		}
	}, 300)
}

// Trigger search when query changes
watch(itemSearchQuery, () => searchItems())

// --- Drag and Drop ---
function onDragStart(idx, event) {
	dragIdx.value = idx
	event.dataTransfer.effectAllowed = "move"
}

function onDragOver(idx, event) {
	event.dataTransfer.dropEffect = "move"
	dragOverIdx.value = idx
}

function onDrop(targetIdx) {
	const fromIdx = dragIdx.value
	if (fromIdx === null || fromIdx === targetIdx) {
		dragOverIdx.value = null
		return
	}
	const items = cardDetail.value.items
	const [moved] = items.splice(fromIdx, 1)
	items.splice(targetIdx, 0, moved)
	dragIdx.value = null
	dragOverIdx.value = null
}

onMounted(() => {
	loadCards()
	loadOpeningHours()
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>

<style>
/* Ensure frappe-ui Dialogs render above CardEditor overlay (z-300) */
.dialog-overlay {
	z-index: 400 !important;
}
</style>
