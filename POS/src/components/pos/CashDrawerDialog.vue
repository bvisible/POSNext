<!-- //// Neoffice — added file (no upstream equivalent). Opens the cash drawer wired to the till's Star -->
<!-- //// CloudPRNT printer without a sale: the cashier picks a reason (and writes a note for Other), the -->
<!-- //// opening goes into the cloudprnt journal under their name and session, and the dialog shows what -->
<!-- //// the printer answered. Upstream POSNext has no cash drawer (maintenance#1935). -->
<template>
	<Dialog v-model="open" :options="{ title: __('Open the cash drawer'), size: 'lg' }">
		<template #body-content>
			<div class="flex flex-col gap-4">
				<p class="text-sm text-gray-600">
					{{ __("Without a sale: say why. The opening is recorded under your name.") }}
				</p>
				<div class="grid grid-cols-2 gap-3">
					<button
						v-for="reason in reasons"
						:key="reason.value"
						type="button"
						class="min-h-[56px] rounded-xl border px-3 text-base font-medium transition-colors"
						:class="
							selected === reason.value
								? 'border-2 border-orange-400 bg-orange-50 text-orange-900'
								: 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
						"
						:disabled="busy"
						@click="selected = reason.value"
					>
						{{ reason.label }}
					</button>
				</div>
				<div class="flex flex-col gap-1">
					<label for="cash-drawer-note" class="text-sm font-medium text-gray-700">
						{{ selected === "Other" ? __("Note (required)") : __("Note (optional)") }}
					</label>
					<input
						id="cash-drawer-note"
						v-model="note"
						type="text"
						class="h-12 rounded-lg border border-gray-300 px-3 text-base"
						:placeholder="__('For example: a 50 note changed')"
						:disabled="busy"
					/>
				</div>
				<div
					v-if="state"
					class="rounded-lg px-3 py-2 text-sm font-medium"
					:class="{
						'bg-gray-50 text-gray-700': state.result === 'Sent',
						'bg-green-50 text-green-800': state.result === 'Opened',
						'bg-red-50 text-red-800': state.result === 'Not opened',
					}"
				>
					{{ stateText }}
				</div>
			</div>
		</template>
		<template #actions>
			<div class="flex items-center justify-between gap-3">
				<span class="text-xs text-gray-500">{{ printerLabel }}</span>
				<div class="flex gap-2">
					<Button :disabled="busy" @click="open = false">{{ __("Close") }}</Button>
					<Button
						variant="solid"
						:loading="busy"
						:disabled="!canOpen"
						@click="openDrawer"
					>
						{{ __("Open the drawer") }}
					</Button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { Button, Dialog, call } from "frappe-ui";
import { computed, ref, watch } from "vue";
import { useToast } from "@/composables/useToast";

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	posProfile: { type: String, default: "" },
	posOpeningShift: { type: String, default: "" },
	printerLabel: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);
const { showSuccess, showError } = useToast();

const POLL_MS = 1500;
const POLL_TRIES = 12;

const open = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
});

// The values are the journal's reasons (cloudprnt.drawer.REASONS); the labels are what the cashier reads.
const reasons = [
	{ value: "Give change", label: __("Give change") },
	{ value: "Cash float", label: __("Cash float") },
	{ value: "Change error", label: __("Change error") },
	{ value: "Other", label: __("Other") },
];

const selected = ref("Give change");
const note = ref("");
const busy = ref(false);
const state = ref(null);

const canOpen = computed(
	() =>
		!busy.value &&
		Boolean(selected.value) &&
		(selected.value !== "Other" || note.value.trim().length > 0)
);
const stateText = computed(() => {
	if (!state.value) return "";
	if (state.value.result === "Opened")
		return __("Drawer opened, confirmed by {0}", [state.value.printer]);
	if (state.value.result === "Not opened") {
		return __("The drawer did not open: {0}", [
			state.value.detail || __("no answer from the printer"),
		]);
	}
	return __("Sent to {0}…", [state.value.printer || props.printerLabel]);
});

watch(open, (isOpen) => {
	if (isOpen) {
		selected.value = "Give change";
		note.value = "";
		state.value = null;
	}
});

async function openDrawer() {
	busy.value = true;
	try {
		const answer = await call("cloudprnt.drawer.open_from_till", {
			pos_profile: props.posProfile,
			reason: selected.value,
			note: note.value,
			pos_opening_shift: props.posOpeningShift,
		});
		state.value = { result: "Sent", printer: answer.printer };
		await follow(answer.opening);
	} catch (error) {
		showError(error?.messages?.[0] || error?.message || __("The drawer could not be opened"));
	} finally {
		busy.value = false;
	}
}

async function follow(opening) {
	for (let attempt = 0; attempt < POLL_TRIES; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
		const status = await call("cloudprnt.drawer.opening_status", { opening });
		state.value = status;
		if (status.result !== "Sent") break;
	}
	if (state.value?.result === "Opened") {
		showSuccess(stateText.value);
		open.value = false;
	}
}
</script>
