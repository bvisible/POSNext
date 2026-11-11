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
			v-if="group.category && showCategories && !group.subcategory"
			class="bg-white border-b border-gray-200 px-3 py-1.5 mt-3 first:mt-0 rounded-t-lg"
		>
			<h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
				{{ group.category }}
			</h3>
		</div>
		<!-- //// Neoffice — a sub-category: a second level under its category (NeoResto lot 1, product owner, 03.11.2026), a heading with the colour of its dishes -->
		<div
			v-if="group.subcategory && showSubcategories"
			class="mt-2 first:mt-0 flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-gray-600"
			data-card-subcategory
		>
			<span v-if="groupColor(group)" class="h-2 w-2 rounded-full" :style="{ backgroundColor: groupColor(group) }" />
			{{ group.subcategory }}
		</div>
		<div
			v-if="group.items.length"
			data-card-grid
			:class="[
				'grid gap-1.5 sm:gap-2.5',
				cardGridClasses(tilesPerRow),
				tileHeightClass(tileHeight),
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
					isText(item) ? 'tile--text' : '',
					overhangs(item) ? 'tile--badge' : '',
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
						'relative tile-well-picture rounded-neo-sm mb-1.5 sm:mb-2 overflow-hidden',
						isText(item) ? 'tile-well--text' : '',
					]"
					:style="wellStyle(item)"
				>
					<img v-if="showsImage(item)" :src="item.image" class="w-full h-full object-cover" />
					<div
						v-else
						:class="[
							'w-full h-full flex items-center justify-center p-2',
							'tile-well-name',
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
import { cardGridClasses, tileGridStyle, tileHeightClass, tilesPerRow as fixedCount } from "@/utils/tileGrid"

const props = defineProps({
	// The card's entries by category: [{ category, items }]
	groups: { type: Array, default: () => [] },
	// The category headings show while no category is chosen
	showCategories: { type: Boolean, default: true },
	// The till's « Tiles per row »: "Automatic" or a number from 3 to 8
	tilesPerRow: { type: [String, Number], default: "Automatic" },
	// The till's « Tile height »: "Compact", "Standard" or "Large" (how tall a tile is, with or without a picture)
	tileHeight: { type: String, default: "Standard" },
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
	// The sub-category headings show while no sub-category is chosen
	showSubcategories: { type: Boolean, default: true },
})

const emit = defineEmits(["pick", "add-portions"])

const { getStockStatus } = useStock()
const fixed = computed(() => fixedCount(props.tilesPerRow) !== null)

function outOfStock(item) {
	const stock = props.stockOf(item)
	return stock !== null && stock <= 0
}

// Whether something overhangs the tile's top corners (the stock count, the « + » of a counted product): the name of a tile with no picture then keeps clear of it
function overhangs(item) {
	const stock = props.stockOf(item)
	return (stock !== null && stock > 0) || counted(item)
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

// The colour most of the dishes of a group carry (the first met wins a tie): that of its sub-category heading
function groupColor(group) {
	const counts = new Map()
	for (const item of group.items) {
		const color = tileColor(item)
		if (color) counts.set(color, (counts.get(color) || 0) + 1)
	}
	let best = null
	for (const [color, count] of counts) if (best === null || count > counts.get(best)) best = color
	return best
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

/* //// Neoffice — the whole selector inside :global(): Vue compiles `:global(.dark) .x` to `.dark` alone and drops `.x`, so the rule painted <html> and never the element (maintenance#2256) */
:global(.dark .tile--colored),
:global([data-theme="dark"] .tile--colored) {
	background-color: var(--tile-dim);
}

/* //// Neoffice — the fixed grid (a number of tiles per row): each tile is measured by its own width, the name of a dish of a picture shows on two lines at most and the price always
   //// shows whole. */
.tile-grid-fixed > [data-card-tile] {
	container-type: inline-size;
}

/* //// Neoffice — the till's « Tile height » (POS Settings.tile_height; product owner, 05.11.2026: « arriver à caser en hauteur plus de boutons »): the grid says how tall its tiles are, in
   //// the ratio of a picture and the least height of the well of a dish with no picture. Large is the tile as it always was (square picture, three lines of name). */
.tile-grid-h-compact {
	--tile-picture-ratio: 16 / 9;
	--tile-text-min: 2.5rem;
}

.tile-grid-h-standard {
	--tile-picture-ratio: 4 / 3;
	--tile-text-min: 3.5rem;
}

.tile-grid-h-large {
	--tile-picture-ratio: 1 / 1;
	--tile-text-min: 4.5rem;
}

.tile-well-picture {
	aspect-ratio: var(--tile-picture-ratio, 1 / 1);
}

/* //// Neoffice — a dish with no picture to show (the till shows none, or the dish has none) is a compact tile in every grid, the automatic one too: its name once, in a well as high as its
   //// name needs (and no higher than the tile height asks) and clear of the stock badge that overhangs the corner when there is one, its price under it; a row of names only is shorter than
   //// a row of pictures, and the well takes the height its row leaves (product owner, 03.11.2026: « c'est affiché grand si on affiche sans photo ») */
.tile--text {
	display: flex;
	flex-direction: column;
	padding: 0.375rem;
}

.tile-well--text {
	aspect-ratio: auto;
	min-height: var(--tile-text-min, 4.5rem);
	flex: 1 0 auto;
	display: flex;
	flex-direction: column;
	margin-bottom: 0.125rem;
}

.tile--text > div:last-child {
	flex: 0 0 auto;
}

.tile--text .tile-well-name {
	height: auto;
	flex: 1 1 auto;
	padding: 0.25rem 0.375rem;
}

/* The stock count and the « + » of a counted product overhang the top corners: the name keeps clear of them */
.tile--badge .tile-well-name {
	padding-top: 0.875rem;
}

/* A compact tile says its name on two lines at most, a little smaller, and keeps its edges close */
.tile-grid-h-compact .tile-well-name span {
	-webkit-line-clamp: 2;
	font-size: 0.875rem;
	line-height: 1.15;
}

/* A long word breaks rather than leaving the tile */
.tile-well-name span,
.tile-name-repeat {
	overflow-wrap: anywhere;
	hyphens: auto;
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

/* //// Neoffice — a tile with no picture says its name once, in its well, in the fixed grid as in the automatic one: written after the fixed grid's rules and doubled in specificity, because the
   //// fixed grid's own rule for the repeated name (`display: -webkit-box`, the same specificity) came later in this file and brought the name back under its well (product owner, 05.11.2026:
   //// « il affiche deux fois le nom »). */
.tile--text.tile--text .tile-name-repeat,
.tile--text.tile--text [data-tile-name] {
	display: none;
}
</style>
