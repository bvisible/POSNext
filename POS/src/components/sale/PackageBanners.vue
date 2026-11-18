<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The banner of each package of the customer, right under the customer (NeoSalon, lots G11, voie 1; the board « Use a package at the till »): its title,
	<!-- //// the sessions left and until when, and a black « Use » that pays the line of the cart the package covers (the cashier's chosen line, else the first service line it covers). Greyed when
	<!-- //// no line can be paid. One banner per package, in the order the site gives (the first to end on top, the ones with no end last: the site's contract, never sorted again here). The site's words show under the banner when it refuses. -->
	<!-- //// The audit of 18.11 (voie 4): the touch surface's sizes (§ 7), the sessions the cart already takes counted, a package past its last day not offered. -->
	<div v-if="banners.length" class="space-y-1.5 px-2 pb-2" data-test="package-banners">
		<div
			v-for="banner in banners"
			:key="banner.pack.package"
			:data-test="`package-banner-${banner.pack.package}`"
		>
			<div
				class="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-2.5 py-2 dark:border-green-800 dark:bg-green-900/30"
			>
				<div class="min-w-0 flex-1">
					<b
						dir="auto"
						class="block break-words text-[14px] leading-tight text-green-900 dark:text-green-100"
						data-test="package-banner-title"
						>{{ banner.pack.title }}</b
					>
					<span
						class="block text-[14px] leading-tight text-green-800 dark:text-green-200"
						data-test="package-banner-left"
						>{{ banner.left }}<template v-if="banner.until">{{ banner.until[0] }}<span class="whitespace-nowrap">{{ banner.until[1] }}</span>{{ banner.until[2] }}</template></span
					>
				</div>
				<button
					type="button"
					class="min-h-[44px] shrink-0 whitespace-nowrap rounded-lg bg-gray-900 px-3 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
					data-test="package-banner-use"
					:disabled="!banner.row || busy === banner.pack.package"
					:title="banner.row ? '' : __('No line of the cart is paid by this package.')"
					@click="emit('use', { pack: banner.pack, row: banner.row })"
				>
					{{ __("Use package") }}
				</button>
			</div>
			<p
				v-if="refusals[banner.pack.package]"
				class="mt-1 px-1 text-[14px] text-red-700 dark:text-red-300"
				role="alert"
				data-test="package-banner-why"
			>
				{{ refusals[banner.pack.package] }}
			</p>
		</div>
	</div>
</template>

<script setup>
/**
 * //// Neoffice — added file (no upstream equivalent). The packages of the cart's customer as banners; it holds nothing and asks nothing: it shows what the store read, and hands the package and the line
 * //// it would pay (utils/packageTarget) to the cart, which asks the site and applies the agreement.
 */
import { computed } from "vue";
import { dateOf, expired, takenByOtherLines, targetLine } from "@/utils/packageTarget";

const props = defineProps({
	// The packages of the customer, the first to end first (the site's order: the till shows what the site gives and sorts nothing)
	packages: { type: Array, default: () => [] },
	// The lines of the cart, and the one the cashier chose last
	rows: { type: Array, default: () => [] },
	chosen: { type: Object, default: null },
	isOffered: { type: Function, default: () => false },
	// The package being asked about, and the reasons the site gave, by package
	busy: { type: String, default: "" },
	refusals: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["use"]);

// What is left, counting what the cart already takes of it (« 6 sessions left after this cart »): the banner never says 7 when the cart has used one
const left = (pack) => {
	const taken = takenByOtherLines(pack, props.rows);
	if (taken > 0) {
		const after = Math.max(0, pack.remaining - taken);
		return after === 1 ? __("1 session left after this cart") : __("{0} sessions left after this cart", [after]);
	}
	return pack.remaining === 1 ? __("1 session left") : __("{0} sessions left", [pack.remaining]);
};

const untilPieces = (date) => {
	const marker = "\u0000";
	const [before, after] = __("until {0}", [marker]).split(marker);
	return [` · ${before}`, date, after ?? ""];
};

// A package with nothing left is no banner (nothing to use), nor one past its last day
const banners = computed(() =>
	props.packages
		.filter((pack) => pack.remaining > 0 && !expired(pack))
		.map((pack) => ({
			pack,
			row: targetLine(pack, props.rows, props.chosen, props.isOffered),
			left: left(pack),
			// « · until 28-11-2026 » in three pieces, the date alone in a span that never breaks (a date cut at its hyphen read as two numbers)
			until: pack.valid_till ? untilPieces(dateOf(pack.valid_till)) : null,
		}))
);
</script>
