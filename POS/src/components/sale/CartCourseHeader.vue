<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The header of a course in the cart of a table's order (NeoResto lot 1, Daniel, 01.11: « la même logique que dans la cuisine sur le ticket
	     de la table, il faut barrer et réduire pour laisser que ce qu'il reste visible »). It is the kitchen ticket's way of saying a course: the name in small capitals and a dashed rule after it.
	     A course that is all delivered is ONE row that a press opens and closes: a chevron, the name, a check mark, a rule, how many lines and what they come to. The whole row is the button
	     (44 px high at least), so that the chevron is not the only place to press. The colours are the screen's own greys, which the till's dark remap lightens by itself. -->
	<div data-cart-course :data-course-key="groupKey" :data-course-kind="kind" class="break-inside-avoid">
		<button
			v-if="foldable"
			type="button"
			data-cart-course-fold
			:aria-expanded="folded ? 'false' : 'true'"
			:title="__('Show or hide the finished dishes')"
			class="flex min-h-[44px] w-full touch-manipulation items-center gap-2 rounded-neo-sm px-1 text-start text-gray-700 hover:bg-gray-50 active:bg-gray-100"
			@click="$emit('toggle')"
		>
			<svg
				class="h-4 w-4 flex-none transition-transform rtl:-scale-x-100"
				:class="folded ? '' : 'rotate-90'"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path d="m9 6 6 6-6 6" />
			</svg>
			<span class="whitespace-nowrap text-[11px] font-bold uppercase leading-none tracking-wider">{{ label }}</span>
			<svg
				data-cart-course-done
				class="h-4 w-4 flex-none text-green-700 dark:text-ds-success"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path d="M20 6 9 17l-5-5" />
			</svg>
			<span class="min-w-[1rem] flex-1 border-t border-dashed border-gray-400 dark:border-gray-600" aria-hidden="true"></span>
			<span class="flex-none text-xs font-bold leading-none tabular-nums">{{ count }}</span>
			<span class="flex-none text-xs font-bold leading-none tabular-nums" dir="ltr"><bdi>{{ subtotal }}</bdi></span>
		</button>
		<div v-else class="flex items-center gap-1.5 px-1 pb-0.5 pt-1.5">
			<span class="whitespace-nowrap text-[11px] font-bold uppercase leading-none tracking-wider text-gray-700">{{ label }}</span>
			<span class="flex-1 border-t border-dashed border-gray-500 dark:border-gray-600" aria-hidden="true"></span>
		</div>
	</div>
</template>

<script setup>
/**
 * groupKey: the key of the group in utils/cartCourses (a family, or "held"), for the tests and for what remembers which fold is open
 * kind:     "course" or "held" (the lines of no course have no header)
 * label:    the name of the course, in the restaurant's language (utils/cartCourses: `courseGroupLabel`)
 * foldable: the course is all delivered: its header is a button
 * folded:   its lines are hidden
 * count:    how many lines the course has
 * subtotal: what they come to, written (the cart's own currency format)
 *
 * Emits `toggle` when the row of a course that can fold is pressed.
 */
defineProps({
	groupKey: { type: String, required: true },
	kind: { type: String, default: "course" },
	label: { type: String, required: true },
	foldable: { type: Boolean, default: false },
	folded: { type: Boolean, default: false },
	count: { type: Number, default: 0 },
	subtotal: { type: String, default: "" },
})
defineEmits(["toggle"])
</script>
