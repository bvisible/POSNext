<!-- //// Neoffice — added file (no upstream equivalent). The grid of a restaurant card at the till: its categories -->
<!-- //// and its tiles (the dishes and the menus of the card, with their picture, colour or name, their stock and -->
<!-- //// their price). It stood inside POSSale.vue (f2392119, 2026-03-22 "restaurant card system"; 26f5a3f1 the -->
<!-- //// colours) and moved here when the number of tiles per row became a setting of the till (NeoResto lot 1, task -->
<!-- //// 13; product owner, 30.10.2026). « Automatic » keeps the columns by the width of the screen; a number from 3 -->
<!-- //// to 8 fixes them, and a tile without a picture then shows its name in a shorter well, once, its price whole. -->
<!-- //// A product counted by its portions (NeoResto lot 1, Daniel, 02.11.2026) has a « + » to add portions when the kitchen can make more; -->
<!-- //// a sold-out tile is greyed out only where the restaurant says so, and then shows « Sold out ». -->
<!-- //// A tile takes the colour of its item, else of its item group (the Service Colour of the group): a pale face, a 4 px top edge and, round a picture, the same face instead -->
<!-- //// of the white frame (NeoResto lot 1, product owner, 03.11.2026: « par famille, pour retrouver très vite un produit »); the till may show no pictures at all. -->
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
					'group relative border rounded-neo-md p-1.5 sm:p-2.5 touch-manipulation transition-[border-color,box-shadow] duration-100',
					tileColor(item) ? 'tile--colored' : 'bg-white border-gray-200',
					greyedOut(item)
						? 'opacity-50 ' + (counted(item) ? 'cursor-pointer' : 'cursor-not-allowed')
						: 'cursor-pointer hover:shadow-neo-md ' + (tileColor(item) ? '' : 'hover:border-blue-400'),
					fixed && isText(item) ? 'tile--text' : '',
				]"
				:style="tileStyle(item)"
				@click="emit('pick', item)"
			>
				<button
					v-if="counted(item)"
					type="button"
					data-add-portions
					:title="__('Add portions')"
					:aria-label="__('Add portions')"
					class="absolute -top-1.5 -start-1.5 sm:-top-2 sm:-start-2 z-20 h-6 w-6 rounded-full border-2 border-white bg-gray-900 text-white text-sm font-bold leading-none shadow-lg touch-manipulation"
					@click.stop="emit('add-portions', item)"
				>
					+
				</button>
				<!-- Stock Badge -->
				<!-- //// Neoffice — a count only while some is left: a sold-out tile says « Sold out », never -3 or -2 (neoffice-maintenance#2163: -->
				<!-- //// the stock goes below zero where the site sells beyond it, and the badge printed it beside « Sold out ») -->
				<div
					v-if="stockOf(item) !== null && !outOfStock(item)"
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
				<span
					v-if="outOfStock(item)"
					data-sold-out
					class="absolute top-1/3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-red-600 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-white select-none whitespace-nowrap"
					>{{ __("Sold out") }}</span
				>
				<div
					:class="[
						'relative aspect-square rounded-neo-sm mb-1.5 sm:mb-2 overflow-hidden',
						fixed && isText(item) ? 'tile-well--text' : '',
					]"
					:style="wellStyle(item)"
				>
					<img v-if="showsImage(item)" :src="item.image" class="w-full h-full object-cover" />
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
import { cardColor, softTint } from "@/utils/phoneCard"
import { tintOf } from "@/utils/ticketFamilies"
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
	// Is the entry counted by its portions (the kitchen's count, not the stock's)? Such a tile has its « + »
	countedBy: { type: Function, default: () => false },
	// A sold-out tile is greyed out and refused (the restaurant's choice); off, it only shows it is sold out
	greyOut: { type: Boolean, default: true },
	// The till's « Pictures on the till »: off, a dish shows its name on its colour, whatever picture it has
	pictures: { type: Boolean, default: true },
	// The till's « Colours of the tiles »: a tile takes the colour of its item, else of its item group
	colors: { type: Boolean, default: true },
})

const emit = defineEmits(["pick", "add-portions"])

const { getStockStatus } = useStock()
const fixed = computed(() => fixedCount(props.tilesPerRow) !== null)

function outOfStock(item) {
	const stock = props.stockOf(item)
	return stock !== null && stock <= 0
}

function counted(item) {
	return item.item_type !== "Menu" && props.countedBy(item)
}

function greyedOut(item) {
	return props.greyOut && outOfStock(item)
}

// Whether a tile shows its picture: it has one, and the till shows pictures
function showsImage(item) {
	return props.pictures && Boolean(item.image)
}

// A dish without a picture to show: its name is its face
function isText(item) {
	return !showsImage(item) && item.item_type !== "Menu"
}

// The colour of a tile: its item's own, else its item group's (the server hands it as `service_color`); none for a menu, or when the till shows no colours
function tileColor(item) {
	if (!props.colors || item.item_type === "Menu") return null
	return cardColor(item.custom_color) || cardColor(item.service_color) || null
}

// The three shades of a tile's colour, as variables of the tile: the edge, the pale face of the light screen, the dim face of the dark one (see the style below)
function tileStyle(item) {
	const color = tileColor(item)
	return color ? { "--tile-edge": color, "--tile-soft": softTint(color), "--tile-dim": tintOf(color) } : {}
}

function wellStyle(item) {
	if (showsImage(item)) return {}
	if (item.custom_color) return { backgroundColor: item.custom_color }
	// A tile of its group's colour shows it through: the well takes none of its own
	if (tileColor(item)) return { backgroundColor: "transparent" }
	return { backgroundColor: "var(--pos-panel)" }
}

function nameClasses(item) {
	const base = "font-bold line-clamp-3"
	if (item.custom_color) {
		return `${base} ${isLightColor(item.custom_color) ? "text-gray-800" : "text-white"} text-sm sm:text-base`
	}
	if (tileColor(item)) return `${base} text-gray-800 text-sm sm:text-base`
	return `${base} text-gray-500 text-xs sm:text-sm`
}
</script>

<style scoped>
/* //// Neoffice — a tile of a colour (item's, else item group's): the pale face of the colour and its 4 px top edge, like the phone's buttons; on the dark screen the colour
   //// at 16 % over the card, never the pale face (the ink there is light). */
.tile--colored {
	border-color: var(--tile-edge);
	border-top-width: 4px;
	background-color: var(--tile-soft);
}

:global(.dark) .tile--colored,
:global([data-theme="dark"]) .tile--colored {
	background-color: var(--tile-dim);
}

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
