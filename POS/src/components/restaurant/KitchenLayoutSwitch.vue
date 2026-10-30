<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The switch at the end of the kitchen screen's filter line that -->
	<!-- //// chooses how its two bands are laid out (NeoRestau lot 1, task 23): BANDS, the waiting tickets in a lane above the -->
	<!-- //// tickets in preparation, or COLUMNS, side by side. Two buttons rather than one that flips: a cook reads what each -->
	<!-- //// does before touching it. The name of each layout is written on its button because the screen is a tablet, where -->
	<!-- //// a tooltip never shows; the icons are lucide's, the set the till's build already carries. It is as high as the -->
	<!-- //// chips of the line (32 px) and made of the same pieces, so it adds nothing to the height of the line. -->
	<div
		data-test="layout-switch"
		role="group"
		:aria-label="__('Layout')"
		class="flex items-center gap-1"
	>
		<button
			type="button"
			data-layout="bands"
			:class="[CHIP, layout === LAYOUT_BANDS ? ACTIVE : IDLE]"
			:aria-pressed="layout === LAYOUT_BANDS ? 'true' : 'false'"
			:aria-label="__('Waiting orders above, orders in preparation below')"
			@click="choose(LAYOUT_BANDS)"
		>
			<LucideRows2 class="w-4 h-4 flex-shrink-0" aria-hidden="true" />
			<span data-test="layout-label" :class="LABEL">{{ __("Bands") }}</span>
		</button>
		<button
			type="button"
			data-layout="columns"
			:class="[CHIP, layout === LAYOUT_COLUMNS ? ACTIVE : IDLE]"
			:aria-pressed="layout === LAYOUT_COLUMNS ? 'true' : 'false'"
			:aria-label="__('Waiting orders on the left, orders in preparation on the right')"
			@click="choose(LAYOUT_COLUMNS)"
		>
			<LucideColumns2 class="w-4 h-4 flex-shrink-0" aria-hidden="true" />
			<span data-test="layout-label" :class="LABEL">{{ __("Columns") }}</span>
		</button>
	</div>
</template>

<script setup>
import LucideColumns2 from "~icons/lucide/columns-2"
import LucideRows2 from "~icons/lucide/rows-2"
import { LAYOUT_BANDS, LAYOUT_COLUMNS } from "@/utils/kitchenLayout"

/**
 * The switch of the kitchen screen's layout. Controlled: the screen holds the layout (and keeps it on the device), this
 * component draws the two choices and says which one was pressed. It says so for the layout in use too: a device nobody
 * has chosen for opens on a layout of its own (by the way it is held), and pressing that one is a choice the screen must
 * hear, or the layout would still follow the tablet when it is turned.
 */
defineProps({
	layout: { type: String, default: LAYOUT_BANDS },
})
const emit = defineEmits(["update:layout"])

function choose(layout) {
	emit("update:layout", layout)
}

// The chips of the shared line (RoomStationFilterLine), 32 px high, with the same two states. The padding is a little
// narrower than theirs: this one is a control, not a filter, and every pixel of width is a chip of the line that stays on it.
const CHIP =
	"inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg transition-colors whitespace-nowrap touch-manipulation"
const ACTIVE = "bg-gray-800 text-white dark:bg-white dark:text-gray-800"
// The words of the two layouts are written on the buttons (a tablet has no tooltip). Where the line is short of room they
// give way to the icons: at 1024 px they push the switch onto a row of their own and cost the screen 36 px of tickets
// (measured). They show from 1100 px, and on a tablet held upright, where the line has two rows anyway. The aria-labels
// name each layout whatever is drawn.
const LABEL = "hidden min-[1100px]:inline portrait:inline"
const IDLE =
	"bg-gray-100 text-gray-600 active:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
</script>
