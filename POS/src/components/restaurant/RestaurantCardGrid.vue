<!-- //// Neoffice — added file (no upstream equivalent). The grid of a restaurant card at the till: its categories -->
<!-- //// and its tiles (the dishes and the menus of the card, with their picture, colour or name, their stock and -->
<!-- //// their price). It stood inside POSSale.vue (f2392119, 2026-03-22 "restaurant card system"; 26f5a3f1 the -->
<!-- //// colours) and moved here when the number of tiles per row became a setting of the till (NeoRestau lot 1, task -->
<!-- //// 13; product owner, 30.10.2026). « Automatic » keeps the columns by the width of the screen; a number from 3 -->
<!-- //// to 8 fixes them, and a tile without a picture then shows its name in a shorter well, once, its price whole. -->
<template>
	<template v-for="(group, groupIndex) in groups" :key="'g' + groupIndex">
		<div
			v-if="group.category && showCategories"
			class="bg-white border-b border-gray-200 px-3 py-1.5 mt-3 first:mt-0 rounded-t-lg"
		>
			<h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
				{{ group.category }}
			</h3>
		</div>
		<div
			data-card-grid
			:class="[
				'grid gap-1.5 sm:gap-2.5',
				cardGridClasses(tilesPerRow),
				showCategories && group.category ? 'mt-1' : 'mt-0',
			]"
			:style="tileGridStyle(tilesPerRow)"
		>
			<div
				v-for="(item, itemIndex) in group.items"
				:key="itemIndex"
				data-card-tile
				:class="[
					'group relative bg-white border border-gray-200 rounded-neo-md p-1.5 sm:p-2.5 touch-manipulation transition-[border-color,box-shadow] duration-100',
					outOfStock(item)
						? 'opacity-50 cursor-not-allowed'
						: 'cursor-pointer hover:border-blue-400 hover:shadow-neo-md',
					fixed && isText(item) ? 'tile--text' : '',
				]"
				@click="emit('pick', item)"
			>
				<!-- Stock Badge -->
				<div
					v-if="stockOf(item) !== null"
					:class="[
						'absolute -top-1.5 -end-1.5 sm:-top-2 sm:-end-2 rounded-md shadow-lg z-10',
						'px-2 sm:px-2.5 py-1 sm:py-1 text-[10px] sm:text-xs font-bold',
						'border-2 border-white select-none',
						getStockStatus(stockOf(item)).color,
						getStockStatus(stockOf(item)).textColor,
					]"
					data-stock-badge
				>
					{{ Math.floor(stockOf(item)) }}
				</div>
				<div
					:class="[
						'relative aspect-square rounded-neo-sm mb-1.5 sm:mb-2 overflow-hidden',
						fixed && isText(item) ? 'tile-well--text' : '',
					]"
					:style="wellStyle(item)"
				>
					<img v-if="item.image" :src="item.image" class="w-full h-full object-cover" />
					<div
						v-else
						:class="[
							'w-full h-full flex items-center justify-center p-2',
							fixed ? 'tile-well-name' : '',
						]"
					>
						<svg
							v-if="item.item_type === 'Menu'"
							class="w-8 h-8 text-amber-400"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"
							/>
						</svg>
						<span v-else :class="nameClasses(item)" class="text-center leading-tight" data-well-name>
							{{ item.item_name || item.label }}
						</span>
					</div>
					<span
						v-if="item.item_type === 'Menu'"
						class="absolute top-1 right-1 text-[8px] font-bold text-white bg-amber-500 px-1.5 py-0.5 rounded-full"
						>Menu</span
					>
				</div>
				<div class="min-w-0">
					<p
						:class="[
							'text-[10px] sm:text-xs font-semibold text-gray-900 truncate mb-0.5 leading-tight',
							fixed ? 'tile-name-repeat' : '',
						]"
						data-tile-name
					>
						{{ item.item_name || item.menu_name || item.label }}
					</p>
					<div :class="['text-[9px] sm:text-[10px] leading-tight', fixed ? 'tile-price' : '']">
						<span
							class="font-semibold"
							:class="item.item_type === 'Menu' ? 'text-amber-600' : 'text-blue-600'"
							data-tile-price
							>{{ formatPrice(item.price || item.default_price || 0) }}</span
						>
					</div>
				</div>
			</div>
		</div>
	</template>
</template>

<script setup>
import { computed } from "vue"
import { useStock } from "@/composables/useStock"
import { isLightColor } from "@/utils/itemColors"
import { cardGridClasses, tileGridStyle, tilesPerRow as fixedCount } from "@/utils/tileGrid"

const props = defineProps({
	// The card's entries by category: [{ category, items }]
	groups: { type: Array, default: () => [] },
	// The category headings show while no category is chosen
	showCategories: { type: Boolean, default: true },
	// The till's « Tiles per row »: "Automatic" or a number from 3 to 8
	tilesPerRow: { type: [String, Number], default: "Automatic" },
	// The stock of an entry to show (null: no stock to show), and how a price reads
	stockOf: { type: Function, default: () => null },
	formatPrice: { type: Function, default: (amount) => String(amount) },
})

const emit = defineEmits(["pick"])

const { getStockStatus } = useStock()
const fixed = computed(() => fixedCount(props.tilesPerRow) !== null)

function outOfStock(item) {
	const stock = props.stockOf(item)
	return stock !== null && stock <= 0
}

// A dish without a picture: its name is its face
function isText(item) {
	return !item.image && item.item_type !== "Menu"
}

function wellStyle(item) {
	if (item.image) return {}
	if (item.custom_color) return { backgroundColor: item.custom_color }
	return { backgroundColor: "#F3F4F6" }
}

function nameClasses(item) {
	const base = "font-bold line-clamp-3"
	if (item.custom_color) {
		return `${base} ${isLightColor(item.custom_color) ? "text-gray-800" : "text-white"} text-sm sm:text-base`
	}
	return `${base} text-gray-500 text-xs sm:text-sm`
}
</script>

<style scoped>
/* //// Neoffice — the fixed grid (a number of tiles per row): each tile is measured by its own width. A dish
   //// without a picture shows its name in a well shorter than a picture's, clear of the stock badge that
   //// overhangs the corner, and not again under it; the price always shows whole. Nothing here touches the
   //// automatic grid. */
.tile-grid-fixed > [data-card-tile] {
	container-type: inline-size;
}

/* The well of a dish without a picture holds three lines of its name at least, and takes the height its row
   leaves: a row of names only is shorter than a row of pictures */
.tile-grid-fixed .tile--text {
	display: flex;
	flex-direction: column;
}

.tile-grid-fixed .tile-well--text {
	aspect-ratio: auto;
	min-height: 4.5rem;
	flex: 1 0 auto;
	display: flex;
	flex-direction: column;
}

.tile-grid-fixed .tile--text > div:last-child {
	flex: 0 0 auto;
}

.tile-grid-fixed .tile-well-name {
	height: auto;
	flex: 1 1 auto;
	padding: 0.875rem 0.375rem 0.375rem;
}

/* A long word breaks rather than leaving the tile */
.tile-grid-fixed .tile-well-name span,
.tile-grid-fixed .tile-name-repeat {
	overflow-wrap: anywhere;
	hyphens: auto;
}

.tile-grid-fixed .tile--text .tile-name-repeat {
	display: none;
}

.tile-grid-fixed .tile-name-repeat {
	white-space: normal;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}

.tile-grid-fixed .tile-price {
	font-size: 0.75rem;
	white-space: nowrap;
}
</style>
