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
						<div v-for="card in cards" :key="card.name"
							@click="selectedCard = card.name; loadCardDetail(card.name)"
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
							<div class="flex justify-between items-center mb-4">
								<div class="flex items-center gap-3">
									<h3 class="font-bold text-lg">{{ cardDetail.card_name }}</h3>
									<label class="flex items-center gap-1.5 text-xs cursor-pointer">
										<input type="checkbox" v-model="cardDetail.is_active" class="rounded" @change="toggleCardActive" />
										{{ __("Active") }}
									</label>
								</div>
								<div class="flex gap-1">
									<Button variant="solid" size="sm" @click="saveCard" :loading="saving">{{ __("Save") }}</Button>
									<button @click="deleteCard" class="text-xs px-2 py-1 rounded hover:bg-red-50 text-red-600">{{ __("Delete") }}</button>
								</div>
							</div>

							<!-- Card items -->
							<div class="space-y-1">
								<div v-for="(item, idx) in cardDetail.items" :key="idx"
									class="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
									:class="item.item_type === 'Category'
										? 'bg-amber-50 border border-amber-200 font-bold text-amber-800 mt-3 first:mt-0'
										: 'bg-white border border-gray-100 hover:border-gray-200 ml-4'">

									<!-- Drag handle -->
									<span class="text-gray-300 cursor-grab">⠿</span>

									<!-- Category or Item icon -->
									<span v-if="item.item_type === 'Category'" class="text-amber-500 text-xs font-bold uppercase tracking-wider flex-1">
										{{ item.label || __("Category") }}
									</span>
									<template v-else>
										<span class="flex-1 text-sm">{{ item.label || item.item_name || item.item }}</span>
										<input v-model.number="item.price" type="number" step="0.01"
											class="w-20 px-2 py-0.5 border rounded text-sm text-right"
											:placeholder="__('Price')" />
									</template>

									<!-- Delete -->
									<button @click="cardDetail.items.splice(idx, 1)" class="text-gray-300 hover:text-red-500 transition-colors">
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
				</template>
						</div>
					</div>
				</div>
			</div>
		</div>
	</Transition>

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
				<Input
					v-model="itemSearchQuery"
					type="text"
					:placeholder="__('Search items by name...')"
					@input="searchItems"
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
import { ref, computed, onMounted } from "vue"
import { Button, Dialog, Input } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import CreateItemDialog from "@/components/restaurant/CreateItemDialog.vue"

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(["update:modelValue"])

const show = computed({
	get: () => props.modelValue,
	set: (v) => emit("update:modelValue", v),
})

function handleClose() {
	show.value = false
}

const { showSuccess, showError } = useToast()
const cards = ref([])
const cardDetail = ref(null)
const selectedCard = ref(null)
const loading = ref(true)
const saving = ref(false)
const showNewCard = ref(false)
const newCardName = ref("")

// Category dialog
const showCategoryDialog = ref(false)
const newCategoryName = ref("")

// Item search dialog
const showItemSearchDialog = ref(false)
const itemSearchQuery = ref("")
const searchResults = ref([])

// Create item dialog
const showCreateItemDialog = ref(false)

async function loadCards() {
	try {
		const res = await call("frappe.client.get_list", {
			doctype: "Restaurant Card",
			fields: ["name", "card_name", "is_active"],
			order_by: "is_active desc, card_name asc",
			limit_page_length: 0
		})
		if (res) cards.value = res
	} catch (error) {
		showError(__("Failed to load cards"))
	} finally {
		loading.value = false
	}
}

async function loadCardDetail(name) {
	try {
		const doc = await call("frappe.client.get", { doctype: "Restaurant Card", name })
		if (doc) {
			cardDetail.value = {
				name: doc.name,
				card_name: doc.card_name,
				is_active: doc.is_active,
				items: (doc.items || []).map(i => ({
					item_type: i.item_type,
					label: i.label,
					item: i.item,
					item_name: i.item_name,
					menu: i.menu,
					price: i.price,
					sort_order: i.sort_order,
				}))
			}
		}
	} catch (error) {
		showError(__("Failed to load card"))
	}
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
		}))
		await call("frappe.client.save", { doc })
		showSuccess(__("Card saved"))
		loadCards()
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
			selectedCard.value = doc.name
			loadCardDetail(doc.name)
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

async function toggleCardActive() {
	try {
		await call("frappe.client.set_value", {
			doctype: "Restaurant Card", name: cardDetail.value.name,
			fieldname: "is_active", value: cardDetail.value.is_active ? 1 : 0
		})
	} catch { /* silent */ }
}

function addCategory() {
	if (newCategoryName.value) {
		cardDetail.value.items.push({ item_type: "Category", label: newCategoryName.value, item: null, menu: null, price: 0 })
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
		price: item.standard_rate || 0
	})
	closeItemSearch()
}

function closeItemSearch() {
	showItemSearchDialog.value = false
	itemSearchQuery.value = ""
	searchResults.value = []
}

function openCreateItemFromSearch() {
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

onMounted(loadCards)
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
