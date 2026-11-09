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
	<!-- //// Neoffice — compact cart head, the cart carries its compact flag so that the head's style can follow it (NeoResto lot 1, product owner, 05.11.2026) -->
	<div :class="cartCompact ? 'cart--compact' : ''" class="flex flex-col h-full bg-white rounded-neo-lg overflow-hidden">
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
		<!-- //// Neoffice — compact cart head, the customer row is one slim line (NeoResto lot 1, product owner, 05.11.2026) -->
		<div data-cart-head class="px-2.5 py-2 border-b border-gray-200 bg-gray-50">
			<!-- Inline Customer Search/Selection -->
			<div ref="customerSearchContainer" class="relative">
				<div v-if="customer && !changingCustomer">
					<!-- Two Cards Layout: Customer Card + Document Type Card -->
					<div class="flex items-stretch gap-2">
						<!-- //// Neoffice — [CU] the selected-customer card became a hover target (group relative, -->
						<!-- //// min-w-0) so the full-info popover below can hang off it; upstream shows the name and -->
						<!-- //// nothing else (53d0107c, 2026-07-09 "richer customer info"). -->
						<!-- Customer Card (hover shows full-info popover) -->
						<!-- //// Neoffice — compact cart head, the selected customer's card (NeoResto lot 1, product owner, 05.11.2026) -->
						<div
							data-cart-customer class="group relative flex-1 flex items-center gap-1.5 bg-white border border-gray-200 rounded-neo-md p-1.5 shadow-neo min-w-0"
						>
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
								<!-- //// Neoffice — compact cart head, the customer's avatar (NeoResto lot 1, product owner, 05.11.2026) -->
								<div
									data-cart-customer-avatar class="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0"
								>
									<!-- //// Neoffice — customerLabel (see the script): the name of a customer that comes back from the server as a string -->
									<FeatherIcon
										v-if="isPhoneName(customerLabel)"
										name="phone"
										class="w-4 h-4 text-white"
									/>
									<svg
										v-else
										class="w-4 h-4 text-white"
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
								</div>
								<!-- //// Neoffice — compact cart head, the name and its detail side by side (NeoResto lot 1, product owner, 05.11.2026) -->
								<div class="min-w-0 flex-1" data-cart-customer-info>
									<p
										dir="auto"
										class="text-xs font-semibold text-gray-900 truncate leading-tight"
									>
										<!-- //// Neoffice — customerLabel (see the script) -->
										{{ customerLabel }}
									</p>
									<!-- //// Neoffice — [CU] e-mail shown next to the phone: it was already cached and -->
									<!-- //// never displayed, and business customers are identified by mail (4a0dd461). -->
									<p
										v-if="customer.mobile_no || customer.email_id"
										dir="ltr"
										class="text-[10px] text-gray-500 truncate leading-tight text-start"
									>
										<!-- //// Neoffice — feat(pos): smoother customer selection & full edit form (4a0dd461, 2026-07-09). -->
										<span v-if="customer.mobile_no">{{
											customer.mobile_no
										}}</span>
										<span
											v-if="customer.mobile_no && customer.email_id"
											class="text-gray-300"
										>
											·
										</span>
										<span v-if="customer.email_id">{{
											customer.email_id
										}}</span>
									</p>
									<p
										v-if="customerLpInfo.wallet_enabled"
										class="text-[10px] text-amber-600 font-medium truncate leading-tight"
									>
										{{ __("LP") }}:
										{{ formatCurrency(customerLpInfo.balance_iqd) }}
										<span v-if="customerLpInfo.balance_points">
											({{ customerLpInfo.balance_points }} {{ __("pts") }})
										</span>
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
								<!-- //// Neoffice — customerLabel (see the script) -->
								<p class="text-xs font-bold text-gray-900 truncate">
									{{ customerLabel }}
								</p>
								<div class="mt-1.5 space-y-1">
									<div
										v-if="customer.customer_type"
										class="flex items-start gap-1.5 text-[10px]"
									>
										<span class="w-12 flex-shrink-0 text-gray-400">{{
											__("Type")
										}}</span>
										<span class="text-gray-700">{{
											__(customer.customer_type)
										}}</span>
									</div>
									<div
										v-if="customer.mobile_no"
										class="flex items-start gap-1.5 text-[10px]"
									>
										<span class="w-12 flex-shrink-0 text-gray-400">{{
											__("Phone")
										}}</span>
										<span class="text-gray-700 break-all">{{
											customer.mobile_no
										}}</span>
									</div>
									<div
										v-if="customer.email_id"
										class="flex items-start gap-1.5 text-[10px]"
									>
										<span class="w-12 flex-shrink-0 text-gray-400">{{
											__("Email")
										}}</span>
										<span class="text-gray-700 break-all">{{
											customer.email_id
										}}</span>
									</div>
									<div
										v-if="formatAddress(customer)"
										class="flex items-start gap-1.5 text-[10px]"
									>
										<span class="w-12 flex-shrink-0 text-gray-400">{{
											__("Address")
										}}</span>
										<span class="text-gray-700">{{
											formatAddress(customer)
										}}</span>
									</div>
									<div
										v-if="customer.customer_group"
										class="flex items-start gap-1.5 text-[10px]"
									>
										<span class="w-12 flex-shrink-0 text-gray-400">{{
											__("Group")
										}}</span>
										<span class="text-gray-700">{{
											customer.customer_group
										}}</span>
									</div>
									<div
										v-if="customer.territory"
										class="flex items-start gap-1.5 text-[10px]"
									>
										<span class="w-12 flex-shrink-0 text-gray-400">{{
											__("Territory")
										}}</span>
										<span class="text-gray-700">{{ customer.territory }}</span>
									</div>
								</div>
							</div>

							<!-- Action Buttons -->
							<!-- //// Neoffice — compact cart head, the edit and create customer buttons (NeoResto lot 1, product owner, 05.11.2026) -->
							<div data-cart-customer-actions class="flex items-center gap-0.5 flex-shrink-0" @click.stop>
								<button
									type="button"
									@click.stop="$emit('edit-customer', customer)"
									class="w-10 h-10 flex items-center justify-center text-blue-500 hover:bg-blue-50 active:bg-blue-100 rounded-lg transition-colors touch-manipulation"
									:title="__('Edit customer details')"
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
											d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
										/>
									</svg>
								</button>
								<button
									type="button"
									@click.stop="$emit('create-customer', '')"
									class="w-10 h-10 flex items-center justify-center text-green-600 hover:bg-green-50 active:bg-green-100 rounded-lg transition-colors touch-manipulation"
									:title="__('Create new customer')"
								>
									<svg
										class="w-4 h-4"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										stroke-width="2.5"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M12 4v16m8-8H4"
										/>
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
									:class="
										cartStore.targetDoctype === 'Sales Invoice'
											? 'bg-white text-blue-600 shadow-sm'
											: 'text-gray-500 hover:text-gray-700'
									"
									:title="__('Sales Invoice')"
								>
									<svg
										class="w-3.5 h-3.5"
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
									<span>{{ __("Invoice") }}</span>
								</button>
								<button
									type="button"
									@click="selectDocType('Sales Order')"
									class="px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-200 flex items-center gap-1"
									:class="
										cartStore.targetDoctype === 'Sales Order'
											? 'bg-white text-orange-600 shadow-sm'
											: 'text-gray-500 hover:text-gray-700'
									"
									:title="__('Sales Order')"
								>
									<svg
										class="w-3.5 h-3.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
										/>
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
								ref="customerSearchInputRef"
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
						<!-- //// line is one of its attributes (b3a9d850, 2026-03-20); an HTML comment -->
						<!-- //// between them would break the tag, which is what Neoffice commit 4ed5051e undid. -->
						<div
							v-if="settingsStore.allowSalesOrder && !restaurantStore.isEnabled"
							class="flex items-center bg-gray-100 rounded-xl p-0.5 h-10"
						>
							<button
								type="button"
								@click="selectDocType('Sales Invoice')"
								class="h-full px-2.5 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-1.5"
								:class="
									cartStore.targetDoctype === 'Sales Invoice'
										? 'bg-white text-blue-600 shadow-sm'
										: 'text-gray-500 hover:text-gray-700'
								"
								:title="__('Sales Invoice')"
							>
								<svg
									class="w-4 h-4"
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
								<span class="hidden sm:inline">{{ __("Invoice") }}</span>
							</button>
							<button
								type="button"
								@click="selectDocType('Sales Order')"
								class="h-full px-2.5 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-1.5"
								:class="
									cartStore.targetDoctype === 'Sales Order'
										? 'bg-white text-orange-600 shadow-sm'
										: 'text-gray-500 hover:text-gray-700'
								"
								:title="__('Sales Order')"
							>
								<svg
									class="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
									/>
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
						v-if="
							customerSearchFocused &&
							customerSearch.trim().length < 2 &&
							customerResults.length > 0
						"
						class="px-2 py-1 bg-gray-50 border-b border-gray-200"
					>
						<span
							class="text-[10px] font-medium text-gray-500 uppercase tracking-wide"
						>
							{{ __("Frequent Customers") }}
						</span>
					</div>

					<!-- Customer Results -->
					<div
						v-if="customerResults.length > 0"
						class="max-h-48 overflow-y-auto overscroll-contain"
					>
						<button
							type="button"
							v-for="(cust, index) in customerResults"
							:key="cust.name"
							@mousedown.prevent="selectCustomer(cust)"
							:class="[
								'w-full text-start px-2 py-1.5 flex items-center gap-1.5 border-b border-gray-100 last:border-0 touch-manipulation select-none cursor-pointer active:bg-blue-200',
								index === selectedIndex
									? 'bg-blue-100'
									: 'hover:bg-blue-50 active:bg-blue-100',
							]"
						>
							<div
								class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 pointer-events-none"
							>
								<FeatherIcon
									v-if="isPhoneName(cust.customer_name)"
									name="phone"
									class="w-3 h-3 text-blue-600"
								/>
								<span v-else class="text-[10px] font-bold text-blue-600">{{
									getInitials(cust.customer_name)
								}}</span>
							</div>
							<div class="flex-1 min-w-0 pointer-events-none">
								<p dir="auto" class="text-[11px] font-semibold text-gray-900 truncate">
									{{ cust.customer_name }}
								</p>
								<!-- //// Neoffice — [CU] a search row shows phone, e-mail and a one-line address so -->
								<!-- //// the cashier can tell two same-named customers apart; upstream showed the -->
								<!-- //// phone alone. get_customers was widened to return the address rather than -->
								<!-- //// fetching per customer (4a0dd461 + 53d0107c, 2026-07-09). -->
								<p
									v-if="cust.mobile_no || cust.email_id"
									dir="ltr"
									class="text-[9px] text-gray-600 truncate text-start"
								>
									<span v-if="cust.mobile_no">{{ cust.mobile_no }}</span>
									<span
										v-if="cust.mobile_no && cust.email_id"
										class="text-gray-300"
									>
										·
									</span>
									<span v-if="cust.email_id">{{ cust.email_id }}</span>
								</p>
								<p
									v-if="addressSnippet(cust)"
									class="text-[9px] text-gray-400 truncate flex items-center gap-0.5"
								>
									<svg
										class="w-2.5 h-2.5 flex-shrink-0"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
										/>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
										/>
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
		<!-- //// Neoffice — the header zone of the cart is tighter on a phone (kitchen test, 01.11): every pixel it takes is a pixel less for the lines. -->
		<!-- //// Neoffice — compact cart head, the zone of the cart's actions is one row (NeoResto lot 1, product owner, 05.11.2026) -->
		<div v-if="items.length > 0" data-cart-top class="px-2 py-2 max-sm:py-1 border-b border-gray-200 bg-white">
			<!-- //// Neoffice — compact cart head, its title bar hands its parts to the row (NeoResto lot 1, product owner, 05.11.2026) -->
			<div data-cart-top-bar class="flex items-center justify-between mb-1.5 max-sm:mb-0.5">
				<!-- //// Neoffice — compact cart head, the title says what the cart is, which the cart already shows: it makes way for the offers (NeoResto lot 1, product owner, 05.11.2026) -->
				<h2 class="text-xs font-bold text-gray-900" data-cart-top-title>{{ __("Cart Items") }}</h2>
				<!-- //// Neoffice — compact cart head, the clear, fold and sort buttons (NeoResto lot 1, product owner, 05.11.2026) -->
				<div class="flex items-center gap-1" data-cart-top-actions>
					<!-- Clear Cart Button -->
					<!-- //// Neoffice — tighter on a phone, as the rest of the header zone -->
					<button
						@click="$emit('clear-cart')"
						class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 max-sm:py-1 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors touch-manipulation"
						type="button"
						:title="__('Clear all items')"
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
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v2M4 7h16"
							/>
						</svg>
						<span>{{ __("Clear") }}</span>
					</button>
					<!-- //// Neoffice — « Replier les services livrés » (NeoResto lot 1, Daniel, 01.11): the device's choice to draw a table's order by course and fold the courses that are all delivered. A small switch -->
					<!-- //// next to « Trier », only where it does something (a table's order of a restaurant that uses courses). The button is 44px for a finger and takes no height from the row (-my-1.5). ON is -->
					<!-- //// the ink (paper in dark), OFF a neutral track: no colour of the till's dark remap is used, so the two states stay apart there. -->
					<button
						v-if="showFoldSwitch"
						type="button"
						role="switch"
						data-test="fold-delivered-switch"
						:aria-checked="foldDelivered ? 'true' : 'false'"
						:aria-label="__('Fold delivered courses')"
						:title="__('Fold delivered courses')"
						class="-my-1.5 inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center gap-1 rounded-lg px-1 text-gray-600 hover:bg-gray-50"
						@click="setFoldDelivered(!foldDelivered)"
					>
						<LucideChevronsDownUp class="h-4 w-4 flex-none" aria-hidden="true" />
						<span
							class="relative inline-flex h-5 w-9 flex-none items-center rounded-full p-0.5 transition-colors"
							:class="foldDelivered ? 'bg-gray-800 dark:bg-ds-paper' : 'bg-gray-600'"
							aria-hidden="true"
						>
							<span
								class="block h-4 w-4 rounded-full bg-ds-paper shadow transition-transform"
								:class="foldDelivered ? 'translate-x-4 dark:bg-ds-ink' : 'translate-x-0'"
							></span>
						</span>
					</button>
					<!-- Sort Dropdown -->
					<div class="relative" ref="cartSortContainer">
						<button
							@click="toggleCartSortDropdown"
							:class="[
								'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors touch-manipulation',
								cartSortBy
									? 'text-blue-600 hover:bg-blue-50'
									: 'text-gray-600 hover:bg-gray-50',
							]"
							:title="
								cartSortBy
									? cartSortOrder === 'asc'
										? __('Sorted by {0} A-Z', [getCartSortLabel()])
										: __('Sorted by {0} Z-A', [getCartSortLabel()])
									: __('Sort cart items')
							"
							:aria-label="__('Sort cart items')"
							type="button"
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
									d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
								/>
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
								<div
									class="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-100"
								>
									{{ __("Sort Cart") }}
								</div>
								<div class="py-1">
									<!-- No Sorting (clear) -->
									<button
										@click="handleCartSortToggle(null)"
										:class="[
											'w-full px-3 py-2 text-sm transition-colors flex items-center justify-between group',
											!cartSortBy
												? 'bg-blue-50 text-blue-700'
												: 'text-gray-700 hover:bg-gray-50',
										]"
										type="button"
									>
										<span class="flex items-center gap-2.5">
											<svg
												class="w-4 h-4 text-gray-400 group-hover:text-gray-600"
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
											<span>{{ __("No Sorting") }}</span>
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
											cartSortBy === option.field
												? 'bg-blue-50 text-blue-700'
												: 'text-gray-700 hover:bg-gray-50',
										]"
										type="button"
									>
										<span class="flex items-center gap-2.5">
											<svg
												class="w-4 h-4 text-gray-400 group-hover:text-gray-600"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													:d="option.icon"
												/>
											</svg>
											<span>{{ option.label }}</span>
										</span>
										<!-- Sort direction icon -->
										<svg
											class="w-5 h-5"
											:class="
												cartSortBy === option.field
													? 'text-blue-600'
													: 'text-gray-300'
											"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												:d="
													CART_SORT_ICONS[
														getCartSortIconState(option.field)
													]
												"
											/>
										</svg>
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- //// Neoffice — compact cart head, the offers and the coupon share the row of the cart's actions (NeoResto lot 1, product owner, 05.11.2026) -->
			<!-- Offers & Coupon Buttons -->
			<div class="flex gap-2" data-cart-top-deals>
				<!-- View All Offers Button -->
				<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
				<button
					type="button"
					@click="$emit('show-offers')"
					class="relative flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 max-sm:py-1.5 rounded-neo-md bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 hover:border-green-400 hover:from-green-100 hover:to-emerald-100 hover:shadow-neo transition-all min-w-0 touch-manipulation active:scale-[0.98]"
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

				<!-- Applied coupon: code and saving, × removes it -->
				<div
					v-if="cartStore.appliedCoupon"
					class="flex-1 flex items-center min-w-0 rounded-lg border border-emerald-300 bg-emerald-50"
				>
					<button
						type="button"
						@click="$emit('apply-coupon')"
						class="flex-1 flex items-center gap-1.5 px-2.5 py-2 min-w-0 text-start"
						:aria-label="__('Coupon')"
					>
						<FeatherIcon name="tag" class="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
						<span class="text-xs font-bold text-emerald-800 truncate" dir="ltr">
							{{ cartStore.appliedCoupon.code }} −{{ formatCurrency(cartStore.appliedCoupon.amount) }}
						</span>
					</button>
					<button
						type="button"
						@click="cartStore.removeDiscountFromCart()"
						class="w-10 h-9 flex items-center justify-center text-emerald-800 hover:text-red-700 flex-shrink-0"
						:aria-label="__('Remove coupon {0}', [cartStore.appliedCoupon.code])"
						:title="__('Remove coupon {0}', [cartStore.appliedCoupon.code])"
					>
						<FeatherIcon name="x" class="w-4 h-4" />
					</button>
				</div>
				<!-- Enter Coupon Code Button -->
				<!-- //// Neoffice — [D] Neoffice theme tokens on the class below, not stock Tailwind (87f168fe). -->
				<button
					v-else
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

		<!-- //// Neoffice — « Who did the work? »: the person every line added from now on is given, the cashier's own already chosen (NeoSalon, lot G1, product owner, 09.11.2026). Nothing is drawn while the option is off. -->
		<WhoServesBar v-if="settingsStore.enableSalesPersons" :pos-profile="posProfile" :items="items" />

		<!-- Cart Items -->
		<div class="flex-1 overflow-y-auto p-0.5 sm:p-1.5 bg-gray-50">
			<div
				v-if="items.length === 0"
				class="flex flex-col items-center justify-center min-h-full px-3 sm:px-4 py-6"
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
						:title="__('Draft Invoices')"
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

					<!-- POS Expense -->
					<button
						v-if="allowPosExpense"
						type="button"
						@click="$emit('show-expense')"
						class="flex flex-col items-center justify-center p-3 sm:p-4 bg-white border border-gray-200 rounded-lg hover:border-amber-300 hover:bg-amber-50 active:bg-amber-100 transition-colors shadow-sm hover:shadow touch-manipulation group"
						:title="__('Record POS expense')"
					>
						<div
							class="w-9 h-9 sm:w-10 sm:h-10 bg-amber-50 rounded-full flex items-center justify-center mb-2 group-hover:bg-amber-100 transition-colors"
						>
							<svg
								class="w-5 h-5 text-amber-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
								/>
							</svg>
						</div>
						<span class="text-[11px] sm:text-xs font-semibold text-gray-700">{{
							__("POS Expense")
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

					<!-- Shift History -->
					<button
						type="button"
						@click="$emit('show-shift-history')"
						class="flex flex-col items-center justify-center p-3 sm:p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 active:bg-indigo-100 transition-colors shadow-sm hover:shadow touch-manipulation group"
						:title="__('View shift history')"
					>
						<div
							class="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-50 rounded-full flex items-center justify-center mb-2 group-hover:bg-indigo-100 transition-colors"
						>
							<svg
								class="w-5 h-5 text-indigo-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
								/>
							</svg>
						</div>
						<span class="text-[11px] sm:text-xs font-semibold text-gray-700">{{
							__("Shift History")
						}}</span>
					</button>
				</div>
			</div>

			<div v-else ref="cartListRef" class="flex flex-col gap-1">
				<!-- //// Neoffice — the key names the ROW too: the same dish and unit can sit on two lines (the one the kitchen has, the -->
				<!-- //// one that waits), and a key they shared let a field's focus and the quantity typed into it land on the other -->
				<!-- //// row (NeoResto lot 1, task 22, fix round 3). -->
				<!-- //// Neoffice — an offered row (task 24) shares its paid line's code and unit: it is a row of its own, so its row key tells it from the paid line. -->
				<!-- //// Neoffice — the lines come under a header per course (NeoResto lot 1, Daniel, 01.11): this outer loop walks the groups (cartEntries), the loop inside it is the cart's own, over the lines a group -->
				<!-- //// shows (a course that is all delivered shows none while it is folded). Outside a table's order of a restaurant that uses courses, or with the device's switch off, there is ONE group with no header: the flat list. -->
				<template v-for="entry in cartEntries" :key="entry.key">
				<CartCourseHeader
					v-if="entry.group && entry.group.kind !== 'loose'"
					:group-key="entry.group.key"
					:kind="entry.group.kind"
					:label="courseGroupLabel(entry.group)"
					:foldable="entry.group.delivered"
					:folded="entry.group.folded"
					:count="entry.group.count"
					:subtotal="formatCurrency(entry.group.subtotal)"
					@toggle="toggleCourse(entry.group.key)"
				/>
				<!-- //// Neoffice — the cart's own loop, now over the lines a group shows (it walked `displayCartItems` before) -->
				<template
					v-for="(item, lineIndex) in entry.rows"
					:key="
						item.item_code +
						'-' +
						(item.uom || '') +
						(item.is_free_item ? '-free' : '') +
						'-' +
						rowKeyOf(item)
					"
				>
					<!-- Free gift: its own mini line under the line that earned it, no quantity controls -->
					<div
						v-if="isLockedFreeRow(item)"
						:class="[
							'flex items-center gap-2 rounded-md border border-[#0f7a4a]/30 bg-[#e9f5ef] p-2',
							item._giftOf ? 'ms-6 -mt-0.5' : '',
						]"
					>
						<div
							class="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-lg overflow-hidden bg-white border border-[#0f7a4a]/20 flex items-center justify-center"
						>
							<img
								v-if="giftImage(item)"
								:src="giftImage(item)"
								:alt="item.item_name"
								loading="lazy"
								class="w-full h-full object-cover"
							/>
							<FeatherIcon v-else name="gift" class="w-5 h-5 text-[#0f7a4a]" />
						</div>
						<div class="flex-1 min-w-0">
							<span
								class="inline-flex items-center gap-1 rounded-full bg-[#0f7a4a] px-2 py-0.5 text-[11px] font-bold text-white"
							>
								<FeatherIcon name="gift" class="w-3 h-3" />{{ __("Free gift") }}
							</span>
							<div dir="auto" class="mt-0.5 text-sm font-semibold text-[#1d2433] leading-snug line-clamp-2">
								{{ item.item_name }}
							</div>
						</div>
						<div class="flex-shrink-0 text-end tabular-nums">
							<div class="text-sm font-bold text-[#0f7a4a]">{{ __("Free of charge") }}</div>
							<div v-if="giftValue(item) > 0" class="text-xs text-gray-500 line-through">
								<bdi>{{ formatCurrency(giftValue(item)) }}</bdi>
							</div>
							<div class="text-xs text-gray-600 inline-flex items-center gap-1">
								<bdi>{{ formatQuantity(item.quantity) }}</bdi><span aria-hidden="true">×</span>
							</div>
						</div>
					</div>

					<!-- //// Neoffice — « Offert » (NeoResto lot 1, task 24): an offered row, under its paid line (nestOfferedRows), -->
					<!-- //// or on its own when the whole line is offered: « Offert », 0.00 charged, its value struck through. -->
					<!-- //// « Annuler l'offert » hands the cart row behind the copy shown back to the cart (cartRowOf). -->
					<div
						v-else-if="isOfferedRow(item)"
						data-test="offered-line"
						:class="[
							'flex items-center gap-2 rounded-md border border-[#E9C5A4] bg-[#FAEFE6] p-2',
							item._offeredOf ? 'ms-6 -mt-0.5' : '',
							item.kds_status === 'Delivered' ? 'opacity-70' : '',
						]"
					>
						<div
							class="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-lg overflow-hidden bg-white border border-[#E9C5A4] flex items-center justify-center"
						>
							<img
								v-if="item.image"
								:src="item.image"
								:alt="item.item_name"
								loading="lazy"
								class="w-full h-full object-cover"
							/>
							<FeatherIcon v-else name="gift" class="w-5 h-5 text-[#A15A2E]" />
						</div>
						<div class="flex-1 min-w-0">
							<span
								class="inline-flex items-center gap-1 rounded-full bg-[#A15A2E] px-2 py-0.5 text-[11px] font-bold text-white"
							>
								<FeatherIcon name="gift" class="w-3 h-3" />{{ __("Offered", null, OFFER_CONTEXT) }}
							</span>
							<!-- //// Neoffice — an offered row of a delivered dish is struck through too, with its paid line (isStruck) -->
							<div dir="auto" class="mt-0.5 text-sm font-semibold text-[#1d2433] leading-snug line-clamp-2" :class="isStruck(item) ? 'line-through' : ''">
								{{ item.item_name }}
							</div>
						</div>
						<div class="flex-shrink-0 text-end tabular-nums">
							<div class="text-sm font-bold text-[#A15A2E]">{{ formatCurrency(0) }}</div>
							<div class="text-xs text-gray-500 line-through">
								<bdi>{{ formatCurrency(offeredLineValue(item)) }}</bdi>
							</div>
							<div class="text-xs text-gray-600 inline-flex items-center gap-1">
								<bdi>{{ formatQuantity(item.quantity) }}</bdi><span aria-hidden="true">×</span>
							</div>
						</div>
						<button
							type="button"
							data-test="cancel-offer"
							class="flex-shrink-0 h-11 px-3 rounded-md border border-[#E9C5A4] bg-white text-xs font-semibold text-[#A15A2E] hover:bg-[#FAEFE6] touch-manipulation"
							:aria-label="__('Cancel the offer of {0}', [item.item_name])"
							@click.stop="offeredItems.cancelOffer(cartRowOf(item))"
						>
							{{ __("Cancel the offer") }}
						</button>
					</div>

					<!-- Paid line -->
					<!-- //// Neoffice — [D] Neoffice radius token on the line (87f168fe), and [R] a line already -->
					<!-- //// delivered to the table is dimmed instead of removed, so the waiter still sees what -->
					<!-- //// was served (c7f6932c, 2026-03-23); both are in the :class of the tag below, re-attached -->
					<!-- //// to upstream develop's new cart line at the 2026-10-28 merge. -->
					<div
						v-else
						:data-line-key="lineKey(item)"
						@click="openEditDialog(item)"
						:class="[
							'rounded-neo-sm border bg-white p-2 cursor-pointer motion-safe:transition-colors motion-safe:duration-500',
							flashKey === lineKey(item)
								? 'border-blue-400 bg-blue-50'
								: 'border-gray-200 hover:border-blue-300',
							lineSaving(item) > 0 ? 'border-s-[3px] border-s-[#0f7a4a]' : '',
								item.kds_status === 'Delivered' ? 'opacity-50' : '',
								cartLineClassesOf(item),
							]"
						>
							<!-- //// Neoffice — the compact line of a restaurant till (NeoResto lot 1, product owner, 05.11.2026: « une ligne par article »): the `data-cart-*` marks tell the style below which part is which; it only lays them out in a grid when the card carries `cart-line--compact` (utils/cartLayout.js). -->
							<div class="flex gap-2 cart-line-body">
							<!-- Item Image Thumbnail -->
							<!-- //// Neoffice — [IMG] the cart thumbnail paints the Item's custom_color when it -->
							<!-- //// has no photo; upstream drew a placeholder icon, which made a restaurant cart -->
							<!-- //// of colour-coded Items unreadable (983130d3, 2026-03-25). The :style below is -->
							<!-- //// that change; the marker sits above the opening tag because it is an attribute. -->
							<!-- //// Neoffice — on a phone a dish with no photo draws no thumbnail at all (kitchen test, 01.11): the grey square with the first eight -->
							<!-- //// letters of the name took 52px of a 340px line and said nothing the name beside it did not say. A photo still shows. -->
							<div
									v-if="lineShowsThumbOf(item)"
									data-cart-thumb
									class="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200"
									:class="item.image ? '' : 'max-sm:hidden'"
								:style="
									item.image
										? {}
										: item.custom_color
										? {
												backgroundColor: item.custom_color,
												borderColor: item.custom_color,
										  }
										: {
												background:
													'linear-gradient(to bottom right, #F9FAFB, #F3F4F6)',
										  }
								"
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
								<!-- //// the line stays legible whatever the manager picked; truncated to 8 characters -->
								<!-- //// because it is the thumbnail's fallback content (983130d3). -->
								<span
									v-else
									class="text-[7px] sm:text-[8px] font-bold leading-tight text-center px-0.5 line-clamp-2"
									:class="
										item.custom_color && !isLightColor(item.custom_color)
											? 'text-white'
											: 'text-gray-400'
									"
								>
									{{ (item.item_name || "").substring(0, 8) }}
								</span>
							</div>

							<!-- //// Neoffice — compact cart line, the wrapper that lets the grid place the name, the total and the details (NeoResto lot 1, product owner, 05.11.2026) -->
							<div class="flex-1 min-w-0 cart-line-main">
								<!-- Name and line total; the total wraps under the name below 1100px -->
								<!-- //// Neoffice — except on a phone (under 640px), where the cart is the whole screen: the total stays at the right of the name, on one row (kitchen test, 01.11). -->
								<div class="flex flex-row sm:flex-col min-[1100px]:flex-row min-[1100px]:items-start gap-x-2 cart-line-head">
									<!-- //// Neoffice — a delivered line is struck through where the cart is drawn by course (isStruck), its name and its total: what is done is crossed out, as on the kitchen's ticket -->
									<h4
											dir="auto"
											data-cart-name
											class="flex-1 min-w-0 text-sm font-semibold text-gray-900 leading-snug line-clamp-2"
										:class="isStruck(item) ? 'line-through' : ''"
									>
										{{ item.item_name }}
									</h4>
									<!-- //// Neoffice — the total is right-aligned on a phone, where it stands beside the name -->
									<div data-cart-total class="flex-shrink-0 tabular-nums max-sm:text-end min-[1100px]:text-end">
										<div class="text-base font-bold text-[#1d2433]" :class="isStruck(item) ? 'line-through' : ''">
											{{ formatCurrency(getLineAmount(item)) }}
										</div>
										<div v-if="lineSaving(item) > 0" class="text-xs text-gray-500 line-through">
											{{ formatCurrency(getLineAmount(item) + lineSaving(item)) }}
										</div>
									</div>
								</div>

								<!-- Meta row: unit price, gift split, batch, serial, unit -->
								<!-- //// Neoffice — compact cart line, the quantity × price row is placed by the grid (NeoResto lot 1, product owner, 05.11.2026) -->
								<div
										data-cart-meta
										class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 mt-0.5"
									>
									<!-- Quantity × price as separate boxes, so they order with the page direction -->
									<!-- //// Neoffice — « 1 × CHF 21.50 » repeats the line's total, so on a phone it only shows when the quantity is not one or a price is struck out (kitchen test, 01.11). -->
									<!-- //// Neoffice — compact cart line, a quantity of one says nothing its total does not: the line hides « 1 × price » at every width (NeoResto lot 1, product owner, 05.11.2026) -->
									<span
											class="inline-flex items-center gap-1 tabular-nums"
											:class="Number(item.quantity) === 1 && !getLineStrikePrice(item) ? 'max-sm:hidden cart-line-single' : ''"
										>
										<bdi>{{ formatQuantity(item.quantity) }}</bdi>
										<span aria-hidden="true">×</span>
										<s v-if="getLineStrikePrice(item)" class="text-gray-500"
											><bdi>{{ formatCurrency(getLineStrikePrice(item)) }}</bdi></s
										>
										<bdi :class="getLineStrikePrice(item) ? 'font-semibold text-[#0f7a4a]' : ''">{{
											formatCurrency(getLineNetRate(item))
										}}</bdi>
									</span>
									<span
										v-if="item._bundledFreeQty > 0"
										class="font-semibold text-emerald-700"
									>
										{{
											__("{0} = {1} + {2} gift", [
												formatQuantity(getDisplayQuantity(item)),
												formatQuantity(item.quantity),
												formatQuantity(item._bundledFreeQty),
											])
										}}
									</span>
									<span v-if="item.batch_no" :class="batchExpiryClass(item)">
										{{ __("Batch {0}", [item.batch_no]) }}
										<template v-if="batchExpiry(item)">
											· {{ __("expires {0}", [formatDate(batchExpiry(item))]) }}
										</template>
									</span>
									<span
										v-if="item.serial_no"
										dir="ltr"
										:title="serialList(item).join(', ')"
									>
										SN …{{ serialList(item).at(-1)?.slice(-6) }}
										<template v-if="serialList(item).length > 1">
											+{{ serialList(item).length - 1 }}
										</template>
									</span>
									<span
										v-if="(item.uom || item.stock_uom) !== item.stock_uom"
										class="font-semibold text-gray-700"
									>
										{{ item.uom }}
									</span>
									<span
										v-if="item.sales_person"
										class="text-blue-700 truncate max-w-[8rem]"
										:title="item.sales_person_name || item.sales_person"
									>
										{{ item.sales_person_name || item.sales_person }}
									</span>
									<!-- //// Neoffice — a product the till does not follow by person says it asks for nobody, instead of looking forgotten (NeoSalon, lot G1, canvas « Caisse 1 »). -->
									<span
										v-else-if="settingsStore.enableSalesPersons && !settingsStore.trackProductSalesByPerson && kindOfLine(item) === 'product'"
										class="text-gray-500 truncate max-w-[12rem]"
										data-test="line-no-person-asked"
									>
										{{ __("Product: no person asked") }}
									</span>
								</div>

								<!-- //// Neoffice — [R] restaurant facts of the line, none of which upstream has: the -->
								<!-- //// free-text note the waiter typed, the preparation station the Item is routed to -->
								<!-- //// (colour from the station record), the line's own kitchen state, and a summary of -->
								<!-- //// the chosen product options, so the ticket can be checked before it is sent -->
								<!-- //// (87f168fe, e005b94b, 831857f2, 4df0caf1, c7f6932c, 2026-03-20/23). -->
								<div
									v-if="
										item.posa_special_instructions ||
										(item.preparation_station && restaurantStore.isEnabled) ||
										(cartStore.restaurantTable && lineShowsKitchenState(item)) ||
										showFamilyChip(item)
										"
										data-cart-chips
										class="flex flex-wrap items-center gap-1 mt-0.5"
									>
									<!-- Special Instructions Badge (Restaurant mode) -->
									<span
										v-if="item.posa_special_instructions"
										class="inline-flex items-center px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[9px] font-bold flex-shrink-0"
										:title="item.posa_special_instructions"
									>
										<FeatherIcon name="edit-3" class="w-2.5 h-2.5 me-0.5" />
										{{ __("Note") }}
									</span>
									<!-- //// Neoffice — the course of the line (service families, NeoResto lot 1): a tap on the chip gives the line another -->
									<!-- //// course ("une entrée prise en plat"), until the kitchen has the line. -->
									<ServiceFamilyChip
										v-if="showFamilyChip(item)"
										:family="item.service_family"
										:editable="canChangeFamily(item)"
										@change="changeFamily(item, $event)"
									/>
									<!-- Preparation Station Badge (Restaurant mode) -->
									<span
										v-if="item.preparation_station && restaurantStore.isEnabled"
										class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 text-white"
										:style="{ backgroundColor: getStationColor(item.preparation_station) }"
									>
										{{ getStationDisplayName(item.preparation_station) }}
									</span>
									<!-- KDS Item Status Badge -->
									<!-- //// Neoffice — none for a line of a station that works on paper alone (lineShowsKitchenState) -->
									<span
										v-if="cartStore.restaurantTable && lineShowsKitchenState(item)"
										class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0"
										:class="kdsStatusBadgeClass(item.kds_status)"
									>
										<FeatherIcon
											v-if="item.kds_status === 'Waiting'"
											name="clock"
											class="w-2.5 h-2.5 me-0.5"
										/>
										<!-- //// Neoffice — the kitchen status is a label under its own context (kitchenStatusLabel), not the bare word every app shares (NeoResto lot 1, task 9) -->
										{{ kitchenStatusLabel(item.kds_status) }}
									</span>
								</div>
								<!-- Item Modifiers Summary -->
								<!-- //// Neoffice — compact cart line, the options row is placed by the grid (NeoResto lot 1, product owner, 05.11.2026) -->
								<div
									v-if="item.posa_item_modifiers && restaurantStore.isEnabled"
										data-cart-mods
										class="text-[10px] text-gray-500 mt-0.5 truncate"
								>
									{{ formatModifiers(item.posa_item_modifiers) }}
								</div>

								<!-- Controls: quantity, unit, remove -->
								<!-- //// Neoffice — compact cart line, the controls row hands its parts to the grid (NeoResto lot 1, product owner, 05.11.2026) -->
								<div class="flex items-center gap-2 mt-1.5 cart-line-controls" @click.stop>
									<!-- Serial items: count + edit serials -->
									<!-- //// Neoffice — compact cart line, a serial count is placed like the stepper (NeoResto lot 1, product owner, 05.11.2026) -->
									<div
										v-if="item.has_serial_no && item.serial_no"
										data-cart-serial
										class="flex items-center gap-1"
									>
										<span
											class="flex items-center h-10 px-2 rounded-md bg-blue-50 border border-blue-200 text-sm font-bold text-blue-700 tabular-nums"
										>
											<FeatherIcon name="hash" class="w-3.5 h-3.5 me-0.5" />{{ item.quantity }}
										</span>
										<button
											type="button"
											@click="openEditDialog(item)"
											class="w-10 h-10 max-[1100px]:w-11 max-[1100px]:h-11 flex items-center justify-center rounded-md border border-gray-200 text-blue-700 hover:bg-blue-50"
											:title="__('Edit serials')"
											:aria-label="__('Edit serials')"
										>
											<FeatherIcon name="edit-2" class="w-4 h-4" />
										</button>
									</div>
									<!-- Quantity stepper (total units, including a carved gift) -->
									<!-- //// Neoffice — compact cart line, the quantity stepper is placed by the grid (NeoResto lot 1, product owner, 05.11.2026) -->
									<div
										v-else
										data-cart-stepper
										:class="[
											'flex items-center border rounded-md overflow-hidden',
											item.is_resolved_barcode
												? 'border-amber-300 bg-amber-50'
												: 'border-gray-200 bg-white',
										]"
									>
										<button
											type="button"
											@click="decrementQuantity(item)"
											:disabled="item.is_resolved_barcode"
											class="w-10 h-10 max-[1100px]:w-11 max-[1100px]:h-11 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:bg-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent touch-manipulation"
											:aria-label="__('Decrease quantity')"
											:title="
												item.is_resolved_barcode
													? __('Quantity locked (barcode item)')
													: __('Decrease quantity')
											"
										>
											<FeatherIcon name="minus" class="w-4 h-4" />
										</button>
										<!-- //// Neoffice — @blur hands over its event: a sent line shows its quantity again when the field is left unreadable (NeoResto lot 1, task 22, fix round 2); Escape drops what was typed (fix round 3) -->
										<input
											:value="formatQuantity(getDisplayQuantity(item))"
											@input="updateQuantity(item, $event.target.value)"
											@blur="handleQuantityBlur(item, $event)"
											@keydown.enter="$event.target.blur()"
											@keydown.esc="cancelTypedQuantity(item, $event)"
											type="text"
											inputmode="decimal"
											dir="ltr"
											:disabled="item.is_resolved_barcode"
											class="w-14 h-10 max-[1100px]:h-11 text-center border-x border-gray-200 text-sm font-bold tabular-nums bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600 disabled:text-amber-700"
											:aria-label="__('Quantity')"
											:title="
												item.is_resolved_barcode
													? __('Quantity locked (barcode item)')
													: ''
											"
										/>
										<button
											type="button"
											@click="incrementQuantity(item)"
											:disabled="item.is_resolved_barcode"
											class="w-10 h-10 max-[1100px]:w-11 max-[1100px]:h-11 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:bg-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent touch-manipulation"
											:aria-label="__('Increase quantity')"
											:title="
												item.is_resolved_barcode
													? __('Quantity locked (barcode item)')
													: __('Increase quantity')
											"
										>
											<FeatherIcon name="plus" class="w-4 h-4" />
										</button>
									</div>

									<!-- UOM Selector Dropdown (only when the item has other units) -->
									<!-- //// Neoffice — compact cart line, the unit selector is placed by the grid (NeoResto lot 1, product owner, 05.11.2026) -->
									<div
										v-if="item.item_uoms && item.item_uoms.length > 0"
										data-cart-uom
										class="relative group/uom"
									>
										<button
											type="button"
											@click="toggleUomDropdown(item.item_code, item.uom)"
											:disabled="item.is_resolved_barcode"
											class="h-10 max-[1100px]:h-11 px-3 flex items-center gap-1 rounded-md border border-gray-200 text-sm font-semibold text-gray-700 hover:border-blue-400 disabled:text-amber-700 disabled:bg-amber-50"
											:title="
												item.is_resolved_barcode
													? __('UOM locked (barcode item)')
													: __('Click to change unit')
											"
										>
											{{ item.uom || item.stock_uom || __("Nos", null, "UOM") }}
											<FeatherIcon
												name="chevron-down"
												:class="[
													'w-3.5 h-3.5 transition-transform',
													openUomDropdown === `${item.item_code}-${item.uom}`
														? 'rotate-180'
														: '',
												]"
											/>
										</button>
										<div
											v-if="openUomDropdown === `${item.item_code}-${item.uom}`"
											class="absolute top-full start-0 mt-0.5 bg-white border border-gray-200 rounded-md shadow-xl z-50 min-w-full overflow-hidden"
										>
											<button
												v-for="uom in [item.stock_uom, ...item.item_uoms.map((u) => u.uom)]"
												:key="uom"
												type="button"
												@click="selectUom(item, uom)"
												:class="[
													'w-full text-start px-3 py-2.5 text-sm font-semibold border-b border-gray-100 last:border-0',
													(item.uom || item.stock_uom) === uom
														? 'bg-blue-50 text-blue-700'
														: 'text-gray-700 hover:bg-blue-50',
												]"
											>
												{{ uom || __("Nos", null, "UOM") }}
											</button>
										</div>
									</div>

									<!-- //// Neoffice — [R] the two per-line restaurant actions: push this line to the -->
									<!-- //// kitchen on its own (a restaurant sends courses one at a time) and add a note or -->
									<!-- //// product option (c7f6932c + 87f168fe, 2026-03-20/23; 4df0caf1). The line shown is a copy -->
									<!-- //// (nestFreeRows): both hand over the cart row behind it (cartRowOf, osiris 30.10.2026). -->
									<div class="contents cart-line-actions">
									<!-- //// Neoffice — compact cart line, the send button sits under the name, on the chips' row (NeoResto lot 1, product owner, 05.11.2026) -->
									<button
										v-if="cartStore.restaurantTable && item.kds_status === 'Waiting'"
										data-cart-send
										type="button"
										@click="
											commitTypedQuantity();
											$emit('send-item-to-kitchen', cartRowOf(item));
										"
										class="ms-auto w-10 h-10 max-[1100px]:w-11 max-[1100px]:h-11 flex items-center justify-center rounded-md text-purple-600 hover:text-purple-800 hover:bg-purple-50 touch-manipulation"
										:aria-label="__('Send to kitchen')"
										:title="__('Send to kitchen')"
									>
										<FeatherIcon name="zap" class="w-4 h-4" />
									</button>
									<!-- //// Neoffice — the options button too hands over the cart row behind the copy shown (cartRowOf). -->
									<!-- //// Neoffice — compact cart line, the note button has its own column (NeoResto lot 1, product owner, 05.11.2026) -->
									<button
										@click="$emit('open-modifiers', cartRowOf(item))"
										v-if="cartStore.restaurantTable"
										data-cart-notes
										type="button"
										:class="[
											'w-10 h-10 max-[1100px]:w-11 max-[1100px]:h-11 flex items-center justify-center rounded-md text-gray-500 hover:text-blue-700 hover:bg-blue-50 touch-manipulation',
											item.kds_status === 'Waiting' ? '' : 'ms-auto',
										]"
										:aria-label="__('Add Note / Modifier')"
										:title="__('Add Note / Modifier')"
									>
										<FeatherIcon name="edit-3" class="w-4 h-4" />
									</button>
									<!-- //// Neoffice — compact cart line, closes the group of the note and send buttons (NeoResto lot 1, product owner, 05.11.2026) -->
									</div>
									<!-- //// Neoffice — [CART] emits the item OBJECT, not (item_code, uom): with product options -->
									<!-- //// the same item_code sits on several cart lines, and removing by code deleted the wrong -->
									<!-- //// one (7e1376a3, 2026-03-31 "remove deletes only one item (by ref)"). The line shown is -->
									<!-- //// a copy (nestFreeRows): emit the cart row behind it, or the bin does nothing (30.10.2026). -->
									<button
										type="button"
										data-cart-remove
										@click="$emit('remove-item', cartRowOf(item))"
										:class="[
											'w-10 h-10 max-[1100px]:w-11 max-[1100px]:h-11 flex items-center justify-center rounded-md text-gray-500 hover:text-red-700 hover:bg-red-50 touch-manipulation',
											cartStore.restaurantTable ? '' : 'ms-auto',
										]"
										:aria-label="__('Remove {0}', [item.item_name])"
										:title="__('Remove item')"
									>
										<FeatherIcon name="trash-2" class="w-4 h-4" />
									</button>
								</div>

								<!-- Saving: its own full-size line with the offer name -->
								<!-- Saving: what the customer gets and keeps; the offer's name on its own line -->
								<!-- //// Neoffice — compact cart line, the offer line spans the whole card (NeoResto lot 1, product owner, 05.11.2026) -->
								<div
										v-if="lineSaving(item) > 0"
										data-cart-saving
										class="mt-1.5 rounded-md bg-[#e9f5ef] px-2 py-1 text-sm text-[#0f7a4a]"
									>
									<div class="flex items-center justify-between gap-2">
										<span class="flex items-center gap-1.5 min-w-0 font-bold">
											<FeatherIcon
												:name="isGiftSaving(item) ? 'gift' : 'tag'"
												class="w-4 h-4 flex-shrink-0"
											/>
											<span class="truncate">{{ savingTitle(item) }}</span>
										</span>
										<span class="font-bold tabular-nums flex-shrink-0">
											{{ __("You save {0}", [formatCurrency(lineSaving(item))]) }}
										</span>
									</div>
									<div
										v-if="savingSource(item)"
										dir="auto"
										class="truncate text-xs text-[#0f7a4a]/80 ps-[22px]"
										:title="savingSource(item)"
									>
										{{ savingSource(item) }}
									</div>
								</div>
							</div>
						</div>
					</div>
				</template>
				<!-- //// Neoffice — closes the loop over the groups opened above -->
				</template>
			</div>
		</div>

		<!-- Totals Summary -->
		<!-- //// Neoffice — the totals zone is marked off from the list by a soft shadow on a phone, and its figures stand side by side (kitchen test, 01.11): the quantity, -->
		<!-- //// the subtotal and the tax were three rows of a 600px-high screen; as three cells of one row (the discount, when there is one, keeps a row of its own) they leave -->
		<!-- //// the lines room to show. The two `contents` wrappers are invisible from 640px up: nothing changes on a desktop. -->
		<div class="p-1.5 sm:p-2 bg-white border-t border-gray-200 max-sm:shadow-[0_-6px_10px_-8px_rgba(0,0,0,0.18)]">
			<div class="max-sm:grid max-sm:grid-cols-3 max-sm:gap-x-2 max-sm:mb-1 sm:contents">
			<!-- Summary Details -->
			<!-- //// Neoffice — `contents`: the quantity and subtotal rows become cells on a phone -->
			<div v-if="items.length > 0" class="mb-1.5 max-sm:contents">
				<div class="flex items-center justify-between text-xs text-gray-600 mb-0.5 max-sm:flex-col max-sm:items-start max-sm:mb-0">
					<span class="font-medium">{{ __("Total Quantity") }}</span>
					<span class="font-bold text-gray-900 text-center min-w-[60px]">{{
						formatQuantity(totalQuantity)
					}}</span>
				</div>
				<!-- //// Neoffice — the subtotal is the second cell on a phone -->
				<div class="flex items-center justify-between text-xs text-gray-600 max-sm:flex-col max-sm:items-start">
					<span class="font-medium">{{ __("Subtotal") }}</span>
					<span class="font-bold text-gray-900 text-center min-w-[60px]">{{
						formatCurrency(displaySubtotal)
					}}</span>
				</div>
			</div>

			<!-- Summary Details (continued) -->
			<!-- //// Neoffice — `contents`: this block's rows join the cells of the row above on a phone -->
			<div v-if="items.length > 0" class="mb-1.5 max-sm:contents">
				<!-- //// Neoffice — the discount keeps a row of its own, last, on a phone -->
				<!-- Discount Display: savings in green, with the applied coupon -->
				<div
					v-if="displayDiscountAmount > 0"
					class="flex items-center justify-between gap-2 mb-0.5 bg-emerald-50 rounded px-1.5 py-1 -mx-0.5 max-sm:col-span-3 max-sm:order-last"
				>
					<div class="flex items-center gap-1.5 min-w-0">
						<FeatherIcon name="tag" class="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
						<span class="text-xs font-bold text-emerald-800">{{ __("Customer saves") }}</span>
						<span
							v-if="cartStore.appliedCoupon"
							class="inline-flex items-center rounded-full border border-emerald-300 bg-white ps-2 text-[11px] font-bold text-emerald-800 min-w-0"
						>
							<span class="truncate" dir="ltr">{{ cartStore.appliedCoupon.code }}</span>
							<button
								type="button"
								@click="cartStore.removeDiscountFromCart()"
								class="w-7 h-6 flex items-center justify-center hover:text-red-700"
								:aria-label="__('Remove coupon {0}', [cartStore.appliedCoupon.code])"
							>
								<FeatherIcon name="x" class="w-3 h-3" />
							</button>
						</span>
					</div>
					<span class="text-sm font-extrabold text-emerald-700 tabular-nums" dir="ltr">
						−{{ formatCurrency(displayDiscountAmount) }}
					</span>
				</div>

				<!-- //// Neoffice — the tax is the third cell of that row on a phone -->
				<div class="flex items-center justify-between text-xs text-gray-600 max-sm:flex-col max-sm:items-start">
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
				<!-- //// Neoffice — closes the row of three cells opened above (phone) -->
				</div>

			<!-- //// Neoffice — [CHF] added: Swiss cash has no coin under 0.05, so the total is -->
			<!-- //// rounded to the currency's smallest fraction and the adjustment is shown as -->
			<!-- //// its own line; hiding it would make the receipt look wrong by a few cents -->
			<!-- //// (4fdb5df4, 2026-04-04 "rounding total, tips visibility, cash quick amounts"). -->
			<!-- Rounding Adjustment -->
			<div
				v-if="roundingAdjustment !== 0"
				class="flex items-center justify-between text-xs text-gray-600 px-1 mb-1"
			>
				<span class="font-medium">{{ __("Rounding") }}</span>
				<span class="font-bold text-center min-w-[60px]">{{
					formatCurrency(roundingAdjustment)
				}}</span>
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
				<div
					v-if="cartStore.guestPaidAmount > 0"
					class="mt-1.5 pt-1.5 border-t border-blue-200 space-y-1"
				>
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold text-green-700">
							{{ __("Already paid (guest)") }}
						</span>
						<span class="text-sm font-bold text-green-600">
							{{ formatCurrency(cartStore.guestPaidAmount) }}
						</span>
					</div>
					<div
						v-if="cartStore.guestTipAmount > 0"
						class="flex items-center justify-between"
					>
						<span class="text-xs text-green-600 italic">
							{{ __("Tip (guest)") }}
						</span>
						<span class="text-xs text-green-600 italic">
							{{ formatCurrency(cartStore.guestTipAmount) }}
						</span>
					</div>
					<!-- //// Neoffice — a cart paid on the phone is checked before it is sold: its check opens again from here (scanning in the shop, lot 4) -->
					<button
						v-if="cartStore.shopCartCheck"
						type="button"
						class="w-full py-1.5 rounded-neo-md text-xs font-bold text-white bg-gray-900 hover:bg-gray-800"
						@click="cartStore.$patch({ shopCartCheckOpen: true })"
					>
						{{ __("Check the cart {0}", [cartStore.shopCartCheck.code]) }}
					</button>
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold text-orange-600">
							{{ __("Remaining to collect") }}
						</span>
						<span class="text-sm font-bold text-orange-600">
							{{
								formatCurrency(
									Math.max(0, displayGrandTotal - cartStore.guestPaidAmount)
								)
							}}
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
			<!-- //// Neoffice — « Commander la suite » (service families, NeoResto lot 1): when courses are held back at a table, the waiter -->
			<!-- //// orders the next one (named on the button), or everything held for a table in a hurry. Only the waiter's gesture releases a -->
			<!-- //// held course; the kitchen touches nothing. -->
			<!-- //// Neoffice — the two buttons that order are easy to see (Daniel, 01.11: « il faut mettre les 2 boutons de commande plus visibles »): « Commander la suite » is a SOLID ink button, « Tout commander » keeps -->
			<!-- //// a white face under a thick ink outline, with bold words, both as tall as « Valider » and « Payer » under them (Daniel, 01.11: « aligne les boutons sur la taille Valider / Payer »: 36px, the outlined one gives its 2px borders back in its padding). On a phone (under 640px) they stack at full width, the ink one first; from 640px they sit side by side, the ink one taking the -->
			<!-- //// width and the outlined one fitting its words. Every action is ink (the design system); in dark the ink turns to paper (ds-paper) and its words to ink, the outline to paper. -->
			<div v-if="showNextCourse" class="flex flex-col sm:flex-row gap-1.5 mb-1.5">
				<button
					type="button"
					data-order-next-course
					@click="orderNextCourse"
					class="w-full sm:flex-1 py-2.5 px-3 rounded-neo-md bg-[#141414] text-white hover:bg-[#2B2B2B] active:bg-black dark:bg-ds-paper dark:text-ds-ink dark:hover:bg-ds-sand-300 dark:active:bg-ds-sand-400 font-bold text-xs transition-all flex items-center justify-center touch-manipulation"
				>
					{{ nextCourseLabel(nextCourse.family) }}
				</button>
				<!-- //// Neoffice — « Tout commander »: a white face under a thick ink outline (2px), bold words, the height of « Valider » (py-2 + 2px border = py-2.5); paper outline and words in dark. `class` comes first so that this marker stands next to it. -->
				<button
					class="w-full sm:w-auto py-2 px-3 rounded-neo-md border-2 border-[#141414] bg-white text-[#141414] hover:bg-gray-50 active:bg-gray-100 dark:border-ds-paper dark:text-ds-paper font-bold text-xs transition-all flex items-center justify-center touch-manipulation"
					type="button"
					data-order-everything
					@click="orderEverything"
				>
					{{ orderEverythingLabel() }}
				</button>
			</div>
			<!-- Restaurant Mode Buttons -->
			<div
				v-if="
					restaurantStore.isEnabled &&
					(cartStore.restaurantTable || cartStore.isTakeaway)
				"
				class="flex gap-1.5"
			>
				<!-- Send to Kitchen Button (Primary - green) -->
				<!-- //// Neoffice — the quantity typed in a field that is still focused is committed first (fix round 3). -->
				<button
					type="button"
					@click="openKitchenDialog"
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
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
					<!-- //// Neoffice — msgid was the French "Valider" (RULE: source files are English, -->
					<!-- //// the French lives in locale/fr.po). Displayed text unchanged. -->
					<span>{{ __("Validate") }}</span>
				</button>

				<!-- Pay Button (blue) — disabled if fully paid by guest -->
				<button
					type="button"
					@click="handleProceedToPayment"
					:disabled="
						items.length === 0 ||
						(cartStore.guestPaidAmount > 0 &&
							cartStore.guestPaidAmount >= displayGrandTotal)
					"
					:class="[
						'flex-1 py-2.5 px-3 rounded-neo-md font-bold text-xs text-white transition-all flex items-center justify-center touch-manipulation',
						items.length === 0 ||
						(cartStore.guestPaidAmount > 0 &&
							cartStore.guestPaidAmount >= displayGrandTotal)
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
					<!-- //// Neoffice — msgid was the French "Payer", which fr.po had picked up as the -->
					<!-- //// ENGLISH noun and translated to "Payeur": the Pay button of a French till read -->
					<!-- //// "Payeur". Reuses the existing "Pay" msgid, already translated "Payer". -->
					<span>{{ __("Pay") }}</span>
				</button>

				<!-- //// Neoffice — the kitchen ticket of the table, printed again by the server (NeoResto lot 1, Daniel, 02.11.2026: a kitchen with tickets only): drawn where a station that has lines at the kitchen has a printer (utils/tillKitchenTicket.js) -->
				<button
					v-if="kitchenTicket?.available"
					type="button"
					data-kitchen-ticket
					@click="printKitchenTicket"
					class="w-10 py-2.5 rounded-neo-md text-white transition-all flex items-center justify-center touch-manipulation bg-gray-600 hover:bg-gray-700 active:bg-gray-800 shadow-neo-md hover:shadow-neo-lg active:scale-[0.98]"
					:title="__('Print the kitchen ticket again')"
					:aria-label="__('Print the kitchen ticket again')"
				>
					<span class="relative flex items-center justify-center">
						<svg
							v-if="kitchenTicket.phase === 'sending' || kitchenTicket.phase === 'printing'"
							class="w-4 h-4 animate-spin"
							fill="none"
							viewBox="0 0 24 24"
						>
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
						</svg>
						<svg v-else-if="kitchenTicket.phase === 'printed'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						<svg
							v-else-if="kitchenTicket.phase === 'offline' || kitchenTicket.phase === 'failed'"
							class="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="2.5"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v5m0 3.5v.01M12 3l9.5 17h-19L12 3z" />
						</svg>
						<!-- A receipt: the paper that goes to the kitchen (the printer is the bill's) -->
						<svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M7 3h10a2 2 0 012 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 012-2zM9 8h6M9 12h6" />
						</svg>
						<span
							v-if="kitchenTicket.phase !== 'idle' && kitchenTicket.text"
							role="status"
							aria-live="polite"
							data-kitchen-ticket-state
							:class="[
								'absolute bottom-full right-0 mb-3 w-max max-w-[16rem] rounded-neo-md px-2 py-1 text-right text-[11px] font-semibold leading-tight shadow-neo-md',
								kitchenTicketStateClass,
							]"
						>
							{{ kitchenTicket.text }}
						</span>
					</span>
				</button>

				<!-- Print Provisional Ticket Button (compact - gray) -->
				<!-- //// Neoffice — the ticket shows the quantity typed in a field that is still focused (fix round 3). -->
				<button
					type="button"
					@click="printProvisionalTicket"
					:disabled="items.length === 0"
					:class="[
						'w-10 py-2.5 rounded-neo-md text-white transition-all flex items-center justify-center touch-manipulation',
						items.length === 0
							? 'bg-gray-300 cursor-not-allowed'
							: 'bg-gray-600 hover:bg-gray-700 active:bg-gray-800 shadow-neo-md hover:shadow-neo-lg active:scale-[0.98]',
					]"
					:aria-label="__('Print provisional ticket')"
				>
					<!-- //// Neoffice — the ticket's state on the button (ruling 97, NeoResto task 28a): a spinner while -->
					<!-- //// it is sent and printed, a tick once printed, a warning when the printer is offline or it did -->
					<!-- //// not print, and what it means in words above the button (utils/provisionalTicket.js). -->
					<span class="relative flex items-center justify-center">
						<svg
							v-if="ticketState.phase === 'sending' || ticketState.phase === 'printing'"
							class="w-4 h-4 animate-spin"
							fill="none"
							viewBox="0 0 24 24"
						>
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
						</svg>
						<svg
							v-else-if="ticketState.phase === 'printed'"
							class="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="3"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						<svg
							v-else-if="ticketState.phase === 'offline' || ticketState.phase === 'failed'"
							class="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="2.5"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v5m0 3.5v.01M12 3l9.5 17h-19L12 3z" />
						</svg>
					<!-- //// Neoffice — upstream's printer icon, now shown only when no ticket is on its way (task 28a). -->
					<svg
						v-else
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
						<!-- //// Neoffice — what the ticket's state means, in words, above the button (ruling 97, task 28a). -->
						<span
							v-if="ticketState.phase !== 'idle'"
							role="status"
							aria-live="polite"
							data-provisional-ticket-state
							:class="[
								'absolute bottom-full right-0 mb-3 w-max max-w-[16rem] rounded-neo-md px-2 py-1 text-right text-[11px] font-semibold leading-tight shadow-neo-md',
								ticketStateClass,
							]"
						>
							{{ ticketState.text }}
						</span>
					</span>
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
					:aria-label="__('Hold')"
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
					<span>{{ __("Hold") }}</span>
				</button>
			</div>
		</div>

		<!-- Edit Item Dialog -->
		<!-- //// Neoffice — « Offert » (task 24): whether the line may be offered, and the offer confirmed in the dialog. -->
		<EditItemDialog
			v-model="showEditDialog"
			:item="selectedItem"
			:warehouses="warehouses"
			:currency="currency"
			:can-offer="canOfferSelected"
			@update-item="handleUpdateItem"
			@offer-item="handleOfferItem"
		/>
	</div>
</template>

<script setup>
/**
 * ============================================================================
 * IMPORTS
 * ============================================================================
 */
import { promoApi } from "@/utils/promoApi";
//// Neoffice — [R] the cart reads the restaurant store (table, takeaway, stations)
//// and [IMG] the colour helper for Items with no photo, neither of which exists
//// upstream (8aa35c29, 983130d3). [F] the currency import was wrapped by Biome.
import { usePOSCartStore } from "@/stores/posCart";
import { usePOSSettingsStore } from "@/stores/posSettings";
import { usePOSOffersStore } from "@/stores/posOffers";
import { useCustomerSearchStore } from "@/stores/customerSearch";
//// Neoffice — feat: Phase 1 restaurant module - header toggle, UI cleanup, multi-room tabs (8aa35c29, 2026-03-20).
import { useRestaurantStore } from "@/stores/restaurant";
//// Neoffice — the compact lines of a restaurant till's cart (NeoResto lot 1, 05.11.2026)
import { cartIsCompact, cartLineClasses, cartShowsPictures, lineShowsThumb } from "@/utils/cartLayout";
import { isLightColor } from "@/utils/itemColors";
//// Neoffice — the row actions hand over the cart row behind a shown copy (utils/cartRow.js).
import { cartRowOf, rowKeyOf } from "@/utils/cartRow";
//// Neoffice — which lines have left for the kitchen: their typed quantity waits for the end of the typing (NeoResto lot 1, task 22, fix round 2)
import { hasLeftForTheKitchen, showsKitchenState } from "@/utils/lineKitchenState";
//// Neoffice — the badge of a dish sent to the kitchen shows its status through kitchenStatusLabel (NeoResto lot 1, task 9)
import { kitchenStatusLabel } from "@/utils/kitchenStatus";
import { DEFAULT_CURRENCY, formatCurrency as formatCurrencyUtil } from "@/utils/currency";
import { useFormatters } from "@/composables/useFormatters";
import { useCartSort } from "@/composables/useCartSort";
import { isOffline } from "@/utils/offline";
import { nestFreeRows } from "@/utils/gwpSameItemFreeRows";
//// Neoffice — « Offert » (NeoResto lot 1, task 24): offered rows nested under their paid line, the cart's offer actions.
import { OFFER_CONTEXT, canOfferRow, isOfferedRow, listPrice, nestOfferedRows } from "@/utils/offeredRows";
import { useOfferedItemsStore } from "@/stores/offeredItems";
import { useItemSearchStore } from "@/stores/itemSearch";
import { offlineWorker } from "@/utils/offline/workerClient";
import { logger } from "@/utils/logger";
import { FeatherIcon } from "frappe-ui";

const log = logger.create("InvoiceCart");
import { createResource } from "frappe-ui";
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue";
import EditItemDialog from "./EditItemDialog.vue";
//// Neoffice — « Who did the work? » above the cart, and the kind of a line (NeoSalon, lot G1, product owner, 09.11.2026).
import WhoServesBar from "./WhoServesBar.vue";
import { kindOfLine } from "@/utils/salesPersonLines";
//// Neoffice — the course chip of a line and the words of « Commander la suite » (service families, NeoResto lot 1).
import ServiceFamilyChip from "./ServiceFamilyChip.vue";
import {
	canChangeFamily,
	hasServiceFamilies,
	nextCourseLabel,
	nextRelease,
	orderEverythingLabel,
} from "@/utils/serviceFamilies";
import {
	getDisplayQuantity as getDisplayQuantityForLine,
	resolvePaidQuantityFromDisplay as resolvePaidQtyForLine,
} from "@/utils/gwpSameItemFreeRows";
//// Neoffice — the lines of a table's order come under a header per course, the courses that are all delivered folded (NeoResto lot 1, Daniel, 01.11); the device chooses whether they do.
import CartCourseHeader from "./CartCourseHeader.vue";
import LucideChevronsDownUp from "~icons/lucide/chevrons-down-up";
import { useFoldDelivered } from "@/composables/useFoldDelivered";
import { courseGroupLabel, groupCartByCourse, isDeliveredLine, toggleKey } from "@/utils/cartCourses";

/**
 * ============================================================================
 * STORES & COMPOSABLES
 * ============================================================================
 */
//// Neoffice — [R] restaurant store added next to the retail ones: it holds the open
//// table, takeaway state and the station map used by the badges (8aa35c29). [F]
//// the surrounding lines only lost their semicolons (87f168fe).
const cartStore = usePOSCartStore(); // Pinia store for cart state management
const settingsStore = usePOSSettingsStore(); // Pinia store for POS settings
const offersStore = usePOSOffersStore(); // Pinia store for offers/promotions
const customerSearchStore = useCustomerSearchStore(); // Pinia store for customer search
//// Neoffice — feat: Phase 1 restaurant module - header toggle, UI cleanup, multi-room tabs (8aa35c29, 2026-03-20).
const restaurantStore = useRestaurantStore(); // Pinia store for restaurant features
//// Neoffice — how the lines of the cart look at a restaurant till (NeoResto lot 1, product owner, 05.11.2026): compact lines (one row per article) and their pictures, two settings of the till (utils/cartLayout.js)
const cartCompact = computed(() => cartIsCompact(settingsStore.settings, restaurantStore.isEnabled));
const cartPictures = computed(() => cartShowsPictures(settingsStore.settings));
const cartLineClassesOf = (item) => cartLineClasses(item, { compact: cartCompact.value, pictures: cartPictures.value });
const lineShowsThumbOf = (item) => lineShowsThumb(item, { compact: cartCompact.value, pictures: cartPictures.value });
//// Neoffice — whether the table shows the kitchen's state on a line: not for a station that works on paper alone (NeoResto lot 1, Daniel, 02.11.2026)
const lineShowsKitchenState = (item) => showsKitchenState(item, restaurantStore.isPaperOnly);
const { formatQuantity, formatDate } = useFormatters(); // Quantity and date formatting utilities

function handleProceedToPayment() {
	//// Neoffice — the payment is made on the cart as the cashier sees it: the quantity typed in a field that is still focused is
	//// committed first (NeoResto lot 1, task 22, fix round 3).
	commitTypedQuantity();
	//// Neoffice — [R] added: helpers the restaurant cart needs and upstream has no use
	//// for. formatModifiers renders the JSON stored on the invoice line by the modifier
	//// dialog, and the two station helpers resolve a station name to its display name
	//// and colour through the station/item map rather than a field on Item, which was
	//// dropped to stop polluting the Item doctype (4df0caf1, 831857f2, 2026-03-21).
	emit("proceed-to-payment");
}

//// Neoffice — refactor: move station-item relation into Preparation Station child table, add per-item KDS status (831857f2, 2026-03-21).
function formatModifiers(modifiersJson) {
	try {
		const mods = JSON.parse(modifiersJson);
		return mods.map((m) => m.options.map((o) => o.name).join(", ")).join(" · ");
	} catch {
		return "";
	}
}

function getStationColor(stationName) {
	// Look through station items map to find color
	const map = restaurantStore.stationItemsMap;
	for (const [, info] of Object.entries(map)) {
		if (info.station === stationName) return info.color;
	}
	return "#6B7280";
}

function getStationDisplayName(stationName) {
	//// Neoffice — a station is shown by its label, never by its name: a new one is named by a hash, and the
	//// item map alone missed a station reached through its item group (NeoResto lot 1, task 2).
	return restaurantStore.stationLabel(stationName);
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
	//// Neoffice — the till's kitchen-ticket button of the table's order: { available, phase, text } (utils/tillKitchenTicket.js)
	kitchenTicket: {
		type: Object,
		default: () => ({ available: false, phase: "idle", text: "" }),
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
	company: String,
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
	allowPosExpense: {
		type: Boolean,
		default: false,
	},
});

/**
 * ============================================================================
 * EMITS
 * ============================================================================
 * Events emitted to parent component for cart operations
 */
const emit = defineEmits([
	//// Neoffice — the row of the line (cartRowOf) rides last on update-quantity, update-uom and edit-item, and replaces the
	//// item code on remove-item: see setQuantityOf, removeRowOf, selectUom and handleUpdateItem.
	"update-quantity", // (itemCode, newQty, uom?, row?) - Update item quantity
	//// Neoffice — the « + » of a line that carries a special note or options: a plain unit more, never on that line (the product owner, 08.11.2026)
	"add-plain-unit", // (row) - One unit more of the dish, with no note
	"remove-item", // (itemCode | row, uom?) - Remove item from cart
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
	//// Neoffice — the waiter orders the next course held back, or everything held (service families, NeoResto lot 1).
	"order-next-course", // () - Order the next held course (restaurant mode, table service)
	"order-everything", // () - Order every held line (restaurant mode, table service)
	"show-coupons", // () - Show available coupons
	"show-offers", // () - Show available offers dialog
	"remove-offer", // (offerId) - Remove applied offer
	//// Neoffice — the row of the line rides last on these two events too (see the note at the top of this list, fix round 1).
	"update-uom", // (itemCode, newUom, currentUom?, row?) - Change item's unit of measure
	"edit-item", // (item, row?) - Open item edit dialog
	//// Neoffice — [R] added events: per-line note/modifier dialog and the provisional
	//// pre-payment ticket the waiter drops on the table (87f168fe, 71050faf).
	"open-modifiers", // (item) - Open special instructions dialog (restaurant mode)
	"print-provisional-ticket", // () - Print provisional ticket (restaurant mode)
	//// Neoffice — print the kitchen ticket of the table's order again, by the server (NeoResto lot 1, Daniel, 02.11.2026)
	"print-kitchen-ticket", // () - Print a copy of the kitchen ticket (restaurant mode)
	"view-shift", // () - View current shift details
	"show-drafts", // () - Show draft/held orders
	"show-history", // () - Show invoice history
	"show-return", // () - Open return invoice dialog
	"show-expense", // () - Open POS expense dialog
	"close-shift", // () - Close current shift
	"show-shift-history", // () - Open shift history dialog
	// "create-sales-order", // () - Create Sales Order // Removed as per instruction
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
]);

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
} = useCartSort(
	() => props.items,
	computed(() => settingsStore.cartLifo),
);

/**
 * Display cart lines with each free gift nested under the line that earned it.
 * Same-SKU GWP gifts carved out of a line (buy 2 get 1 free → 2 paid + 1 free
 * after 3 scans) count in that line's `_bundledFreeQty`.
 */
//// Neoffice — and each offered row under its paid line (task 24).
const displayCartItems = computed(() => nestOfferedRows(nestFreeRows(sortedItems.value)));

// Last-touched line: highlighted for 600ms and scrolled into view
const cartListRef = ref(null);
const flashKey = ref(null);
let flashTimer = null;

function lineKey(item) {
	return `${item.item_code}-${item.uom || ""}`;
}

const itemSearchStore = useItemSearchStore();

function listedItem(item) {
	return itemSearchStore.allItems?.find((i) => i.item_code === item.item_code);
}

// What a free gift would normally cost, so the cashier can tell the customer its value
function giftValue(item) {
	const listed = listedItem(item);
	const unit = Number.parseFloat(listed?.price_list_rate ?? listed?.rate) || 0;
	return unit * (Number.parseFloat(item.quantity) || 0);
}

// Gift picture from the free row, else from the item list (some offer engines send none)
function giftImage(item) {
	return item.image || listedItem(item)?.image || null;
}

watch(
	() => props.items.filter((i) => !i.is_free_item).map((i) => `${lineKey(i)}=${i.quantity}`),
	async (lines, oldLines = []) => {
		const touched = lines.find((line) => !oldLines.includes(line));
		if (!touched) return;
		flashKey.value = touched.slice(0, touched.lastIndexOf("="));
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => {
			flashKey.value = null;
		}, 600);
		await nextTick();
		cartListRef.value
			?.querySelector(`[data-line-key="${CSS.escape(flashKey.value || "")}"]`)
			?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
	}
);

/**
 * Reactive State
 * ============================================================================
 */
// Customer search state
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const customerSearch = ref(""); // Current search query
const customerSearchContainer = ref(null); // Ref to search container for click-outside detection
const customerSearchFocused = ref(false); // Track if search input is focused
const customerSearchInputRef = ref(null); // Ref to the native search input element
// Use Pinia store for allCustomers (shared with CustomerDialog, synced on customer creation)
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const allCustomers = computed(() => customerSearchStore.allCustomers);
const customersLoaded = computed(() => customerSearchStore.allCustomers.length > 0);
const selectedIndex = ref(-1); // Keyboard navigation index for search results
const availableGiftCards = ref([]); // Available gift cards for current customer
const previousCustomer = ref(null); // Store previous customer for restore on blur
const changingCustomer = ref(false); // Search shown over the selected customer

// Edit item dialog state
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const showEditDialog = ref(false); // Controls edit dialog visibility
const selectedItem = ref(null); // Item being edited
//// Neoffice — the cart row behind the copy being edited: the update must reach THAT line, not the first line of the same item and
//// unit (the dish can sit twice in a table's cart, one line sent and one that waits). NeoResto lot 1, task 22, fix round 1.
let editedRow = null;

// UOM dropdown state - tracks which item's UOM dropdown is open (by item_code)
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const openUomDropdown = ref(null);

// Cart sort dropdown container (template ref for outside-click detection)
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const cartSortContainer = ref(null);

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
	customerSearchStore.loadAllCustomers(props.posProfile);
}

// Load offers on component init (uses shared store method to prevent duplicate fetches)
// ensureOffersFetched handles both online/offline cases and caching
if (props.posProfile) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	offersStore.ensureOffersFetched(props.posProfile);
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
	url: promoApi.getActiveCoupons(),
	makeParams() {
		const customerName = props.customer?.name || props.customer;
		return {
			customer: customerName,
			company: props.company,
		};
	},
	auto: false,
	onSuccess(data) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		availableGiftCards.value = data?.message || data || [];
	},
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
});

const customerLpInfo = ref({
	wallet_enabled: false,
	balance_points: 0,
	balance_iqd: 0,
});

const customerLpResource = createResource({
	url: "pos_next.api.wallet.get_wallet_info",
	makeParams() {
		const customerName = props.customer?.name || props.customer;
		return {
			customer: customerName,
			company: props.company,
			pos_profile: props.posProfile,
		};
	},
	auto: false,
	onSuccess(data) {
		const payload = data?.message || data || {};
		customerLpInfo.value = {
			wallet_enabled: Boolean(payload.wallet_enabled),
			balance_points: Number(payload.balance_points) || 0,
			balance_iqd: Number(payload.balance_iqd ?? payload.wallet_balance) || 0,
		};
	},
	onError() {
		customerLpInfo.value = {
			wallet_enabled: false,
			balance_points: 0,
			balance_iqd: 0,
		};
	},
});

/**
 * Watch for customer changes to load their gift cards.
 * Reloads gift cards resource when customer is selected (and online).
 * Clears gift cards when customer is removed or offline.
 */
watch(
	() => props.customer,
	(newCustomer) => {
		const customerName = newCustomer?.name || newCustomer;
		if (customerName && props.company && !isOffline()) {
			giftCardsResource.reload();
		} else {
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			availableGiftCards.value = [];
		}

		if (customerName && props.company && props.posProfile && !isOffline()) {
			customerLpResource.reload();
		} else {
			customerLpInfo.value = {
				wallet_enabled: false,
				balance_points: 0,
				balance_iqd: 0,
			};
		}
	}
);

// Refresh wallet / LP balance after a completed sale when the cart is cleared
// but the same customer stays selected (watch on customer alone won't re-fire).
watch(
	() => props.items?.length ?? 0,
	(newLen, oldLen) => {
		if (oldLen > 0 && newLen === 0) {
			const customerName = props.customer?.name || props.customer;
			if (customerName && props.company && props.posProfile && !isOffline()) {
				customerLpResource.reload();
			}
		}
	}
);

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
const appliedOfferCount = computed(() => (props.appliedOffers || []).length);

/**
 * Pre-computed customer lookup map for O(1) access by ID.
 * Rebuilt when allCustomers changes.
 */
const customerMap = computed(() => {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const map = new Map();
	for (const cust of allCustomers.value) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		map.set(cust.name, cust);
	}
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	return map;
});

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
	const searchValue = customerSearch.value.trim().toLowerCase();

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
			return allCustomers.value.slice(0, 10);
		}
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		return [];
	}

	//// Neoffice — [CU] upstream matched the whole query with a single includes(), so typing
	//// "Dupont Jean" found nothing for a customer stored as "Jean Dupont". The query is split
	//// into tokens that must each match somewhere, in any order (afb8f175, 2026-07-09).
	//// tokenized any-order search so "Dupont Jean" finds "Jean Dupont"
	// Split the query into words and require each to match somewhere in the
	// name / mobile / id, in any order — a plain includes() on the whole string
	// missed reversed word order (the stored name may be "Jean Dupont").
	const tokens = searchValue.split(/\s+/).filter(Boolean);
	return (
		allCustomers.value
			.filter((cust) => {
				//// Neoffice — [CU] tokenised, order-independent match (see the note just above):
				//// upstream's includes() on the whole string missed "Dupont Jean" for a customer
				//// stored as "Jean Dupont" (afb8f175, 2026-07-09).
				const haystack =
					(cust.customer_name || "").toLowerCase() +
					" " +
					(cust.mobile_no || "").toLowerCase() +
					" " +
					(cust.name || "").toLowerCase();

				return tokens.every((tok) => haystack.includes(tok));
			})
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			.slice(0, 20)
	);
});

/**
 * Reset keyboard selection index when search results change.
 * Ensures the selection doesn't point to a non-existent result.
 */
watch(customerResults, () => {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	selectedIndex.value = -1;
});

/**
 * Total quantity of all items in cart (including free items).
 * Sums quantity + free_qty for each cart item.
 * @returns {Number} Total item quantity
 */
const totalQuantity = computed(() => {
	return props.items.reduce((sum, item) => {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		const qty = item.quantity || 0;
		// For dedicated free item rows, quantity IS the free qty — don't double-count
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		const freeQty = item.is_free_item ? 0 : item.free_qty || 0;
		return sum + qty + freeQty;
	}, 0);
});

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
		return props.subtotal - props.taxAmount;
	}
	// Tax exclusive: subtotal is already net (before tax)
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	return props.subtotal;
});

/**
 * Display grand total that visually equals Subtotal + Tax - Discount.
 *
 * This ensures the math is intuitive for cashiers:
 * Grand Total = displaySubtotal + Tax - Discount
 *
 * @returns {Number} Grand total amount to display
 */
const displayGrandTotal = computed(() => {
	//// Neoffice — the grand total shown is the invoice's: props.grandTotal, the store's own computation by ERPNext's
	//// rules with the Swiss 0.05 rounding (4fdb5df4; NeoResto lot 1, Ruling 70). Upstream added up the lines shown above
	//// (subtotal + tax − discount + rounding), which is not the invoice's total when a header discount meets prices
	//// without tax: ERPNext takes the discount off the total and computes the tax after it (100.00 + 8.1 % with 10.00
	//// off is 98.10, the lines above say 100.00 + 7.35 − 10.00). On a till whose prices include the tax they agree.
	return props.grandTotal;
});

/**
 * Sum line discounts directly from cart items for instant, exact footer display.
 * Avoids waiting on incremental cache updates after offer application.
 */
const displayDiscountAmount = computed(() => {
	const lineDiscounts = props.items.reduce(
		(sum, item) => sum + (Number.parseFloat(item.discount_amount) || 0),
		0
	);
	const storeDiscount = Number.parseFloat(props.discountAmount) || 0;
	// Prefer the larger value: store total includes header/additional discounts;
	// line sum is fresher when offer stamps land before the incremental cache.
	return Math.max(lineDiscounts, storeDiscount);
});

/**
 * ============================================================================
 * FUNCTIONS
 * ============================================================================
 */

//// Neoffice — the provisional ticket's state, shown on the printer button of the action bar (ruling 97, task 28a).
import { ticketState } from "@/utils/provisionalTicket";
//// Neoffice — a line that carries a special note takes no unit more from the « + » (the product owner, 08.11.2026)
import { carriesANote } from "@/utils/noteOnALine";

const ticketStateClass = computed(
	() =>
		({
			printed: "bg-green-600 text-white",
			offline: "bg-amber-500 text-white",
			failed: "bg-red-600 text-white",
		})[ticketState.phase] || "bg-gray-800 text-white"
);

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
	if (!cartStore.restaurantTable && !cartStore.isTakeaway) return false;
	return cartStore.invoiceItems.some(
		(item) => !item.is_free_item && (!item.kds_status || item.kds_status === "Waiting")
	);
});

//// Neoffice — the service families (NeoResto lot 1). The chip and « Commander la suite » belong to a table's order of a
//// restaurant that has set a family; a takeaway, a counter order and a site with no family show none of it.
const isTableOrder = computed(
	() => restaurantStore.isEnabled && Boolean(cartStore.restaurantTable) && !cartStore.isTakeaway
);

function showFamilyChip(item) {
	return isTableOrder.value && hasServiceFamilies.value && Boolean(item.service_family);
}

// The line shown is a copy: the family is written on the cart row behind it
function changeFamily(item, family) {
	cartStore.setServiceFamily(cartRowOf(item), family);
}

// The next course among the held lines (a held drink is no course)
//// Neoffice — and, where the kitchen prepares ahead, the next course SENT AHEAD and not called yet (the service rhythm, NeoResto lot 1, Daniel, 01.11)
const nextCourse = computed(() => nextRelease(cartStore.invoiceItems, restaurantStore.serviceRhythm));
const showNextCourse = computed(() => isTableOrder.value && nextCourse.value.indexes.length > 0);

function orderNextCourse() {
	commitTypedQuantity();
	emit("order-next-course");
}

function orderEverything() {
	commitTypedQuantity();
	emit("order-everything");
}

//// Neoffice — the cart of a table's order by course, like the kitchen's ticket (NeoResto lot 1, Daniel, 01.11: « il faut barrer et réduire pour laisser que ce qu'il reste visible »): a header per course in
//// the order of the meal, the courses that are all delivered folded into one row, the lines held back in a last group (utils/cartCourses holds the rule). The device chooses whether the cart does it
//// (« Replier les services livrés », on by default); off, or outside a table's order of a restaurant that uses courses, the list is the flat one it always was. Only the drawing changes: the lines,
//// the totals and the tax are the cart's, and a delivered line is still billed.
const { foldDelivered, setFoldDelivered } = useFoldDelivered();
const showFoldSwitch = computed(() => isTableOrder.value && hasServiceFamilies.value);
const courseView = computed(() => showFoldSwitch.value && foldDelivered.value);
// The folded courses a waiter opened again: they last for the table shown and are dropped when another table opens
const openedCourses = ref(new Set());
watch(
	() => cartStore.restaurantTable?.name,
	() => {
		openedCourses.value = new Set();
	}
);
const cartEntries = computed(() => {
	if (!courseView.value) return [{ key: "all", group: null, rows: displayCartItems.value }];
	return groupCartByCourse(displayCartItems.value, { amountOf: getLineAmount, expanded: openedCourses.value }).map(
		(group) => ({ key: group.key, group, rows: group.visibleRows })
	);
});
function toggleCourse(key) {
	openedCourses.value = toggleKey(openedCourses.value, key);
}
// A delivered line is struck through where the cart is drawn by course; the flat list greys it, as it always did
function isStruck(item) {
	return courseView.value && isDeliveredLine(item);
}

/**
 * Get CSS classes for KDS status badge based on status value.
 * @param {String} status - KDS status (Waiting, Pending, Preparing, Ready, Delivered)
 * @returns {String} CSS classes for the badge
 */
function kdsStatusBadgeClass(status) {
	if (status === "Waiting") return "bg-gray-100 text-gray-600";
	if (status === "Pending") return "bg-yellow-100 text-yellow-700";
	if (status === "Preparing") return "bg-blue-100 text-blue-700";
	if (status === "Ready") return "bg-green-100 text-green-700";
	if (status === "Delivered") return "bg-gray-200 text-gray-500";
	return "bg-indigo-100 text-indigo-700";
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
	customerSearch.value = event.target.value;
}

// Track if customer history has been loaded this session
//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
const customerHistoryLoaded = ref(false);

/**
 * Handle search input focus - shows frequent customers dropdown.
 */
function handleSearchFocus() {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	customerSearchFocused.value = true;
	// Load customer history only once per session for faster subsequent focuses
	if (!customerHistoryLoaded.value) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		customerSearchStore.loadCustomerHistory();
		customerHistoryLoaded.value = true;
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
		customerSearchFocused.value = false;
		// Nothing typed: keep the selected customer
		if (!customerSearch.value.trim()) changingCustomer.value = false;
	}, 100);
}

/** Open customer search over the selected customer, keeping it until another is picked. */
async function startChangingCustomer() {
	changingCustomer.value = true;
	await nextTick();
	customerSearchInputRef.value?.focus();
}

/** A customer saved with only a phone number as the name */
function isPhoneName(name) {
	return /^\+?[\d\s-]{6,}$/.test(String(name || "").trim());
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
	if (customerResults.value.length === 0) return;

	if (event.key === "ArrowDown") {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		event.preventDefault();
		selectedIndex.value = Math.min(selectedIndex.value + 1, customerResults.value.length - 1);
	} else if (event.key === "ArrowUp") {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		event.preventDefault();
		selectedIndex.value = Math.max(selectedIndex.value - 1, -1);
	} else if (event.key === "Enter") {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		event.preventDefault();
		if (selectedIndex.value >= 0 && selectedIndex.value < customerResults.value.length) {
			selectCustomer(customerResults.value[selectedIndex.value]);
		} else if (customerResults.value.length === 1) {
			// Auto-select if only one result
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			selectCustomer(customerResults.value[0]);
		}
	} else if (event.key === "Escape") {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		customerSearch.value = "";
		changingCustomer.value = false;
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
	customerSearchStore.trackCustomerSelection(cust.name);
	emit("select-customer", cust);
	customerSearch.value = "";
	selectedIndex.value = -1;
	customerSearchFocused.value = false;
	previousCustomer.value = null;
	changingCustomer.value = false;
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
	previousCustomer.value = null;
	emit("select-customer", null);
	await nextTick();
	const searchInput = document.getElementById("cart-customer-search");
	if (searchInput) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		searchInput.focus();
	}
}

/**
 * Open customer creation dialog with current search text.
 * Pre-fills the new customer name with the search query.
 */
function createNewCustomer() {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const searchValue = customerSearch.value;
	// Close dropdown immediately
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	customerSearch.value = "";
	customerSearchFocused.value = false;
	// Emit event to open customer creation dialog
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	emit("create-customer", searchValue);
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
	if (!name || !name.trim()) return "?";
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	const first = Array.from(parts[0])[0] || "?";
	if (parts.length >= 2) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		const second = Array.from(parts[1])[0] || "?";
		return (first + second).toUpperCase();
	}
	return Array.from(parts[0]).slice(0, 2).join("").toUpperCase();
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
	if (!raw) return [];
	return String(raw)
		.split(/<br\s*\/?>/i)
		.map((line) =>
			line
				.replace(/<[^>]*>/g, "")
				.replace(/&nbsp;/gi, " ")
				.replace(/\s+/g, " ")
				.trim()
		)
		.filter((line) => line && !/^(phone|email|t[ée]l(?:[ée]phone)?)\s*:/i.test(line));
}

/**
 * Short one-line address snippet for a customer search result.
 *
 * @param {Object} cust - Customer object (may carry primary_address)
 * @returns {String} Address on one line, or "" when none
 */
function addressSnippet(cust) {
	return cleanAddressParts(cust?.primary_address).join(", ");
}

/**
 * Full, sanitized address for the selected-customer info popover.
 *
 * @param {Object} cust - Customer object
 * @returns {String} Plain-text address, or "" when none
 */
function formatAddress(cust) {
	return cleanAddressParts(cust?.primary_address).join(", ");
}

/**
 * Effective discount % for badges. Coupon max_amount caps are stored as
 * absolute amounts (discount_percentage=0), so derive % from amount/base.
 */
function isLockedFreeRow(item) {
	return Boolean(item?.is_free_item || item?._isStandaloneFreeRow);
}

const getDisplayQuantity = getDisplayQuantityForLine;

function serialList(item) {
	return String(item?.serial_no || "")
		.split("\n")
		.filter((s) => s.trim());
}

function batchExpiry(item) {
	return item?.batch_expiry_date || item?.expiry_date || null;
}

/** Amber when the batch expires within 30 days */
function batchExpiryClass(item) {
	const expiry = batchExpiry(item);
	return expiry && new Date(expiry) - Date.now() < 30 * 86400000 ? "text-amber-700 font-semibold" : "";
}

/** "20% off (Fairy 3 pcs)": the discount and the offer or coupon that gave it */
// Money the customer keeps on this line, from an offer, a gift or a coupon
function lineSaving(item) {
	return Number.parseFloat(item?.discount_amount) || 0;
}

function isGiftSaving(item) {
	return ["free_item", "gwp"].includes(item?.discount_source);
}

function savingOffer(item) {
	const rules = Array.isArray(item.pricing_rules)
		? item.pricing_rules
		: String(item.pricing_rules || "").split(",");
	return (props.appliedOffers || []).find(
		(o) => rules.includes(o.code) || (o.rules || []).some((r) => rules.includes(r))
	);
}

// What the customer gets on this line: "1 free", "20% off", "Coupon WELCOME10"
function savingTitle(item) {
	if (item.coupon_code) {
		// A coupon stacked on a promotion names both
		const pre = Number(item.pre_coupon_discount?.discount_percentage) || 0;
		return pre > 0
			? __("{0}% off + Coupon {1}", [pre.toFixed(0), item.coupon_code])
			: __("Coupon {0}", [item.coupon_code]);
	}
	if (isGiftSaving(item)) {
		const unit = Number.parseFloat(item.price_list_rate || item.rate) || 0;
		const units = unit ? Math.round(lineSaving(item) / unit) : 0;
		if (units > 0) return __("{0} free", [units]);
	}
	return __("{0}% off", [Number(getItemDiscountPercent(item)).toFixed(0)]);
}

// The offer that gave it, shown quieter beside the title
function savingSource(item) {
	return item.coupon_code ? "" : savingOffer(item)?.name || "";
}

const resolvePaidQuantityFromDisplay = resolvePaidQtyForLine;

/**
 * Net line amount. Uses `??` so a legitimate 0 (100% discount / free item)
 * is not replaced by the full rate × qty.
 */
function getLineAmount(item) {
	const amount = item?.amount;
	if (amount !== null && amount !== undefined && amount !== "") {
		return Number.parseFloat(amount) || 0;
	}
	return (Number.parseFloat(item?.rate) || 0) * (Number.parseFloat(item?.quantity) || 0);
}

/** Effective unit price after line discount (0 for a fully free line). */
function getLineNetRate(item) {
	const qty = Number.parseFloat(item?.quantity ?? item?.qty) || 0;
	const hasDiscount =
		(Number.parseFloat(item?.discount_amount) || 0) > 0 ||
		(Number.parseFloat(item?.discount_percentage) || 0) > 0 ||
		item?.is_free_item;
	const rate = Number.parseFloat(item?.rate) || 0;
	if (hasDiscount && qty > 0) {
		// Gross (tax-mode independent) unit price after discount
		const discount = Number.parseFloat(item?.discount_amount) || 0;
		if (discount > 0) return Math.max(0, rate - discount / qty);
		if (item?.is_free_item) return getLineAmount(item) / qty;
		const pct = Number.parseFloat(item?.discount_percentage) || 0;
		return Math.max(0, rate * (1 - pct / 100));
	}
	return rate;
}

/** Original list price to show struck through, or null when there is no discount. */
function getLineStrikePrice(item) {
	const list = Number.parseFloat(item?.price_list_rate ?? item?.rate) || 0;
	const net = getLineNetRate(item);
	return list > net + 0.0001 ? list : null;
}

function getItemDiscountPercent(item) {
	const pct = Number.parseFloat(item?.discount_percentage) || 0;
	if (pct > 0) return pct;
	const discountAmount = Number.parseFloat(item?.discount_amount) || 0;
	if (discountAmount <= 0) return 0;
	const qty = Number.parseFloat(item?.quantity || item?.qty) || 0;
	const rate = Number.parseFloat(item?.price_list_rate || item?.rate) || 0;
	const base = qty * rate;
	if (base <= 0) return 0;
	return (discountAmount / base) * 100;
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
	return formatCurrencyUtil(Number.parseFloat(amount || 0), props.currency);
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
		return 1;
	}

	// Round to 4 decimal places to avoid floating point errors
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const rounded = Math.round(quantity * 10000) / 10000;

	// Check if it's a multiple of 0.5
	if (Math.abs(rounded % 0.5) < 0.0001) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		return 0.5;
	}

	// Check if it's a multiple of 0.25
	if (Math.abs(rounded % 0.25) < 0.0001) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		return 0.25;
	}

	// Check if it's a multiple of 0.1
	if (Math.abs(rounded % 0.1) < 0.0001) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		return 0.1;
	}

	// For other decimals, use 0.01 for fine control
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	return 0.01;
}

//// Neoffice — the quantity of a line, or its removal, is asked for BY ROW: with the item and its unit alone the parent found the
//// first line carrying them, and a table's cart now holds the same dish twice (the line the kitchen has, the line that waits): the
//// stepper of the second one lowered or removed the first. The row also tells the store which line must not take a new unit
//// (NeoResto lot 1, task 22, fix round 1).
function setQuantityOf(item, quantity) {
	emit("update-quantity", item.item_code, quantity, item.uom, cartRowOf(item));
}

function removeRowOf(item) {
	emit("remove-item", cartRowOf(item));
}

/**
 * Increment item quantity using smart step.
 * Uses getSmartStep to determine appropriate increment value.
 *
 * @param {Object} item - Cart item to increment
 */
function incrementQuantity(item) {
	if (item.is_resolved_barcode || isLockedFreeRow(item)) return;

	//// Neoffice — a line with a special note or options takes no unit more: the unit goes on a plain line (the product owner, 08.11.2026: « si on met une note sur un article et que l'on en ajoute 1, il ne doit pas faire +1 sur l'article avec la note »)
	if (carriesANote(item)) {
		emit("add-plain-unit", cartRowOf(item));
		return;
	}

	const step = getSmartStep(getDisplayQuantity(item));
	const newPaidQty = Math.round((getDisplayQuantity(item) + step) * 10000) / 10000;
	//// Neoffice — by row, see setQuantityOf / removeRowOf (NeoResto lot 1, task 22, fix round 1).
	setQuantityOf(item, newPaidQty);
}

/**
 * Decrement item quantity using smart step.
 * Removes item if quantity would become zero or negative.
 *
 * @param {Object} item - Cart item to decrement
 */
function decrementQuantity(item) {
	if (item.is_resolved_barcode || isLockedFreeRow(item)) return;

	const step = getSmartStep(getDisplayQuantity(item));
	const newPaidQty = Math.round((getDisplayQuantity(item) - step) * 10000) / 10000;

	if (newPaidQty <= 0) {
		// If quantity would be 0 or negative, remove the item
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		//// Neoffice — by row, see setQuantityOf / removeRowOf (NeoResto lot 1, task 22, fix round 1).
		removeRowOf(item);
	} else {
		//// Neoffice — by row, see setQuantityOf / removeRowOf (NeoResto lot 1, task 22, fix round 1).
		setQuantityOf(item, newPaidQty);
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
	if (item.is_resolved_barcode || isLockedFreeRow(item)) return;

	//// Neoffice — the field fires on every key. On a line that has left for the kitchen the waiter's « 12 » went through « 1 »,
	//// which lowered the line the kitchen has, and then « 12 », which put 11 units on a new line: the bill said 12, the
	//// kitchen had made 4 and would get 11 more. Such a line takes the quantity when the waiter leaves the field or presses
	//// Enter (handleQuantityBlur), once, as the number he typed (NeoResto lot 1, task 22, fix round 2).
	const row = cartRowOf(item);
	if (hasLeftForTheKitchen(row)) {
		if (Number.isNaN(Number.parseFloat(value))) typedOnSentLine.delete(row);
		else typedOnSentLine.set(row, { item, text: value });
		return;
	}

	applyTypedQuantity(item, value);
}

//// Neoffice — the text typed in the quantity field of a line that has left for the kitchen, by cart row, until the field is left, its
//// Enter pressed, or a way out of the cart (payment, Validate, ticket) asks for it (a Map, so that all of them can be committed).
const typedOnSentLine = new Map();

//// Neoffice — commits every quantity typed and not yet applied, each once. A button tap does not always blur the field it was typed in
//// (a phone), and a keyboard shortcut (F9, Ctrl/Cmd+Enter) runs from it: the payment then opened on the cart without the quantity,
//// and the kitchen dialog offered a cart that lacked the units it was about to bill (NeoResto lot 1, task 22, fix round 3).
function commitTypedQuantity() {
	for (const [row, typed] of [...typedOnSentLine]) {
		typedOnSentLine.delete(row);
		applyTypedQuantity(typed.item, typed.text);
	}
}

//// Neoffice — Escape in the field of a sent line drops what was typed and shows its quantity again (fix round 3).
function cancelTypedQuantity(item, event) {
	const row = cartRowOf(item);
	if (!hasLeftForTheKitchen(row)) return;
	typedOnSentLine.delete(row);
	if (event?.target) event.target.value = formatQuantity(getDisplayQuantity(item));
}

//// Neoffice — the buttons that leave the cart for the payment, the kitchen or the printer commit first (fix round 3).
function openKitchenDialog() {
	commitTypedQuantity();
	emit("open-kitchen-dialog");
}

function printProvisionalTicket() {
	commitTypedQuantity();
	emit("print-provisional-ticket");
}

//// Neoffice — the customer of an order that comes back from the server is its name, a string: the header read `customer.customer_name || customer.name`,
//// which is nothing for a string, so a table whose customer the till did not pick itself (a guest who signed in from the QR page, NeoResto lot 1, Daniel,
//// 02.11.2026) showed a customer with no name.
const customerLabel = computed(() =>
	typeof props.customer === "string"
		? props.customer
		: props.customer?.customer_name || props.customer?.name || ""
);

//// Neoffice — the kitchen ticket of the table, printed again (NeoResto lot 1, Daniel, 02.11.2026)
const kitchenTicketStateClass = computed(
	() =>
		({
			printed: "bg-green-600 text-white",
			offline: "bg-amber-500 text-white",
			failed: "bg-red-600 text-white",
		})[props.kitchenTicket?.phase] || "bg-gray-800 text-white"
);

function printKitchenTicket() {
	commitTypedQuantity();
	emit("print-kitchen-ticket");
}

//// Neoffice — what updateQuantity did with each value typed, now also what a sent line does once with the whole of it (fix round 2).
function applyTypedQuantity(item, value) {
	const displayQty = Number.parseFloat(value);

	// If the input isn't a valid number (e.g., user cleared the field), do nothing
	if (isNaN(displayQty)) return;

	const paidQty = resolvePaidQuantityFromDisplay(item, displayQty);

	// If quantity is zero or negative, remove the item from the cart
	//// Neoffice — by row, see setQuantityOf / removeRowOf (NeoResto lot 1, task 22, fix round 1).
	if (paidQty <= 0) return removeRowOf(item);

	// For positive numbers, update paid quantity (free row stays separate in data)
	//// Neoffice — by row, see setQuantityOf / removeRowOf (NeoResto lot 1, task 22, fix round 1).
	setQuantityOf(item, paidQty);
}

/**
 * Handle quantity input blur - validate and round.
 * Called when user leaves the quantity input field.
 * - Removes item if quantity is 0 or invalid
 * - Rounds to 4 decimal places for consistency
 *
 * @param {Object} item - Cart item that lost focus
 */
//// Neoffice — the event is handed over so a sent line can show its quantity again (NeoResto lot 1, task 22, fix round 2).
function handleQuantityBlur(item, event = null) {
	if (isLockedFreeRow(item)) return;
	//// Neoffice — a quantity typed on a sent line is applied now, once; a field left empty or unreadable shows the quantity again
	//// (fix round 2).
	const row = cartRowOf(item);
	if (typedOnSentLine.has(row)) {
		const typed = typedOnSentLine.get(row);
		typedOnSentLine.delete(row);
		applyTypedQuantity(item, typed.text);
		return;
	}
	if (event?.target && hasLeftForTheKitchen(row)) {
		event.target.value = formatQuantity(getDisplayQuantity(item));
	}
	// When user leaves the input field, round and validate
	if (!item.quantity || item.quantity <= 0) {
		// If quantity is 0 or invalid, remove the item
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		//// Neoffice — by row, see setQuantityOf / removeRowOf (NeoResto lot 1, task 22, fix round 1).
		removeRowOf(item);
	} else {
		// Round to 4 decimal places for consistency
		const roundedQty = Math.round(getDisplayQuantity(item) * 10000) / 10000;
		if (roundedQty !== getDisplayQuantity(item)) {
			//// Neoffice — by row, see setQuantityOf / removeRowOf (NeoResto lot 1, task 22, fix round 1).
			setQuantityOf(item, roundedQty);
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
	const key = `${itemCode}-${uom}`;
	openUomDropdown.value = openUomDropdown.value === key ? null : key;
}

/**
 * Select a UOM from dropdown - changes UOM and closes dropdown
 * Handles merging if target UOM already exists in cart
 */
async function selectUom(item, newUom) {
	// Defense in depth: free/GWP rows stay promotion-owned even if UI disable fails.
	if (isLockedFreeRow(item)) {
		openUomDropdown.value = null;
		return;
	}
	if (item.uom === newUom) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		openUomDropdown.value = null;
		return;
	}

	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	const currentUom = item.uom || item.stock_uom;
	//// Neoffice — by row (NeoResto lot 1, task 22, fix round 1): the dish can sit twice in a table's cart, one line sent and one that
	//// waits, and the unit asked for is the one of the line whose dropdown was opened; the parent's second call gets the same row.
	await cartStore.changeItemUOM(item.item_code, newUom, currentUom, cartRowOf(item));
	openUomDropdown.value = null;
	emit("update-uom", item.item_code, newUom, currentUom, cartRowOf(item));
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
	// Free / GWP / promo gift rows are promotion-owned — cashier must not
	// change qty or rate (would oversell free stock beyond the offer).
	if (isLockedFreeRow(item)) return;
	//// Neoffice — the cart row behind the line shown, for « Offert » (task 24): the dialog edits a copy.
	selectedCartRow.value = cartRowOf(item);
	selectedItem.value = { ...item };
	//// Neoffice — the row the dialog edits, kept to hand it back with the update (NeoResto lot 1, task 22, fix round 1).
	editedRow = cartRowOf(item);
	showEditDialog.value = true;
}

//// Neoffice — « Offert » (NeoResto lot 1, task 24): the dialog's line may be offered where the till lets its cashiers
//// change a discount, on an invoice, for a sold line; the offer confirmed there splits the cart row (offeredItems).
const offeredItems = useOfferedItemsStore();
const selectedCartRow = ref(null);
const canOfferSelected = computed(() => offeredItems.canOffer && canOfferRow(selectedCartRow.value));

async function handleOfferItem({ quantity }) {
	if (selectedCartRow.value) await offeredItems.offer(selectedCartRow.value, quantity);
}

/** What an offered row is worth, at list price. */
function offeredLineValue(item) {
	return (Number.parseFloat(item?.quantity) || 0) * listPrice(item);
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
	const originalUom = selectedItem.value?.uom || selectedItem.value?.stock_uom;
	// Use store method to update item, passing original UOM to identify correct item
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	//// Neoffice — by row, see editedRow.
	await cartStore.updateItemDetails(updatedItem.item_code, updatedItem, originalUom, editedRow);
	// Also emit for parent component compatibility
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	//// Neoffice — by row, see editedRow: the parent applies the update a second time, to the same line.
	emit("edit-item", updatedItem, editedRow);
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Handlers & Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

function selectDocType(type) {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	cartStore.setTargetDoctype(type);
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
	const target = event.target;

	// Close customer search if clicking outside
	if (
		customerSearchContainer.value &&
		target instanceof Node &&
		!customerSearchContainer.value.contains(target)
	) {
		//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
		customerSearch.value = "";
		changingCustomer.value = false;

		// Restore previous customer if set and no customer selected
		if (previousCustomer.value && !props.customer) {
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			emit("select-customer", previousCustomer.value);
			previousCustomer.value = null;
		}
	}

	// Close UOM dropdown if clicking outside
	if (openUomDropdown.value !== null) {
		// Check if click is outside all UOM dropdowns
		const clickedInsideUomDropdown =
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			target instanceof Element && target.closest(".group\\/uom");
		if (!clickedInsideUomDropdown) {
			//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
			openUomDropdown.value = null;
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
		showCartSortDropdown.value = false;
	}
}

/**
 * Component mounted - register global click listener.
 * Used for click-outside detection on dropdowns.
 */
onMounted(() => {
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	if (typeof document === "undefined") return;
	// Use mousedown instead of click to catch events before they are swallowed by other handlers
	//// Neoffice — [F] Biome reformat only, no behaviour change (87f168fe); see file map.
	document.addEventListener("mousedown", handleOutsideClick);
});

/**
 * Component unmounting - cleanup global click listener.
 * Prevents memory leaks by removing event listener.
 */
onBeforeUnmount(() => {
	//// Neoffice — [GC] the edit dialog is exposed to the parent so POSSale can open it
	//// by itself the moment a zero-priced Item lands in the cart: a gift card has no
	//// price until the cashier types one, and upstream offers no way in (5dddc528,
	//// 2026-01-14 "auto-open edit dialog for zero-price items (gift cards)").
	if (typeof document === "undefined") return;
	document.removeEventListener("mousedown", handleOutsideClick);
});
//// Neoffice — feat(pos): auto-open edit dialog for zero-price items (gift cards) (5dddc528, 2026-02-18).

/**
 * Expose methods to parent component.
 * Allows POSSale to trigger edit dialog for zero-price items (e.g., gift cards).
 */
defineExpose({
	openEditDialog, //// Neoffice — the page opens a zero-price line (gift card) for editing (5dddc528).
	commitTypedQuantity, //// Neoffice — the page commits the quantity typed in a field before it pays, validates or prints (task 22, fix round 3).
	focusCustomerSearch() {
		if (props.customer) {
			// Show the search over the assigned customer; it stays until another is picked
			startChangingCustomer();
		} else {
			customerSearchInputRef.value?.focus();
		}
	},
});
</script>
```

<!-- //// Neoffice — the compact cart line's style is its own file (cartLines.css, an added file: the style of a restaurant till's cart, NeoResto lot 1, product owner, 05.11.2026), `scoped` to this component. -->
<style scoped src="./cartLines.css"></style>
