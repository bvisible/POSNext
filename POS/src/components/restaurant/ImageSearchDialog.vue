<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Picture picker for restaurant items: -->
	<!-- //// searches Pexels through our own server-side proxy (no API key in the browser) and -->
	<!-- //// attaches the chosen photo to the Item, so a card can be built visually without a -->
	<!-- //// photo shoot. Upstream POSNext has no image search. (26f5a3f1, 2026-03-25 "add image -->
	<!-- //// and color support for items in POS restaurant"; e7aa3918 drops the forced "food" -->
	<!-- //// prefix and adds pagination.) -->
	<Dialog v-model="show" :options="{ title: __('Search Food Images'), size: 'lg' }">
		<template #body-content>
			<div class="flex flex-col gap-4">
				<!-- Search input -->
				<div class="flex gap-2">
					<input
						v-model="query"
						:placeholder="__('Search for a dish...')"
						class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
						@keydown.enter="search"
					/>
					<Button @click="search" :loading="searching" variant="solid" theme="blue">
						{{ __("Search") }}
					</Button>
				</div>

				<!-- Results grid -->
				<div v-if="searching && !results.length" class="flex justify-center py-8">
					<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
				</div>
				<div v-else-if="results.length" class="max-h-[50vh] overflow-y-auto">
					<div class="grid grid-cols-3 gap-2">
						<button
							v-for="img in results"
							:key="img.id"
							@click="selectedImage = (selectedImage?.id === img.id ? null : img)"
							:class="[
								'aspect-square rounded-lg overflow-hidden border-2 transition-all',
								selectedImage?.id === img.id
									? 'border-blue-500 ring-2 ring-blue-200'
									: 'border-transparent hover:border-gray-300'
							]"
							type="button"
						>
							<img :src="img.thumb" class="w-full h-full object-cover" loading="lazy" />
						</button>
					</div>
					<!-- Load more -->
					<div v-if="hasMore" class="flex justify-center mt-3">
						<Button @click="loadMore" :loading="loadingMore" variant="subtle" size="sm">
							{{ __("Load more") }}
						</Button>
					</div>
				</div>
				<div v-else-if="searched" class="text-center py-8 text-gray-400 text-sm">
					{{ __("No images found. Try a different search term.") }}
				</div>

				<!-- Attribution -->
				<p v-if="results.length" class="text-[10px] text-gray-400">
					{{ __("Photos provided by Pexels") }}
				</p>
			</div>
		</template>
		<template #actions>
			<div class="flex gap-2">
				<Button variant="subtle" @click="show = false">
					{{ __("Cancel") }}
				</Button>
				<Button
					variant="solid"
					theme="blue"
					@click="confirmSelection"
					:disabled="!selectedImage"
					:loading="downloading"
				>
					{{ __("Use Image") }}
				</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { ref, watch } from "vue"
import { Button, Dialog } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"

const props = defineProps({
	initialQuery: { type: String, default: "" },
})

const show = defineModel({ type: Boolean, default: false })
const emit = defineEmits(["image-selected"])

const { showError } = useToast()

const query = ref("")
const results = ref([])
const selectedImage = ref(null)
const searching = ref(false)
const searched = ref(false)
const downloading = ref(false)
const hasMore = ref(false)
const currentPage = ref(1)
const loadingMore = ref(false)

watch(show, (val) => {
	if (val) {
		query.value = props.initialQuery || ""
		results.value = []
		selectedImage.value = null
		searched.value = false
		hasMore.value = false
		currentPage.value = 1
		if (query.value) search()
	}
})

async function search() {
	if (!query.value.trim()) return
	searching.value = true
	searched.value = false
	selectedImage.value = null
	currentPage.value = 1
	try {
		const res = await call("pos_next.api.restaurant.search_food_images", {
			query: query.value.trim(),
			page: 1,
		})
		results.value = res.photos || []
		hasMore.value = res.has_more || false
		currentPage.value = res.page || 1
	} catch (err) {
		showError(__("Failed to search images"))
		results.value = []
	} finally {
		searching.value = false
		searched.value = true
	}
}

async function loadMore() {
	loadingMore.value = true
	try {
		const nextPage = currentPage.value + 1
		const res = await call("pos_next.api.restaurant.search_food_images", {
			query: query.value.trim(),
			page: nextPage,
		})
		results.value = [...results.value, ...(res.photos || [])]
		hasMore.value = res.has_more || false
		currentPage.value = res.page || nextPage
	} catch (err) {
		showError(__("Failed to load more images"))
	} finally {
		loadingMore.value = false
	}
}

async function confirmSelection() {
	if (!selectedImage.value) return
	downloading.value = true
	try {
		const fileUrl = await call("pos_next.api.restaurant.download_food_image", {
			image_url: selectedImage.value.url,
			item_name: props.initialQuery || "item",
		})
		emit("image-selected", fileUrl)
		show.value = false
	} catch (err) {
		showError(__("Failed to download image"))
	} finally {
		downloading.value = false
	}
}
</script>
