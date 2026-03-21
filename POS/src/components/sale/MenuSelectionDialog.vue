<template>
	<Dialog
		v-model="show"
		:options="{ title: menu ? menu.menu_name : __('Select Menu'), size: 'lg' }"
	>
		<template #body-content>
			<div class="p-4 max-h-[65vh] overflow-y-auto">
				<!-- Menu info -->
				<div v-if="menu" class="flex items-center gap-4 mb-6 pb-4 border-b">
					<img v-if="menu.image" :src="menu.image" class="w-16 h-16 rounded-lg object-cover" />
					<div class="flex-1">
						<h3 class="text-lg font-bold text-gray-900">{{ menu.menu_name }}</h3>
						<p v-if="menu.description" class="text-sm text-gray-500 mt-0.5">{{ menu.description }}</p>
					</div>
					<div class="text-xl font-bold text-blue-600">{{ formatPrice(menu.price) }}</div>
				</div>

				<!-- Course steps -->
				<div v-for="(course, idx) in courses" :key="course.course_name" class="mb-6">
					<div class="flex items-center gap-2 mb-3">
						<span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
							:class="selectedItems[course.course_name] ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'">
							{{ idx + 1 }}
						</span>
						<h4 class="text-sm font-bold text-gray-900">{{ course.course_name }}</h4>
						<span v-if="selectedItems[course.course_name]" class="text-xs text-green-600 font-medium">
							{{ selectedItems[course.course_name].item_name }}
						</span>
					</div>

					<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
						<button
							v-for="item in course.items"
							:key="item.item"
							@click="selectCourseItem(course.course_name, item)"
							class="px-3 py-3 text-sm font-medium rounded-lg border-2 transition-all text-left"
							:class="selectedItems[course.course_name]?.item === item.item
								? 'border-blue-500 bg-blue-50 text-blue-700'
								: 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'"
						>
							{{ item.item_name }}
						</button>
					</div>
				</div>
			</div>
		</template>

		<template #actions>
			<div class="flex justify-between items-center w-full">
				<div class="text-sm text-gray-500">
					{{ selectedCount }}/{{ courses.length }} {{ __("courses selected") }}
				</div>
				<div class="flex gap-2">
					<Button @click="show = false" variant="subtle">{{ __("Cancel") }}</Button>
					<Button @click="confirmMenu" variant="solid" theme="blue" :disabled="!allSelected">
						{{ __("Add Menu") }}
					</Button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { ref, computed } from "vue"
import { Dialog, Button } from "frappe-ui"
import { DEFAULT_CURRENCY, formatCurrency as formatCurrencyUtil } from "@/utils/currency"

const emit = defineEmits(["menu-confirmed"])

const show = ref(false)
const menu = ref(null)
const selectedItems = ref({}) // { courseName: { item, item_name } }

const courses = computed(() => menu.value?.courses || [])

const selectedCount = computed(() => Object.keys(selectedItems.value).filter(k => selectedItems.value[k]).length)
const allSelected = computed(() => courses.value.length > 0 && selectedCount.value === courses.value.length)

function selectCourseItem(courseName, item) {
	selectedItems.value = { ...selectedItems.value, [courseName]: item }
}

function formatPrice(amount) {
	return formatCurrencyUtil(amount, DEFAULT_CURRENCY)
}

function open(menuData) {
	menu.value = menuData
	selectedItems.value = {}
	show.value = true
}

function confirmMenu() {
	if (!allSelected.value || !menu.value) return

	const items = Object.entries(selectedItems.value).map(([courseName, item], idx) => ({
		item_code: item.item,
		item_name: item.item_name,
		course_name: courseName,
		menu_name: menu.value.menu_name,
		menu_price: menu.value.price,
		is_menu_item: true,
		// First item gets the full menu price, others get 0
		price_override: idx === 0 ? menu.value.price : 0,
	}))

	emit("menu-confirmed", items)
	show.value = false
}

defineExpose({ open })
</script>
