<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Scanning in the shop (lot 3, board 7 of the canvas): the carts -->
	<!-- //// of the till's phones still to be sold, above its held invoices, so that a seller finds one without its code. -->
	<!-- //// Each says its code, its customer, its articles and amount, since when, and where it stands; « Take over » -->
	<!-- //// puts it in the till's cart as its code would (useShopCart). Shown only where the till takes phones' carts. -->
	<section v-if="carts.length" class="flex flex-col gap-2" :aria-label="__('Carts of the phones')">
		<h3 class="text-sm font-semibold text-gray-900">{{ __("Carts of the phones") }}</h3>
		<ul class="flex flex-col gap-2">
			<li
				v-for="cart in carts"
				:key="cart.code"
				class="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3"
			>
				<div class="flex-1 min-w-0">
					<p class="text-sm text-gray-900 flex flex-wrap items-baseline gap-x-2">
						<strong class="font-mono">{{ cart.code }}</strong>
						<span dir="auto" class="truncate">{{ cart.customer_name || cart.customer }}</span>
					</p>
					<p class="text-xs text-gray-600 mt-0.5 tabular-nums">
						{{ __("{0} articles · {1}", [cart.articles, money(cart)]) }} · {{ timeOf(cart.since) }}
					</p>
				</div>
				<span :class="['shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold', stateOf(cart).tone]">
					{{ stateOf(cart).label }}
				</span>
				<Button variant="solid" :loading="takingOver === cart.code" @click="takeOverTheCart(cart)">
					{{ __("Take over") }}
				</Button>
			</li>
		</ul>
	</section>
</template>

<script setup>
import { useShopCart } from "@/composables/useShopCart"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { usePOSShiftStore } from "@/stores/posShift"
import { call } from "@/utils/apiWrapper"
import { formatCurrency } from "@/utils/currency"
import { Button } from "frappe-ui"
import { onMounted, ref } from "vue"

const emit = defineEmits(["taken-over"])

// The stores are read when the list is asked for, not when the drafts dialog is set up: a dialog of a till that takes no
// phone's cart asks nothing of them
const { takeOver } = useShopCart()

const carts = ref([])
const takingOver = ref(null)

function money(cart) {
	return formatCurrency(
		cart.grand_total,
		cart.currency || usePOSShiftStore().profileCurrency || undefined,
	)
}

/** The hour the cart was started, on the site's clock the server writes it in (« 14:31 »). */
function timeOf(since) {
	return String(since || "").slice(11, 16)
}

/** Where the cart stands, as the planche of the canvas says it: the customer still scanning, an article to check, or to pay. */
function stateOf(cart) {
	if (cart.status === "Scanning") {
		return {
			label: __("The customer is still scanning"),
			tone: "bg-gray-100 text-gray-700",
		}
	}
	if (cart.needs_validation) {
		return {
			label: __("An article to check"),
			tone: "bg-amber-50 text-amber-800",
		}
	}
	return { label: __("To be paid"), tone: "bg-orange-50 text-orange-800" }
}

async function load() {
	const shiftStore = usePOSShiftStore()
	if (
		!usePOSSettingsStore().settings.enable_shop_scan ||
		!shiftStore.profileName
	)
		return
	try {
		carts.value =
			(await call("pos_next.api.shop_scan.list_shop_carts", {
				pos_profile: shiftStore.profileName,
			})) || []
	} catch (error) {
		// The till's held invoices still show: the list of the phones' carts is an extra
		console.error("Shop carts list error:", error)
		carts.value = []
	}
}

async function takeOverTheCart(cart) {
	takingOver.value = cart.code
	try {
		await takeOver(cart.code)
		// Taken over: the till's cart is now that cart's draft (refused over a cart in progress: the dialog stays open)
		if (usePOSCartStore().shopCartInvoice === cart.invoice)
			emit("taken-over", cart)
	} finally {
		takingOver.value = null
	}
}

onMounted(load)
</script>
