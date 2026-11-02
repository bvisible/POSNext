<template>
	<div data-test="view-switch" role="group" :aria-label="__('Show the tables as')" :class="size === 'phone' ? 'flex' : 'inline-flex flex-shrink-0'">
		<!-- //// Neoffice — added file (no upstream equivalent). The switch of the till's tables between the list and the
		     //// floor plan (NeoResto lot 1, task 26). On a phone, under the ink bar, two halves of 44 px, « List » first, as
		     //// the waiter mockup draws it; on the floor plan's line of a tablet or a PC, a small « Plan | List » of 32 px,
		     //// the height of the line's chips (Ruling 44). The one shown is in ink. -->
		<button
			v-for="(half, at) in halves"
			:key="half.view"
			type="button"
			:data-test="'view-' + half.view"
			:aria-pressed="view === half.view"
			:class="[
				size === 'phone' ? PHONE : LINE,
				at === 0 ? FIRST[size] : LAST[size],
				view === half.view ? ON : OFF[size],
			]"
			@click="choose(half.view)"
		>
			{{ half.label }}
		</button>
	</div>
</template>

<script setup>
import { computed } from "vue"

const props = defineProps({
	// The view shown: "list" or "plan"
	view: { type: String, required: true },
	// "phone": the mockup's two halves under the ink bar; "line": the small switch of the floor plan's line
	size: { type: String, default: "phone" },
})
const emit = defineEmits(["update:view"])

const halves = computed(() =>
	props.size === "phone"
		? [
				{ view: "list", label: __("List") },
				{ view: "plan", label: __("Floor Plan") },
			]
		: [
				// The plan of the dining room, short (« Plan »: the line has little room), under a context of its own: the bare
				// word is the whole site's, and another app translates it in its own sense. No arguments: an empty list, which
				// the catalogue's extraction reads as it reads null
				{ view: "plan", label: __("Plan", [], "Floor plan view, short") },
				{ view: "list", label: __("List") },
			],
)

// The mockup's halves: 44 px, 10 px outer corners, 15 px; the line's: 32 px, 8 px corners, 14 px (its chips)
const PHONE =
	"flex-1 min-h-[44px] flex items-center justify-center border text-[15px] touch-manipulation"
const LINE =
	"inline-flex items-center h-8 px-3 border text-sm font-medium whitespace-nowrap touch-manipulation"
const FIRST = { phone: "rounded-s-[10px]", line: "rounded-s-lg" }
const LAST = { phone: "rounded-e-[10px] -ms-px", line: "rounded-e-lg -ms-px" }
//// Neoffice — dark mode (NeoResto lot 1, smoke-test fix): the half in use is the bright paper one in dark (« on dark, primary becomes a bright paper button », the design system's dark scope), the other a quiet card with the secondary text colour; the line's small switch already had its dark classes for the half not in use.
const ON =
	"relative z-[1] bg-[#141414] border-[#141414] text-[#FFFDF8] font-bold dark:bg-ds-paper dark:border-ds-paper dark:text-ds-ink"
const OFF = {
	phone: "bg-[#FFFDF8] border-[#DCD4C7] text-[#524B41] dark:bg-[#1c1f26] dark:border-[rgba(255,251,245,0.24)] dark:text-ds-sand-300",
	line: "bg-white border-gray-300 text-gray-600 hover:text-gray-800 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-300",
}

function choose(view) {
	if (view !== props.view) emit("update:view", view)
}
</script>
