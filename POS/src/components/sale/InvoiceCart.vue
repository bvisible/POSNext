<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// align POS design with Neoffice theme and improve customer display — 87f168f + e005b94 (+5 more)
  //// hide both Sales Order toggle instances in restaurant mode — b3a9d85 + 87f168f
  //// Phase 1 restaurant module - header toggle, UI cleanup, multi-room tabs — 8aa35c2 + 71050fa (+6 more)
  //// table only marked Occupied when draft invoice exists, not before — c7f6932 + 87f168f (+3 more)
  //// cart color thumbnails, image upload, and card item color propagation — 983130d
  //// modifier dialog opens correct item (findLast), remove deletes only on… — 7e1376a
  //// rounding total, tips visibility, cash quick amounts — 4fdb5df + 87f168f
  //// show remaining to collect in cart + payment dialog accounts for guest… — 214125e + 1c05e7c (+2 more)
  //// move station-item relation into Preparation Station child table, add… — 831857f + 4df0caf (+3 more)
  //// auto-open edit dialog for zero-price items (gift cards) — 5dddc52 + 87f168f
-->
<!--
  InvoiceCart.vue - Shopping Cart Component for POS System

  ============================================================================
  OVERVIEW
  ============================================================================
  This component displays the shopping cart in the POS interface, including:
  - Customer selection/search with instant in-memory filtering
  - Cart items list with quantity controls, UOM selection, and pricing
  - Offers and coupon application buttons
  - Order totals (subtotal, discount, tax, grand total)
  - Checkout and Hold order actions
  - Quick action buttons when cart is empty

  ============================================================================
  COMPONENT STRUCTURE
  ============================================================================

  1. HEADER SECTION (Customer Selection)
     - Shows selected customer info with edit/remove options
     - Search input with instant filtering from cached customer list
     - Dropdown with search results and "Create New Customer" option
     - Works offline using cached customer data

  2. ACTION BUTTONS SECTION (Offers & Coupons)
     - "Offers" button - Shows available promotional offers
     - "Coupon" button - Apply coupon/gift card codes
     - Badge indicators show count of available/applied offers

  3. CART ITEMS SECTION
     - Scrollable list of cart items
     - Each item shows: thumbnail, name, badges (free/discount), price, quantity controls
     - Quantity controls: increment/decrement buttons + manual input
     - UOM (Unit of Measure) dropdown selector
     - Serial item support with edit dialog
     - Empty cart state with quick action buttons

  4. TOTALS SECTION
     - Total Quantity
     - Subtotal
     - Discount (highlighted when applied)
     - Tax
     - Grand Total (emphasized)

  5. ACTION BUTTONS
     - Checkout - Proceed to payment
     - Hold - Save as draft order

  ============================================================================
  FEATURES
  ============================================================================

  - Offline Support: Customer search works offline using cached data
  - Instant Search: In-memory customer filtering for zero-latency results
  - Smart Quantity Steps: Automatically detects decimal precision for +/- buttons
  - UOM Conversion: Change units with automatic price recalculation
  - Serial Number Support: Special handling for serialized inventory items
  - Responsive Design: Adapts to mobile and desktop layouts
  - Touch Optimized: Large tap targets and touch feedback
  - RTL Support: Fully supports right-to-left languages

  ============================================================================
-->
<template>
	<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
	<div class="flex flex-col h-full bg-white rounded-neo-lg overflow-hidden">
		<!-- //// Neoffice — divergence map for this file. Each marker below carries a tag. -->
		<!-- //// [D] design tokens: upstream styles with stock Tailwind (rounded-lg/xl, -->
		<!-- ////     shadow-sm/lg). The fork swaps them for the Neoffice theme scale -->
		<!-- ////     (rounded-neo-*, shadow-neo-*) so the POS looks like the rest of -->
		<!-- ////     Neoffice and follows the theme from one place (87f168fe, 2026-03-20 -->
		<!-- ////     "align POS design with Neoffice theme and improve customer display"). -->
		<!-- //// [F] format only: the fork runs Biome (no semicolons, double quotes, 80 -->
		<!-- ////     columns) where upstream is Prettier-shaped. A hunk tagged [F] carries -->
		<!-- ////     no behaviour: at the next upstream merge take their line and re-run -->
		<!-- ////     `yarn lint` rather than resolving by hand (87f168fe, 3e25c3b6). -->
		<!-- //// [R] restaurant / table service: upstream POSNext is a retail POS and knows -->
		<!-- ////     nothing of tables. Neoffice sells the POS to restaurants, so the cart -->
		<!-- ////     also drives a table, preparation stations and per-item KDS status, item -->
		<!-- ////     modifiers, takeaway, and the provisional (pre-payment) ticket, and it -->
		<!-- ////     hides the retail-only controls when restaurant mode is on (8aa35c29, -->
		<!-- ////     e005b94b, 831857f2, 4df0caf1, c7f6932c, 71050faf, d3ca6959, 884f8ebd, -->
		<!-- ////     a268f4e9, 7269b953, 7fdaa8cf, b3a9d850). -->
		<!-- //// [G] guest ordering: guests order and pay from their phone via a QR code, so -->
		<!-- ////     the cashier's cart must show what the table has already paid, the tip -->
		<!-- ////     they left, and what is still to collect. Upstream has no such flow -->
		<!-- ////     (6d7195f4, 214125e5, 1c05e7c7, e25a9266, 48b2e6c0). -->
		<!-- //// [CHF] Swiss cash rounds to the 0.05 fraction, so the grand total carries a -->
		<!-- ////     rounding adjustment upstream does not model (4fdb5df4). -->
		<!-- //// [CU] customer area rework: search, selection and the info shown about the -->
		<!-- ////     selected customer (afb8f175, 4a0dd461, 53d0107c, 4aac18e5). -->
		<!-- //// [GC] gift cards are Items priced at zero whose value is typed at the till -->
		<!-- ////     (5dddc528). [CART] cart-line identity fixes (7e1376a3). -->
		<!-- Header with Customer -->
		<div class="px-2.5 py-2 border-b border-gray-200 bg-gray-50">
			<!-- Inline Customer Search/Selection -->
			<div ref="customerSearchContainer" class="relative">
				<div v-if="customer">
					<!-- //// click name to re-search (removed red X) + show email in results -->
					<!-- Two Cards Layout: Customer Card + Document Type Card -->
					<div class="flex items-stretch gap-2">
						<!-- //// Neoffice — [CU] the selected-customer card became a hover target (group relative, -->
						<!-- //// min-w-0) so the full-info popover below can hang off it; upstream shows the name and -->
						<!-- //// nothing else (53d0107c, 2026-07-09 "richer customer info"). -->
						<!-- Customer Card (hover shows full-info popover) -->
						<div class="group relative flex-1 flex items-center gap-1.5 bg-white border border-gray-200 rounded-neo-md p-1.5 shadow-neo min-w-0">
							<!-- Customer Avatar & Info -->
							<!-- //// Neoffice — [CU] the customer name itself is the switch control. Upstream -->
							<!-- //// needed two taps (a red X to clear, then the search); a cashier changes -->
							<!-- //// customer constantly, so one tap re-opens the search instead (4a0dd461, -->
							<!-- //// 2026-07-09 "smoother customer selection & full edit form"). -->
							<div
									@click.stop="clearCustomer"
									role="button"
									tabindex="0"
									@keydown.enter.stop="clearCustomer"
									:title="__('Change customer')"
									class="flex items-center gap-2 min-w-0 flex-1 px-1.5 py-1 cursor-pointer rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors"
								>
								<div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
									<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
									</svg>
								</div>
								<div class="min-w-0 flex-1">
									<p class="text-xs font-semibold text-gray-900 truncate leading-tight">
										{{ customer.customer_name || customer.name }}
									</p>
									<!-- //// Neoffice — [CU] e-mail shown next to the phone: it was already cached and -->
									<!-- //// never displayed, and business customers are identified by mail (4a0dd461). -->
									<p v-if="customer.mobile_no || customer.email_id" class="text-[10px] text-gray-500 truncate leading-tight">
										<span v-if="customer.mobile_no">{{ customer.mobile_no }}</span>
										<span v-if="customer.mobile_no && customer.email_id" class="text-gray-300"> · </span>
										<span v-if="customer.email_id">{{ customer.email_id }}</span>
									</p>
								</div>
							</div>

							<!-- //// Neoffice — [CU] a hover popover carrying the customer's type, phone, mail and postal -->
							<!-- //// address. At a Swiss counter the cashier is asked to confirm the invoicing address, -->
							<!-- //// and the data was already cached — upstream simply never showed it (53d0107c, -->
							<!-- //// 2026-07-09; the Phone:/Email: lines ERPNext appends to primary_address are stripped -->
							<!-- //// in cleanAddressParts, 4aac18e5). -->
							<!-- //// address snippet in results + full-info popover on selected card -->
							<!-- Full-info popover (shown on hover over the customer card) -->
							<div
								class="pointer-events-none absolute top-full start-0 z-50 mt-1 hidden w-64 rounded-neo-md border border-gray-200 bg-white p-2.5 text-left shadow-neo-md group-hover:block"
							>
								<p class="text-xs font-bold text-gray-900 truncate">
									{{ customer.customer_name || customer.name }}
								</p>
								<div class="mt-1.5 space-y-1">
									<div v-if="customer.customer_type" class="flex items-start gap-1.5 text-[10px]">
										<span class="w-12 flex-shrink-0 text-gray-400">{{ __("Type") }}</span>
										<span class="text-gray-700">{{ __(customer.customer_type) }}</span>
									</div>
									<div v-if="customer.mobile_no" class="flex items-start gap-1.5 text-[10px]">
										<span class="w-12 flex-shrink-0 text-gray-400">{{ __("Phone") }}</span>
										<span class="text-gray-700 break-all">{{ customer.mobile_no }}</span>
									</div>
									<div v-if="customer.email_id" class="flex items-start gap-1.5 text-[10px]">
										<span class="w-12 flex-shrink-0 text-gray-400">{{ __("Email") }}</span>
										<span class="text-gray-700 break-all">{{ customer.email_id }}</span>
									</div>
									<div v-if="formatAddress(customer)" class="flex items-start gap-1.5 text-[10px]">
										<span class="w-12 flex-shrink-0 text-gray-400">{{ __("Address") }}</span>
										<span class="text-gray-700">{{ formatAddress(customer) }}</span>
									</div>
									<div v-if="customer.customer_group" class="flex items-start gap-1.5 text-[10px]">
										<span class="w-12 flex-shrink-0 text-gray-400">{{ __("Group") }}</span>
										<span class="text-gray-700">{{ customer.customer_group }}</span>
									</div>
									<div v-if="customer.territory" class="flex items-start gap-1.5 text-[10px]">
										<span class="w-12 flex-shrink-0 text-gray-400">{{ __("Territory") }}</span>
										<span class="text-gray-700">{{ customer.territory }}</span>
									</div>
								</div>
							</div>

							<!-- Action Buttons -->
							<div class="flex items-center gap-0.5 flex-shrink-0" @click.stop>
								<button
									type="button"
									@click.stop="$emit('edit-customer', customer)"
									class="w-7 h-7 flex items-center justify-center text-blue-500 hover:bg-blue-50 active:bg-blue-100 rounded-lg transition-colors touch-manipulation"
									:title="__('Edit customer details')"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
									</svg>
								</button>
								<button
									type="button"
									@click.stop="$emit('create-customer', '')"
									class="w-7 h-7 flex items-center justify-center text-green-600 hover:bg-green-50 active:bg-green-100 rounded-lg transition-colors touch-manipulation"
									:title="__('Create new customer')"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
									</svg>
								<!-- //// Neoffice — [CU] a red "remove customer" button used to sit right after this -->
								<!-- //// line. It was dropped when the customer name became the way to re-open the -->
								<!-- //// search, so clearing and switching is one tap instead of two (4a0dd461, -->
								<!-- //// 2026-07-09). git blame attributes nothing here: the hunk is a pure deletion. -->
								</button>
							</div>
						</div>

						<!-- //// Neoffice — [R] a restaurant never raises a Sales Order at the till, so the -->
						<!-- //// Invoice/Order switch is hidden whenever restaurant mode is on. Upstream -->
						<!-- //// always shows it (b3a9d850, 2026-03-20; the same guard is repeated on the -->
						<!-- //// second instance of this switch further down). -->
						<!-- Document Type Card (hidden in restaurant mode) -->
						<!-- //// Neoffice — [R] the restaurant guard is the note just above (b3a9d850); -->
						<!-- //// [D] Neoffice theme tokens on the class below (87f168fe). -->
						<div
							v-if="settingsStore.allowSalesOrder && !restaurantStore.isEnabled"
							class="flex items-center bg-white border border-gray-200 rounded-neo-md p-1.5 shadow-neo flex-shrink-0"
						>
							<div class="flex items-center bg-gray-100 rounded-lg p-0.5">
								<button
									type="button"
									@click="selectDocType('Sales Invoice')"
									class="px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-200 flex items-center gap-1"
									:class="cartStore.targetDoctype === 'Sales Invoice'
										? 'bg-white text-blue-600 shadow-sm'
										: 'text-gray-500 hover:text-gray-700'"
									:title="__('Sales Invoice')"
								>
									<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
									</svg>
									<span>{{ __("Invoice") }}</span>
								</button>
								<button
									type="button"
									@click="selectDocType('Sales Order')"
									class="px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-200 flex items-center gap-1"
									:class="cartStore.targetDoctype === 'Sales Order'
										? 'bg-white text-orange-600 shadow-sm'
										: 'text-gray-500 hover:text-gray-700'"
									:title="__('Sales Order')"
								>
									<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
									</svg>
									<span>{{ __("Order") }}</span>
								</button>
							</div>
						</div>
					</div>
				</div>
				<div v-else>
					<div class="flex gap-1.5">
						<!-- Search Input -->
						<div class="relative flex-1">
							<!-- Search Icon Prefix -->
							<div
								class="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none"
							>
								<svg
									v-if="customersLoaded"
									class="w-4 h-4 text-gray-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
									/>
								</svg>
								<div
									v-else
									class="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-500"
								></div>
							</div>

							<!-- Native Input for Instant Search -->
							<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
							<input
								id="cart-customer-search"
								name="cart-customer-search"
								:value="customerSearch"
								@input="handleSearchInput"
								@focus="handleSearchFocus"
								@blur="handleSearchBlur"
								type="text"
								:placeholder="__('Search or add customer...')"
								class="w-full h-10 ps-9 pe-3 text-xs border border-gray-200 rounded-neo-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-neo transition-shadow"
								:disabled="!customersLoaded"
								@keydown="handleKeydown"
								autocomplete="off"
								:aria-label="__('Search customer in cart')"
							/>
						</div>

						<!-- Quick Create Customer Button -->
						<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
						<button
							type="button"
							@click="createNewCustomer"
							class="flex items-center justify-center w-10 h-10 bg-green-500 hover:bg-green-600 active:bg-green-700 rounded-neo-md text-white transition-colors shadow-neo hover:shadow-neo-md touch-manipulation flex-shrink-0"
							:title="__('Create new customer')"
							:aria-label="__('Create new customer')"
						>
							<svg
								class="w-5 h-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
								/>
							</svg>
						</button>

						<!-- Document Type Toggle (Sales Invoice / Sales Order) -->
						<!-- //// Neoffice — [R] second instance of the Sales Order switch, hidden in -->
						<!-- //// restaurant mode for the same reason; the first one was fixed alone and the -->
						<!-- //// toggle stayed visible here (b3a9d850 + 8aa35c29, 2026-03-20). -->
						<!-- //// Neoffice — [R] the v-if on the tag below is what hides this second Sales Order -->
						<!-- //// switch in restaurant mode; the marker sits above the opening tag because the changed -->
						<!-- //// line is one of its attributes (b3a9d850, 2026-03-20). -->
						<div
							v-if="settingsStore.allowSalesOrder && !restaurantStore.isEnabled"
							class="flex items-center bg-gray-100 rounded-xl p-0.5 h-10"
						>
							<button
								type="button"
								@click="selectDocType('Sales Invoice')"
								class="h-full px-2.5 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-1.5"
								:class="cartStore.targetDoctype === 'Sales Invoice'
									? 'bg-white text-blue-600 shadow-sm'
									: 'text-gray-500 hover:text-gray-700'"
								:title="__('Sales Invoice')"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
								<span class="hidden sm:inline">{{ __("Invoice") }}</span>
							</button>
							<button
								type="button"
								@click="selectDocType('Sales Order')"
								class="h-full px-2.5 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-1.5"
								:class="cartStore.targetDoctype === 'Sales Order'
									? 'bg-white text-orange-600 shadow-sm'
									: 'text-gray-500 hover:text-gray-700'"
								:title="__('Sales Order')"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
								</svg>
								<span class="hidden sm:inline">{{ __("Order") }}</span>
							</button>
						</div>
					</div>
				</div>

				<!-- Customer Dropdown -->
				<div
					v-if="customerSearchFocused || customerSearch.trim().length >= 2"
					class="absolute z-50 mt-0.5 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-hidden will-change-transform"
				>
					<!-- Frequent Customers Header (when showing suggestions) -->
					<div
						v-if="customerSearchFocused && customerSearch.trim().length < 2 && customerResults.length > 0"
						class="px-2 py-1 bg-gray-50 border-b border-gray-200"
					>
						<span class="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
							{{ __('Frequent Customers') }}
						</span>
					</div>

					<!-- Customer Results -->
					<div v-if="customerResults.length > 0" class="max-h-48 overflow-y-auto overscroll-contain">
						<button
							type="button"
							v-for="(cust, index) in customerResults"
							:key="cust.name"
							@mousedown.prevent="selectCustomer(cust)"
							:class="[
								'w-full text-start px-2 py-1.5 flex items-center gap-1.5 border-b border-gray-100 last:border-0 touch-manipulation select-none cursor-pointer active:bg-blue-200',
								index === selectedIndex ? 'bg-blue-100' : 'hover:bg-blue-50 active:bg-blue-100',
							]"
						>
							<div
								class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 pointer-events-none"
							>
								<span class="text-[10px] font-bold text-blue-600">{{
									getInitials(cust.customer_name)
								}}</span>
							</div>
							<div class="flex-1 min-w-0 pointer-events-none">
								<p class="text-[11px] font-semibold text-gray-900 truncate">
									{{ cust.customer_name }}
								</p>
								<!-- //// Neoffice — [CU] a search row shows phone, e-mail and a one-line address so -->
								<!-- //// the cashier can tell two same-named customers apart; upstream showed the -->
								<!-- //// phone alone. get_customers was widened to return the address rather than -->
								<!-- //// fetching per customer (4a0dd461 + 53d0107c, 2026-07-09). -->
								<p v-if="cust.mobile_no || cust.email_id" class="text-[9px] text-gray-600 truncate">
									<span v-if="cust.mobile_no">{{ cust.mobile_no }}</span>
									<span v-if="cust.mobile_no && cust.email_id" class="text-gray-300"> · </span>
									<span v-if="cust.email_id">{{ cust.email_id }}</span>
								</p>
								<p v-if="addressSnippet(cust)" class="text-[9px] text-gray-400 truncate flex items-center gap-0.5">
									<svg class="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
										<path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
									</svg>
									<span class="truncate">{{ addressSnippet(cust) }}</span>
								</p>
							</div>
						</button>
					</div>

					<!-- No Results + Create New Option -->
					<div v-else-if="customerSearch.trim().length >= 2">
						<div
							class="px-2 py-1.5 text-center text-[11px] font-medium text-gray-700 border-b border-gray-100"
						>
							{{ __('No results for "{0}"', [customerSearch]) }}
						</div>
					</div>

					<!-- Create New Customer Option -->
					<button
						type="button"
						v-if="customerSearch.trim().length >= 2"
						@mousedown.prevent="createNewCustomer"
						class="w-full text-start px-2 py-1.5 hover:bg-green-50 active:bg-green-100 flex items-center gap-1.5 border-t border-gray-200 touch-manipulation select-none cursor-pointer"
					>
						<div
							class="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 pointer-events-none"
						>
							<svg
								class="w-3 h-3 text-green-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 4v16m8-8H4"
								/>
							</svg>
						</div>
						<div class="flex-1 pointer-events-none">
							<p class="text-[11px] font-medium text-green-700">
								{{ __("Create New Customer") }}
							</p>
							<p class="text-[9px] text-green-600">"{{ customerSearch }}"</p>
						</div>
					</button>
				</div>
			</div>
		</div>

		<!-- Action Buttons Section -->
		<div v-if="items.length > 0" class="px-2 py-2 border-b border-gray-200 bg-white">
			<div class="flex items-center justify-between mb-1.5">
				<h2 class="text-xs font-bold text-gray-900">{{ __("Cart Items") }}</h2>
				<div class="flex items-center gap-1">
					<!-- Clear Cart Button -->
					<button
						@click="$emit('clear-cart')"
						class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors touch-manipulation"
						type="button"
						:title="__('Clear all items')"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v2M4 7h16"/>
						</svg>
						<span>{{ __("Clear") }}</span>
					</button>
					<!-- Sort Dropdown -->
					<div class="relative" ref="cartSortContainer">
						<button
							@click="toggleCartSortDropdown"
							:class="[
								'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors touch-manipulation',
								cartSortBy
									? 'text-blue-600 hover:bg-blue-50'
									: 'text-gray-600 hover:bg-gray-50'
							]"
							:title="cartSortBy
								? (cartSortOrder === 'asc'
									? __('Sorted by {0} A-Z', [getCartSortLabel()])
									: __('Sorted by {0} Z-A', [getCartSortLabel()]))
								: __('Sort cart items')"
							:aria-label="__('Sort cart items')"
							type="button"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
							</svg>
							<span>{{ __("Sort") }}</span>
						</button>

						<!-- Sort Dropdown Menu -->
						<div
							v-if="showCartSortDropdown"
							@click.stop
							class="absolute end-0 mt-1 w-52 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999]"
						>
							<div class="py-2">
								<div class="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-100">
									{{ __('Sort Cart') }}
								</div>
								<div class="py-1">
									<!-- No Sorting (clear) -->
									<button
										@click="handleCartSortToggle(null)"
										:class="[
											'w-full px-3 py-2 text-sm transition-colors flex items-center justify-between group',
											!cartSortBy ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
										]"
										type="button"
									>
										<span class="flex items-center gap-2.5">
											<svg class="w-4 h-4 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
											</svg>
											<span>{{ __('No Sorting') }}</span>
										</span>
									</button>

									<div class="h-px bg-gray-100 my-1"></div>

									<!-- Sort Options Loop -->
									<button
										v-for="option in CART_SORT_OPTIONS"
										:key="option.field"
										@click="handleCartSortToggle(option.field)"
										:class="[
											'w-full px-3 py-2 text-sm transition-colors flex items-center justify-between group',
											cartSortBy === option.field ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
										]"
										type="button"
									>
										<span class="flex items-center gap-2.5">
											<svg class="w-4 h-4 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="option.icon"/>
											</svg>
											<span>{{ option.label }}</span>
										</span>
										<!-- Sort direction icon -->
										<svg
											class="w-5 h-5"
											:class="cartSortBy === option.field ? 'text-blue-600' : 'text-gray-300'"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="CART_SORT_ICONS[getCartSortIconState(option.field)]"/>
										</svg>
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Offers & Coupon Buttons -->
			<div class="flex gap-2">
				<!-- View All Offers Button -->
				<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
				<button
					type="button"
					@click="$emit('show-offers')"
					class="relative flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-neo-md bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 hover:border-green-400 hover:from-green-100 hover:to-emerald-100 hover:shadow-neo transition-all min-w-0 touch-manipulation active:scale-[0.98]"
					:aria-label="__('View all available offers')"
				>
					<svg
						class="w-3.5 h-3.5 text-green-600 flex-shrink-0"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
						/>
					</svg>
					<span class="text-[11px] font-bold text-green-700">{{ __("Offers") }}</span>
					<!-- Badge shows ONLY applied offers count - NOT eligible/pending offers -->
					<!-- This prevents confusion where offers show as "applied" before backend validation -->
					<span
						v-if="appliedOfferCount > 0"
						class="bg-green-600 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 flex-shrink-0 min-w-[16px] text-center"
					>
						{{ appliedOfferCount }}
					</span>
				</button>

				<!-- Enter Coupon Code Button -->
				<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
				<button
					type="button"
					@click="$emit('apply-coupon')"
					class="relative flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-neo-md bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200 hover:border-purple-400 hover:from-purple-100 hover:to-violet-100 hover:shadow-neo transition-all min-w-0 touch-manipulation active:scale-[0.98]"
					:aria-label="__('Apply coupon code')"
				>
					<svg
						class="w-3.5 h-3.5 text-purple-600 flex-shrink-0"
						fill="currentColor"
						viewBox="0 0 20 20"
					>
						<path
							fill-rule="evenodd"
							d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z"
							clip-rule="evenodd"
						/>
					</svg>
					<span class="text-[11px] font-bold text-purple-700">{{ __("Coupon") }}</span>
					<span
						v-if="availableGiftCards.length > 0"
						class="bg-purple-600 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 flex-shrink-0 min-w-[16px] text-center"
					>
						{{ availableGiftCards.length }}
					</span>
				</button>
			</div>
		</div>

		<!-- Cart Items -->
		<div class="flex-1 overflow-y-auto p-0.5 sm:p-1.5 bg-gray-50">
			<div
				v-if="items.length === 0"
				class="flex flex-col items-center justify-center h-full px-3 sm:px-4 py-6"
			>
				<!-- Empty Cart Icon & Message -->
				<div
					class="w-14 h-14 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3"
				>
					<svg
						class="h-7 w-7 sm:h-8 sm:w-8 text-gray-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
						/>
					</svg>
				</div>
				<p class="text-xs sm:text-sm font-semibold text-gray-900 mb-1">
					{{ __("Your cart is empty") }}
				</p>
				<p class="text-[10px] sm:text-xs text-gray-500 mb-5 sm:mb-6">
					{{ __("Select items to start or choose a quick action") }}
				</p>

				<!-- Quick Actions Grid -->
				<div class="grid grid-cols-2 gap-2 sm:gap-2.5 w-full max-w-lg">
					<!-- View Shift -->
					<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
					<button
						type="button"
						@click="$emit('view-shift')"
						class="flex flex-col items-center justify-center p-3 sm:p-4 bg-white border border-gray-200 rounded-neo-md hover:border-blue-300 hover:bg-blue-50 active:bg-blue-100 transition-colors shadow-neo hover:shadow-neo-md touch-manipulation group"
						:title="__('View current shift details')"
					>
						<div
							class="w-9 h-9 sm:w-10 sm:h-10 bg-blue-50 rounded-full flex items-center justify-center mb-2 group-hover:bg-blue-100 transition-colors"
						>
							<svg
								class="w-5 h-5 text-blue-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
								/>
							</svg>
						</div>
						<span class="text-[11px] sm:text-xs font-semibold text-gray-700">{{
							__("View Shift")
						}}</span>
					</button>

					<!-- Draft Invoices -->
					<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
					<button
						type="button"
						@click="$emit('show-drafts')"
						class="flex flex-col items-center justify-center p-3 sm:p-4 bg-white border border-gray-200 rounded-neo-md hover:border-purple-300 hover:bg-purple-50 active:bg-purple-100 transition-colors shadow-neo hover:shadow-neo-md touch-manipulation group"
						:title="__('View draft invoices')"
					>
						<div
							class="w-9 h-9 sm:w-10 sm:h-10 bg-purple-50 rounded-full flex items-center justify-center mb-2 group-hover:bg-purple-100 transition-colors"
						>
							<svg
								class="w-5 h-5 text-purple-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
						</div>
						<span class="text-[11px] sm:text-xs font-semibold text-gray-700">{{
							__("Draft Invoices")
						}}</span>
					</button>

					<!-- Invoice History -->
					<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
					<button
						type="button"
						@click="$emit('show-history')"
						class="flex flex-col items-center justify-center p-3 sm:p-4 bg-white border border-gray-200 rounded-neo-md hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-neo hover:shadow-neo-md touch-manipulation group"
						:title="__('View invoice history')"
					>
						<div
							class="w-9 h-9 sm:w-10 sm:h-10 bg-gray-50 rounded-full flex items-center justify-center mb-2 group-hover:bg-gray-100 transition-colors"
						>
							<svg
								class="w-5 h-5 text-gray-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</div>
						<span class="text-[11px] sm:text-xs font-semibold text-gray-700">{{
							__("Invoice History")
						}}</span>
					</button>

					<!-- Return Invoice -->
					<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
					<button
						type="button"
						@click="$emit('show-return')"
						class="flex flex-col items-center justify-center p-3 sm:p-4 bg-white border border-gray-200 rounded-neo-md hover:border-red-300 hover:bg-red-50 active:bg-red-100 transition-colors shadow-neo hover:shadow-neo-md touch-manipulation group"
						:title="__('Process return invoice')"
					>
						<div
							class="w-9 h-9 sm:w-10 sm:h-10 bg-red-50 rounded-full flex items-center justify-center mb-2 group-hover:bg-red-100 transition-colors"
						>
							<svg
								class="w-5 h-5 text-red-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
								/>
							</svg>
						</div>
						<span class="text-[11px] sm:text-xs font-semibold text-gray-700">{{
							__("Return Invoice")
						}}</span>
					</button>

					<!-- Close Shift -->
					<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
					<button
						type="button"
						@click="$emit('close-shift')"
						class="flex flex-col items-center justify-center p-3 sm:p-4 bg-white border border-gray-200 rounded-neo-md hover:border-orange-300 hover:bg-orange-50 active:bg-orange-100 transition-colors shadow-neo hover:shadow-neo-md touch-manipulation group"
						:title="__('Close current shift')"
					>
						<div
							class="w-9 h-9 sm:w-10 sm:h-10 bg-orange-50 rounded-full flex items-center justify-center mb-2 group-hover:bg-orange-100 transition-colors"
						>
							<svg
								class="w-5 h-5 text-orange-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
								/>
							</svg>
						</div>
						<span class="text-[11px] sm:text-xs font-semibold text-gray-700">{{
							__("Close Shift")
						}}</span>
					</button>

					<!-- Create Customer -->
					<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
					<button
						type="button"
						@click="$emit('create-customer', '')"
						class="flex flex-col items-center justify-center p-3 sm:p-4 bg-white border border-gray-200 rounded-neo-md hover:border-green-300 hover:bg-green-50 active:bg-green-100 transition-colors shadow-neo hover:shadow-neo-md touch-manipulation group"
						:title="__('Create new customer')"
					>
						<div
							class="w-9 h-9 sm:w-10 sm:h-10 bg-green-50 rounded-full flex items-center justify-center mb-2 group-hover:bg-green-100 transition-colors"
						>
							<svg
								class="w-5 h-5 text-green-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
								/>
							</svg>
						</div>
						<span class="text-[11px] sm:text-xs font-semibold text-gray-700">{{
							__("Create Customer")
						}}</span>
					</button>
				</div>
			</div>

			<div v-else class="flex flex-col gap-0.5 sm:gap-1">
				<!-- //// Neoffice — [D] Neoffice theme tokens on the cart line (87f168fe), and [R] a -->
				<!-- //// line already delivered to the table is dimmed instead of removed, so the -->
				<!-- //// waiter still sees what was served (c7f6932c, 2026-03-23). -->
				<div
					v-for="(item, index) in sortedItems"
					:key="item.item_code + '-' + (item.uom || '') + (item.is_free_item ? '-free' : '')"
					@click="item.is_free_item ? null : openEditDialog(item)"
					:class="[
						'border rounded-neo-sm p-1.5 sm:p-2 transition-all duration-200',
						item.is_free_item
							? 'bg-green-50 border-green-300 cursor-default'
							: 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-neo-md active:scale-[0.99] cursor-pointer group',
						item.kds_status === 'Delivered' ? 'opacity-50' : ''
					]"
				>
					<div class="flex gap-1.5 sm:gap-2">
						<!-- Item Image Thumbnail -->
						<!-- //// Neoffice — [IMG] the cart thumbnail paints the Item's custom_color when it -->
						<!-- //// has no photo; upstream drew an SVG placeholder, which made a restaurant cart -->
						<!-- //// of colour-coded Items unreadable (983130d3, 2026-03-25). -->
						<!-- //// Neoffice — [IMG] the class and :style below are what paint the Item's custom_color -->
						<!-- //// on the thumbnail; the marker sits above the opening tag because both changed lines -->
						<!-- //// are its attributes (983130d3, 2026-03-25). -->
						<div
							class="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200"
							:style="item.image ? {} : item.custom_color ? { backgroundColor: item.custom_color, borderColor: item.custom_color } : { background: 'linear-gradient(to bottom right, #F9FAFB, #F3F4F6)' }"
						>
							<img
								v-if="item.image"
								:src="item.image"
								:alt="item.item_name"
								loading="lazy"
								width="48"
								height="48"
								decoding="async"
								class="w-full h-full object-cover"
							/>
							<!-- //// Neoffice — [IMG] name over the colour, in white when the colour is dark, so -->
							<!-- //// the line stays legible whatever the manager picked (983130d3). -->
							<!-- //// Neoffice — [IMG] the class and :class below flip the fallback name to white on a -->
							<!-- //// dark tile; marker above the opening tag, the changed lines are attributes -->
							<!-- //// (983130d3, 2026-03-25). -->
							<span
								v-else
								class="text-[7px] sm:text-[8px] font-bold leading-tight text-center px-0.5 line-clamp-2"
								:class="item.custom_color && !isLightColor(item.custom_color) ? 'text-white' : 'text-gray-400'"
							>
								<!-- //// Neoffice — [IMG] the name is the fallback content of the thumbnail, hence -->
								<!-- //// the truncation to 8 characters (983130d3). -->
								{{ (item.item_name || '').substring(0, 8) }}
							</span>
						</div>

						<!-- Item Content -->
						<div class="flex-1 min-w-0 flex flex-col justify-center">
							<!-- Header: Item Name, Badges & Delete -->
							<div class="flex items-start justify-between gap-0.5 mb-0.5">
								<div class="flex items-center gap-1.5 flex-1 min-w-0">
									<h4
										class="text-xs sm:text-sm font-extrabold text-gray-900 truncate leading-tight"
									>
										{{ item.item_name }}
									</h4>
									<!-- //// Neoffice — [R] restaurant badges on a cart line, none of which upstream has: -->
									<!-- //// the free-text note the waiter typed, the preparation station the Item is -->
									<!-- //// routed to (bar or kitchen, colour taken from the station record) and a -->
									<!-- //// summary of the chosen modifiers, so the ticket can be checked before it is -->
									<!-- //// sent (87f168fe, e005b94b, 831857f2, 4df0caf1, 2026-03-20/21). -->
									<!-- Special Instructions Badge (Restaurant mode) -->
								<span
									v-if="item.posa_special_instructions"
									class="inline-flex items-center px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[9px] font-bold flex-shrink-0"
									:title="item.posa_special_instructions"
								>
									<svg class="w-2.5 h-2.5 me-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
									{{ __("Note") }}
								</span>
								<!-- Preparation Station Badge (Restaurant mode) -->
								<span
									v-if="item.preparation_station && restaurantStore.isEnabled"
									class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 text-white"
									:style="{ backgroundColor: getStationColor(item.preparation_station) }"
								>
									{{ getStationDisplayName(item.preparation_station) }}
								</span>
								<!-- Item Modifiers Summary -->
								<div v-if="item.posa_item_modifiers && restaurantStore.isEnabled" class="text-[10px] text-gray-500 mt-0.5 truncate">
									{{ formatModifiers(item.posa_item_modifiers) }}
								</div>
								<!-- Free Item Badge -->
									<span
										v-if="item.free_qty && item.free_qty > 0"
										class="inline-flex items-center px-1.5 py-0.5 bg-green-600 text-white rounded-full text-[9px] font-bold flex-shrink-0"
										:title="item.is_free_item ? __('Free item') : __('{0} free item(s) included', [item.free_qty])"
									>
										<svg
											class="w-2.5 h-2.5 me-0.5"
											fill="currentColor"
											viewBox="0 0 20 20"
										>
											<path
												fill-rule="evenodd"
												d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
												clip-rule="evenodd"
											/>
										</svg>
										{{ item.is_free_item ? __("FREE") : __("+{0} FREE", [item.free_qty]) }}
									</span>
									<!-- Discount Badge -->
									<div
										v-if="item.discount_amount && item.discount_amount > 0"
										class="inline-flex items-center px-1.5 py-0.5 bg-gradient-to-r from-red-50 to-orange-50 text-red-700 rounded-full text-[9px] font-bold border border-red-200 flex-shrink-0"
									>
										<svg
											class="w-2.5 h-2.5 me-0.5"
											fill="currentColor"
											viewBox="0 0 20 20"
										>
											<path
												fill-rule="evenodd"
												d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z"
												clip-rule="evenodd"
											/>
										</svg>
										{{
											__("{0}%", [
												Number(item.discount_percentage).toFixed(0),
											])
										}}
									</div>
								</div>
								<!-- //// Neoffice — [R] added: per-line kitchen state and the two per-line actions -->
								<!-- //// that go with it. A restaurant sends courses one at a time, so each line -->
								<!-- //// carries its own kds_status, can be pushed to the kitchen on its own, and can -->
								<!-- //// get a note or modifier. Upstream only knows a whole-order state (c7f6932c + -->
								<!-- //// 87f168fe, 2026-03-20/23). -->
								<!-- KDS Item Status Badge -->
								<span
									v-if="cartStore.restaurantTable && item.kds_status"
									class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0"
									:class="kdsStatusBadgeClass(item.kds_status)"
								>
									<svg v-if="item.kds_status === 'Waiting'" class="w-2.5 h-2.5 me-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
									{{ __(item.kds_status) }}
								</span>
								<!-- Quick Send Button (for Waiting items in restaurant mode) -->
								<button
									v-if="cartStore.restaurantTable && item.kds_status === 'Waiting'"
									type="button"
									@click.stop="$emit('send-item-to-kitchen', item)"
									class="text-purple-500 hover:text-purple-700 active:text-purple-800 transition-colors flex-shrink-0 p-0.5 -m-0.5 mr-1 touch-manipulation active:scale-90"
									:title="__('Send to kitchen')"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
								</button>
								<!-- Add Modifiers Button (Restaurant mode) -->
								<button
									v-if="!item.is_free_item && cartStore.restaurantTable"
									type="button"
									@click.stop="$emit('open-modifiers', item)"
									class="text-gray-400 hover:text-blue-600 active:text-blue-700 transition-colors flex-shrink-0 p-0.5 -m-0.5 mr-1 touch-manipulation active:scale-90"
									:title="__('Add Note / Modifier')"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
								</button>

								<!-- //// Neoffice — [CART] emits the item OBJECT, not its item_code: with modifiers -->
								<!-- //// the same item_code sits on several cart lines, and removing by code deleted -->
								<!-- //// all of them at once (7e1376a3, 2026-03-31 "remove deletes only one item -->
								<!-- //// (by ref)"). -->
								<button
									v-if="!item.is_free_item"
									type="button"
									@click.stop="$emit('remove-item', item)"
									class="text-gray-400 hover:text-red-600 active:text-red-700 transition-colors flex-shrink-0 p-0.5 -m-0.5 touch-manipulation active:scale-90"
									:aria-label="__('Remove {0}', [item.item_name])"
									:title="__('Remove item')"
								>
									<svg
										class="h-4 w-4"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</button>
							</div>

							<!-- Single Row: Quantity Counter, UOM, Price & Total -->
							<div class="flex items-center justify-between gap-1.5">
								<div class="flex items-center gap-1.5">
									<!-- Quantity Counter -->
									<!-- For free items, show static quantity badge -->
									<div
										v-if="item.is_free_item"
										class="flex items-center bg-green-100 border border-green-300 rounded px-2 h-6 sm:h-7"
									>
										<span class="text-xs sm:text-sm font-bold text-green-700">{{ item.quantity }}</span>
									</div>
									<!-- For serial items, show serial badge with edit button -->
									<div
										v-else-if="item.has_serial_no && item.serial_no"
										class="flex items-center gap-1"
										@click.stop
									>
										<!-- Serial count badge -->
										<div
											class="flex items-center bg-blue-50 border border-blue-200 rounded px-1.5 h-6 sm:h-7"
										>
											<FeatherIcon
												name="hash"
												class="w-3 h-3 text-blue-500 me-0.5"
											/>
											<span
												class="text-xs sm:text-sm font-bold text-blue-700"
												>{{ item.quantity }}</span
											>
										</div>
										<!-- Edit button -->
										<button
											type="button"
											@click="openEditDialog(item)"
											class="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded transition-colors shadow-sm"
											:title="__('Edit serials')"
										>
											<FeatherIcon name="edit-2" class="w-3 h-3" />
										</button>
									</div>
									<!-- For non-serial items, show normal quantity controls -->
									<div
										v-else
										:class="[
											'flex items-center bg-gray-50 border rounded overflow-hidden',
											item.is_resolved_barcode ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
										]"
									>
										<button
											type="button"
											@click.stop="decrementQuantity(item)"
											:disabled="item.is_resolved_barcode"
											:class="[
												'w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center font-bold transition-colors touch-manipulation border-e',
												item.is_resolved_barcode
													? 'bg-gray-100 text-gray-400 cursor-not-allowed border-amber-300'
													: 'bg-white hover:bg-gray-100 active:bg-gray-200 text-gray-700 border-gray-200'
											]"
											:aria-label="__('Decrease quantity')"
											:title="item.is_resolved_barcode ? __('Quantity locked (barcode item)') : __('Decrease quantity')"
										>
											<svg
												class="w-3 h-3"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="3"
													d="M20 12H4"
												/>
											</svg>
										</button>
										<input
											:value="formatQuantity(item.quantity)"
											@click.stop
											@input="updateQuantity(item, $event.target.value)"
											@blur="handleQuantityBlur(item)"
											@keydown.enter="$event.target.blur()"
											type="text"
											inputmode="decimal"
											:disabled="item.is_resolved_barcode"
											:class="[
												'w-16 sm:w-20 h-6 sm:h-7 text-center border-0 text-xs sm:text-sm font-bold focus:outline-none',
												item.is_resolved_barcode
													? 'bg-amber-50 text-amber-700 cursor-not-allowed'
													: 'bg-white text-gray-900 focus:ring-2 focus:ring-blue-500'
											]"
											:aria-label="__('Quantity')"
											:title="item.is_resolved_barcode ? __('Quantity locked (barcode item)') : ''"
										/>
										<button
											type="button"
											@click.stop="incrementQuantity(item)"
											:disabled="item.is_resolved_barcode"
											:class="[
												'w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center font-bold transition-colors touch-manipulation border-s',
												item.is_resolved_barcode
													? 'bg-gray-100 text-gray-400 cursor-not-allowed border-amber-300'
													: 'bg-white hover:bg-gray-100 active:bg-gray-200 text-gray-700 border-gray-200'
											]"
											:aria-label="__('Increase quantity')"
											:title="item.is_resolved_barcode ? __('Quantity locked (barcode item)') : __('Increase quantity')"
										>
											<svg
												class="w-3 h-3"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="3"
													d="M12 4v16m8-8H4"
												/>
											</svg>
										</button>
									</div>

									<!-- UOM Selector Dropdown -->
									<div class="relative group/uom" @click.stop>
										<button
											type="button"
											@click="toggleUomDropdown(item.item_code, item.uom)"
											:disabled="
												item.is_resolved_barcode || !item.item_uoms || item.item_uoms.length === 0
											"
											:class="[
												'h-6 sm:h-7 text-[10px] sm:text-xs font-bold rounded ps-2 pe-5 transition-all touch-manipulation flex items-center justify-center min-w-[45px]',
												item.is_resolved_barcode
													? 'bg-amber-100 text-amber-700 border border-amber-300 cursor-not-allowed'
													: item.item_uoms && item.item_uoms.length > 0
														? 'bg-blue-500 text-white border border-blue-400 hover:bg-blue-600 active:scale-95 cursor-pointer'
														: 'bg-gray-100 text-gray-500 border border-gray-200 cursor-not-allowed opacity-60',
											]"
											:title="
												item.is_resolved_barcode
													? __('UOM locked (barcode item)')
													: item.item_uoms && item.item_uoms.length > 0
														? __('Click to change unit')
														: __('Only one unit available')
											"
										>
											{{
												item.uom ||
												item.stock_uom ||
												__("Nos", null, "UOM")
											}}
										</button>
										<svg
											:class="[
												'absolute end-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 pointer-events-none transition-transform',
												openUomDropdown === `${item.item_code}-${item.uom}`
													? 'rotate-180'
													: '',
												item.is_resolved_barcode
													? 'text-amber-600'
													: item.item_uoms && item.item_uoms.length > 0
														? 'text-white'
														: 'text-gray-400',
											]"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2.5"
												d="M19 9l-7 7-7-7"
											/>
										</svg>
										<div
											v-if="
												openUomDropdown ===
													`${item.item_code}-${item.uom}` &&
												item.item_uoms &&
												item.item_uoms.length > 0
											"
											class="absolute top-full start-0 mt-0.5 bg-white border border-blue-300 rounded shadow-xl z-50 min-w-full overflow-hidden"
										>
											<button
												type="button"
												@click="selectUom(item, item.stock_uom)"
												:class="[
													'w-full text-start px-2 py-1.5 text-[10px] sm:text-xs font-semibold transition-colors border-b border-gray-100',
													(item.uom || item.stock_uom) === item.stock_uom
														? 'bg-blue-50 text-blue-700'
														: 'text-gray-700 hover:bg-blue-50',
												]"
											>
												{{ item.stock_uom || __("Nos", null, "UOM") }}
											</button>
											<button
												v-for="uomData in item.item_uoms"
												:key="uomData.uom"
												type="button"
												@click="selectUom(item, uomData.uom)"
												:class="[
													'w-full text-start px-2 py-1.5 text-[10px] sm:text-xs font-semibold transition-colors border-b border-gray-100 last:border-0',
													(item.uom || item.stock_uom) === uomData.uom
														? 'bg-blue-50 text-blue-700'
														: 'text-gray-700 hover:bg-blue-50',
												]"
											>
												{{ uomData.uom }}
											</button>
										</div>
									</div>

									<!-- Price -->
									<span class="text-[10px] sm:text-xs font-bold text-gray-700">
										{{ formatCurrency(item.rate) }}
									</span>
								</div>

								<!-- Item Total -->
								<div class="text-end flex-shrink-0">
									<div
										class="text-xs sm:text-sm font-bold text-blue-600 leading-none"
									>
										{{
											formatCurrency(
												item.amount || item.rate * item.quantity
											)
										}}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Totals Summary -->
		<div class="p-1.5 sm:p-2 bg-white border-t border-gray-200">
			<!-- Summary Details -->
			<div v-if="items.length > 0" class="mb-1.5">
				<div class="flex items-center justify-between text-xs text-gray-600 mb-0.5">
					<span class="font-medium">{{ __("Total Quantity") }}</span>
					<span class="font-bold text-gray-900 text-center min-w-[60px]">{{
						formatQuantity(totalQuantity)
					}}</span>
				</div>
				<div class="flex items-center justify-between text-xs text-gray-600">
					<span class="font-medium">{{ __("Subtotal") }}</span>
					<span class="font-bold text-gray-900 text-center min-w-[60px]">{{
						formatCurrency(displaySubtotal)
					}}</span>
				</div>
			</div>

			<!-- Summary Details (continued) -->
			<div v-if="items.length > 0" class="mb-1.5">
				<!-- Discount Display - Highlighted -->
				<div
					v-if="discountAmount > 0"
					class="flex items-center justify-between mb-0.5 bg-red-50 rounded px-1.5 py-1 -mx-0.5"
				>
					<div class="flex items-center gap-1">
						<svg
							class="w-3.5 h-3.5 text-red-600"
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<path
								fill-rule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z"
								clip-rule="evenodd"
							/>
						</svg>
						<span class="text-xs font-bold text-red-700">{{ __("Discount") }}</span>
					</div>
					<span class="text-sm font-extrabold text-red-600 text-center min-w-[60px]">{{
						formatCurrency(discountAmount)
					}}</span>
				</div>

				<div class="flex items-center justify-between text-xs text-gray-600">
					<div class="flex items-center gap-1">
						<svg
							class="w-3.5 h-3.5 text-gray-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
							/>
						</svg>
						<span class="font-medium">{{ __("Tax") }}</span>
					</div>
					<span class="font-bold text-gray-900 text-center min-w-[60px]">{{
						formatCurrency(taxAmount)
					}}</span>
				</div>
			</div>

			<!-- //// Neoffice — [CHF] added: Swiss cash has no coin under 0.05, so the total is -->
			<!-- //// rounded to the currency's smallest fraction and the adjustment is shown as -->
			<!-- //// its own line; hiding it would make the receipt look wrong by a few cents -->
			<!-- //// (4fdb5df4, 2026-04-04 "rounding total, tips visibility, cash quick amounts"). -->
			<!-- Rounding Adjustment -->
			<div v-if="roundingAdjustment !== 0" class="flex items-center justify-between text-xs text-gray-600 px-1 mb-1">
				<span class="font-medium">{{ __("Rounding") }}</span>
				<span class="font-bold text-center min-w-[60px]">{{ formatCurrency(roundingAdjustment) }}</span>
			</div>

			<!-- Grand Total -->
			<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
			<div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-neo-md p-2.5 mb-1.5">
				<div class="flex items-center justify-between">
					<span class="text-sm font-extrabold text-gray-900">{{
						__("Grand Total")
					}}</span>
					<span
						class="text-lg sm:text-xl font-extrabold text-blue-600 text-center min-w-[60px]"
					>
						{{ formatCurrency(displayGrandTotal) }}
					</span>
				</div>
				<!-- //// Neoffice — [G] added: guests pay their own share from their phone, so the -->
				<!-- //// cashier needs to see what the table already paid, the tip left (voluntary, -->
				<!-- //// so it is NOT counted against the order) and what is still to collect. -->
				<!-- //// Upstream has no guest payment at all (6d7195f4, 214125e5, 1c05e7c7, -->
				<!-- //// e25a9266, 2026-03-30/04-01). -->
				<!-- Guest payments already received on this table -->
				<div v-if="cartStore.guestPaidAmount > 0" class="mt-1.5 pt-1.5 border-t border-blue-200 space-y-1">
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold text-green-700">
							{{ __("Already paid (guest)") }}
						</span>
						<span class="text-sm font-bold text-green-600">
							{{ formatCurrency(cartStore.guestPaidAmount) }}
						</span>
					</div>
					<div v-if="cartStore.guestTipAmount > 0" class="flex items-center justify-between">
						<span class="text-xs text-green-600 italic">
							{{ __("Tip (guest)") }}
						</span>
						<span class="text-xs text-green-600 italic">
							{{ formatCurrency(cartStore.guestTipAmount) }}
						</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold text-orange-600">
							{{ __("Remaining to collect") }}
						</span>
						<span class="text-sm font-bold text-orange-600">
							{{ formatCurrency(Math.max(0, displayGrandTotal - cartStore.guestPaidAmount)) }}
						</span>
					</div>
				</div>
			</div>

			<!-- Action Buttons -->
			<!-- //// Neoffice — [R] added: the restaurant/takeaway action bar, shown instead of -->
			<!-- //// the retail Checkout+Hold pair. Validate sends the round to the preparation -->
			<!-- //// stations (it is disabled when nothing is sendable), Pay is disabled when the -->
			<!-- //// guests already covered the whole table [G], and the printer button issues a -->
			<!-- //// provisional ticket which is explicitly not a receipt. Hold is hidden here: -->
			<!-- //// the table IS the hold, and saving a local draft raised "Draft not found". -->
			<!-- //// (8aa35c29, 7269b953, 7fdaa8cf, c7f6932c, 71050faf, d3ca6959, 884f8ebd, -->
			<!-- //// a268f4e9, 48b2e6c0, 2026-03-20 to 04-01.) -->
			<!-- Restaurant Mode Buttons -->
			<div v-if="restaurantStore.isEnabled && (cartStore.restaurantTable || cartStore.isTakeaway)" class="flex gap-1.5">
				<!-- Send to Kitchen Button (Primary - green) -->
				<button
					type="button"
					@click="$emit('open-kitchen-dialog')"
					:disabled="!hasSendableItems"
					:class="[
						'flex-1 py-2.5 px-3 rounded-neo-md font-bold text-xs text-white transition-all flex items-center justify-center touch-manipulation',
						!hasSendableItems
							? 'bg-gray-300 cursor-not-allowed'
							: 'bg-green-600 hover:bg-green-700 active:bg-green-800 shadow-neo-md hover:shadow-neo-lg active:scale-[0.98]',
					]"
					:aria-label="__('Send order')"
				>
					<svg
						class="w-4 h-4 me-1.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M5 13l4 4L19 7"
						/>
					</svg>
					<span>{{ __("Valider") }}</span>
				</button>

				<!-- Pay Button (blue) — disabled if fully paid by guest -->
				<button
					type="button"
					@click="handleProceedToPayment"
					:disabled="items.length === 0 || (cartStore.guestPaidAmount > 0 && cartStore.guestPaidAmount >= displayGrandTotal)"
					:class="[
						'flex-1 py-2.5 px-3 rounded-neo-md font-bold text-xs text-white transition-all flex items-center justify-center touch-manipulation',
						items.length === 0 || (cartStore.guestPaidAmount > 0 && cartStore.guestPaidAmount >= displayGrandTotal)
							? 'bg-gray-300 cursor-not-allowed'
							: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-neo-md hover:shadow-neo-lg active:scale-[0.98]',
					]"
					:aria-label="__('Proceed to payment')"
				>
					<svg
						class="w-4 h-4 me-1.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
						/>
					</svg>
					<span>{{ __("Payer") }}</span>
				</button>

				<!-- Print Provisional Ticket Button (compact - gray) -->
				<button
					type="button"
					@click="$emit('print-provisional-ticket')"
					:disabled="items.length === 0"
					:class="[
						'w-10 py-2.5 rounded-neo-md text-white transition-all flex items-center justify-center touch-manipulation',
						items.length === 0
							? 'bg-gray-300 cursor-not-allowed'
							: 'bg-gray-600 hover:bg-gray-700 active:bg-gray-800 shadow-neo-md hover:shadow-neo-lg active:scale-[0.98]',
					]"
					:aria-label="__('Print provisional ticket')"
				>
					<svg
						class="w-4 h-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"
						/>
					</svg>
				</button>

				<!-- Hold Order Button (Secondary - orange) - hidden in restaurant mode -->
				<button
					type="button"
					v-if="items.length > 0 && !restaurantStore.isEnabled"
					@click="$emit('save-draft')"
					class="flex-1 py-2.5 px-2 rounded-neo-md font-semibold text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 active:bg-orange-200 transition-all touch-manipulation active:scale-[0.98] flex items-center justify-center"
					:aria-label="__('Hold order as draft')"
				>
					<svg
						class="w-4 h-4 me-1.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
						/>
					</svg>
					<span>{{ __("Hold", null, "order") }}</span>
				</button>
			</div>

			<!-- Normal Mode Buttons -->
			<div v-else class="flex gap-1.5">
				<!-- Checkout Button (Primary - 50% width) -->
				<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
				<button
					type="button"
					@click="handleProceedToPayment"
					:disabled="items.length === 0"
					:class="[
						'flex-1 py-2.5 px-3 rounded-neo-md font-bold text-xs text-white transition-all flex items-center justify-center touch-manipulation',
						items.length === 0
							? 'bg-gray-300 cursor-not-allowed'
							: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-neo-md hover:shadow-neo-lg active:scale-[0.98]',
					]"
					:aria-label="__('Proceed to payment')"
				>
					<svg
						class="w-4 h-4 me-1.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
						/>
					</svg>
					<span>{{ __("Checkout") }}</span>
				</button>

				<!-- Hold Order Button (Secondary - 50% width) -->
				<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
				<button
					type="button"
					v-if="items.length > 0"
					@click="$emit('save-draft')"
					class="flex-1 py-2.5 px-2 rounded-neo-md font-semibold text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 active:bg-orange-200 transition-all touch-manipulation active:scale-[0.98] flex items-center justify-center"
					:aria-label="__('Hold order as draft')"
				>
					<svg
						class="w-4 h-4 me-1.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
						/>
					</svg>
					<span>{{ __("Hold", null, "order") }}</span>
				</button>
			</div>
		</div>

		<!-- Edit Item Dialog -->
		<EditItemDialog
			v-model="showEditDialog"
			:item="selectedItem"
			:warehouses="warehouses"
			:currency="currency"
			@update-item="handleUpdateItem"
		/>

	</div>
</template>

<script setup>
/**
 * ============================================================================
 * IMPORTS
 * ============================================================================
 */
//// Neoffice — [R] the cart reads the restaurant store (table, takeaway, stations)
//// and [IMG] the colour helper for Items with no photo, neither of which exists
//// upstream (8aa35c29, 983130d3). [F] the currency import was wrapped by Biome.
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { usePOSOffersStore } from "@/stores/posOffers"
import { useCustomerSearchStore } from "@/stores/customerSearch"
import { useRestaurantStore } from "@/stores/restaurant"
import { isLightColor } from "@/utils/itemColors"
import {
	DEFAULT_CURRENCY,
	formatCurrency as formatCurrencyUtil,
} from "@/utils/currency"
import { useFormatters } from "@/composables/useFormatters"
import { useCartSort } from "@/composables/useCartSort"
import { isOffline } from "@/utils/offline"
import { offlineWorker } from "@/utils/offline/workerClient"
import { logger } from "@/utils/logger"
import { FeatherIcon } from "frappe-ui"

const log = logger.create("InvoiceCart")
import { createResource } from "frappe-ui"
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue"
import EditItemDialog from "./EditItemDialog.vue"

/**
 * ============================================================================
 * STORES & COMPOSABLES
 * ============================================================================
 */
//// Neoffice — [R] restaurant store added next to the retail ones: it holds the open
//// table, takeaway state and the station map used by the badges (8aa35c29). [F]
//// the surrounding lines only lost their semicolons (87f168fe).
const cartStore = usePOSCartStore() // Pinia store for cart state management
const settingsStore = usePOSSettingsStore() // Pinia store for POS settings
const offersStore = usePOSOffersStore() // Pinia store for offers/promotions
const customerSearchStore = useCustomerSearchStore() // Pinia store for customer search
const restaurantStore = useRestaurantStore() // Pinia store for restaurant features
const { formatQuantity } = useFormatters() // Quantity formatting utilities

function handleProceedToPayment() {
	//// Neoffice — [R] added: helpers the restaurant cart needs and upstream has no use
	//// for. formatModifiers renders the JSON stored on the invoice line by the modifier
	//// dialog, and the two station helpers resolve a station name to its display name
	//// and colour through the station/item map rather than a field on Item, which was
	//// dropped to stop polluting the Item doctype (4df0caf1, 831857f2, 2026-03-21).
	emit("proceed-to-payment")
}

function formatModifiers(modifiersJson) {
	try {
		const mods = JSON.parse(modifiersJson)
		return mods.map((m) => m.options.map((o) => o.name).join(", ")).join(" · ")
	} catch {
		return ""
	}
}

function getStationColor(stationName) {
	// Look through station items map to find color
	const map = restaurantStore.stationItemsMap
	for (const [, info] of Object.entries(map)) {
		if (info.station === stationName) return info.color
	}
	return "#6B7280"
}

function getStationDisplayName(stationName) {
	// Look through station items map to find display name
	const map = restaurantStore.stationItemsMap
	for (const [, info] of Object.entries(map)) {
		if (info.station === stationName) return info.station_name
	}
	return stationName
}

/**
 * ============================================================================
 * PROPS
 * ============================================================================
 * @prop {Array} items - Cart items array with item details (item_code, quantity, rate, etc.)
 * @prop {Object} customer - Selected customer object (name, customer_name, mobile_no)
 * @prop {Number} subtotal - Cart subtotal before tax and discounts
 * @prop {Number} taxAmount - Total tax amount
 * @prop {Number} discountAmount - Total discount amount applied
 * @prop {Number} grandTotal - Final total (subtotal - discount + tax)
 * @prop {String} posProfile - Current POS Profile name
 * @prop {String} currency - Currency code for formatting (e.g., "USD", "EUR")
 * @prop {Array} appliedOffers - List of currently applied promotional offers
 * @prop {Array} warehouses - Available warehouses for item selection
 */
const props = defineProps({
	items: {
		type: Array,
		default: () => [],
	},
	customer: Object,
	subtotal: {
		type: Number,
		default: 0,
	},
	taxAmount: {
		type: Number,
		default: 0,
	},
	discountAmount: {
		type: Number,
		default: 0,
	},
	grandTotal: {
		type: Number,
		default: 0,
	},
	//// Neoffice — [CHF] added prop: the parent computes the Swiss 0.05 rounding and
	//// passes the adjustment down, so the cart can show it and add it to the displayed
	//// grand total (4fdb5df4, 2026-04-04).
	roundingAdjustment: {
		type: Number,
		default: 0,
	},
	posProfile: String,
	currency: {
		type: String,
		default: DEFAULT_CURRENCY,
	},
	appliedOffers: {
		type: Array,
		default: () => [],
	},
	warehouses: {
		type: Array,
		default: () => [],
	},
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
})

/**
 * ============================================================================
 * EMITS
 * ============================================================================
 * Events emitted to parent component for cart operations
 */
const emit = defineEmits([
	"update-quantity", // (itemCode, newQty, uom?) - Update item quantity
	"remove-item", // (itemCode, uom?) - Remove item from cart
	"select-customer", // (customer) - Select/change customer
	"edit-customer", // (customer) - Open edit customer dialog
	"create-customer", // (searchText) - Open create customer dialog
	"proceed-to-payment", // () - Navigate to payment screen
	"clear-cart", // () - Clear all items from cart
	"save-draft", // () - Save current cart as draft/hold order
	"apply-coupon", // () - Open coupon application dialog
	//// Neoffice — [R] added events: send the round to the kitchen, open the send dialog,
	//// and send a single line. A restaurant fires a course at a time, which upstream's
	//// pay-or-hold cart has no event for (8aa35c29, c7f6932c).
	"send-to-kitchen", // () - Send order to kitchen (restaurant mode)
	"open-kitchen-dialog", // () - Open kitchen dialog (restaurant mode)
	"send-item-to-kitchen", // (item) - Send individual item to kitchen (restaurant mode)
	"show-coupons", // () - Show available coupons
	"show-offers", // () - Show available offers dialog
	"remove-offer", // (offerId) - Remove applied offer
	"update-uom", // (itemCode, newUom) - Change item's unit of measure
	"edit-item", // (item) - Open item edit dialog
	//// Neoffice — [R] added events: per-line note/modifier dialog and the provisional
	//// pre-payment ticket the waiter drops on the table (87f168fe, 71050faf).
	"open-modifiers", // (item) - Open special instructions dialog (restaurant mode)
	"print-provisional-ticket", // () - Print provisional ticket (restaurant mode)
	"view-shift", // () - View current shift details
	"show-drafts", // () - Show draft/held orders
	"show-history", // () - Show invoice history
	"show-return", // () - Open return invoice dialog
	"close-shift", // () - Close current shift
	// "create-sales-order", // () - Create Sales Order // Removed as per instruction
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
])

// Cart sort composable (must be after defineProps)
const {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	cartSortBy,
	cartSortOrder,
	showCartSortDropdown,
	sortedItems,
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	CART_SORT_OPTIONS,
	CART_SORT_ICONS,
	toggleCartSortDropdown,
	handleCartSortToggle,
	getCartSortLabel,
	getCartSortIconState,
} = useCartSort(() => props.items)

/**
 * ============================================================================
 * REACTIVE STATE
 * ============================================================================
 */
// Customer search state
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const customerSearch = ref("") // Current search query
const customerSearchContainer = ref(null) // Ref to search container for click-outside detection
const customerSearchFocused = ref(false) // Track if search input is focused
// Use Pinia store for allCustomers (shared with CustomerDialog, synced on customer creation)
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const allCustomers = computed(() => customerSearchStore.allCustomers)
const customersLoaded = computed(
	() => customerSearchStore.allCustomers.length > 0,
)
const selectedIndex = ref(-1) // Keyboard navigation index for search results
const availableGiftCards = ref([]) // Available gift cards for current customer
const previousCustomer = ref(null) // Store previous customer for restore on blur

// Edit item dialog state
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const showEditDialog = ref(false) // Controls edit dialog visibility
const selectedItem = ref(null) // Item being edited

// UOM dropdown state - tracks which item's UOM dropdown is open (by item_code)
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const openUomDropdown = ref(null)

// Cart sort dropdown container (template ref for outside-click detection)
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const cartSortContainer = ref(null)

/**
 * ============================================================================
 * API RESOURCES
 * ============================================================================
 * These resources handle data fetching from the server with offline support.
 * Data is cached in the service worker for offline access.
 */

/**
 * Customer Loading
 *
 * Uses the shared customerSearchStore for customer data.
 * This ensures customers are synced across all components (InvoiceCart, CustomerDialog).
 * New customers are immediately available after creation without page refresh.
 */
// Load customers via the shared Pinia store (if not already loaded)
if (props.posProfile) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	customerSearchStore.loadAllCustomers(props.posProfile)
}

// Load offers on component init (uses shared store method to prevent duplicate fetches)
// ensureOffersFetched handles both online/offline cases and caching
if (props.posProfile) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	offersStore.ensureOffersFetched(props.posProfile)
}

/**
 * Gift Cards Resource
 *
 * Fetches active coupon codes and gift cards for the selected customer.
 * - Only fetches when a customer is selected and online
 * - Reloads when customer changes (via watcher)
 * - Used for the "Coupon" button badge count
 *
 * @endpoint pos_next.api.offers.get_active_coupons
 */
const giftCardsResource = createResource({
	url: "pos_next.api.offers.get_active_coupons",
	makeParams() {
		return {
			customer: props.customer?.name || props.customer,
			company: props.posProfile, // Will get company from profile
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		}
	},
	auto: false,
	onSuccess(data) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		availableGiftCards.value = data?.message || data || []
	},
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
})

/**
 * Watch for customer changes to load their gift cards.
 * Reloads gift cards resource when customer is selected (and online).
 * Clears gift cards when customer is removed or offline.
 */
watch(
	() => props.customer,
	(newCustomer) => {
		if (newCustomer && props.posProfile && !isOffline()) {
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			giftCardsResource.reload()
		} else {
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			availableGiftCards.value = []
		}
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	},
)

/**
 * ============================================================================
 * COMPUTED PROPERTIES
 * ============================================================================
 */

/**
 * Count of currently applied promotional offers.
 * Used for the badge on the "Offers" button.
 * @returns {Number} Count of applied offers
 */
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const appliedOfferCount = computed(() => (props.appliedOffers || []).length)

/**
 * Pre-computed customer lookup map for O(1) access by ID.
 * Rebuilt when allCustomers changes.
 */
const customerMap = computed(() => {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const map = new Map()
	for (const cust of allCustomers.value) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		map.set(cust.name, cust)
	}
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	return map
})

/**
 * Instant customer search results with in-memory filtering.
 *
 * Performs zero-latency filtering on the cached customer list.
 * Searches across customer_name, mobile_no, and customer ID.
 * Returns max 20 results to keep dropdown performant.
 *
 * @returns {Array} Filtered customer objects matching search query
 */
const customerResults = computed(() => {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const searchValue = customerSearch.value.trim().toLowerCase()

	// When focused with no/short search term, show frequent customers (top 5)
	if (searchValue.length < 2) {
		if (customerSearchFocused.value) {
			// Get frequent customer IDs from the store
			// const frequentIds = customerSearchStore.frequentCustomers.slice(0, 5);
			// if (frequentIds.length > 0) {
			// 	const frequentCustomers = [];
			// 	for (const id of frequentIds) {
			// 		const cust = customerMap.value.get(id);
			// 		if (cust) frequentCustomers.push(cust);
			// 	}
			// 	return frequentCustomers;
			// }
			// If no frequent customers, show first 5 from the list
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			return allCustomers.value.slice(0, 10)
		}
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		return []
	}

	//// Neoffice — [CU] upstream matched the whole query with a single includes(), so typing
	//// "Moret Daniel" found nothing for a customer stored as "Daniel Moret". The query is split
	//// into tokens that must each match somewhere, in any order (afb8f175, 2026-07-09).
	//// tokenized any-order search so "Moret Daniel" finds "Daniel Moret"
	// Split the query into words and require each to match somewhere in the
	// name / mobile / id, in any order — a plain includes() on the whole string
	// missed reversed word order (the stored name may be "Daniel Moret").
	const tokens = searchValue.split(/\s+/).filter(Boolean)
	return allCustomers.value
		.filter((cust) => {
			//// Neoffice — [CU] tokenised, order-independent match (see the note just above):
			//// upstream's includes() on the whole string missed "Moret Daniel" for a customer
			//// stored as "Daniel Moret" (afb8f175, 2026-07-09).
			const haystack =
				(cust.customer_name || "").toLowerCase() +
				" " +
				(cust.mobile_no || "").toLowerCase() +
				" " +
				(cust.name || "").toLowerCase()

			return tokens.every((tok) => haystack.includes(tok))
		})
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		.slice(0, 20)
})

/**
 * Reset keyboard selection index when search results change.
 * Ensures the selection doesn't point to a non-existent result.
 */
watch(customerResults, () => {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	selectedIndex.value = -1
})

/**
 * Total quantity of all items in cart (including free items).
 * Sums quantity + free_qty for each cart item.
 * @returns {Number} Total item quantity
 */
const totalQuantity = computed(() => {
	return props.items.reduce((sum, item) => {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		const qty = item.quantity || 0
		// For dedicated free item rows, quantity IS the free qty — don't double-count
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		const freeQty = item.is_free_item ? 0 : item.free_qty || 0
		return sum + qty + freeQty
	}, 0)
})

/**
 * Display subtotal adjusted for tax-inclusive mode.
 *
 * When tax is inclusive, the raw subtotal from the store includes tax.
 * For clear cashier display, we show:
 * - Subtotal: Net amount (before tax) = gross - tax
 * - Tax: The extracted tax amount
 * - Grand Total: gross amount = Subtotal + Tax
 *
 * When tax is exclusive, subtotal is already net (before tax).
 *
 * @returns {Number} Subtotal amount to display (net amount before tax)
 */
const displaySubtotal = computed(() => {
	if (cartStore.taxInclusive) {
		// Tax inclusive: subtotal from store is gross (includes tax)
		// Display the net amount (before tax) for clarity
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		return props.subtotal - props.taxAmount
	}
	// Tax exclusive: subtotal is already net (before tax)
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	return props.subtotal
})

/**
 * Display grand total that visually equals Subtotal + Tax - Discount.
 *
 * This ensures the math is intuitive for cashiers:
 * Grand Total = displaySubtotal + Tax - Discount
 *
 * @returns {Number} Grand total amount to display
 */
const displayGrandTotal = computed(() => {
	// Always: displaySubtotal + tax - discount + rounding
	// This makes the display consistent and intuitive
	//// Neoffice — [CHF] the displayed grand total carries the Swiss 0.05 rounding, so
	//// the figure on screen equals the one that will be charged and printed (4fdb5df4).
	return displaySubtotal.value + props.taxAmount - props.discountAmount + (props.roundingAdjustment || 0)
})

/**
 * ============================================================================
 * FUNCTIONS
 * ============================================================================
 */

//// Neoffice — [R] added: what the restaurant action bar needs. hasSendableItems
//// gates the Validate button on there being a line not yet sent (it must also count
//// takeaway, which was missed at first and left the button dead), and the badge
//// classes render the per-line kitchen state (c7f6932c, a268f4e9, 2026-03-23/26).
/**
 * Check if there are items that can be sent to kitchen.
 * Excludes free items and items that have already been sent/prepared.
 * @returns {Boolean} True if at least one item can be sent
 */
const hasSendableItems = computed(() => {
	if (!cartStore.restaurantTable && !cartStore.isTakeaway) return false
	return cartStore.invoiceItems.some(
		(item) =>
			!item.is_free_item && (!item.kds_status || item.kds_status === "Waiting"),
	)
})

/**
 * Get CSS classes for KDS status badge based on status value.
 * @param {String} status - KDS status (Waiting, Pending, Preparing, Ready, Delivered)
 * @returns {String} CSS classes for the badge
 */
function kdsStatusBadgeClass(status) {
	if (status === "Waiting") return "bg-gray-100 text-gray-600"
	if (status === "Pending") return "bg-yellow-100 text-yellow-700"
	if (status === "Preparing") return "bg-blue-100 text-blue-700"
	if (status === "Ready") return "bg-green-100 text-green-700"
	if (status === "Delivered") return "bg-gray-200 text-gray-500"
	return "bg-indigo-100 text-indigo-700"
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer Search Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle customer search input with instant reactivity.
 * Updates the customerSearch ref which triggers computed filtering.
 * @param {Event} event - Input event from search field
 */
function handleSearchInput(event) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	customerSearch.value = event.target.value
}

// Track if customer history has been loaded this session
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const customerHistoryLoaded = ref(false)

/**
 * Handle search input focus - shows frequent customers dropdown.
 */
function handleSearchFocus() {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	customerSearchFocused.value = true
	// Load customer history only once per session for faster subsequent focuses
	if (!customerHistoryLoaded.value) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		customerSearchStore.loadCustomerHistory()
		customerHistoryLoaded.value = true
	}
}

/**
 * Handle search input blur - hides dropdown after a short delay.
 * Short delay as fallback for keyboard/tab navigation (mousedown.prevent handles click cases).
 */
function handleSearchBlur() {
	// Reduced delay - mousedown.prevent handles most cases, this is just for keyboard nav
	setTimeout(() => {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		customerSearchFocused.value = false
	}, 100)
}

/**
 * Handle keyboard navigation in customer search dropdown.
 * Supports:
 * - ArrowDown/ArrowUp: Navigate through results
 * - Enter: Select current or auto-select single result
 * - Escape: Clear search
 *
 * @param {KeyboardEvent} event - Keyboard event from search input
 */
function handleKeydown(event) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	if (customerResults.value.length === 0) return

	if (event.key === "ArrowDown") {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		event.preventDefault()
		selectedIndex.value = Math.min(
			selectedIndex.value + 1,
			customerResults.value.length - 1,
		)
	} else if (event.key === "ArrowUp") {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		event.preventDefault()
		selectedIndex.value = Math.max(selectedIndex.value - 1, -1)
	} else if (event.key === "Enter") {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		event.preventDefault()
		if (
			selectedIndex.value >= 0 &&
			selectedIndex.value < customerResults.value.length
		) {
			selectCustomer(customerResults.value[selectedIndex.value])
		} else if (customerResults.value.length === 1) {
			// Auto-select if only one result
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			selectCustomer(customerResults.value[0])
		}
	} else if (event.key === "Escape") {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		customerSearch.value = ""
	}
}

/**
 * Select a customer from search results.
 * Emits select-customer event and resets search state.
 * Tracks customer selection for frequency-based suggestions.
 * @param {Object} cust - Customer object to select
 */
function selectCustomer(cust) {
	// Track selection for frequent customers feature
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	customerSearchStore.trackCustomerSelection(cust.name)
	emit("select-customer", cust)
	customerSearch.value = ""
	selectedIndex.value = -1
	customerSearchFocused.value = false
	previousCustomer.value = null
}

//// Neoffice — [CU] this is the old removeCustomer path, folded into clearCustomer
//// when the red X was replaced by clicking the customer name; it now also re-focuses
//// the search so the cashier can type straight away (4a0dd461, 2026-07-09).
//// Neoffice — [CU] the doc block below describes clearCustomer, which replaced upstream's
//// removeCustomer and its red X (4a0dd461, 2026-07-09).
/**
 * Clear the currently selected customer and re-open the search input.
 * Triggered by clicking the selected customer's name (replaces the old
 * red "remove" button) so the cashier can immediately search another one.
 * Emits select-customer with null to deselect, then focuses the search box.
 */
async function clearCustomer() {
	//// Neoffice — [CU] the reset moved here from the deleted removeCustomer, so a
	//// blur cannot restore the customer the cashier just cleared (4a0dd461).
	previousCustomer.value = null
	emit("select-customer", null)
	await nextTick()
	const searchInput = document.getElementById("cart-customer-search")
	if (searchInput) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		searchInput.focus()
	}
}

/**
 * Open customer creation dialog with current search text.
 * Pre-fills the new customer name with the search query.
 */
function createNewCustomer() {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const searchValue = customerSearch.value
	// Close dropdown immediately
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	customerSearch.value = ""
	customerSearchFocused.value = false
	// Emit event to open customer creation dialog
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	emit("create-customer", searchValue)
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get initials from a customer name for avatar display.
 * Returns first letter of first two words, or first two letters if single word.
 *
 * @param {String} name - Customer name
 * @returns {String} 2-letter initials (uppercase)
 */
function getInitials(name) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	if (!name || !name.trim()) return "?"
	const parts = name.trim().split(/\s+/).filter(Boolean)
	if (parts.length === 0) return "?"
	const first = Array.from(parts[0])[0] || "?"
	if (parts.length >= 2) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		const second = Array.from(parts[1])[0] || "?"
		return (first + second).toUpperCase()
	}
	return Array.from(parts[0]).slice(0, 2).join("").toUpperCase()
}

//// Neoffice — [CU] cleanAddressParts has no upstream equivalent: ERPNext stores
//// primary_address as HTML and appends its own Phone: / Email: lines, which would print
//// twice in the popover since both are already shown above it. The HTML is split on the line
//// breaks and those two lines dropped (53d0107c + 4aac18e5, 2026-07-09).
//// sanitize primary_address HTML, drop the appended Phone:/Email: lines
/**
 * Turn the Customer `primary_address` HTML into clean address lines.
 * ERPNext stores it as HTML (<br>-separated) and appends "Phone:" / "Email:"
 * lines — those are dropped here since phone/email are shown separately.
 *
 * @param {String} raw - Raw primary_address HTML
 * @returns {String[]} Cleaned address lines (street, city, country…)
 */
function cleanAddressParts(raw) {
	if (!raw) return []
	return String(raw)
		.split(/<br\s*\/?>/i)
		.map((line) =>
			line
				.replace(/<[^>]*>/g, "")
				.replace(/&nbsp;/gi, " ")
				.replace(/\s+/g, " ")
				.trim(),
		)
		.filter(
			(line) => line && !/^(phone|email|t[ée]l(?:[ée]phone)?)\s*:/i.test(line),
		)
}

/**
 * Short one-line address snippet for a customer search result.
 *
 * @param {Object} cust - Customer object (may carry primary_address)
 * @returns {String} Address on one line, or "" when none
 */
function addressSnippet(cust) {
	return cleanAddressParts(cust?.primary_address).join(", ")
}

/**
 * Full, sanitized address for the selected-customer info popover.
 *
 * @param {Object} cust - Customer object
 * @returns {String} Plain-text address, or "" when none
 */
function formatAddress(cust) {
	return cleanAddressParts(cust?.primary_address).join(", ")
}

/**
 * Format a numeric amount as currency string.
 * Uses the component's currency prop for formatting.
 *
 * @param {Number} amount - Amount to format
 * @returns {String} Formatted currency string (e.g., "$1,234.56")
 */
function formatCurrency(amount) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	return formatCurrencyUtil(Number.parseFloat(amount || 0), props.currency)
}

// ─────────────────────────────────────────────────────────────────────────────
// Quantity Control Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intelligently determine the step size based on current quantity.
 * - Whole numbers (1, 2, 3): step by 1
 * - Multiples of 0.5 (1.5, 2.5): step by 0.5
 * - Multiples of 0.25 (0.25, 0.75): step by 0.25
 * - Multiples of 0.1 (0.1, 0.3): step by 0.1
 * - Other decimals: step by 0.01
 */
function getSmartStep(quantity) {
	// Check if it's a whole number
	if (quantity === Math.floor(quantity)) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		return 1
	}

	// Round to 4 decimal places to avoid floating point errors
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const rounded = Math.round(quantity * 10000) / 10000

	// Check if it's a multiple of 0.5
	if (Math.abs(rounded % 0.5) < 0.0001) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		return 0.5
	}

	// Check if it's a multiple of 0.25
	if (Math.abs(rounded % 0.25) < 0.0001) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		return 0.25
	}

	// Check if it's a multiple of 0.1
	if (Math.abs(rounded % 0.1) < 0.0001) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		return 0.1
	}

	// For other decimals, use 0.01 for fine control
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	return 0.01
}

/**
 * Increment item quantity using smart step.
 * Uses getSmartStep to determine appropriate increment value.
 *
 * @param {Object} item - Cart item to increment
 */
function incrementQuantity(item) {
	// Prevent editing resolved barcode items
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	if (item.is_resolved_barcode) return

	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const step = getSmartStep(item.quantity)
	const newQty = Math.round((item.quantity + step) * 10000) / 10000
	emit("update-quantity", item.item_code, newQty, item.uom)
}

/**
 * Decrement item quantity using smart step.
 * Removes item if quantity would become zero or negative.
 *
 * @param {Object} item - Cart item to decrement
 */
function decrementQuantity(item) {
	// Prevent editing resolved barcode items
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	if (item.is_resolved_barcode) return

	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const step = getSmartStep(item.quantity)
	const newQty = Math.round((item.quantity - step) * 10000) / 10000

	if (newQty <= 0) {
		// If quantity would be 0 or negative, remove the item
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		emit("remove-item", item.item_code, item.uom)
	} else {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		emit("update-quantity", item.item_code, newQty, item.uom)
	}
}

/**
 * Update quantity from direct input (manual typing).
 * Allows any positive number during typing without rounding.
 *
 * @param {Object} item - Cart item to update
 * @param {String} value - New quantity value from input
 */

function updateQuantity(item, value) {
	// Prevent editing resolved barcode items
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	if (item.is_resolved_barcode) return

	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const qty = Number.parseFloat(value)

	// If the input isn't a valid number (e.g., user cleared the field), do nothing
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	if (isNaN(qty)) return

	// If quantity is zero or negative, remove the item from the cart
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	if (qty <= 0) return emit("remove-item", item.item_code, item.uom)

	// For positive numbers, update quantity immediately (no rounding here while typing)
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	emit("update-quantity", item.item_code, qty, item.uom)
}

/**
 * Handle quantity input blur - validate and round.
 * Called when user leaves the quantity input field.
 * - Removes item if quantity is 0 or invalid
 * - Rounds to 4 decimal places for consistency
 *
 * @param {Object} item - Cart item that lost focus
 */
function handleQuantityBlur(item) {
	// When user leaves the input field, round and validate
	if (!item.quantity || item.quantity <= 0) {
		// If quantity is 0 or invalid, remove the item
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		emit("remove-item", item.item_code, item.uom)
	} else {
		// Round to 4 decimal places for consistency
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		const roundedQty = Math.round(item.quantity * 10000) / 10000
		if (roundedQty !== item.quantity) {
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			emit("update-quantity", item.item_code, roundedQty, item.uom)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// UOM (Unit of Measure) Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggle UOM dropdown visibility for an item.
 * Uses unique key combining item_code + uom to handle same item with different UOMs.
 */
function toggleUomDropdown(itemCode, uom) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const key = `${itemCode}-${uom}`
	openUomDropdown.value = openUomDropdown.value === key ? null : key
}

/**
 * Select a UOM from dropdown - changes UOM and closes dropdown
 * Handles merging if target UOM already exists in cart
 */
async function selectUom(item, newUom) {
	if (item.uom === newUom) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		openUomDropdown.value = null
		return
	}

	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const currentUom = item.uom || item.stock_uom
	await cartStore.changeItemUOM(item.item_code, newUom, currentUom)
	openUomDropdown.value = null
	emit("update-uom", item.item_code, newUom)
}

// ─────────────────────────────────────────────────────────────────────────────
// Item Edit Dialog Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the edit item dialog for an item.
 * Creates a copy of the item to avoid mutating the original.
 * Used for serial number items and advanced editing.
 *
 * @param {Object} item - Cart item to edit
 */
function openEditDialog(item) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	selectedItem.value = { ...item }
	showEditDialog.value = true
}

/**
 * Handle item update from edit dialog.
 * Updates item via cart store and emits for parent compatibility.
 *
 * @param {Object} updatedItem - Updated item data from dialog
 */
async function handleUpdateItem(updatedItem) {
	// Get the original UOM from selectedItem (before any changes)
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const originalUom = selectedItem.value?.uom || selectedItem.value?.stock_uom
	// Use store method to update item, passing original UOM to identify correct item
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	await cartStore.updateItemDetails(
		updatedItem.item_code,
		updatedItem,
		originalUom,
	)
	// Also emit for parent component compatibility
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	emit("edit-item", updatedItem)
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Handlers & Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

function selectDocType(type) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	cartStore.setTargetDoctype(type)
}

/**
 * Handle clicks outside interactive elements.
 * - Closes customer search dropdown when clicking outside
 * - Closes UOM dropdown when clicking outside
 * - Closes cart sort dropdown when clicking outside
 *
 * @param {MouseEvent} event - Click event
 */
function handleOutsideClick(event) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const target = event.target

	// Close customer search if clicking outside
	if (
		customerSearchContainer.value &&
		target instanceof Node &&
		!customerSearchContainer.value.contains(target)
	) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		customerSearch.value = ""

		// Restore previous customer if set and no customer selected
		if (previousCustomer.value && !props.customer) {
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			emit("select-customer", previousCustomer.value)
			previousCustomer.value = null
		}
	}

	// Close UOM dropdown if clicking outside
	if (openUomDropdown.value !== null) {
		// Check if click is outside all UOM dropdowns
		const clickedInsideUomDropdown =
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			target instanceof Element && target.closest(".group\\/uom")
		if (!clickedInsideUomDropdown) {
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			openUomDropdown.value = null
		}
	}

	// Close cart sort dropdown if clicking outside
	if (
		showCartSortDropdown.value &&
		cartSortContainer.value &&
		target instanceof Node &&
		!cartSortContainer.value.contains(target)
	) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		showCartSortDropdown.value = false
	}
}

/**
 * Component mounted - register global click listener.
 * Used for click-outside detection on dropdowns.
 */
onMounted(() => {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	if (typeof document === "undefined") return
	// Use mousedown instead of click to catch events before they are swallowed by other handlers
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	document.addEventListener("mousedown", handleOutsideClick)
})

/**
 * Component unmounting - cleanup global click listener.
 * Prevents memory leaks by removing event listener.
 */
onBeforeUnmount(() => {
	//// Neoffice — [GC] the edit dialog is exposed to the parent so POSSale can open it
	//// by itself the moment a zero-priced Item lands in the cart: a gift card has no
	//// price until the cashier types one, and upstream offers no way in (5dddc528,
	//// 2026-01-14 "auto-open edit dialog for zero-price items (gift cards)").
	if (typeof document === "undefined") return
	document.removeEventListener("mousedown", handleOutsideClick)
})

/**
 * Expose methods to parent component.
 * Allows POSSale to trigger edit dialog for zero-price items (e.g., gift cards).
 */
defineExpose({
	openEditDialog,
})
</script>
```
