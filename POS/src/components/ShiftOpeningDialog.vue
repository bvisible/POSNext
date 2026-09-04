<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// Neoffice — upstream opens every shift on an empty drawer. A Swiss shop leaves a float in
  //// the till overnight, so the dialog asks the server what the previous closing kept back
  //// (pos_next.api.shifts.get_suggested_opening_balance), pre-fills the cash Mode of Payment
  //// with it and says where the figure comes from; the spinner was widened to cover that
  //// second call so the amount cannot change under the cashier's fingers, and the fetch is
  //// best effort so it can never block opening a shift (5783eb27, 2026-03-28).
  //// cash withdrawal at shift closing with suggested opening balance — 5783eb2
-->
<template>
  <Dialog v-model="open" :options="{ title: __('Open POS Shift'), size: 'xl' }">
    <template #body-content>
      <div class="flex flex-col gap-6">
        <!-- Step 1: Select POS Profile -->
        <div v-if="step === 1" class="flex flex-col gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2 text-start">
              {{ __('Select POS Profile') }}
            </label>
            <div v-if="profilesResource.loading" class="text-center py-4">
              <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
            <div v-else-if="profilesResource.data && profilesResource.data.length > 0" class="grid grid-cols-1 gap-3">
              <div
                v-for="profile in profilesResource.data"
                :key="profile.name"
                @click="selectPosProfile(profile)"
                :class="[
                  'p-4 border rounded-lg cursor-pointer transition-all',
                  selectedProfile?.name === profile.name
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                ]"
              >
                <div class="flex justify-between items-start">
                  <div class="text-start">
                    <h3 class="font-medium text-gray-900">{{ profile.name }}</h3>
                    <p class="text-sm text-gray-500 mt-1">{{ profile.company }}</p>
                  </div>
                  <span class="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {{ profile.currency }}
                  </span>
                </div>
              </div>
            </div>
            <div v-else class="text-center py-8 text-gray-500">
              <p>{{ __('No POS Profiles available. Please contact your administrator.') }}</p>
            </div>
          </div>

          <div v-if="profilesResource.error" class="rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-800">{{ profilesResource.error }}</p>
          </div>
        </div>

        <!-- Step 2: Enter Opening Balances -->
        <div v-if="step === 2" class="flex flex-col gap-4">
          <div class="mb-4">
            <div class="flex items-center justify-between">
              <div class="text-start">
                <h3 class="font-medium text-gray-900">{{ selectedProfile?.name }}</h3>
                <p class="text-sm text-gray-500">{{ selectedProfile?.company }}</p>
              </div>
              <Button variant="subtle" @click="step = 1">{{ __('Change Profile') }}</Button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-3 text-start">
              {{ __('Opening Balance (Optional)') }}
            </label>

            <!-- //// Neoffice — the spinner must also cover the suggested-balance call: otherwise the -->
            <!-- //// payment list rendered with empty amounts and the suggestion arrived afterwards, so -->
            <!-- //// the cashier saw the field change under their fingers (5783eb27, 2026-03-28 "cash -->
            <!-- //// withdrawal at shift closing with suggested opening balance"). -->
            <div v-if="dialogDataResource.loading || suggestedBalanceResource.loading" class="text-center py-4">
              <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>

            <div v-else-if="paymentMethods.length > 0" class="flex flex-col gap-3">
              <div
                v-for="method in paymentMethods"
                :key="method.name"
                class="flex items-center gap-3 p-3 border rounded-lg"
              >
                <div class="flex-1 text-start">
                  <label class="text-sm font-medium text-gray-700">
                    {{ method.mode_of_payment }}
                  </label>
                  <!-- //// Neoffice — says where the pre-filled amount comes from: it is what the previous -->
                  <!-- //// shift left in the drawer after its closing withdrawal, not something anyone typed -->
                  <!-- //// (5783eb27, 2026-03-28). -->
                  <p v-if="suggestedCashMode === method.mode_of_payment && suggestedAmount > 0" class="text-xs text-blue-600 mt-0.5">
                    {{ __('Suggested from last shift: {0}', [suggestedAmount]) }}
                  </p>
                </div>
                <div class="w-32">
                  <Input
                    v-model="openingBalances[method.mode_of_payment]"
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
            </div>

            <div v-else class="text-center py-4 text-gray-500">
              <p class="text-sm">{{ __('No payment methods configured for this POS Profile') }}</p>
            </div>
          </div>

          <div v-if="dialogDataResource.error" class="rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-800">{{ dialogDataResource.error }}</p>
          </div>

          <div v-if="createShiftResource.error" class="rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-800">{{ createShiftResource.error }}</p>
          </div>
        </div>

        <!-- Step 3: Resume or Open New -->
        <div v-if="step === 3" class="flex flex-col gap-4">
          <div class="text-center">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
              <svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">{{ __('Existing Shift Found') }}</h3>
            <p class="text-sm text-gray-500 mb-6">
              {{ __('You have an open shift. Would you like to resume it or close it and open a new one?') }}
            </p>

            <div v-if="existingShift" class="bg-gray-50 rounded-lg p-4 mb-6">
              <div class="text-sm text-gray-600">
                  <TranslatedHTML
                    :tag="'p'"
                    :inner="__('&lt;strong&gt;POS Profile:&lt;/strong&gt; {0}', [existingShift.pos_profile?.name])"
                  />
                  <div class="h-2"></div>
                  <TranslatedHTML
                    :tag="'p'"
                    :inner="__('&lt;strong&gt;Opened:&lt;/strong&gt; {0}', [formatDateTime(existingShift.pos_opening_shift?.period_start_date)])"
                  />
              </div>
            </div>

            <div class="flex gap-3 justify-center">
              <Button variant="solid" theme="blue" @click="resumeShift">
                {{ __('Resume Shift') }}
              </Button>
              <Button
                variant="subtle"
                theme="gray"
                @click="closeAndOpenNew"
                :disabled="closingExistingShift"
              >
                {{ __('Close & Open New') }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #actions>
      <div class="flex justify-between w-full">
        <Button v-if="step > 1 && step !== 3" variant="subtle" @click="step--">
          {{ __('Back') }}
        </Button>
        <div v-else></div>

        <div class="flex gap-2">
          <Button variant="subtle" @click="closeDialog('cancelled')" :disabled="createShiftResource.loading">
            {{ __('Cancel') }}
          </Button>
          <Button
            v-if="step === 1"
            variant="solid"
            theme="blue"
            @click="nextStep"
            :disabled="!selectedProfile"
          >
            {{ __('Next') }}
          </Button>
          <Button
            v-if="step === 2"
            variant="solid"
            theme="blue"
            @click="openShift"
            :loading="createShiftResource.loading"
          >
            {{ __('Open Shift') }}
          </Button>
        </div>
      </div>
    </template>
  </Dialog>

  <ShiftClosingDialog
    v-if="existingShift"
    v-model="showClosingDialog"
    :opening-shift="existingShift?.pos_opening_shift?.name"
    @shift-closed="handleExistingShiftClosed"
  />
</template>

<script setup>
import { Button, Dialog, Input } from "frappe-ui"
import { createResource } from "frappe-ui"
import { computed, ref, watch } from "vue"
import { useShift } from "../composables/useShift"
import { useFormatters } from "../composables/useFormatters"
import ShiftClosingDialog from "./ShiftClosingDialog.vue"
import TranslatedHTML from "./common/TranslatedHTML.vue"

const props = defineProps({
	modelValue: Boolean,
})

const emit = defineEmits(["update:modelValue", "shift-opened", "dialog-closed"])

const open = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
})

const { createOpeningShift, getOpeningDialogData, checkOpeningShift } =
	useShift()
const { formatDateTime } = useFormatters()

const step = ref(1)
const selectedProfile = ref(null)
const openingBalances = ref({})
const existingShift = ref(null)
const showClosingDialog = ref(false)
const closingExistingShift = ref(false)
const restartProfileName = ref(null)
//// Neoffice — what the last closing left in the drawer, and for which Mode of Payment
//// (5783eb27, 2026-03-28).
const suggestedAmount = ref(0)
const suggestedCashMode = ref("")

// Get POS Profiles
const profilesResource = createResource({
	url: "pos_next.api.pos_profile.get_pos_profiles",
	auto: false,
})

// Get dialog data (payment methods)
const dialogDataResource = createResource({
	url: "pos_next.api.shifts.get_opening_dialog_data",
	auto: false,
})

//// Neoffice — upstream opens every shift at zero. A Swiss shop leaves a float in the
//// till overnight, so we ask the server what the last closing kept back and propose it
//// (5783eb27, 2026-03-28 "cash withdrawal at shift closing with suggested opening
//// balance").
// Get suggested opening balance from last closing shift
const suggestedBalanceResource = createResource({
	url: "pos_next.api.shifts.get_suggested_opening_balance",
	auto: false,
})

// Create shift resource
const createShiftResource = createOpeningShift

// Computed payment methods for selected profile
const paymentMethods = computed(() => {
	if (!dialogDataResource.data || !selectedProfile.value) return []

	return (dialogDataResource.data.payments_method || []).filter(
		(method) => method.parent === selectedProfile.value.name,
	)
})

// Watch dialog open state
// Use { immediate: true } to ensure initDialog runs even when
// the component mounts with open already true (e.g., after logout with dialog open)
watch(
	open,
	(isOpen) => {
		if (isOpen) {
			initDialog()
		} else {
			resetDialog()
		}
	},
	{ immediate: true },
)

watch(showClosingDialog, (isOpen) => {
	closingExistingShift.value = isOpen
	if (!isOpen && existingShift.value) {
		restartProfileName.value = null
	}
})

async function initDialog() {
	step.value = 1
	selectedProfile.value = null
	existingShift.value = null
	openingBalances.value = {}
	dialogDataResource.reset()

	try {
		// Await profile fetch to ensure data is loaded before proceeding
		await profilesResource.fetch()

		// Check if user already has an open shift
		const checkResult = await checkOpeningShift.fetch()
		if (checkResult) {
			existingShift.value = checkResult
			step.value = 3
		}
	} catch (error) {
		console.error("Error initializing shift dialog:", error)
		// Error will be displayed via profilesResource.error in the UI
	}
}

function resetDialog() {
	step.value = 1
	selectedProfile.value = null
	openingBalances.value = {}
	existingShift.value = null
	profilesResource.reset()
	dialogDataResource.reset()
	createShiftResource.reset()
}

function selectPosProfile(profile) {
	selectedProfile.value = profile
}

async function nextStep() {
	if (step.value === 1 && selectedProfile.value) {
		await dialogDataResource.fetch()

		//// Neoffice — pre-fills the cash opening balance from the last closing. Best effort: a
		//// failure here must never stop the cashier from opening the shift, hence the silent
		//// catch (5783eb27, 2026-03-28).
		// Fetch suggested opening balance from last closing shift
		suggestedAmount.value = 0
		suggestedCashMode.value = ""
		try {
			const result = await suggestedBalanceResource.submit({
				pos_profile: selectedProfile.value.name,
			})
			if (result) {
				suggestedAmount.value = result.suggested_amount || 0
				suggestedCashMode.value = result.cash_mode_of_payment || ""
				// Pre-fill the cash opening balance
				if (suggestedAmount.value > 0 && suggestedCashMode.value) {
					openingBalances.value[suggestedCashMode.value] = suggestedAmount.value
				}
			}
		} catch {
			// Suggestion is optional, don't block opening
		}

		step.value = 2
	}
}

async function openShift() {
	if (!selectedProfile.value) return

	// Prepare balance details
	const balance_details = paymentMethods.value.map((method) => ({
		mode_of_payment: method.mode_of_payment,
		opening_amount: Number.parseFloat(
			openingBalances.value[method.mode_of_payment] || 0,
		),
	}))

	try {
		await createShiftResource.submit({
			pos_profile: selectedProfile.value.name,
			company: selectedProfile.value.company,
			balance_details,
		})

		emit("shift-opened")
		closeDialog("shift-opened")
	} catch (error) {
		console.error("Error opening shift:", error)
	}
}

function resumeShift() {
	emit("shift-opened")
	closeDialog("resumed")
}

function closeAndOpenNew() {
	if (!existingShift.value?.pos_opening_shift?.name) {
		return
	}

	restartProfileName.value = existingShift.value.pos_profile?.name || null
	showClosingDialog.value = true
}

function closeDialog(reason) {
	open.value = false
	emit("dialog-closed", { reason })
}

async function handleExistingShiftClosed() {
	showClosingDialog.value = false
	const profileToRestore = restartProfileName.value
	restartProfileName.value = null
	existingShift.value = null
	step.value = 1
	openingBalances.value = {}

	await checkOpeningShift.fetch()

	if (!profilesResource.data || profilesResource.data.length === 0) {
		await profilesResource.fetch()
	}

	if (profileToRestore) {
		const matchedProfile = profilesResource.data?.find(
			(profile) => profile.name === profileToRestore,
		)

		if (matchedProfile) {
			selectedProfile.value = matchedProfile
			await dialogDataResource.fetch()
			step.value = 2
		}
	}
}
</script>
