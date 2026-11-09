<template>
	<!-- //// Neoffice — added file (no upstream equivalent). « Who did the work? » above the cart (NeoSalon, lot G1, product owner, 09.11.2026; canvas « Caisse 1 »): the person -->
	<!-- //// every line added from now on is given. The cashier's own sales person is already chosen (« if I open the till with an employee account, the person is already -->
	<!-- //// chosen: Luc is Luc, but I can put Sonia »), one tap changes it, and a line keeps the person it was added with (the details of the line change that one). -->
	<div
		v-if="visible"
		data-test="who-serves"
		class="relative mx-1.5 mt-1.5 sm:mx-2 flex-shrink-0"
		@keydown.esc="open = false"
		@focusout="onFocusOut"
	>
		<button
			type="button"
			data-test="who-serves-toggle"
			:aria-expanded="open ? 'true' : 'false'"
			aria-haspopup="listbox"
			:aria-label="label"
			class="flex w-full min-h-[44px] items-center gap-2.5 rounded-neo-md border-2 bg-white px-2.5 py-1.5 text-start transition-colors dark:bg-gray-800"
			:class="
				store.person
					? 'border-blue-500 dark:border-blue-400'
					: 'border-gray-300 border-dashed dark:border-gray-600'
			"
			@click="open = !open"
		>
			<span
				class="flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-bold"
				:class="
					store.person
						? 'bg-blue-600 text-white'
						: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
				"
				aria-hidden="true"
			>
				{{ initials }}
			</span>
			<span class="min-w-0 flex-1 leading-tight">
				<span
					class="block truncate text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
				>
					{{ label }}
				</span>
				<span
					class="block truncate text-sm font-semibold"
					:class="
						store.person
							? 'text-gray-900 dark:text-gray-100'
							: 'text-gray-500 dark:text-gray-400'
					"
					data-test="who-serves-name"
				>
					{{ store.person ? store.person.sales_person_name : __("Choose the person…") }}
				</span>
			</span>
			<span
				v-if="store.person && store.origin !== 'chosen'"
				data-test="who-serves-preselected"
				class="hidden flex-none items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 sm:inline-flex dark:bg-blue-400/20 dark:text-blue-100"
			>
				<span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
				{{ __("Preselected") }}
			</span>
			<svg
				class="h-5 w-5 flex-none text-gray-600 dark:text-gray-300"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.8"
					d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
				/>
			</svg>
		</button>

		<ul
			v-if="open"
			role="listbox"
			data-test="who-serves-list"
			:aria-label="label"
			class="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-neo-md border border-gray-200 bg-white py-1 shadow-neo-md dark:border-gray-600 dark:bg-gray-800"
		>
			<li v-if="store.loading" class="px-3 py-2 text-sm text-gray-500">
				{{ __("Loading...") }}
			</li>
			<li v-else-if="store.persons.length === 0" class="px-3 py-2 text-sm text-gray-500">
				{{ __("None") }}
			</li>
			<li v-for="row in store.persons" :key="row.name" role="presentation">
				<button
					type="button"
					role="option"
					:aria-selected="store.person?.sales_person === row.name ? 'true' : 'false'"
					:data-test="`who-serves-${row.name}`"
					class="flex w-full min-h-[44px] items-center gap-2.5 px-3 py-1.5 text-start text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
					:class="
						store.person?.sales_person === row.name
							? 'font-semibold text-blue-700 dark:text-blue-100'
							: 'text-gray-900 dark:text-gray-100'
					"
					@click="pick(row)"
				>
					<span class="min-w-0 flex-1 truncate">{{
						row.sales_person_name || row.name
					}}</span>
					<span v-if="row.is_mine" class="flex-none text-xs text-gray-500">{{
						__("You")
					}}</span>
				</button>
			</li>
			<li
				v-if="store.person"
				role="presentation"
				class="border-t border-gray-100 dark:border-gray-700"
			>
				<button
					type="button"
					role="option"
					aria-selected="false"
					data-test="who-serves-nobody"
					class="flex w-full min-h-[44px] items-center px-3 py-1.5 text-start text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
					@click="pickNobody"
				>
					{{ __("Nobody") }}
				</button>
			</li>
		</ul>
	</div>
</template>

<script setup>
/**
 * « Who did the work? » above the cart. It loads the till's sales persons when the option is on, and the cart reads the person it holds
 * (stores/whoServes.js) to give it to each line it adds.
 *
 * posProfile: the till
 * items:      the cart's lines, to word the question for what they are (a service, a product)
 */
import { computed, ref, watch } from "vue";
import { usePOSSettingsStore } from "@/stores/posSettings";
import { useWhoServesStore } from "@/stores/whoServes";
import { kindOfLines, whoLabel } from "@/utils/salesPersonLines";

const props = defineProps({
	posProfile: { type: String, default: "" },
	items: { type: Array, default: () => [] },
});

const settings = usePOSSettingsStore();
const store = useWhoServesStore();
const open = ref(false);

const visible = computed(
	() =>
		Boolean(settings.enableSalesPersons) &&
		Boolean(props.posProfile) &&
		(store.loading || store.persons.length > 0)
);
const label = computed(() => whoLabel(kindOfLines(props.items)));
const initials = computed(() => {
	const name = store.person?.sales_person_name || "";
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
});

// The option comes on (the settings arrive after the cart) or the till changes: load the persons, then the account's own is chosen
watch(
	() => [settings.enableSalesPersons, props.posProfile],
	([on, profile]) => {
		if (on && profile) store.load(profile);
	},
	{ immediate: true }
);

function pick(row) {
	store.choose(row);
	open.value = false;
}

function pickNobody() {
	store.clear();
	open.value = false;
}

// Leaving the bar (a tap elsewhere, Tab) closes the list; moving inside it does not
function onFocusOut(event) {
	if (!open.value) return;
	const bar = event.currentTarget;
	if (!event.relatedTarget || !bar.contains(event.relatedTarget)) open.value = false;
}
</script>
