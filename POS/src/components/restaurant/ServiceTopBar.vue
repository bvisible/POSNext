<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The ONE top bar of the restaurant's service screens, the kitchen's and the -->
	<!-- //// runner's (NeoRestau lot 1, task 38a-2, rulings 128 and 129). The page used to open on three lines (a title, a subtitle, a line of -->
	<!-- //// chips) before the first ticket. ROW 1 is one line of 48 px: the title names what the screen shows (the station it is opened on, -->
	<!-- //// not the word « preparation »), the count on the same line, then what a screen adds (the switch between the screens, the display -->
	<!-- //// modes), and at the right the actions: a chip of the page's own, « show completed », the size of the text, the refresh, the exit. ROW 2 is the -->
	<!-- //// page's filters, drawn only when there is something to choose. The bar carries no state: the page holds it and hears the presses. -->
	<header class="flex-shrink-0 bg-white shadow-sm z-10 dark:bg-gray-800" data-test="top-bar">
		<!-- //// Neoffice — the phone (NeoRestau lot 1, smoke-test fix). Below 768 px the bar is no longer ONE line: the kitchen's measured 657 px and the runner's 797 px at 390 px, so « To deliver », the size of the text, the theme, the refresh, the way back, and the runner's display modes were off the screen, and the page scrolled sideways. It is three lines there: the title, then the screens (the switch, and the runner's display modes), then the actions (the chip, « show completed », the size of the text, the theme, the refresh, the way back). The title and each of the other two lines are a box of their own (`top-bar-screens`, `top-bar-actions`) so that they can wrap; from 768 px they are `contents` and take no part in the layout, so that the bar is the line it was (the buttons of 44 px stay 44 px: from 40 px below 768 px, the touch minimum, so that the actions fit one line at 360 px). -->
		<div
			data-test="top-bar-row1"
			class="flex h-12 items-center gap-2 pl-3.5 pr-2.5 max-[1024px]:gap-1.5 max-[1024px]:pr-1.5 max-md:h-auto max-md:flex-wrap max-md:gap-y-1 max-md:py-1.5 max-md:pl-3 max-md:pr-2"
		>
			<div data-test="page-title" class="flex min-w-0 flex-shrink items-baseline gap-2 whitespace-nowrap max-[1024px]:gap-1.5 max-md:h-9 max-md:w-full max-md:items-center">
				<!-- //// Neoffice — dark mode (task 46): the colour of a station is lightened for a dark ground through a variable the class reads, as everywhere on these screens -->
				<span
					v-if="dotColor"
					data-test="title-dot"
					class="h-[11px] w-[11px] flex-none self-center rounded-full bg-[color:var(--dot-color)] dark:bg-[color:var(--dot-on-dark)]"
					:style="{ '--dot-color': dotColor, '--dot-on-dark': dotColorOnDark || dotColor }"
				></span>
				<span v-else data-test="title-dot" class="h-[11px] w-[11px] flex-none self-center rounded-full bg-gray-900 dark:bg-white"></span>
				<h1 data-test="page-heading" class="font-display min-w-0 truncate text-[24px] font-normal leading-none text-gray-900 max-[1024px]:text-[21px] dark:text-white">{{ title }}</h1>
				<!-- //// Neoffice — dark mode (task 46): the till's dark remap of `.text-gray-500` is `!important` (index.css) and reads 4.35:1 on the ground, so `[&&]` doubles the selector for this variant to outrank it -->
				<span data-test="page-count" class="flex-none text-sm font-medium text-gray-500 dark:[&&]:!text-gray-400">· {{ count }}</span>
			</div>

			<!-- What a screen adds after its title: the switch between the screens, and its display modes -->
			<div data-test="top-bar-screens" class="md:contents max-md:flex max-md:w-full max-md:flex-wrap max-md:items-center max-md:gap-1.5 max-md:empty:hidden">
				<slot name="switch" />
				<slot name="view" />
			</div>

			<div data-test="top-bar-actions" class="md:contents max-md:flex max-md:w-full max-md:flex-wrap max-md:items-center max-md:justify-end max-md:gap-1.5">
				<div class="min-w-0 flex-1"></div>

				<slot name="chip" />

				<!-- //// Neoffice — « show completed » stays a real checkbox (it is the control, the label and the eye are what is drawn around it). Above 1024 px it is the words and the box; at 1024 px and below the words give way to an eye of 44 px that lights while the box is checked, so that the row keeps its room. -->
				<label data-test="completed-toggle" class="flex h-11 flex-none max-md:h-10 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap px-1 text-sm text-gray-900 dark:text-gray-100 max-[1024px]:px-0">
					<!-- //// Neoffice — dark mode (task 46): an unchecked box was a solid white disc, which reads as "on" next to the clay fill of a checked one; in dark it is empty with a ring of the system's tertiary text colour (3:1 or more on the header). A checked box keeps its fill. -->
					<input
						type="checkbox"
						:checked="completed"
						class="peer rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:[&:not(:checked)]:bg-transparent dark:[&:not(:checked)]:ring-1 dark:[&:not(:checked)]:ring-inset dark:[&:not(:checked)]:ring-ds-sand-400 max-[1024px]:sr-only"
						@change="emit('update:completed', $event.target.checked)"
					/>
					<span data-test="completed-label" class="max-[1024px]:sr-only">{{ __("Show completed") }}</span>
					<span
						data-test="completed-eye"
						aria-hidden="true"
						class="hidden h-11 w-11 max-md:h-10 max-md:w-10 items-center justify-center rounded-[10px] border border-gray-300 text-gray-700 peer-checked:border-gray-800 peer-checked:bg-gray-800 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 max-[1024px]:inline-flex dark:border-gray-600 dark:text-gray-300 dark:peer-checked:border-white dark:peer-checked:bg-white dark:peer-checked:text-gray-800"
					>
						<LucideEye class="h-5 w-5" />
					</span>
				</label>

				<!-- //// Neoffice — the text size, one tap, kept on the device (task 38a-1, ruling 109), now in the bar: Aa and one pip more lit at each size -->
				<button
					type="button"
					data-test="text-size"
					:class="ICON_BUTTON"
					:aria-label="__('Text size: {0}', [textSizeLabel])"
					:title="__('Text size: {0}', [textSizeLabel])"
					@click="emit('cycle-size')"
				>
					<span class="-translate-y-[3px] text-base font-bold leading-none tracking-tight">Aa</span>
					<span class="absolute bottom-1.5 left-1/2 inline-flex -translate-x-1/2 gap-0.5" aria-hidden="true">
						<i v-for="(name, index) in TEXT_SIZES" :key="name" data-test="text-size-pip" class="block h-[3px] w-[5px] rounded-sm"
							:class="index <= TEXT_SIZES.indexOf(textSize) ? 'bg-blue-400' : 'bg-gray-300'"></i>
					</span>
				</button>

				<!-- //// Neoffice — the control of the awake settings (keep the screen on, rest, wake on a new ticket), beside the size of the text (task 47): a button of the row, not a new bar -->
				<slot name="screen" />

				<slot name="theme" />

				<button type="button" data-test="refresh" :class="ICON_BUTTON" :title="__('Refresh')" @click="emit('refresh')">
					<LucideRefreshCw class="h-5 w-5" aria-hidden="true" />
					<span class="sr-only">{{ __("Refresh") }}</span>
				</button>

				<!-- A tablet signed in with its own account has no till to go back to -->
				<button v-if="deskSession" type="button" data-test="back-to-pos" :class="ICON_BUTTON" :title="__('Back to POS')" @click="emit('back')">
					<LucideArrowLeft class="h-5 w-5" aria-hidden="true" />
					<span class="sr-only">{{ __("Back to POS") }}</span>
				</button>
			</div>
		</div>

		<!-- ROW 2: the page's filters, when it has any -->
		<slot name="filters" />
	</header>
</template>

<script setup>
import LucideArrowLeft from "~icons/lucide/arrow-left"
import LucideEye from "~icons/lucide/eye"
import LucideRefreshCw from "~icons/lucide/refresh-cw"
import { TEXT_SIZES } from "@/utils/kitchenTextSize"

/**
 * The bar of a service screen. Controlled: the page holds what the bar shows (its title, its count, whether the completed
 * tickets are shown, the size of the text) and hears what was pressed.
 *
 * title, count:    the words of the page's one line (« Bar » and « 10 commandes »)
 * dotColor:        the colour of the dot before the title (a station's), none for an ink dot; dotColorOnDark: the same lightened for a dark ground
 * completed:       whether the completed tickets are shown (v-model)
 * textSize:        one of the kitchen text sizes; textSizeLabel: its name, for the button's label
 * deskSession:     the session is a desk user's, who has a till to go back to (a tablet signed in with its own account has none)
 *
 * Slots: `switch` and `view` (after the title), `chip` (before « show completed »), `screen` (the awake settings, after the size of the text), `theme` (after it),
 * and `filters` (row 2).
 */
defineProps({
	title: { type: String, required: true },
	count: { type: String, default: "" },
	dotColor: { type: String, default: "" },
	dotColorOnDark: { type: String, default: "" },
	completed: { type: Boolean, default: false },
	textSize: { type: String, default: "compact" },
	textSizeLabel: { type: String, default: "" },
	deskSession: { type: Boolean, default: true },
})
const emit = defineEmits(["update:completed", "cycle-size", "refresh", "back"])

// A square of 44 px (the touch guideline of the design system) for the icon buttons of the row
const ICON_BUTTON =
	"relative inline-flex h-11 w-11 max-md:h-10 max-md:w-10 flex-none touch-manipulation items-center justify-center rounded-[10px] border border-gray-300 bg-white text-gray-900 active:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
</script>
