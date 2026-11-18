<template>
	<!-- //// Neoffice — added file (no upstream equivalent). « Use a package » (NeoSalon, lots G11, voie 1; the plan « Forfaits et rendez-vous réguliers »): the packages of the customer of the cart that cover the -->
	<!-- //// line, how many sessions each has left and until when, and one button to pay the line with a session. The site decides (it is asked, it writes nothing): the dialog shows its answer, and its reason when -->
	<!-- //// it refuses. The session is counted when the invoice is submitted, and given back if it is cancelled. The audit of 18.11 (voie 4): touch-surface sizes, a package past its last day -->
	<!-- //// out, one date format with the banner's, and « needs the network » said when the till is offline. -->
	<Dialog v-model="show" :options="{ title: __('Use a package'), size: 'xl' }">
		<template #body-content>
			<div class="space-y-4" data-test="package-dialog">
				<div
					class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 leading-snug dark:border-gray-700 dark:bg-gray-800"
				>
					<b
						dir="auto"
						class="block break-words text-base text-gray-900 dark:text-gray-100"
						data-test="package-subject"
						>{{ customerName }}</b
					>
					<span class="text-[15px] text-gray-700 dark:text-gray-300" dir="auto"
						>{{ row?.item_name || row?.item_code }} · {{ sessions }}</span
					>
				</div>

				<p
					v-if="store.loading && !choices.length"
					class="py-3 text-base text-gray-600 dark:text-gray-300"
					data-test="package-loading"
				>
					{{ __("Loading...") }}
				</p>
				<p
					v-else-if="offline"
					class="py-3 text-base text-gray-700 dark:text-gray-200"
					data-test="package-offline"
				>
					{{ __("The packages are read from the site: they need the network.") }}
				</p>
				<p
					v-else-if="!choices.length"
					class="py-3 text-base text-gray-700 dark:text-gray-200"
					data-test="package-none"
				>
					{{ __("No package of this customer pays this line.") }}
				</p>
				<ul v-else class="space-y-3" data-test="package-list">
					<li
						v-for="pack in choices"
						:key="pack.package"
						class="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
						:data-test="`package-${pack.package}`"
					>
						<!-- At a phone's width the sessions left go under the title instead of squeezing it -->
						<div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
							<div class="min-w-0 flex-1 basis-48">
								<b
									dir="auto"
									class="block break-words text-base text-gray-900 dark:text-gray-100"
									>{{ pack.title }}</b
								>
								<span
									class="text-sm text-gray-600 dark:text-gray-300"
									:data-test="`package-valid-${pack.package}`"
									>{{ validText(pack) }}</span
								>
							</div>
							<span
								class="shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100"
								:data-test="`package-left-${pack.package}`"
								>{{
									pack.remaining === 1
										? __("1 of {0} session left", [pack.total])
										: __("{0} of {1} sessions left", [pack.remaining, pack.total])
								}}</span
							>
						</div>
						<div
							class="mt-3 h-2 rounded-full bg-gray-200 dark:bg-gray-700"
							aria-hidden="true"
						>
							<div
								class="h-2 rounded-full bg-gray-900 dark:bg-gray-100"
								:style="{ width: barOf(pack) }"
							></div>
						</div>
						<p
							v-if="refusals[pack.package]"
							class="mt-3 text-[15px] text-red-700 dark:text-red-300"
							role="alert"
							:data-test="`package-why-${pack.package}`"
						>
							{{ refusals[pack.package] }}
						</p>
						<button
							type="button"
							:data-test="`package-use-${pack.package}`"
							class="mt-3 min-h-[48px] w-full rounded-xl bg-gray-900 px-4 text-base font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
							:disabled="busy || pack.remaining < sessionsNeeded"
							@click="use(pack)"
						>
							{{
								sessionsNeeded === 1
									? __("Use 1 session")
									: __("Use {0} sessions", [sessionsNeeded])
							}}
						</button>
					</li>
				</ul>

				<div class="flex items-center justify-end pt-1">
					<button
						type="button"
						data-test="package-close"
						class="min-h-[48px] rounded-xl px-4 text-base font-semibold text-gray-700 dark:text-gray-200"
						@click="show = false"
					>
						{{ __("Close") }}
					</button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
/**
 * //// Neoffice — added file (no upstream equivalent). The window of a line of the cart that a package of its customer may pay (see the template). It never holds a package: the store reads the site's answer
 * //// (`pos_next.api.packages`), and `apply` hands the agreement (the fields of the line, the site's words, the sessions left) to the cart.
 */
import { Dialog } from "frappe-ui";
import { computed, ref, watch } from "vue";
import { covers, useCustomerPackagesStore } from "@/stores/customerPackages";
import { offlineState } from "@/utils/offline/offlineState";
import { dateOf, expired } from "@/utils/packageTarget";

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	// The line of the cart to pay, and the lines of the cart (the sessions the other lines already take)
	row: { type: Object, default: null },
	rows: { type: Array, default: () => [] },
	posProfile: { type: String, default: "" },
	customerId: { type: String, default: "" },
	customerName: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue", "apply"]);

const store = useCustomerPackagesStore();
const show = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
});
const busy = ref(false);
// The reason the site gave for a package, by package
const refusals = ref({});

const sessionsNeeded = computed(() =>
	Math.max(1, Math.trunc(Number(props.row?.quantity ?? props.row?.qty) || 1))
);
const sessions = computed(() =>
	sessionsNeeded.value === 1 ? __("1 session") : __("{0} sessions", [sessionsNeeded.value])
);
// The till is offline: the packages are the site's, nothing was asked, and the window says so instead of « no package pays this line »
const offline = ref(false);
// Only the packages that cover the line and are still valid, the ones with something left first, each group in the order the site gives (never sorted again here)
const choices = computed(() =>
	store.packages
		.filter((pack) => covers(pack, props.row) && !expired(pack))
		.sort((a, b) => Number(b.remaining > 0) - Number(a.remaining > 0))
);

const barOf = (pack) =>
	`${pack.total > 0 ? Math.round((Math.max(0, pack.remaining) / pack.total) * 100) : 0}%`;
// The end is written as the banner writes it (day-month-year), so one package never reads in two ways
const validText = (pack) => {
	if (!pack.valid_till) return __("No end date");
	return __("Valid until {0}", [dateOf(pack.valid_till)]);
};
// The sessions of this package that the other lines of the cart take already
const takenElsewhere = (pack) =>
	props.rows
		.filter((other) => other !== props.row && other.customer_package === pack.package)
		.reduce((sum, other) => sum + (Number(other.quantity ?? other.qty) || 0), 0);

watch(
	() => props.modelValue,
	async (open) => {
		if (!open) return;
		refusals.value = {};
		offline.value = Boolean(offlineState.isOffline);
		// The sessions left are the site's, and may have moved since the cart was opened
		await store.load(props.posProfile, props.customerId);
	},
	{ immediate: true }
);

async function use(pack) {
	busy.value = true;
	try {
		const answer = await store.check(props.posProfile, pack, props.row, takenElsewhere(pack));
		if (answer.ok) {
			emit("apply", { pack, answer });
			show.value = false;
		} else {
			refusals.value = {
				...refusals.value,
				[pack.package]: answer.why || __("This package cannot pay this line."),
			};
		}
	} finally {
		busy.value = false;
	}
}
</script>
