<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The notices at the top of the kitchen screen when the next course of a table is ordered (NeoRestau lot 1, Daniel, 01.11: « quand on commande la suite il doit y avoir un popup à la cuisine »). -->
	<!-- //// ONE notice per table, newest on top, « Table 12 — the next course is ordered: Desserts ». It stands in the page's column, between the bar and the tickets, not over them (nothing is drawn over a ticket: it would hide its button): the tickets -->
	<!-- //// give it the room it takes, and at most three stand at a time (the others are counted) so that a busy minute never takes the screen from the cooks; at 1366 x 768 it fits with no scroll of the page. -->
	<!-- //// The design system: the signal is a FIELD and a gesture, with ink on it (5.7:1), and every action is ink: the notice is the signal's field, its button an ink one, in light and in dark alike. -->
	<section v-if="notices.length" data-test="next-course-notices" role="status" aria-live="polite" class="flex flex-none flex-col gap-2 px-3 pt-2">
		<TransitionGroup name="next-course-notice" tag="div" class="flex flex-col gap-2">
			<div
				v-for="notice in shown"
				:key="notice.key"
				data-test="next-course-notice"
				:data-notice-order="notice.order"
				class="flex items-center gap-2 rounded-xl bg-[#F55D1A] py-1 pl-3 pr-1 text-[#141414] shadow-sm"
			>
				<LucideBellRing class="h-6 w-6 flex-none" aria-hidden="true" />
				<!-- The words are a button too: pressing them finds the ticket again (it is highlighted for a few seconds, then it is a ticket like the others) -->
				<button
					type="button"
					data-test="notice-show"
					class="min-h-11 min-w-0 flex-1 touch-manipulation text-left"
					@click="emit('show', notice.order)"
				>
					<span class="font-display block text-[22px] leading-tight max-md:text-[18px]">{{ messageOf(notice) }}</span>
				</button>
				<button
					type="button"
					data-test="notice-dismiss"
					class="inline-flex h-11 min-w-[44px] flex-none touch-manipulation items-center justify-center gap-1.5 rounded-[10px] bg-[#141414] px-3 text-sm font-bold text-[#FFFDF8] active:bg-[#2b2b2b]"
					:aria-label="__('Dismiss: {0}', [notice.table])"
					@click="emit('dismiss', notice.key)"
				>
					<LucideX class="h-5 w-5" aria-hidden="true" />
					<span class="max-md:sr-only">{{ __("Dismiss") }}</span>
				</button>
			</div>
		</TransitionGroup>
		<p v-if="hidden > 0" data-test="notices-more" class="self-start rounded-full bg-[#141414] px-2.5 text-xs font-bold leading-5 text-[#FFFDF8]">{{ __("+{0}", [hidden]) }}</p>
	</section>
</template>

<script setup>
import { computed } from "vue"
import LucideBellRing from "~icons/lucide/bell-ring"
import LucideX from "~icons/lucide/x"
import { sectionLabel } from "@/utils/ticketFamilies"

/**
 * The notices of the kitchen screen's next courses (composables/useNextCourseNotices).
 *
 * notices: `{ key, order, table, families }`, newest first; at most `max` are drawn, the others are counted
 * Says `dismiss` (the notice's key) when its button is pressed and `show` (its order's name) when its words are.
 */
const props = defineProps({
	notices: { type: Array, default: () => [] },
	max: { type: Number, default: 3 },
})
const emit = defineEmits(["dismiss", "show"])

const shown = computed(() => props.notices.slice(0, props.max))
const hidden = computed(() => Math.max(0, props.notices.length - props.max))

// « Table 12 — the next course is ordered: Mains, Desserts »; a send whose dishes name no course says only the news
function messageOf(notice) {
	const courses = (notice.families || []).map(sectionLabel).filter(Boolean).join(", ")
	return courses
		? __("{0} — the next course is ordered: {1}", [notice.table, courses])
		: __("{0} — the next course is ordered", [notice.table])
}
</script>

<style scoped>
/* Calm and Swiss: a short fade and a few pixels of rise, no bounce, and none at all for somebody who asked for less motion */
.next-course-notice-enter-active,
.next-course-notice-leave-active {
	transition: opacity 200ms ease, transform 200ms ease;
}
.next-course-notice-enter-from,
.next-course-notice-leave-to {
	opacity: 0;
	transform: translateY(-6px);
}
@media (prefers-reduced-motion: reduce) {
	.next-course-notice-enter-active,
	.next-course-notice-leave-active {
		transition: none;
	}
}
</style>
