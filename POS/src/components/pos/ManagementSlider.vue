<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// Neoffice — upstream's sidebar is a retail one. The fork sells this POS to restaurants, so
  //// the rail gained a Cash In/Out button backed by Journal Entry Templates (6c598630,
  //// 2026-03-28) and, behind restaurantStore.isEnabled, Cards, Product Options and Workflows
  //// (60d432a2, 2026-03-23), Tips (c4460c61, 2026-03-29) and Reservations (ebc3ecc5,
  //// 2026-03-29). Nothing upstream shows was removed; the restaurant block is additive.
  //// restaurant sidebar buttons for Cards, Product Options, Workflows — 60d432a + c4460c6 (+2 more)
-->
<template>
	<!-- Icon-Only Sidebar - Hidden on Mobile, Visible on Desktop -->
	<div class="hidden lg:flex w-16 flex-shrink-0 bg-white border-e border-gray-200 flex-col items-center py-4 flex flex-col gap-2">
		<!-- Promotions -->
		<button
			@click="handleMenuClick('promotions')"
			:class="[
				'w-12 h-12 rounded-lg flex items-center justify-center transition-all relative group',
				activeMenu === 'promotions'
					? 'bg-green-100 text-green-600'
					: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
			]"
			:title="__('Promotions')"
		>
			<FeatherIcon name="tag" class="w-5 h-5" />
			<div class="absolute start-full ms-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
				{{ __('Promotions') }}
			</div>
		</button>

		<!-- Products -->
		<button
			@click="handleMenuClick('products')"
			:class="[
				'w-12 h-12 rounded-lg flex items-center justify-center transition-all relative group',
				activeMenu === 'products'
					? 'bg-purple-100 text-purple-600'
					: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
			]"
			:title="__('Products')"
		>
			<FeatherIcon name="package" class="w-5 h-5" />
			<div class="absolute start-full ms-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
				{{ __('Products') }}
			</div>
		</button>

		<!-- Invoices -->
		<button
			@click="handleMenuClick('invoices')"
			:class="[
				'w-12 h-12 rounded-lg flex items-center justify-center transition-all relative group',
				activeMenu === 'invoices'
					? 'bg-indigo-100 text-indigo-600'
					: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
			]"
			:title="__('Invoice Management')"
		>
			<FeatherIcon name="file-text" class="w-5 h-5" />
			<div class="absolute start-full ms-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
				{{ __('Invoice Management') }}
			</div>
		</button>

		<!-- //// Neoffice — added block: the sidebar entries upstream POSNext has no feature behind. -->
		<!-- //// Cash In/Out is always there (6c598630, 2026-03-28, Journal Entry Templates); Cards, -->
		<!-- //// Product Options and Workflows (60d432a2, 2026-03-23), Tips (c4460c61, 2026-03-29) -->
		<!-- //// and Reservations (ebc3ecc5, 2026-03-29) are gated on the restaurant store, so a -->
		<!-- //// retail till keeps upstream's bare sidebar. -->
		<!-- Cash In/Out -->
		<button
			@click="handleMenuClick('cash-entry')"
			:class="[
				'w-12 h-12 rounded-lg flex items-center justify-center transition-all relative group',
				activeMenu === 'cash-entry'
					? 'bg-orange-100 text-orange-600'
					: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
			]"
			:title="__('Cash In/Out')"
		>
			<FeatherIcon name="dollar-sign" class="w-5 h-5" />
			<div class="absolute start-full ms-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
				{{ __('Cash In/Out') }}
			</div>
		</button>

		<!-- Restaurant section (only in restaurant mode) -->
		<template v-if="isRestaurantMode">
			<!-- Divider -->
			<div class="w-8 border-t border-gray-200 my-1"></div>

			<!-- Cards / Menu -->
			<button
				@click="handleMenuClick('cards')"
				:class="[
					'w-12 h-12 rounded-lg flex items-center justify-center transition-all relative group',
					activeMenu === 'cards'
						? 'bg-amber-100 text-amber-600'
						: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
				]"
				:title="__('Cards')"
			>
				<FeatherIcon name="list" class="w-5 h-5" />
				<div class="absolute start-full ms-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
					{{ __('Cards') }}
				</div>
			</button>

			<!-- Product Options -->
			<button
				@click="handleMenuClick('options')"
				:class="[
					'w-12 h-12 rounded-lg flex items-center justify-center transition-all relative group',
					activeMenu === 'options'
						? 'bg-teal-100 text-teal-600'
						: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
				]"
				:title="__('Product Options')"
			>
				<FeatherIcon name="sliders" class="w-5 h-5" />
				<div class="absolute start-full ms-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
					{{ __('Product Options') }}
				</div>
			</button>

			<!-- Workflows -->
			<button
				@click="handleMenuClick('workflows')"
				:class="[
					'w-12 h-12 rounded-lg flex items-center justify-center transition-all relative group',
					activeMenu === 'workflows'
						? 'bg-cyan-100 text-cyan-600'
						: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
				]"
				:title="__('Workflows')"
			>
				<FeatherIcon name="git-branch" class="w-5 h-5" />
				<div class="absolute start-full ms-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
					{{ __('Workflows') }}
				</div>
			</button>

			<!-- Tips -->
			<button
				v-if="isTipsEnabled"
				@click="handleMenuClick('tips')"
				:class="[
					'w-12 h-12 rounded-lg flex items-center justify-center transition-all relative group',
					activeMenu === 'tips'
						? 'bg-pink-100 text-pink-600'
						: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
				]"
				:title="__('Tips')"
			>
				<FeatherIcon name="heart" class="w-5 h-5" />
				<div class="absolute start-full ms-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
					{{ __('Tips') }}
				</div>
			</button>

			<!-- Reservations -->
			<button
				v-if="isRestaurantMode"
				@click="handleMenuClick('reservations')"
				:class="[
					'w-12 h-12 rounded-lg flex items-center justify-center transition-all relative group',
					activeMenu === 'reservations'
						? 'bg-blue-100 text-blue-600'
						: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
				]"
				:title="__('Reservations')"
			>
				<FeatherIcon name="calendar" class="w-5 h-5" />
				<div class="absolute start-full ms-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
					{{ __('Reservations') }}
				</div>
			</button>
		</template>

		<!-- Spacer to push settings to bottom -->
		<div class="flex-1"></div>

		<!-- Divider -->
		<div class="w-8 border-t border-gray-200 my-2"></div>

		<!-- Settings -->
		<button
			@click="handleMenuClick('settings')"
			:class="[
				'w-12 h-12 rounded-lg flex items-center justify-center transition-all relative group',
				activeMenu === 'settings'
					? 'bg-gray-100 text-gray-900'
					: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
			]"
			:title="__('Settings')"
		>
			<FeatherIcon name="settings" class="w-5 h-5" />
			<div class="absolute start-full ms-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
				{{ __('Settings') }}
			</div>
		</button>
	</div>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
//// Neoffice — computed and the restaurant store: the sidebar has to hide its restaurant
//// entries on a retail till (60d432a2, 2026-03-23 "restaurant sidebar buttons for Cards,
//// Product Options, Workflows"). Upstream only needs ref here.
import { ref, computed } from "vue"
import { useRestaurantStore } from "@/stores/restaurant"

//// Neoffice — restaurant store, which drives the visibility of the entries added above
//// (60d432a2, 2026-03-23). Upstream POSNext has no restaurant mode.
const restaurantStore = useRestaurantStore()
const emit = defineEmits(["menu-clicked"])

const activeMenu = ref("")
//// Neoffice — gates for the added sidebar entries: restaurant mode for Cards, Product
//// Options, Workflows and Reservations (60d432a2, 2026-03-23), and the tips toggle of
//// Restaurant Settings for the Tips panel (c4460c61, 2026-03-29 "record guest tips in
//// Restaurant Tip + Tips panel in POS sidebar").
const isRestaurantMode = computed(() => restaurantStore.isEnabled)
const isTipsEnabled = computed(() => restaurantStore.tipsEnabled)

function handleMenuClick(menuItem) {
	activeMenu.value = menuItem
	emit("menu-clicked", menuItem)
}
</script>
