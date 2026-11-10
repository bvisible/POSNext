<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Book an appointment at the till (NeoSalon, step 2, lot G4, plan « Le mode salon de la caisse », board 5): the customer, the services (with their -->
	<!-- //// options, as a plate has its supplements), the person or « whoever », and a free slot the reservation offers. The reservation lane knows what can be booked and when: the till does not guess. -->
	<Dialog v-model="show" :options="{ title: __('New appointment'), size: '2xl' }">
		<template #body-content>
			<div class="space-y-4" data-test="new-dialog">
				<div class="space-y-1.5">
					<label class="text-sm font-semibold text-gray-800 dark:text-gray-100" for="new-customer">{{ __("Customer") }}</label>
					<div v-if="customer" class="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800" data-test="new-customer-chosen">
						<b dir="auto" class="min-w-0 flex-1 truncate text-[15px] text-gray-900 dark:text-gray-100">{{ customer.customer_name || customer.name }}</b>
						<span v-if="customer.mobile_no" class="text-sm text-gray-500">{{ customer.mobile_no }}</span>
						<button type="button" class="text-sm font-semibold text-blue-700 dark:text-blue-300" @click="customer = null">{{ __("Change") }}</button>
					</div>
					<template v-else>
						<input id="new-customer" v-model="query" type="search" autocomplete="off" data-test="new-customer-search" :placeholder="__('Name or mobile')" class="min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 text-[15px] dark:border-gray-600 dark:bg-gray-800" />
						<ul v-if="choices.length" class="max-h-44 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
							<li v-for="row in choices" :key="row.name">
								<button type="button" :data-test="`new-customer-${row.name}`" class="flex min-h-[44px] w-full items-center gap-3 px-3 text-start text-[15px] hover:bg-gray-50 dark:hover:bg-gray-800" @click="pickCustomer(row)">
									<b dir="auto" class="min-w-0 flex-1 truncate">{{ row.customer_name || row.name }}</b>
									<span class="text-sm text-gray-500">{{ row.mobile_no || "" }}</span>
								</button>
							</li>
						</ul>
					</template>
				</div>

				<div class="space-y-1.5">
					<div class="text-sm font-semibold text-gray-800 dark:text-gray-100">{{ __("Services") }}</div>
					<p v-if="loadingServices" class="text-sm text-gray-500">{{ __("Loading...") }}</p>
					<p v-else-if="!services.length" class="text-sm text-gray-500" data-test="new-no-services">{{ __("No service can be booked at this till.") }}</p>
					<div v-else class="flex flex-wrap gap-2" role="group">
						<button v-for="service in services" :key="service.item_code" type="button" :data-test="`new-service-${service.item_code}`" class="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border px-3 text-[15px]" :class="chosen(service) ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-400/15 dark:text-blue-100' : 'border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'" @click="toggle(service)">
							{{ service.label }} <span class="text-xs text-gray-500">{{ money(service.price) }}</span>
						</button>
					</div>
					<div v-for="pick in picks" :key="pick.service.item_code" class="space-y-1">
						<div v-for="group in pick.service.options" :key="group.group" class="flex flex-wrap items-center gap-2">
							<span class="w-28 text-sm text-gray-600 dark:text-gray-300">{{ pick.service.label }} · {{ group.group }}</span>
							<button v-for="choice in group.choices" :key="choice.label" type="button" :data-test="`new-option-${pick.service.item_code}-${choice.label}`" class="min-h-[40px] rounded-lg border px-3 text-sm" :class="pick.options[group.group] === choice.label ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-400/15 dark:text-blue-100' : 'border-gray-300 dark:border-gray-600'" @click="pick.options[group.group] = pick.options[group.group] === choice.label && !group.required ? null : choice.label">
								{{ choice.label }}<span v-if="choice.price_delta"> {{ choice.price_delta > 0 ? "+" : "−" }}{{ Math.abs(choice.price_delta) }}</span>
							</button>
						</div>
					</div>
				</div>

				<div class="grid gap-3 sm:grid-cols-2">
					<div class="space-y-1.5">
						<div class="text-sm font-semibold text-gray-800 dark:text-gray-100">{{ __("With") }}</div>
						<div class="flex flex-wrap gap-2" role="group">
							<button type="button" data-test="new-person-any" class="min-h-[44px] rounded-[10px] border px-3 text-[15px]" :class="!person ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-400/15 dark:text-blue-100' : 'border-gray-300 dark:border-gray-600'" @click="person = null">{{ __("Whoever") }}</button>
							<button v-for="option in offered" :key="option.sales_person" type="button" :data-test="`new-person-${option.sales_person}`" class="min-h-[44px] rounded-[10px] border px-3 text-[15px]" :class="person === option.sales_person ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-400/15 dark:text-blue-100' : 'border-gray-300 dark:border-gray-600'" @click="person = option.sales_person">{{ option.sales_person_name }}</button>
						</div>
					</div>
					<label class="flex flex-col gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
						{{ __("Day") }}
						<input v-model="day" type="date" data-test="new-day" class="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-[15px] font-normal dark:border-gray-600 dark:bg-gray-800" />
					</label>
				</div>

				<div class="space-y-1.5">
					<div class="text-sm font-semibold text-gray-800 dark:text-gray-100">{{ __("Free slots") }}</div>
					<p v-if="!items.length" class="text-sm text-gray-500">{{ __("Choose a service to see the free slots.") }}</p>
					<p v-else-if="loadingSlots" class="text-sm text-gray-500">{{ __("Loading...") }}</p>
					<p v-else-if="!slots.length" class="text-sm text-gray-500" data-test="new-no-slots">{{ __("No free slot this day.") }}</p>
					<div v-else class="flex flex-wrap gap-2" role="group">
						<button v-for="slot in slots" :key="`${slot.starts_at}-${slot.sales_person}`" type="button" :data-test="`new-slot-${hourOf(slot.starts_at)}`" class="min-h-[44px] rounded-[10px] border px-3 text-[15px]" :class="slot === slotChosen ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-400/15 dark:text-blue-100' : 'border-gray-300 dark:border-gray-600'" @click="slotChosen = slot">
							{{ hourOf(slot.starts_at) }}<span v-if="slot.sales_person_name" class="text-xs text-gray-500"> · {{ slot.sales_person_name }}</span>
						</button>
					</div>
				</div>

				<label class="flex items-start gap-3 text-[15px] text-gray-900 dark:text-gray-100">
					<input v-model="notify" type="checkbox" data-test="new-notify" class="mt-1 h-5 w-5 rounded border-gray-400" />
					<span><b>{{ __("Send the confirmation to the customer") }}</b></span>
				</label>

				<div class="flex items-center justify-end gap-3 pt-1">
					<button type="button" class="min-h-[48px] rounded-xl px-4 text-[15px] font-semibold text-red-700 dark:text-red-300" @click="show = false">{{ __("Cancel") }}</button>
					<button type="button" data-test="new-confirm" class="min-h-[48px] rounded-xl bg-gray-900 px-5 text-[15px] font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900" :disabled="working || !ready" @click="submit">{{ working ? __("Loading...") : confirmText }}</button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
/**
 * Book an appointment. `start` is where the cashier pressed (`{ person, from }`: a free hour of a column, or none). emits `update:modelValue` and `booked`.
 */
import { Dialog } from "frappe-ui"
import { computed, reactive, ref, watch } from "vue"
import { useAppointment } from "@/composables/useAppointment"
import { useAppointmentsStore } from "@/stores/appointments"
import { usePOSShiftStore } from "@/stores/posShift"
import { call } from "@/utils/apiWrapper"
import { clockOf, hourOf, isOff } from "@/utils/appointments"
import { formatCurrency } from "@/utils/currency"

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	start: { type: Object, default: () => ({ person: null, from: null }) },
})
const emit = defineEmits(["update:modelValue", "booked"])

const store = useAppointmentsStore()
const shiftStore = usePOSShiftStore()
const appointment = useAppointment()

const show = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) })
const money = (amount) => formatCurrency(amount, shiftStore.profileCurrency || undefined)

const query = ref("")
const choices = ref([])
const customer = ref(null)
const services = ref([])
const loadingServices = ref(false)
// The services picked, in the order they are done, each with the options chosen: `{ service, options: { group: label } }`
const picks = ref([])
const person = ref(null)
const day = ref("")
const slots = ref([])
const slotChosen = ref(null)
const loadingSlots = ref(false)
const notify = ref(true)
const working = ref(false)
let searching = null
let asking = 0

const chosen = (service) => picks.value.some((pick) => pick.service.item_code === service.item_code)
const offered = computed(() => {
	// The people who do every service chosen (a service that names nobody is done by anybody)
	const named = picks.value.map((pick) => pick.service.people.map((p) => p.sales_person))
	return store.people.filter((option) => option.sales_person && !isOff(option) && named.every((list) => !list.length || list.includes(option.sales_person)))
})
/** What the reservation is given: the services in order, each with its options in the shape a line of the till carries them. */
const items = computed(() =>
	picks.value.map((pick) => {
		const groups = pick.service.options
			.map((group) => {
				const choice = group.choices.find((c) => c.label === pick.options[group.group])
				return choice ? { group: group.group, options: [{ name: choice.label, price_adjustment: choice.price_delta }] } : null
			})
			.filter(Boolean)
		return { item_code: pick.service.item_code, options: groups.length ? JSON.stringify(groups) : null }
	}),
)
const ready = computed(() => Boolean(customer.value && items.value.length && slotChosen.value))
const confirmText = computed(() => (slotChosen.value ? __("Book {0}", [hourOf(slotChosen.value.starts_at)]) : __("Book")))

watch(
	() => props.modelValue,
	async (open) => {
		if (!open) return
		query.value = ""
		choices.value = []
		customer.value = null
		picks.value = []
		slots.value = []
		slotChosen.value = null
		notify.value = true
		person.value = props.start?.person?.sales_person || null
		day.value = store.date
		loadingServices.value = true
		services.value = await appointment.services()
		loadingServices.value = false
	},
	{ immediate: true },
)

watch(query, (text) => {
	clearTimeout(searching)
	if (!text || text.length < 2) {
		choices.value = []
		return
	}
	searching = setTimeout(async () => {
		try {
			const answer = await call("pos_next.api.customers.get_customers", { search_term: text, pos_profile: shiftStore.profileName, limit: 8 })
			const list = answer?.message ?? answer
			choices.value = Array.isArray(list) ? list : list?.customers || []
		} catch {
			choices.value = []
		}
	}, 250)
})

function pickCustomer(row) {
	customer.value = row
	choices.value = []
}

function toggle(service) {
	const at = picks.value.findIndex((pick) => pick.service.item_code === service.item_code)
	if (at >= 0) picks.value.splice(at, 1)
	else picks.value.push(reactive({ service, options: {} }))
	if (person.value && !offered.value.some((option) => option.sales_person === person.value)) person.value = null
}

// The free slots are asked again whenever what they depend on changes
watch([items, person, day, () => props.modelValue], async () => {
	slotChosen.value = null
	slots.value = []
	if (!props.modelValue || !items.value.length || !day.value) return
	const ticket = ++asking
	loadingSlots.value = true
	const found = await appointment.slots(day.value, items.value, person.value)
	if (ticket !== asking) return
	loadingSlots.value = false
	slots.value = found
	// The hour the cashier pressed is the slot she meant, when the reservation offers it
	if (props.start?.from !== null && props.start?.from !== undefined) {
		const wanted = clockOf(props.start.from)
		slotChosen.value = found.find((slot) => hourOf(slot.starts_at) === wanted) || null
	}
})

async function submit() {
	if (working.value || !ready.value) return
	working.value = true
	const done = await appointment.book(customer.value.name, items.value, slotChosen.value.starts_at, {
		salesPerson: person.value || slotChosen.value.sales_person || null,
		notify: notify.value,
	})
	working.value = false
	if (!done) return
	await store.refresh()
	emit("booked", done)
	show.value = false
}
</script>
