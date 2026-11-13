<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The banner of each package of the customer, right under the customer (NeoSalon, lots G11, voie 1; the board « Use a package at the till »): its title,
	<!-- //// the sessions left and until when, and a black « Use » that pays the line of the cart the package covers (the cashier's chosen line, else the first service line it covers). Greyed when
	<!-- //// no line can be paid. One banner per package, the first to end on top (the order the site gives). The site's words show under the banner when it refuses. -->
	<div v-if="banners.length" class="space-y-1.5 px-2 pb-2" data-test="package-banners">
		<div
			v-for="banner in banners"
			:key="banner.pack.package"
			:data-test="`package-banner-${banner.pack.package}`"
		>
			<div
				class="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 dark:border-green-800 dark:bg-green-900/30"
			>
				<div class="min-w-0 flex-1">
					<b
						dir="auto"
						class="block break-words text-xs leading-tight text-green-900 dark:text-green-200"
						data-test="package-banner-title"
						>{{ banner.pack.title }}</b
					>
					<span
						class="block text-[11px] leading-tight text-green-800 dark:text-green-300"
						data-test="package-banner-left"
						>{{ banner.text }}</span
					>
				</div>
				<button
					type="button"
					class="min-h-[36px] shrink-0 rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
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
				class="mt-1 px-1 text-[11px] text-red-700 dark:text-red-300"
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
import { dateOf, targetLine } from "@/utils/packageTarget";

const props = defineProps({
	// The packages of the customer, the first to end first (the site's order)
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

const left = (pack) =>
	pack.remaining === 1 ? __("1 session left") : __("{0} sessions left", [pack.remaining]);

// A package with nothing left is no banner: nothing to use
const banners = computed(() =>
	props.packages
		.filter((pack) => pack.remaining > 0)
		.map((pack) => ({
			pack,
			row: targetLine(pack, props.rows, props.chosen, props.isOffered),
			text: pack.valid_till
				? `${left(pack)} · ${__("until {0}", [dateOf(pack.valid_till)])}`
				: left(pack),
		}))
);
</script>
