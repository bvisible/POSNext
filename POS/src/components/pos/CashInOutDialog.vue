<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Cash in and cash out from the till: -->
	<!-- //// the cashier picks one of the till's operations (a Journal Entry Template) and the movement is -->
	<!-- //// booked and submitted immediately, so the closing report and the expected cash stay true. -->
	<!-- //// Upstream POSNext has no cash movement at all — the drawer silently drifts from the -->
	<!-- //// ledger. (6c598630, 2026-03-28 "cash in/out from POS using Journal Entry Templates"; -->
	<!-- //// 2e2ef1a0 adapts to the ERPNext Swiss template structure (totalization and -->
	<!-- //// counterparty), ee6587a0 reads template_title, dd53c641 adds the search filter, -->
	<!-- //// 82b2493a the POS Profile template filter.) Rebuilt by NeoResto lot 1, task 15: the -->
	<!-- //// direction comes from the server, an empty list means no movement, « without VAT », the -->
	<!-- //// receipt's photo, the shift's cap, cancel while the shift is open, and the offline queue. -->
	<Dialog v-model="open" :options="{ title: __('Cash In/Out'), size: '3xl' }">
		<template #body-content>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Left: the till's operations and the form -->
				<div class="space-y-4">
					<div
						v-if="isOffline"
						class="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
					>
						<FeatherIcon name="wifi-off" class="mt-0.5 h-4 w-4 flex-shrink-0" />
						<span>{{ __("Offline: the movements are kept on this device and sent when the network is back.") }}</span>
					</div>

					<div v-if="loading" class="flex items-center justify-center py-8">
						<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-pos-action"></div>
					</div>

					<div v-else-if="noCache" class="py-8 text-center text-sm text-gray-500">
						{{ __("Open this window once with the network to record movements offline.") }}
					</div>

					<div v-else-if="data && !data.shift_open" class="py-8 text-center text-sm text-gray-500">
						{{ __("This shift is closed: no more cash movements.") }}
					</div>

					<div v-else-if="!templates.length" class="space-y-1 py-8 text-center text-sm text-gray-500">
						<p>{{ data?.setup_problem || __("No cash operation is set up for this till.") }}</p>
						<p class="text-xs text-gray-400">
							{{ __("A manager chooses them on the till's POS Profile (Cash In/Out Operations).") }}
						</p>
					</div>

					<template v-else>
						<!-- Form, once an operation is chosen -->
						<div
							v-if="selectedTemplate"
							class="space-y-3 rounded-lg border-2 p-4"
							:class="isOut(selectedTemplate) ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'"
						>
							<div class="flex items-center gap-3">
								<div
									class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
									:class="isOut(selectedTemplate) ? 'bg-red-200 text-red-700' : 'bg-green-200 text-green-700'"
								>
									<FeatherIcon
										:name="isOut(selectedTemplate) ? 'arrow-up-circle' : 'arrow-down-circle'"
										class="h-4 w-4"
									/>
								</div>
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-semibold text-gray-900">
										{{ selectedTemplate.template_title || selectedTemplate.name }}
									</div>
									<div class="truncate text-xs text-gray-600">
										{{ isOut(selectedTemplate) ? __("Out of the drawer") : __("Into the drawer") }}
										· {{ selectedTemplate.account }}
									</div>
								</div>
								<button
									class="flex h-11 w-11 items-center justify-center text-gray-400 hover:text-gray-600"
									:aria-label="__('Close')"
									@click="selectedTemplate = null"
								>
									<FeatherIcon name="x" class="h-4 w-4" />
								</button>
							</div>

							<div>
								<label for="cash-movement-amount" class="mb-1 block text-sm font-medium text-gray-700">
									{{ __("Amount") }}
								</label>
								<input
									id="cash-movement-amount"
									ref="amountInput"
									v-model.number="amount"
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									class="h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-pos-action focus:ring-1 focus:ring-pos-action"
									:placeholder="__('Enter amount')"
									@keyup.enter="submitEntry"
								/>
								<p v-if="isOut(selectedTemplate) && remainingOut !== null" class="mt-1 text-xs text-gray-600">
									{{ __("Still allowed out during this shift: {0}", [formatAmount(remainingOut)]) }}
								</p>
							</div>

							<div>
								<label for="cash-movement-note" class="mb-1 block text-sm font-medium text-gray-700">
									{{ __("Note") }} <span class="text-gray-400">({{ __("optional") }})</span>
								</label>
								<input
									id="cash-movement-note"
									v-model="note"
									type="text"
									maxlength="500"
									class="h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-pos-action focus:ring-1 focus:ring-pos-action"
									:placeholder="__('e.g. Bank deposit ref #123')"
									@keyup.enter="submitEntry"
								/>
							</div>

							<!-- Without VAT: only on an expense paid out whose VAT the desk's logic splits (never an income) -->
							<label
								v-if="selectedTemplate.no_vat_allowed"
								class="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg bg-white px-3 py-2"
							>
								<button
									type="button"
									role="switch"
									:aria-checked="noVat"
									class="relative h-[30px] w-[54px] flex-shrink-0 rounded-full border-2 border-pos-action transition-colors"
									:class="noVat ? 'bg-pos-action' : 'bg-gray-100'"
									@click="noVat = !noVat"
								>
									<span
										class="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-transform"
										:class="noVat ? 'translate-x-[27px]' : 'translate-x-[3px]'"
									></span>
								</button>
								<span class="min-w-0">
									<span class="block text-sm font-medium text-gray-800">{{ __("Without VAT") }}</span>
									<span class="block text-xs text-gray-500">
										{{ __("A purchase from a supplier not subject to VAT: the whole amount is booked as the expense, no input VAT is claimed.") }}
									</span>
								</span>
							</label>

							<!-- The receipt: the camera on a tablet or a phone, a file picker on a computer -->
							<div>
								<input
									ref="photoInput"
									type="file"
									accept="image/*,application/pdf"
									capture="environment"
									class="hidden"
									@change="onPhotoChosen"
								/>
								<div v-if="photo" class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2">
									<img
										v-if="photoPreview"
										:src="photoPreview"
										:alt="__('Receipt')"
										class="h-12 w-12 flex-shrink-0 rounded object-cover"
									/>
									<FeatherIcon v-else name="paperclip" class="h-5 w-5 flex-shrink-0 text-gray-500" />
									<span class="min-w-0 flex-1 truncate text-sm text-gray-700">{{ photo.name }}</span>
									<button
										type="button"
										class="flex h-11 w-11 items-center justify-center text-gray-400 hover:text-gray-600"
										:aria-label="__('Remove the receipt')"
										@click="clearPhoto"
									>
										<FeatherIcon name="trash-2" class="h-4 w-4" />
									</button>
								</div>
								<Button v-else class="w-full" :disabled="submitting" @click="photoInput?.click()">
									<template #prefix>
										<FeatherIcon name="camera" class="h-4 w-4" />
									</template>
									{{ __("Photo of the receipt") }}
								</Button>
								<p v-if="photoError" class="mt-1 text-xs text-red-700">{{ photoError }}</p>
							</div>

							<Button
								class="w-full"
								variant="solid"
								size="lg"
								:loading="submitting"
								:disabled="!amount || amount <= 0"
								@click="submitEntry"
							>
								<template #prefix>
									<FeatherIcon
										:name="isOut(selectedTemplate) ? 'arrow-up-circle' : 'arrow-down-circle'"
										class="h-4 w-4"
									/>
								</template>
								{{ isOut(selectedTemplate) ? __("Record Cash Out") : __("Record Cash In") }}
							</Button>
						</div>

						<!-- Search and the till's operations -->
						<div class="space-y-2">
							<h3 v-if="!selectedTemplate" class="text-sm font-semibold text-gray-700">
								{{ __("Select Operation") }}
							</h3>
							<div v-if="templates.length > 6" class="relative">
								<FeatherIcon
									name="search"
									class="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
								/>
								<input
									v-model="searchQuery"
									type="text"
									class="h-12 w-full rounded-lg border border-gray-200 pe-3 ps-9 text-base focus:border-pos-action focus:ring-1 focus:ring-pos-action"
									:placeholder="__('Search templates...')"
								/>
							</div>
							<div v-if="!filteredTemplates.length" class="py-4 text-center text-sm text-gray-400">
								{{ __("No templates match your search.") }}
							</div>
							<button
								v-for="t in filteredTemplates"
								:key="t.name"
								class="flex min-h-[56px] w-full items-center gap-3 rounded-lg border p-3 text-start transition-all"
								:class="
									selectedTemplate?.name === t.name
										? isOut(t)
											? 'border-red-300 bg-red-50'
											: 'border-green-300 bg-green-50'
										: 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
								"
								@click="selectTemplate(t)"
							>
								<div
									class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
									:class="isOut(t) ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'"
								>
									<FeatherIcon :name="isOut(t) ? 'arrow-up-circle' : 'arrow-down-circle'" class="h-5 w-5" />
								</div>
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium text-gray-900">{{ t.template_title || t.name }}</div>
									<div class="truncate text-xs text-gray-500">{{ t.account }}</div>
								</div>
								<span
									class="rounded-full px-2 py-0.5 text-xs font-medium"
									:class="isOut(t) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'"
								>
									{{ isOut(t) ? __("Out") : __("In") }}
								</span>
							</button>
						</div>
					</template>

					<!-- The till's operations it cannot book, with the reason, for the manager -->
					<details v-if="unusable.length" class="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
						<summary class="cursor-pointer">
							{{ __("{0} operation(s) of this till cannot be used", [unusable.length]) }}
						</summary>
						<ul class="mt-2 space-y-1">
							<li v-for="row in unusable" :key="row.name">{{ row.reason }}</li>
						</ul>
					</details>
				</div>

				<!-- Right: the shift's movements -->
				<div class="space-y-3">
					<h3 class="text-sm font-semibold text-gray-700">{{ __("Shift History") }}</h3>

					<!-- Refused by the server: never sent again; kept for the manager or discarded with a reason -->
					<div v-if="refused.length" class="space-y-2">
						<h4 class="text-xs font-semibold text-pos-danger">{{ __("Refused by the server: not in the books") }}</h4>
						<div
							v-for="row in refused"
							:key="`refused-${row.id}`"
							class="space-y-2 rounded-lg border border-pos-danger bg-red-50 p-3"
						>
							<div class="flex items-center gap-3">
								<div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
									<FeatherIcon name="alert-triangle" class="h-4 w-4" />
								</div>
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium text-gray-900">{{ row.data.template_title }}</div>
									<div class="text-xs text-pos-danger">{{ __("Refused: {0}", [row.error || ""]) }}</div>
									<div v-if="refusedOrigin(row)" class="truncate text-xs text-gray-600">{{ refusedOrigin(row) }}</div>
									<div v-if="row.kept_for_manager" class="text-xs text-gray-600">{{ __("Kept for the manager") }}</div>
								</div>
								<div class="flex-shrink-0 text-sm font-semibold" :class="row.data.direction === 'out' ? 'text-pos-danger' : 'text-pos-saving'">
									{{ row.data.direction === "out" ? "-" : "+" }}{{ formatAmount(row.data.amount) }}
								</div>
							</div>
							<div class="flex flex-wrap justify-end gap-2">
								<Button class="min-h-[44px]" :disabled="isOffline" @click="sendAgain(row)">
									{{ __("Send again") }}
								</Button>
								<Button v-if="!row.kept_for_manager" class="min-h-[44px]" @click="keepForManager(row)">
									{{ __("Keep for the manager") }}
								</Button>
								<Button class="min-h-[44px]" theme="red" :disabled="isOffline" @click="askSetAside(row)">
									{{ __("Discard", null, "Set aside a refused cash movement") }}
								</Button>
							</div>
						</div>
					</div>

					<div
						v-if="!movements.length && !pending.length && !refused.length"
						class="py-8 text-center text-sm text-gray-400"
					>
						{{ __("No cash entries for this shift yet.") }}
					</div>

					<div v-else-if="movements.length || pending.length" class="space-y-2">
						<div class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
							<div v-if="totalIn > 0" class="font-medium text-green-700">{{ __("In") }}: +{{ formatAmount(totalIn) }}</div>
							<div v-if="totalOut > 0" class="font-medium text-red-700">{{ __("Out") }}: -{{ formatAmount(totalOut) }}</div>
							<div class="font-semibold text-gray-700">{{ __("Net") }}: {{ formatAmount(totalIn - totalOut) }}</div>
						</div>

						<!-- Waiting in this device's queue -->
						<div
							v-for="row in pending"
							:key="`pending-${row.id}`"
							class="flex items-center gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3"
						>
							<div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
								<FeatherIcon name="clock" class="h-4 w-4" />
							</div>
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium text-gray-900">{{ row.data.template_title }}</div>
								<div class="truncate text-xs text-amber-800">
									{{ pendingLabel(row) }}
								</div>
							</div>
							<div class="flex-shrink-0 text-sm font-semibold" :class="row.data.direction === 'out' ? 'text-red-700' : 'text-green-700'">
								{{ row.data.direction === "out" ? "-" : "+" }}{{ formatAmount(row.data.amount) }}
							</div>
							<button
								v-if="!row.server_journal_entry"
								type="button"
								class="flex h-11 w-11 flex-shrink-0 items-center justify-center text-gray-400 hover:text-red-600"
								:aria-label="__('Delete')"
								@click="deletePending(row)"
							>
								<FeatherIcon name="trash-2" class="h-4 w-4" />
							</button>
						</div>

						<!-- Booked -->
						<div
							v-for="entry in movements"
							:key="entry.name"
							class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"
						>
							<div
								class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
								:class="entry.direction === 'out' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'"
							>
								<FeatherIcon :name="entry.direction === 'out' ? 'arrow-up' : 'arrow-down'" class="h-4 w-4" />
							</div>
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium text-gray-900">{{ entry.template }}</div>
								<div v-if="entry.note || entry.no_vat" class="truncate text-xs text-gray-500">
									{{ [entry.note, entry.no_vat ? __("Without VAT") : ""].filter(Boolean).join(" · ") }}
								</div>
							</div>
							<div
								class="flex-shrink-0 text-sm font-semibold"
								:class="entry.direction === 'out' ? 'text-red-700' : 'text-green-700'"
							>
								{{ entry.direction === "out" ? "-" : "+" }}{{ formatAmount(entry.amount) }}
							</div>
							<Button
								v-if="entry.can_cancel && !isOffline"
								size="sm"
								:loading="cancelling === entry.name"
								:disabled="Boolean(cancelling)"
								@click="askCancel(entry)"
							>
								{{ __("Cancel") }}
							</Button>
						</div>
					</div>
				</div>
			</div>
		</template>
	</Dialog>

	<!-- Cancelling a movement: said once more before it is done -->
	<Dialog v-model="confirmOpen" :options="{ title: __('Cancel this cash movement?'), size: 'md' }">
		<template #body-content>
			<p class="text-sm text-gray-700">{{ confirmMessage }}</p>
		</template>
		<template #actions>
			<div class="flex justify-end gap-2">
				<Button @click="confirmOpen = false">{{ __("Keep it") }}</Button>
				<Button variant="solid" theme="red" @click="cancelConfirmed">{{ __("Cancel the movement") }}</Button>
			</div>
		</template>
	</Dialog>

	<!-- Discarding a refused movement: a reason, which the server writes on its shift -->
	<Dialog v-model="setAsideOpen" :options="{ title: __('Discard this refused movement?'), size: 'md' }">
		<template #body-content>
			<div class="space-y-3">
				<p class="text-sm text-gray-700">{{ setAsideMessage }}</p>
				<div>
					<label for="cash-movement-set-aside-reason" class="mb-1 block text-sm font-medium text-gray-700">
						{{ __("Reason") }}
					</label>
					<input
						id="cash-movement-set-aside-reason"
						v-model="setAsideReason"
						type="text"
						maxlength="500"
						class="h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-pos-action focus:ring-1 focus:ring-pos-action"
						:placeholder="__('e.g. Paid back to the supplier')"
						@keyup.enter="setAsideConfirmed"
					/>
				</div>
			</div>
		</template>
		<template #actions>
			<div class="flex justify-end gap-2">
				<Button @click="setAsideOpen = false">{{ __("Keep it") }}</Button>
				<Button
					variant="solid"
					theme="red"
					:loading="settingAside"
					:disabled="!setAsideReason.trim() || isOffline"
					@click="setAsideConfirmed"
				>
					{{ __("Discard", null, "Set aside a refused cash movement") }}
				</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Button, Dialog, FeatherIcon, call } from "frappe-ui";
import { useAuthorization } from "@/composables/useAuthorization";
import { useOfflineStatus } from "@/composables/useOfflineStatus";
import { useToast } from "@/composables/useToast";
import { usePOSSyncStore } from "@/stores/posSync";
//// Neoffice — cash in/out amounts in the site's number format (formatAmount below).
import { formatCurrencyNumber } from "@/utils/currency";
import {
	cacheCashMovementDialogData,
	cashMovementAttachmentProblem,
	deleteOfflineCashMovement,
	getCashMovementDialogCache,
	getCashOutRemaining,
	getPendingCashMovements,
	getRefusedCashMovements,
	isTransientError,
	keepRefusedCashMovementForManager,
	resendRefusedCashMovement,
	pendingCashTotals,
	recordCashMovement,
	sessionUserId,
	setAsideRefusedCashMovement,
	syncOfflineCashMovements,
} from "@/utils/offline/cashMovements";

const VOID_ACTION = "Void Cash Movement";

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	posProfile: { type: String, default: "" },
	company: { type: String, default: "" },
	posOpeningShift: { type: String, default: "" },
	currency: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue"]);

const { showSuccess, showError, showWarning } = useToast();
const { requireAuthorization } = useAuthorization();
const { isOffline } = useOfflineStatus();
const syncStore = usePOSSyncStore();

const open = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
});

// State
const data = ref(null);
const pending = ref([]);
// The movements the server refused on this device: the cashier's own, every cashier's for a till manager.
const refused = ref([]);
const setAsideOpen = ref(false);
const setAsideReason = ref("");
const setAsideMessage = ref("");
const settingAside = ref(false);
let setAsideRow = null;
const noCache = ref(false);
const loading = ref(false);
const selectedTemplate = ref(null);
const amount = ref(null);
const note = ref("");
const noVat = ref(false);
const searchQuery = ref("");
const submitting = ref(false);
const cancelling = ref("");
const amountInput = ref(null);
const photoInput = ref(null);
const photo = ref(null);
const photoPreview = ref("");
const photoError = ref("");
const confirmOpen = ref(false);
const confirmMessage = ref("");
let confirmEntry = null;

// Computed
const templates = computed(() => data.value?.templates || []);
const unusable = computed(() => data.value?.unusable || []);
const movements = computed(() => data.value?.movements || []);
const queuedTotals = computed(() => pendingCashTotals(pending.value));

const totalIn = computed(
	() =>
		movements.value.filter((e) => e.direction === "in").reduce((sum, e) => sum + (e.amount || 0), 0) +
		queuedTotals.value.in,
);

const totalOut = computed(
	() =>
		movements.value.filter((e) => e.direction === "out").reduce((sum, e) => sum + (e.amount || 0), 0) +
		queuedTotals.value.out,
);

const remainingOut = computed(() =>
	getCashOutRemaining({
		outLimit: data.value?.out_limit,
		outTotal: data.value?.out_total,
		pendingOut: queuedTotals.value.out,
	}),
);

const filteredTemplates = computed(() => {
	const q = searchQuery.value.trim().toLowerCase();
	if (!q) return templates.value;
	return templates.value.filter((t) =>
		`${t.template_title || t.name} ${t.account || ""}`.toLowerCase().includes(q),
	);
});

// Methods
function isOut(template) {
	// The server reads it from what the template does to the till's cash account: the screen never guesses.
	return template?.direction === "out";
}

function formatAmount(val) {
	//// Neoffice — the site's number format (System Settings, CHF 1'234.50 on a Swiss site) as everywhere on the till, see utils/currency.js (product owner, 2026-10-28) (was toFixed(2), no group separators).
	return formatCurrencyNumber(Number.parseFloat(val || 0) || 0);
}

function pendingLabel(row) {
	if (row.server_journal_entry) return __("Recorded; the photo is sent when the network is back");
	if (row.sync_failed) return __("Not booked yet, sent again later: {0}", [row.error || ""]);
	return __("Waiting to be sent");
}

// Where a refused movement comes from, when it is not this shift's or this cashier's.
function refusedOrigin(row) {
	const parts = [];
	if (row.data?.pos_opening_shift && row.data.pos_opening_shift !== props.posOpeningShift) {
		parts.push(__("Shift {0}", [row.data.pos_opening_shift]));
	}
	if (row.user && row.user !== sessionUserId()) parts.push(row.user);
	return parts.join(" · ");
}

function resetForm() {
	amount.value = null;
	note.value = "";
	noVat.value = false;
	clearPhoto();
}

function selectTemplate(template) {
	selectedTemplate.value = template;
	resetForm();
	nextTick(() => amountInput.value?.focus());
}

function clearPhoto() {
	if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
	photo.value = null;
	photoPreview.value = "";
	photoError.value = "";
	if (photoInput.value) photoInput.value.value = "";
}

function onPhotoChosen(event) {
	const file = event.target.files?.[0];
	clearPhoto();
	if (!file) return;
	const maxSize = data.value?.max_file_size;
	const problem = cashMovementAttachmentProblem(file, maxSize);
	if (problem === "type") {
		photoError.value = __("This file type is not accepted: take a photo or choose a PDF.");
	} else if (problem === "size") {
		photoError.value = __("This file is too large (maximum {0} MB).", [
			Math.round(((Number(maxSize) || 10 * 1024 * 1024) / 1048576) * 10) / 10,
		]);
	} else if (problem === "empty") {
		photoError.value = __("This file is empty.");
	}
	if (problem) return;
	photo.value = { name: file.name, type: file.type, size: file.size, blob: file };
	if (file.type?.startsWith("image/")) photoPreview.value = URL.createObjectURL(file);
}

async function loadPending() {
	pending.value = await getPendingCashMovements(props.posOpeningShift);
	const manager = Boolean(data.value?.is_till_manager);
	refused.value = await getRefusedCashMovements({
		user: manager ? null : sessionUserId(),
		withKeptForManager: manager,
	});
}

async function loadData() {
	if (!props.posOpeningShift) return;
	loading.value = true;
	noCache.value = false;
	try {
		if (isOffline.value) {
			data.value = await getCashMovementDialogCache(props.posProfile, props.posOpeningShift);
			noCache.value = !data.value;
		} else {
			try {
				data.value = await call("pos_next.api.cash_entry.get_cash_movement_dialog_data", {
					pos_opening_shift: props.posOpeningShift,
				});
				await cacheCashMovementDialogData(
					props.posProfile,
					props.posOpeningShift,
					JSON.parse(JSON.stringify(data.value)),
				);
			} catch (error) {
				if (!isTransientError(error)) throw error;
				data.value = await getCashMovementDialogCache(props.posProfile, props.posOpeningShift);
				noCache.value = !data.value;
			}
		}
		await loadPending();
	} catch (error) {
		showError(error?.messages?.[0] || __("Failed to load cash entries"));
	} finally {
		loading.value = false;
	}
}

async function submitEntry() {
	const template = selectedTemplate.value;
	if (!template || !amount.value || amount.value <= 0 || submitting.value || photoError.value) return;
	submitting.value = true;
	try {
		const result = await recordCashMovement({
			movement: {
				pos_opening_shift: props.posOpeningShift,
				pos_profile: props.posProfile,
				template_name: template.name,
				template_title: template.template_title || template.name,
				direction: template.direction,
				amount: amount.value,
				remark: note.value,
				no_vat: template.no_vat_allowed && noVat.value ? 1 : 0,
			},
			attachment: photo.value,
			limits: {
				out_limit: data.value?.out_limit,
				out_total: data.value?.out_total,
				max_file_size: data.value?.max_file_size,
			},
			offline: isOffline.value,
		});
		const dirLabel = isOut(template) ? __("Cash Out") : __("Cash In");
		if (result.queued) {
			showWarning(__("{0} kept on this device: it is sent when the network is back.", [dirLabel]));
		} else {
			showSuccess(__("{0}: {1} recorded ({2})", [dirLabel, formatAmount(result.amount), result.name]));
			if (result.attachment_queued) {
				showWarning(__("The photo of the receipt is sent when the network is back."));
			} else if (result.attachment_error) {
				showError(__("The photo of the receipt was not attached: {0}", [result.attachment_error]));
			}
		}
		selectedTemplate.value = null;
		resetForm();
		await syncStore.updatePendingCount();
		await loadData();
	} catch (error) {
		if (error?.code === "limit") {
			showError(
				__("This cash out exceeds what the till may still take out during this shift ({0}).", [
					formatAmount(error.remaining),
				]),
			);
		} else {
			showError(error?.messages?.[0] || __("Failed to create cash entry"));
		}
	} finally {
		submitting.value = false;
	}
}

// « Send again »: back in the sending loop, then sent at once when it is this cashier's (another cashier's
// movement waits for their session).
async function sendAgain(row) {
	await resendRefusedCashMovement(row.id);
	if (!isOffline.value) await syncOfflineCashMovements();
	await syncStore.updatePendingCount();
	await loadData();
}

async function keepForManager(row) {
	await keepRefusedCashMovementForManager(row.id);
	await loadPending();
}

function askSetAside(row) {
	setAsideRow = row;
	setAsideReason.value = "";
	setAsideMessage.value = __(
		"{0} of {1} never reached the books. Discarded, it leaves this device; the reason is written on its shift, so the cash stays traceable.",
		[row.data.template_title, formatAmount(row.data.amount)],
	);
	setAsideOpen.value = true;
}

async function setAsideConfirmed() {
	const row = setAsideRow;
	const reason = setAsideReason.value.trim();
	if (!row || !reason || settingAside.value) return;
	settingAside.value = true;
	try {
		const result = await setAsideRefusedCashMovement(row.id, reason);
		setAsideOpen.value = false;
		setAsideRow = null;
		if (result?.booked) {
			showSuccess(__("This movement was booked after all ({0}).", [result.booked]));
		} else {
			showSuccess(__("Discarded; the reason is kept on shift {0}.", [row.data.pos_opening_shift]));
		}
		await syncStore.updatePendingCount();
		await loadData();
	} catch (error) {
		showError(error?.messages?.[0] || error?.message || __("Failed to discard the movement"));
	} finally {
		settingAside.value = false;
	}
}

async function deletePending(row) {
	try {
		await deleteOfflineCashMovement(row.id);
		await syncStore.updatePendingCount();
		await loadPending();
	} catch (error) {
		showError(error?.message || __("Failed to delete"));
	}
}

function askCancel(entry) {
	confirmEntry = entry;
	confirmMessage.value = __(
		"{0} of {1} is cancelled in the books: the drawer counts it no more. This cannot be undone at the till.",
		[entry.template, formatAmount(entry.amount)],
	);
	confirmOpen.value = true;
}

async function cancelConfirmed() {
	const entry = confirmEntry;
	confirmOpen.value = false;
	confirmEntry = null;
	if (!entry) return;
	// A manager's PIN when a « Void Cash Movement » rule applies to this till; nothing asked otherwise.
	const grant = await requireAuthorization(VOID_ACTION, {
		pos_profile: props.posProfile,
		journal_entry: entry.name,
		amount: Number.parseFloat(entry.amount) || 0,
		currency: props.currency,
	});
	if (!grant) return;
	cancelling.value = entry.name;
	try {
		await call("pos_next.api.cash_entry.cancel_cash_entry", {
			journal_entry: entry.name,
			authorization_token: grant.grant_token || undefined,
		});
		showSuccess(__("Cash movement {0} cancelled", [entry.name]));
		await loadData();
	} catch (error) {
		showError(error?.messages?.[0] || __("Failed to cancel the cash movement"));
	} finally {
		cancelling.value = "";
	}
}

function onQueueSynced() {
	if (open.value) loadData();
}

// Load data when dialog opens
watch(open, (val) => {
	if (val) {
		selectedTemplate.value = null;
		resetForm();
		searchQuery.value = "";
		loadData();
	} else {
		clearPhoto();
	}
});

onMounted(() => window.addEventListener("offlineCashMovementsSynced", onQueueSynced));
onBeforeUnmount(() => {
	window.removeEventListener("offlineCashMovementsSynced", onQueueSynced);
	clearPhoto();
});
</script>
