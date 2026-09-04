<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// align POS design with Neoffice theme and improve customer display — 87f168f + f23daab (+3 more)
  //// UX improvements - Complete Payment full-width, Pay on Account as disc… — 2584aa5 + 548757f
  //// move toggle-restaurant to correct position + language to dropdown — 5e5db36
  //// Phase 1 restaurant module - header toggle, UI cleanup, multi-room tabs — 8aa35c2 + 5959928 (+2 more)
  //// remove footer height from max-height calc to use full viewport — c0bf6f8
  //// add search bar and grid/list toggle to restaurant card display — 8357bf8 + 9f4e85d (+15 more)
  //// right panel minimum width 450px (was 360/300) — 7e3f945
  //// auto-open edit dialog for zero-price items (gift cards) — 5dddc52
  //// modifier dialog opens correct item (findLast), remove deletes only on… — 7e1376a
  //// rounding total, tips visibility, cash quick amounts — 4fdb5df
  //// table only marked Occupied when draft invoice exists, not before — c7f6932 + 4df0caf (+5 more)
  //// rebrand: rename POS Next to Neopos — 771950b
  //// show remaining to collect in cart + payment dialog accounts for guest… — 214125e
  //// calculate discount on net total after pricing rules — 8e06bb9
  //// add GiftCardCreatedDialog and debug logging — 703f204 + 4239ea8
  //// Phase 4B - restaurant menus with course selection dialog — 9f4e85d + 4df0caf (+2 more)
  //// hide permanent card from schedule settings, add edit schedule link — 6b38498
  //// cash in/out from POS using Journal Entry Templates — 6c59863 + d08c57e (+3 more)
  //// Runner accepts both workflow last step and 'Ready' status (fixes Fren… — a0084ae
  //// improve UX for customer creation flow — 912ef09 + 5959928
  //// improve payment UX - table release debug, lighter processing overlay,… — 548757f + 4239ea8
  //// add email invoice functionality with PDF attachment — 4239ea8 + 548757f (+1 more)
  //// keep success dialog open after Print or Email actions — 39a70d1
  //// Implement Sales Order in Point of Sale (POS) system with cart, invoic… — a046b16
  //// replace JS confirm with proper Dialog for QR confirmation — f3affea + 34751a2 (+6 more)
  //// set tip account type to Income Account and French label — d08c57e + 6c59863 (+2 more)
  //// merge all restaurant enhancements - station groups, realtime cards, s… — 34ee11a
  //// use dynamic customer group and territory lookup for customer display — 185c3c5 + 912ef09 (+1 more)
  //// Merge upstream/develop into version-15 — c87d0e9
  //// apply color/name display to restaurant card view + fix image text — 6a4ff7b
  //// defer guest payment recording until Wallee confirms (no premature Pai… — 02f7445
  //// restaurant card system (carte de restaurant) — f239211 + c7696bb (+17 more)
  //// payment summary in Paid table dialog + real-time cart refresh on gues… — 34751a2 + e762830 (+4 more)
  //// use setter functions for posProfile/posOpeningShift to avoid const as… — b44f194
  //// Merge feature/erpnext-coupon-sync: coupon sync, gift cards, large cat… — 1ec3ead + 2aafa99 (+1 more)
  //// Merge upstream/develop: latest upstream features (brands filter, over… — 7604810
  //// reload server draft when returning to occupied table - shows existing… — c8f9a36 + c5208ba (+20 more)
  //// move station-item relation into Preparation Station child table, add… — 831857f + 34ee11a
  //// add dedicated price entry numpad dialog for zero-price items — 1ff2fba + f23daab (+1 more)
  //// Phase 4A - structured item modifiers with groups, options, and price… — 4df0caf + eabe35e (+1 more)
  //// replace all direct cartStore property assignments with $patch to prev… — dd33c2f
  //// pass tip_amount through full payment chain (PaymentDialog → POSSale →… — e9d1622 + 104959e (+2 more)
  //// use discount_amount instead of additional_discount_amount for gift ca… — b657e65
  //// payment = auto-validate + partial payment confirmation dialog — f295bbe + 2584aa5
  //// Implement initial POS Sale page with item selection, cart management,… — f2ad259
  //// skip local draft deletion in restaurant mode (drafts are server-side… — c89fb98
  //// release restaurant table to Empty after successful payment — 130a613 + 185c3c5 (+2 more)
  //// replace direct invoiceItems assignment with addItem loop to avoid con… — cdef734
  //// add provisional ticket print button in restaurant table view — 71050fa + 4fdb5df
-->
<template>
	<!-- //// Neoffice — the page ground is the Design System neo-bg token (warm paper -->
	<!-- //// #f8f8f8), not upstream's hardcoded bg-gray-50, so the till sits on the same -->
	<!-- //// canvas as the rest of the suite (87f168fe, 2026-03-20 "align POS design -->
	<!-- //// with Neoffice theme and improve customer display"). -->
	<div
		class="flex flex-col bg-[var(--neo-bg)] overflow-x-hidden"
		style="height: 100vh; max-height: 100vh"
	>
		<!-- Loading State -->
		<LoadingSpinner v-if="uiStore.isLoading" />

		<!-- //// Neoffice — full-screen overlay while the invoice is submitted. Upstream -->
		<!-- //// leaves the payment dialog up and the screen idle for the second or two the -->
		<!-- //// server takes, and a cashier who taps again gets a second submit. The -->
		<!-- //// payment dialog is now closed the instant submission starts and this spinner -->
		<!-- //// takes the screen instead (2584aa58, 2026-03-24 "UX improvements ... -->
		<!-- //// processing overlay with spinner"; lightened by 548757f7 the same day). -->
		<!-- Payment Processing Overlay -->
		<div v-if="isProcessingPayment" class="fixed inset-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm z-[400] flex flex-col items-center justify-center">
			<div class="animate-spin rounded-full h-12 w-12 border-b-3 border-blue-500 mb-4"></div>
			<p class="text-lg font-medium text-gray-700 dark:text-gray-200">{{ __('Processing payment...') }}</p>
			<p class="text-sm text-gray-400 mt-1">{{ __('Please wait') }}</p>
		</div>

		<!-- Main App -->
		<template v-else>
			<!-- Header -->
			<!-- //// Neoffice — two additions inside this opening tag (an HTML comment cannot -->
			<!-- //// sit between attributes, hence the marker here): -->
			<!-- ////   :is-restaurant-mode / :can-toggle-restaurant — the header carries the -->
			<!-- ////   fork-knife toggle between retail and table service; the guard forbids -->
			<!-- ////   switching while a cart or an occupied table is alive (8aa35c29, -->
			<!-- ////   2026-03-20 "Phase 1 restaurant module - header toggle, UI cleanup"). -->
			<!-- ////   @toggle-restaurant — the event the toggle emits; it was moved onto the -->
			<!-- ////   header when the language picker went into the dropdown (5e5db360, -->
			<!-- ////   2026-03-21 "move toggle-restaurant to correct position"). -->
			<!-- //// Upstream POSNext is retail-only and has neither. -->
			<POSHeader
				:current-time="shiftStore.currentTime"
				:shift-duration="shiftStore.shiftDuration"
				:has-open-shift="shiftStore.hasOpenShift"
				:profile-name="shiftStore.profileName"
				:user-name="userName"
				:user-image="userImage"
				:is-offline="offlineStore.isOffline"
				:is-syncing="offlineStore.isSyncing"
				:pending-invoices-count="offlineStore.pendingInvoicesCount"
				:is-any-dialog-open="uiStore.isAnyDialogOpen"
				:cache-syncing="itemStore.cacheSyncing"
				:cache-stats="itemStore.cacheStats"
				:stock-sync-active="isStockSyncActive"
				:is-refreshing="stockStore.refreshing"
				:silent-print-enabled="posSettingsStore.silentPrint"
				:qz-connected="qzConnected"
			:is-restaurant-mode="restaurantStore.isEnabled"
			:can-toggle-restaurant="canToggleRestaurant"
				@sync-click="handleSyncClick"
				@printer-click="openHistoryDialog"
				@refresh-click="handleRefresh"
				@clear-cache="handleClearCache"
				@logout="uiStore.showLogoutDialog = true"
				@toggle-restaurant="handleToggleRestaurant"
			>
				<template #menu-items>
					<button
						v-if="shiftStore.hasOpenShift"
						@click="uiStore.showOpenShiftDialog = true"
						class="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"
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
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{{ __("View Shift") }}</span>
					</button>
					<button
						v-if="canAccessShiftActions"
						@click="openDraftDialog"
						class="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-purple-50 flex items-center gap-3 transition-colors relative"
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
						<span>{{ __("Draft Invoices") }}</span>
						<span
							v-if="draftsStore.draftsCount > 0"
							class="ms-auto text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded-full"
						>
							{{ draftsStore.draftsCount }}
						</span>
					</button>
					<button
						v-if="canAccessShiftActions"
						@click="openHistoryDialog"
						class="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 flex items-center gap-3 transition-colors"
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
								d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
						<span>{{ __("Invoice History") }}</span>
					</button>
					<button
						v-if="offlineStore.pendingInvoicesCount > 0"
						@click="
							uiStore.showOfflineInvoicesDialog = true;
							offlineStore.loadPendingInvoices();
						"
						class="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 flex items-center gap-3 transition-colors relative"
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
								d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{{ __("Offline Invoices") }}</span>
						<span
							class="ms-auto text-xs bg-orange-600 text-white px-1.5 py-0.5 rounded-full"
						>
							{{ offlineStore.pendingInvoicesCount }}
						</span>
					</button>
					<button
						v-if="canAccessShiftActions"
						@click="openReturnDialog"
						class="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50 flex items-center gap-3 transition-colors"
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
						<span>{{ __("Return Invoice") }}</span>
					</button>
					<button
						v-if="canAccessShiftActions && canSwitchToDesk"
						@click="switchToDesk"
						class="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-emerald-50 flex items-center gap-3 transition-colors"
					>
						<svg
							class="w-5 h-5 text-emerald-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 7h18M3 12h18M3 17h18"
							/>
						</svg>
						<span>{{ __("Switch To Desk") }}</span>
					</button>
					<hr class="my-1 border-gray-100"> 
					<button
						@click="lockSession()"
						class="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-amber-50 flex items-center gap-3 transition-colors"
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
								d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
							/>
						</svg>
						<span>{{ __("Lock Screen") }}</span>
					</button>
				</template>
				<template #additional-actions>
					<button
						v-if="canAccessShiftActions"
						@click="handleCloseShift()"
						class="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 flex items-center gap-3 transition-colors"
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
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{{ __("Close Shift") }}</span>
					</button>
				</template>
			</POSHeader>

			<!-- Main Content: Responsive Layout -->
			<!-- //// Neoffice — the max-height on the style= attribute below drops the footer -->
			<!-- //// row upstream reserved (calc(100vh - 60px - header)): we deleted the -->
			<!-- //// BrainWise branding footer, so the sales area takes the full viewport -->
			<!-- //// (c0bf6f85, 2026-03-20 "remove footer height from max-height calc to use -->
			<!-- //// full viewport"; footer removed by db22e2ae / 458d81a9 the same day). -->
			<div
				v-if="shiftStore.hasOpenShift"
				class="flex-1 flex overflow-hidden relative"
				style="max-height: calc(100vh - var(--header-height, 60px))"
			>
				<!-- Icon-Only Management Slider - Always Visible -->
				<ManagementSlider @menu-clicked="handleManagementMenuClick" />

				<!-- Main Content Container -->
				<div
					ref="containerRef"
					class="flex-1 flex flex-col lg:flex-row overflow-hidden relative"
				>
					<!-- Mobile Tab Navigation -->
					<div
						class="lg:hidden bg-white border-b border-gray-200 flex shadow-sm sticky top-0 z-[100]"
					>
						<button
							@click="handleTabSwitch('items')"
							:class="[
								'flex-1 px-3 py-3 text-sm font-semibold transition-[color,background-color,border-color] duration-100 relative touch-manipulation',
								uiStore.mobileActiveTab === 'items'
									? 'text-blue-600 border-b-3 border-blue-600 bg-blue-50'
									: 'text-gray-600 hover:text-gray-800 hover:bg-gray-50 active:bg-gray-100',
							]"
							:aria-label="__('View items')"
							:aria-selected="uiStore.mobileActiveTab === 'items'"
							role="tab"
						>
							<div class="flex items-center justify-center gap-1.5">
								<svg
									class="w-5 h-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
									/>
								</svg>
								<span>{{ __("Items") }}</span>
							</div>
						</button>
						<button
							@click="handleTabSwitch('cart')"
							:class="[
								'flex-1 px-3 py-3 text-sm font-semibold transition-[color,background-color,border-color] duration-100 relative touch-manipulation',
								uiStore.mobileActiveTab === 'cart'
									? 'text-blue-600 border-b-3 border-blue-600 bg-blue-50'
									: 'text-gray-600 hover:text-gray-800 hover:bg-gray-50 active:bg-gray-100',
							]"
							:aria-label="__('View cart')"
							:aria-selected="uiStore.mobileActiveTab === 'cart'"
							role="tab"
						>
							<div class="flex items-center justify-center gap-1.5">
								<svg
									class="w-5 h-5"
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
								<span>{{ __("Cart") }}</span>
								<span
									v-if="cartStore.itemCount > 0"
									class="bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shadow-sm"
								>
									{{ cartStore.itemCount }}
								</span>
							</div>
						</button>
					</div>

					<!-- Left: Items Selector (Desktop) / Tab Content (Mobile) -->
					<keep-alive>
						<div
							v-if="uiStore.isDesktop || uiStore.mobileActiveTab === 'items'"
							:style="{
								width: uiStore.isDesktop ? uiStore.leftPanelWidth + 'px' : '100%',
							}"
							:class="[
								'flex flex-col bg-white overflow-hidden',
								uiStore.isDesktop ? 'flex-shrink-0' : 'flex-1',
							]"
							style="contain: layout style paint"
						>
							<!-- //// Neoffice — ▼▼▼ ~290 lines with no upstream counterpart: everything the -->
							<!-- //// left pane becomes in restaurant mode. Upstream POSNext always shows the -->
							<!-- //// item grid; a restaurant starts from the room. With no table picked we -->
							<!-- //// render the floor plan (0ebfda03 2026-03-20 "Phase 2 - visual floor plan -->
							<!-- //// editor", 8aa35c29 multi-room tabs), and once a table or a takeaway ticket -->
							<!-- //// is open (80c90631 2026-03-26) a banner, then the carte instead of the raw -->
							<!-- //// catalogue: cards, categories, grid/list, search, menus and per-item -->
							<!-- //// colours and images (f2392119 2026-03-22 "restaurant card system", -->
							<!-- //// c56eed4f + e172bdba + bd1794bb + 8357bf87 + af6d76d2 2026-03-22, 6a4ff7b3 -->
							<!-- //// 2026-03-25, d526332f 2026-03-27 permanent card, 9f4e85df 2026-03-21 -->
							<!-- //// menus), plus the QR self-ordering button (c5208ba7 2026-03-28) and the -->
							<!-- //// guest-paid state (02f74451 2026-03-31). Returning to an occupied table -->
							<!-- //// reloads the SERVER draft, not a local one (c8f9a36c 2026-03-21). -->
							<!-- Restaurant Mode: Table Selector -->
							<template v-if="restaurantStore.isEnabled && !cartStore.restaurantTable && !cartStore.isTakeaway">
								<FloorPlanEditor
									@table-selected="handleTableSelected"
									@load-table-draft="handleLoadTableDraft"
									@load-server-draft="handleLoadServerDraft"
									@start-takeaway="handleStartTakeaway"
									@cleaning-table-clicked="handleCleaningTableClicked"
								/>
							</template>

							<!-- Normal Mode or Table Selected: Items Selector -->
							<template v-else>
								<!-- Restaurant table / takeaway banner -->
								<div
									v-if="restaurantStore.isEnabled && (cartStore.restaurantTable || cartStore.isTakeaway)"
									class="flex items-center justify-between px-4 py-3 border-b-2"
									:class="cartStore.isTakeaway
										? 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-300'
										: 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'"
								>
									<div class="flex items-center gap-3">
										<FeatherIcon :name="cartStore.isTakeaway ? 'shopping-bag' : 'coffee'" class="w-5 h-5 text-blue-600" />
										<div>
											<span class="text-lg font-bold text-blue-900">
												{{ cartStore.isTakeaway ? cartStore.takeawayNumber : cartStore.restaurantTable?.table_name }}
											</span>
											<span class="text-xs text-blue-700 ms-2">
												{{ cartStore.invoiceItems.length }} {{ __("articles") }}
											</span>
										</div>
										<!-- KDS Status Badge -->
										<div
											:class="[
												'ms-3 px-2.5 py-1 rounded-full text-xs font-semibold text-white',
												cartStore.kdsStatus === 'Pending'
													? 'bg-yellow-500'
													: cartStore.kdsStatus === 'Preparing'
													? 'bg-blue-500'
													: 'bg-green-500'
											]"
										>
											{{ cartStore.kdsStatus }}
										</div>
									</div>
									<Button
										variant="subtle"
										size="sm"
										@click="closeTable"
									>
										{{ __("Back") }}
									</Button>
								</div>

								<!-- Restaurant Card Display (replaces items grid when cards are active) -->
								<div v-if="restaurantStore.isEnabled && restaurantStore.activeCards.length > 0 && (cartStore.restaurantTable || cartStore.isTakeaway)"
									class="flex flex-col flex-1 min-h-0 overflow-hidden">
									<!-- Card tabs (like category tabs) -->
									<div class="px-1.5 sm:px-3 pt-1.5 sm:pt-3 pb-1.5 sm:pb-2 bg-white border-b border-gray-200">
										<div class="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
											<button
												v-for="card in restaurantStore.activeCards"
												:key="card.name"
												@click="selectedCard = card.name; selectedCardCategory = null"
												class="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-neo-sm text-[10px] sm:text-xs font-medium whitespace-nowrap transition-[background-color,border-color] duration-75 touch-manipulation snap-start flex-shrink-0"
												:class="[
													selectedCard === card.name
														? (card.is_permanent ? 'bg-indigo-50 text-indigo-600 border-2 border-indigo-500 shadow-neo' : 'bg-blue-50 text-blue-600 border-2 border-blue-500 shadow-neo')
														: (card.is_permanent ? 'bg-indigo-50/50 text-indigo-600 border border-indigo-200 hover:bg-indigo-50 active:bg-indigo-100' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 active:bg-gray-100')
												]"
											>
												<svg v-if="card.is_permanent" class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
												</svg>
												{{ card.card_name }}
											</button>
											<!-- QR Self-Ordering button -->
											<button
												v-if="restaurantStore.restaurantSettings.enable_qr_ordering && cartStore.restaurantTable"
												@click="handleQRButtonClick"
												class="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-neo-sm text-[10px] sm:text-xs font-medium whitespace-nowrap transition-[background-color,border-color] duration-75 touch-manipulation snap-start flex-shrink-0 ml-auto bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 active:bg-emerald-200"
												:title="__('Generate QR code for guest ordering')"
											>
												<svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
												</svg>
												QR
											</button>
										</div>
									</div>
									<!-- Category sub-filters -->
									<div v-if="cardCategories.length > 0" class="px-1.5 sm:px-3 py-1 bg-white border-b border-gray-100">
										<div class="flex items-center gap-1 overflow-x-auto scrollbar-hide">
											<button
												@click="selectedCardCategory = null"
												class="px-2 py-1 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap transition-colors"
												:class="!selectedCardCategory
													? 'bg-amber-100 text-amber-800'
													: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'"
											>{{ __("All") }}</button>
											<button
												v-for="cat in cardCategories"
												:key="cat"
												@click="selectedCardCategory = cat"
												class="px-2 py-1 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap transition-colors"
												:class="selectedCardCategory === cat
													? 'bg-amber-100 text-amber-800'
													: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'"
											>{{ cat }}</button>
										</div>
									</div>
									<!-- Search + view toggle -->
									<div class="px-1.5 sm:px-3 py-1.5 sm:py-2 bg-white border-b border-gray-200">
										<div class="flex items-center gap-1 sm:gap-2">
											<div class="flex-1 relative min-w-0">
												<svg class="absolute start-2 sm:start-3 top-1/2 -translate-y-1/2 w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
												<input
													v-model="cardSearchQuery"
													type="text"
													:placeholder="__('Search in card...')"
													class="w-full text-[11px] sm:text-sm border border-gray-300 rounded-neo-sm px-2 sm:px-3 py-2 ps-7 sm:ps-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
												/>
											</div>
											<div class="flex items-center gap-0.5 bg-gray-100 rounded-neo-sm p-0.5 flex-shrink-0">
												<button @click="cardViewMode = 'grid'" class="p-1.5 sm:p-2 rounded transition-[background-color,box-shadow] duration-75 touch-manipulation" :class="cardViewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'">
													<svg class="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
												</button>
												<button @click="cardViewMode = 'list'" class="p-1.5 sm:p-2 rounded transition-[background-color,box-shadow] duration-75 touch-manipulation" :class="cardViewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'">
													<svg class="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>
												</button>
											</div>
										</div>
									</div>
									<!-- Items display -->
									<div class="flex-1 overflow-y-auto p-1.5 sm:p-3" style="background-color: var(--neo-bg)">
										<!-- Grid view -->
										<template v-if="cardViewMode === 'grid'">
										<template v-for="(group, gi) in filteredCardGroups" :key="'g'+gi">
											<div v-if="group.category && !selectedCardCategory" class="bg-white border-b border-gray-200 px-3 py-1.5 mt-3 first:mt-0 rounded-t-lg">
												<h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{{ group.category }}</h3>
											</div>
											<div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 sm:gap-2.5" :class="!selectedCardCategory && group.category ? 'mt-1' : 'mt-0'">
												<div
													v-for="(ci_item, ii) in group.items"
													:key="ii"
													@click="ci_item.item_type === 'Menu' ? handleCardMenuClick(ci_item) : handleCardItemClick(ci_item)"
													:class="[
														'group relative bg-white border border-gray-200 rounded-neo-md p-1.5 sm:p-2.5 touch-manipulation transition-[border-color,box-shadow] duration-100',
														isCardItemOutOfStock(ci_item) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400 hover:shadow-neo-md'
													]"
												>
													<!-- Stock Badge -->
													<div
														v-if="getCardItemStock(ci_item) !== null"
														:class="[
															'absolute -top-1.5 -end-1.5 sm:-top-2 sm:-end-2 rounded-md shadow-lg z-10',
															'px-2 sm:px-2.5 py-1 sm:py-1 text-[10px] sm:text-xs font-bold',
															'border-2 border-white select-none',
															getStockStatus(getCardItemStock(ci_item)).color,
															getStockStatus(getCardItemStock(ci_item)).textColor
														]"
													>
														{{ Math.floor(getCardItemStock(ci_item)) }}
													</div>
													<div class="relative aspect-square rounded-neo-sm mb-1.5 sm:mb-2 overflow-hidden"
													:style="getCardItemBgStyle(ci_item)">
														<img v-if="ci_item.image" :src="ci_item.image" class="w-full h-full object-cover" />
														<div v-else class="w-full h-full flex items-center justify-center p-2">
															<svg v-if="ci_item.item_type === 'Menu'" class="w-8 h-8 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>
															<span v-else :class="getCardItemTextClasses(ci_item)" class="text-center leading-tight">
																{{ ci_item.item_name || ci_item.label }}
															</span>
														</div>
														<span v-if="ci_item.item_type === 'Menu'" class="absolute top-1 right-1 text-[8px] font-bold text-white bg-amber-500 px-1.5 py-0.5 rounded-full">Menu</span>
													</div>
													<div class="min-w-0">
														<p class="text-[10px] sm:text-xs font-semibold text-gray-900 truncate mb-0.5 leading-tight">{{ ci_item.item_name || ci_item.menu_name || ci_item.label }}</p>
														<div class="text-[9px] sm:text-[10px] leading-tight">
															<span class="font-semibold" :class="ci_item.item_type === 'Menu' ? 'text-amber-600' : 'text-blue-600'">{{ formatCurrency(ci_item.price || ci_item.default_price || 0) }}</span>
														</div>
													</div>
												</div>
											</div>
										</template>
										</template>

										<!-- List view -->
										<template v-else>
											<template v-for="(group, gi) in filteredCardGroups" :key="'l'+gi">
												<div v-if="group.category && !selectedCardCategory" class="bg-white border-b border-gray-200 px-3 py-1.5 mt-3 first:mt-0 rounded-t-lg">
													<h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{{ group.category }}</h3>
												</div>
												<div
													v-for="(li_item, li) in group.items"
													:key="li"
													@click="li_item.item_type === 'Menu' ? handleCardMenuClick(li_item) : handleCardItemClick(li_item)"
													:class="[
														'flex items-center gap-3 px-2 py-2 border-b border-gray-100 transition-colors',
														isCardItemOutOfStock(li_item) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'
													]"
												>
													<div class="relative flex-shrink-0">
														<img v-if="li_item.image" :src="li_item.image" class="w-10 h-10 rounded-lg object-cover" />
														<div v-else class="w-10 h-10 rounded-lg flex items-center justify-center"
															:style="getCardItemBgStyle(li_item)">
															<svg v-if="li_item.item_type === 'Menu'" class="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>
															<span v-else class="text-[7px] font-bold leading-tight text-center px-0.5"
																:class="li_item.custom_color && !isLightColor(li_item.custom_color) ? 'text-white' : 'text-gray-500'">
																{{ (li_item.item_name || li_item.label || '').substring(0, 6) }}
															</span>
														</div>
														<span
															v-if="getCardItemStock(li_item) !== null"
															:class="[
																'absolute -top-1.5 -end-1.5 rounded-md shadow-sm z-10',
																'px-1.5 py-0.5 text-[9px] font-bold',
																'border border-white',
																getStockStatus(getCardItemStock(li_item)).color,
																getStockStatus(getCardItemStock(li_item)).textColor
															]"
														>
															{{ Math.floor(getCardItemStock(li_item)) }}
														</span>
													</div>
													<div class="flex-1 min-w-0">
														<p class="text-xs font-semibold text-gray-900 truncate">{{ li_item.item_name || li_item.menu_name || li_item.label }}</p>
														<span v-if="li_item.item_type === 'Menu'" class="text-[9px] font-semibold text-amber-600 bg-amber-100 px-1 py-0.5 rounded">Menu</span>
													</div>
													<span class="text-xs font-bold flex-shrink-0" :class="li_item.item_type === 'Menu' ? 'text-amber-600' : 'text-blue-600'">{{ formatCurrency(li_item.price || li_item.default_price || 0) }}</span>
												</div>
											</template>
										</template>
									</div>
								</div>

								<!-- Menu cards (when Menus tab is active, no cards) -->
								<div v-else-if="showMenus && restaurantStore.isEnabled" class="flex flex-col h-full bg-[var(--neo-bg)] rounded-neo-lg overflow-hidden">
									<!-- Menus Tab Navigation -->
									<div class="px-1.5 sm:px-3 pt-1.5 sm:pt-3 pb-1.5 sm:pb-2 bg-white border-b border-gray-200">
										<div class="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
											<button
												@click="showMenus = false"
												class="flex items-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-neo-sm text-[10px] sm:text-xs font-medium whitespace-nowrap transition-[background-color,border-color] duration-75 touch-manipulation snap-start flex-shrink-0 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 active:bg-gray-100"
											>
												<span>{{ __("All Items") }}</span>
											</button>
											<button
												v-if="restaurantStore.activeMenus.length > 0"
												:class="[
													'flex items-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-neo-sm text-[10px] sm:text-xs font-medium whitespace-nowrap transition-[background-color,border-color] duration-75 touch-manipulation snap-start flex-shrink-0',
													'bg-blue-50 text-blue-600 border-2 border-blue-500 shadow-neo'
												]"
											>
												<span>{{ __("Menus") }}</span>
											</button>
										</div>
									</div>

									<!-- Menu cards grid -->
									<div class="flex-1 overflow-y-auto p-3 sm:p-4">
										<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
											<div
												v-for="menu in restaurantStore.activeMenus"
												:key="menu.name"
												@click="menuSelectionRef?.open(menu)"
												class="cursor-pointer rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:shadow-md transition-all p-4 bg-white"
											>
												<img v-if="menu.image" :src="menu.image" class="w-full h-32 object-cover rounded-lg mb-3" />
												<h3 class="font-bold text-gray-900">{{ menu.menu_name }}</h3>
												<p v-if="menu.description" class="text-xs text-gray-500 mt-1 line-clamp-2">{{ menu.description }}</p>
												<div class="mt-2 text-lg font-bold text-blue-600">{{ formatCurrency(menu.price) }}</div>
												<div class="mt-1 text-[10px] text-gray-400">{{ menu.courses?.length || 0 }} {{ __("courses") }}</div>
											</div>
										</div>
										<div v-if="restaurantStore.activeMenus.length === 0" class="flex items-center justify-center h-40">
											<p class="text-gray-500 text-sm">{{ __("No menus available") }}</p>
										</div>
									</div>
								</div>

								<!-- Items Selector (default view, hidden when card is active) -->
								<ItemsSelector
									v-if="!showMenus && !(restaurantStore.isEnabled && restaurantStore.activeCards.length > 0 && (cartStore.restaurantTable || cartStore.isTakeaway))"
									ref="itemsSelectorRef"
									:pos-profile="shiftStore.profileName"
									:cart-items="cartStore.invoiceItems"
									:currency="shiftStore.profileCurrency"
									@item-selected="handleItemSelected"
								/>
							</template>
						<!-- //// Neoffice — ▲▲▲ end of the restaurant left-pane region opened at the -->
						<!-- //// "Restaurant Mode: Table Selector" marker above. -->
						</div>
					</keep-alive>

					<!-- Draggable Divider (Desktop Only) -->
					<div
						v-if="uiStore.isDesktop"
						ref="dividerRef"
						role="separator"
						aria-orientation="vertical"
						@pointerdown="startResize"
						class="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize relative flex-shrink-0 transition-[background-color] duration-100 hidden lg:block"
						:class="{
							'bg-blue-500': uiStore.isResizing,
							'pointer-events-none opacity-0': uiStore.isAnyDialogOpen,
							'z-[1]': !uiStore.isAnyDialogOpen,
						}"
					>
						<div
							class="absolute inset-y-0 -left-2 -right-2"
							style="cursor: col-resize"
						></div>
						<div
							class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-12 bg-gray-400 rounded-full"
							:class="{
								'bg-blue-600': uiStore.isResizing,
								'bg-blue-500': !uiStore.isResizing,
							}"
							style="transition: background-color 0.1s ease; opacity: 0.8"
						></div>
					</div>

					<!-- Right: Invoice Cart (Desktop) / Tab Content (Mobile) -->
					<!-- //// Neoffice — min-width on the style= attribute of the div below raised -->
					<!-- //// 300px -> 450px: the cart now carries table, KDS and modifier badges and -->
					<!-- //// no longer fits in upstream's width (7e3f9458, 2026-03-31 "right panel -->
					<!-- //// minimum width 450px (was 360/300)"). Marker sits above keep-alive, not -->
					<!-- //// inside it: a comment child would make KeepAlive see two children. -->
					<keep-alive>
						<div
							v-if="uiStore.isDesktop || uiStore.mobileActiveTab === 'cart'"
							:class="[
								'flex flex-col bg-gray-50 overflow-hidden',
								uiStore.isDesktop ? 'flex-1' : 'flex-1',
							]"
							style="min-width: 450px; contain: layout style paint"
						>
							<!-- //// Neoffice — four divergences inside this opening tag (no HTML comment can -->
							<!-- //// sit between attributes, so they are listed here): -->
							<!-- ////   ref="invoiceCartRef" — the parent needs a handle on the cart to open -->
							<!-- ////   the edit dialog by itself for a zero-price item, e.g. a gift card whose -->
							<!-- ////   amount the cashier types in (5dddc528, 2026-01-14). -->
							<!-- ////   :grand-total / :rounding-adjustment — CHF has a 0.05 smallest fraction, -->
							<!-- ////   so the cart shows the ROUNDED total and the adjustment line beside it; -->
							<!-- ////   upstream passes the raw grandTotal (4fdb5df4, 2026-04-04 "rounding -->
							<!-- ////   total, tips visibility, cash quick amounts"). -->
							<!-- ////   @remove-item — passes the item OBJECT, not (itemCode, uom): the same -->
							<!-- ////   dish can sit twice in the cart with different modifiers, so removing by -->
							<!-- ////   code deleted the wrong line (7e1376a3, 2026-03-31). -->
							<!-- ////   @send-to-kitchen / @open-kitchen-dialog / @print-provisional-ticket / -->
							<!-- ////   @send-item-to-kitchen / @open-modifiers — the cart exits a restaurant -->
							<!-- ////   order needs besides paying: fire the order (8aa35c29, c7f6932c), print -->
							<!-- ////   the pre-payment ticket (71050faf, 2026-03-25) and edit modifiers -->
							<!-- ////   (4df0caf1, 2026-03-21). -->
							<!-- //// Neoffice — ref="invoiceCartRef" on the tag below: the page needs a handle on the -->
							<!-- //// cart so it can open the line-edit dialog itself for a zero-price item — a gift card -->
							<!-- //// whose amount the cashier types in at the till (5dddc528, 2026-01-14 "auto-open edit -->
							<!-- //// dialog for zero-price items (gift cards)"). The other divergences carried by this -->
							<!-- //// tag are listed just above; none can be marked in place, HTML allows no comment -->
							<!-- //// between attributes. -->
							<InvoiceCart
								ref="invoiceCartRef"
								:items="cartStore.invoiceItems"
								:customer="cartStore.customer"
								:subtotal="cartStore.subtotal"
								:tax-amount="cartStore.totalTax"
								:discount-amount="cartStore.totalDiscount"
								:grand-total="cartStore.roundedGrandTotal"
								:rounding-adjustment="cartStore.roundingAdjustment"
								:pos-profile="shiftStore.profileName"
								:currency="shiftStore.profileCurrency"
								:applied-offers="cartStore.appliedOffers"
								:warehouses="profileWarehouses"
								@update-quantity="cartStore.updateItemQuantity"
								@remove-item="(item) => cartStore.removeItem(item)"
								@select-customer="handleCustomerSelected"
								@create-customer="handleCreateCustomer"
								@edit-customer="handleEditCustomer"
								@proceed-to-payment="handleProceedToPayment"
								@clear-cart="handleClearCart"
								@save-draft="handleSaveDraft"
								@apply-coupon="uiStore.showCouponDialog = true"
								@show-offers="uiStore.showOffersDialog = true"
								@remove-offer="
									(offer) =>
										cartStore.removeOffer(
											offer,
											shiftStore.currentProfile,
											offersDialogRef.value
										)
								"
								@update-uom="cartStore.changeItemUOM"
								@edit-item="handleEditItem"
								@view-shift="uiStore.showOpenShiftDialog = true"
								@show-drafts="openDraftDialog"
								@show-history="openHistoryDialog"
								@show-return="openReturnDialog"
								@close-shift="handleCloseShift"
								@send-to-kitchen="handleSendToKitchen"
								@open-kitchen-dialog="kitchenDialogRef?.open()"
								@print-provisional-ticket="handlePrintProvisionalTicket"
								@send-item-to-kitchen="handleSendSingleItem"
								@open-modifiers="handleOpenModifiers"
							/>
						</div>
					</keep-alive>

					<!-- Mobile Floating Cart Button -->
					<button
						v-if="
							!uiStore.isDesktop &&
							uiStore.mobileActiveTab === 'items' &&
							cartStore.itemCount > 0
						"
						@click="uiStore.setMobileTab('cart')"
						class="lg:hidden fixed bottom-20 end-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full p-4 shadow-2xl hover:shadow-3xl hover:from-blue-700 hover:to-blue-800 active:from-blue-800 active:to-blue-900 transition-[background,box-shadow,transform] duration-200 z-50 touch-manipulation active:scale-95 ring-4 ring-blue-100"
						:aria-label="__('View cart with {0} items', [cartStore.itemCount])"
					>
						<div class="relative">
							<svg
								class="w-7 h-7"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								stroke-width="2.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
								/>
							</svg>
							<span
								class="absolute -top-2 -end-2 bg-red-500 text-white text-xs font-bold rounded-full min-w-[22px] h-[22px] px-1 flex items-center justify-center shadow-lg animate-pulse"
							>
								{{ cartStore.itemCount }}
							</span>
						</div>
					</button>

					<!-- PWA Install Badge (Mobile Only) -->
					<InstallAppBadge />
				</div>
			</div>

			<!-- No Shift Placeholder -->
			<!-- //// Neoffice — same footer-less viewport calc as the sales area above: the -->
			<!-- //// removed BrainWise footer no longer costs 60px (c0bf6f85, 2026-03-20). -->
			<div
				v-else
				class="flex-1 flex items-center justify-center bg-gray-50"
				style="max-height: calc(100vh - var(--header-height, 60px))"
			>
				<div class="text-center">
					<div
						class="mx-auto flex items-center justify-center h-24 w-24 rounded-full bg-blue-100"
					>
						<svg
							class="h-12 w-12 text-blue-600"
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
					<h3 class="mt-4 text-lg font-medium text-gray-900">
						<!-- //// Neoffice — product name: Neopos, not upstream's "POS Next" (771950bd, -->
						<!-- //// 2026-04-02 "rebrand: rename POS Next to Neopos"). -->
						{{ __("Welcome to Neopos") }}
					</h3>
					<p class="mt-2 text-sm text-gray-500">
						{{ __("Please open a shift to start making sales") }}
					</p>
					<Button
						variant="solid"
						theme="blue"
						@click="uiStore.showOpenShiftDialog = true"
						class="mt-6"
					>
						{{ __("Open Shift") }}
					</Button>
				</div>
			</div>

			<!-- Payment Dialog -->
		<!-- //// Neoffice — two attribute changes inside this tag: :grand-total is the CHF -->
		<!-- //// 0.05-rounded total, so the amount tendered matches the amount printed -->
		<!-- //// (4fdb5df4, 2026-04-04); :guest-paid-amount tells the dialog what the -->
		<!-- //// guests already settled from their phones, so the cashier is asked for the -->
		<!-- //// remainder and not for the whole bill (214125e5, 2026-03-30 "show -->
		<!-- //// remaining to collect in cart + payment dialog accounts for guest -->
		<!-- //// payments"). -->
		<!-- //// Neoffice — :grand-total below is the CHF 0.05-rounded total, not upstream's raw -->
		<!-- //// grandTotal: what the cashier tenders has to match what the receipt prints, and the -->
		<!-- //// difference is shown as its own rounding line (4fdb5df4, 2026-04-04 "rounding total, -->
		<!-- //// tips visibility, cash quick amounts"). -->
		<PaymentDialog
			v-model="uiStore.showPaymentDialog"
			:grand-total="cartStore.roundedGrandTotal"
			:subtotal="cartStore.subtotal"
			:guest-paid-amount="cartStore.guestPaidAmount"
			:pos-profile="shiftStore.profileName"
			:currency="shiftStore.profileCurrency"
			:is-offline="offlineStore.isOffline"
			:allow-partial-payment="posSettingsStore.allowPartialPayment"
			:allow-credit-sale="posSettingsStore.allowCreditSale"
			:allow-customer-credit-payment="posSettingsStore.allowCustomerCreditPayment"
			:allow-write-off="posSettingsStore.allowWriteOffChange"
			:write-off-limit="shiftStore.writeOffLimit"
			:customer="cartStore.customer"
			:company="shiftStore.profileCompany"
			:additional-discount="cartStore.additionalDiscount"
			:items="cartStore.invoiceItems"
			:tax-amount="cartStore.totalTax"
			:discount-amount="cartStore.totalDiscount"
			:target-doctype="cartStore.targetDoctype"
			:is-submitting="cartStore.isSubmitting"
			:applied-offer-count="cartStore.appliedOffers.length"
			@payment-completed="handlePaymentCompleted"
			@update-additional-discount="handleAdditionalDiscountUpdate"
			@show-offers="uiStore.showOffersDialog = true"
			@show-coupon="uiStore.showCouponDialog = true"
		/>

			<!-- Customer Selection Dialog -->
			<CustomerDialog
				v-model="uiStore.showCustomerDialog"
				:pos-profile="shiftStore.profileName"
				@customer-selected="handleCustomerSelected"
			/>

			<!-- Shift Opening Dialog -->
			<ShiftOpeningDialog
				v-model="uiStore.showOpenShiftDialog"
				@shift-opened="handleShiftOpened"
			/>

			<!-- Shift Closing Dialog -->
			<ShiftClosingDialog
				v-model="uiStore.showCloseShiftDialog"
				:opening-shift="shiftStore.currentShift?.name"
				@shift-closed="handleShiftClosed"
			/>

			<!-- Draft Invoices Dialog -->
			<DraftInvoicesDialog
				v-model="uiStore.showDraftDialog"
				:currency="shiftStore.profileCurrency"
				:allow-print-draft-invoices="posSettingsStore.allowPrintDraftInvoices"
				@load-draft="handleLoadDraft"
				@drafts-updated="draftsStore.updateDraftsCount"
			/>

			<!-- Return Invoice Dialog -->
			<ReturnInvoiceDialog
				v-model="uiStore.showReturnDialog"
				:pos-profile="shiftStore.profileName"
				:pos-opening-shift="shiftStore.currentShift?.name"
				:currency="shiftStore.profileCurrency"
				@return-created="handleReturnCreated"
			/>

			<!-- //// Neoffice — in a restaurant the order leaves for the stations long before -->
			<!-- //// it is paid, so the cart needs a second, non-payment exit. Upstream has -->
			<!-- //// only "pay" (c7f6932c, 2026-03-23 "table only marked Occupied when draft -->
			<!-- //// invoice exists, not before"). -->
			<!-- Send to Kitchen Dialog -->
			<SendToKitchenDialog
				ref="kitchenDialogRef"
				@items-sent="handleItemsSentToKitchen"
			/>

			<!-- Coupon Dialog -->
			<!-- //// Neoffice — :net-total and :grand-total inside this tag. A gift card is -->
			<!-- //// capped on the net total AFTER pricing rules, not on the raw subtotal: -->
			<!-- //// capping on the subtotal let a card exceed the discounted price and the -->
			<!-- //// server refused the invoice (8e06bb9c, 2026-01-16 "calculate discount on -->
			<!-- //// net total after pricing rules"). The total is the CHF-rounded one -->
			<!-- //// (4fdb5df4, 2026-04-04). -->
			<CouponDialog
				v-model="uiStore.showCouponDialog"
				:subtotal="cartStore.subtotal"
				:net-total="cartStore.netTotalBeforeAdditionalDiscount"
				:tax-amount="cartStore.totalTax"
				:grand-total="cartStore.roundedGrandTotal"
				:items="cartStore.invoiceItems"
				:pos-profile="shiftStore.profileName"
				:customer="cartStore.customer?.name || cartStore.customer"
				:company="shiftStore.profileCompany"
				:currency="shiftStore.profileCurrency"
				:applied-coupon="cartStore.appliedCoupon"
				@discount-applied="handleDiscountApplied"
				@discount-removed="handleDiscountRemoved"
			/>

			<!-- //// Neoffice — a gift card sold at the till must be handed over with its -->
			<!-- //// code, so the codes created by the invoice are shown once, right after the -->
			<!-- //// sale. Upstream keeps gift cards server-side and never surfaces them -->
			<!-- //// (703f2046, 2026-01-14 "add GiftCardCreatedDialog and debug logging"). -->
			<!-- Gift Card Created Dialog -->
			<GiftCardCreatedDialog
				:open="showGiftCardCreatedDialog"
				:gift-cards="createdGiftCards"
				:currency="shiftStore.profileCurrency"
				@close="showGiftCardCreatedDialog = false"
			/>

			<!-- Offers Dialog -->
			<OffersDialog
				ref="offersDialogRef"
				v-model="uiStore.showOffersDialog"
				:subtotal="cartStore.subtotal"
				:items="cartStore.invoiceItems"
				:pos-profile="shiftStore.profileName"
				:customer="cartStore.customer?.name || cartStore.customer"
				:company="shiftStore.profileCompany"
				:currency="shiftStore.profileCurrency"
				:applied-offers="cartStore.appliedOffers"
				@apply-offer="handleApplyOffer"
				@remove-offer="
					(offer) =>
						cartStore.removeOffer(
							offer,
							shiftStore.currentProfile,
							offersDialogRef.value
						)
				"
			/>

			<!-- Batch/Serial Dialog -->
			<BatchSerialDialog
				v-model="uiStore.showBatchSerialDialog"
				:item="cartStore.pendingItem"
				:quantity="cartStore.pendingItemQty"
				:warehouse="shiftStore.profileWarehouse"
				:pos-profile="cartStore.posProfile"
				@batch-serial-selected="handleBatchSerialSelected"
			/>

			<!-- Generic Item Selection Dialog -->
			<ItemSelectionDialog
				v-model="uiStore.showItemSelectionDialog"
				:item="cartStore.pendingItem"
				:mode="cartStore.selectionMode"
				:pos-profile="shiftStore.profileName"
				:currency="shiftStore.profileCurrency"
				@option-selected="handleOptionSelected"
			/>

			<!-- //// Neoffice — three dialogs a dish needs and an article does not: structured -->
			<!-- //// modifiers (4df0caf1, 2026-03-21 "Phase 4A - structured item modifiers"), a -->
			<!-- //// numpad for an item whose price is entered at the till (1ff2fba2, -->
			<!-- //// 2026-03-27), and course-by-course menu selection (9f4e85df, 2026-03-21 -->
			<!-- //// "Phase 4B - restaurant menus with course selection dialog"). -->
			<!-- Item Modifiers Dialog -->
			<ItemModifiersDialog ref="itemModifiersRef" @saved="handleModifiersSaved" />
			<PriceEntryDialog ref="priceEntryRef" @price-confirmed="handlePriceConfirmed" />

			<!-- Menu Selection Dialog -->
			<MenuSelectionDialog
				ref="menuSelectionRef"
				@menu-confirmed="handleMenuConfirmed"
			/>

			<!-- Invoice History Dialog -->
			<InvoiceHistoryDialog
				v-model="uiStore.showHistoryDialog"
				:pos-profile="shiftStore.profileName"
				:pos-opening-shift="shiftStore.currentShift?.name"
				:currency="shiftStore.profileCurrency"
				@view-invoice="handleViewInvoice"
				@print-invoice="handlePrintInvoice"
				@return-created="handleReturnCreated"
			/>

			<!-- Offline Invoices Dialog -->
			<OfflineInvoicesDialog
				v-model="uiStore.showOfflineInvoicesDialog"
				:is-offline="offlineStore.isOffline"
				:pending-invoices="offlineStore.pendingInvoicesList"
				:is-syncing="offlineStore.isSyncing"
				:currency="shiftStore.profileCurrency"
				@sync-all="handleSyncAll"
				@delete-invoice="handleDeleteOfflineInvoice"
				@edit-invoice="handleEditOfflineInvoice"
				@print-invoice="handlePrintInvoice"
				@refresh="offlineStore.loadPendingInvoices"
			/>

			<!-- //// Neoffice — label narrowed from upstream's "Create/Edit Customer Dialog": -->
			<!-- //// this quick form now only creates. The cart pencil opens the meta-driven -->
			<!-- //// EditCustomerDialog below instead, which picks up custom fields and stays -->
			<!-- //// inside the SPA (82fbfd9e, 2026-07-10 "full meta-driven customer edit -->
			<!-- //// dialog (stays in the POS)"). -->
			<!-- Create Customer Dialog (quick form) -->
			<CreateCustomerDialog
				v-model="uiStore.showCreateCustomerDialog"
				:pos-profile="shiftStore.profileName"
				:initial-name="uiStore.initialCustomerName"
				:customer="editCustomer"
				@customer-created="handleCustomerCreated"
				@customer-updated="handleCustomerUpdated"
			/>

			<!-- //// Neoffice — added dialog, no upstream equivalent. The cart pencil used to reopen the -->
			<!-- //// small quick-create form in edit mode; this one is built from the Customer doctype -->
			<!-- //// meta, so it picks up custom fields on its own, and it stays a dialog inside the SPA — -->
			<!-- //// which is what the PWA / tablet till needs (82fbfd9e, 2026-07-10 "full meta-driven -->
			<!-- //// customer edit dialog (stays in the POS)"). -->
			<!-- //// Full meta-driven Customer edit dialog (pencil icon) -->
			<EditCustomerDialog
				v-model="showEditCustomerDialog"
				:customer="editCustomer"
				@customer-updated="handleCustomerUpdated"
			/>

			<!-- Promotion Management -->
			<PromotionManagement
				v-model="showPromotionManagement"
				:pos-profile="shiftStore.profileName"
				:company="shiftStore.profileCompany"
				:currency="shiftStore.profileCurrency"
				@promotion-saved="handlePromotionSaved"
			/>

			<!-- POS Settings -->
			<!-- //// Neoffice — :initial-tab inside this tag: the settings dialog can be opened -->
			<!-- //// straight on one tab, so "edit the schedule" in the card editor lands on -->
			<!-- //// the schedule rather than on the first tab (6b38498b, 2026-03-27 "hide -->
			<!-- //// permanent card from schedule settings, add edit schedule link"). -->
			<POSSettings
				v-model="showPOSSettings"
				:pos-profile="shiftStore.profileName"
				:current-warehouse="shiftStore.profileWarehouse"
				:initial-tab="settingsInitialTab"
			/>

			<!-- Stock Lookup Dialog (Products Menu) -->
			<WarehouseAvailabilityDialog
				v-model="showStockLookup"
				mode="search"
				:pos-profile="shiftStore.profileName"
				:company="shiftStore.profileCompany"
			/>

			<!-- //// Neoffice — the restaurant authoring surface, none of it upstream: the -->
			<!-- //// preparation-workflow editor and the product-options editor (d59036f1 -->
			<!-- //// 2026-03-23, f23daabe 2026-03-27), the carte editor (f2392119 2026-03-22), -->
			<!-- //// the tips panel — Swiss service tips are recorded per server (c4460c61, -->
			<!-- //// 2026-03-29 "record guest tips in Restaurant Tip + Tips panel") — the -->
			<!-- //// reservation dialog (ebc3ecc5, 2026-03-29) and cash in/out, which posts a -->
			<!-- //// Journal Entry from a template instead of leaving the drawer unexplained -->
			<!-- //// (6c598630, 2026-03-28 "cash in/out from POS using Journal Entry -->
			<!-- //// Templates"). -->
			<!-- Restaurant Editors -->
			<WorkflowEditor v-if="showWorkflowEditor" v-model="showWorkflowEditor" />
			<ProductOptionsEditor v-if="showProductOptionsEditor" v-model="showProductOptionsEditor" />
			<CardEditor v-if="showCardEditor" v-model="showCardEditor" @cards-updated="restaurantStore.fetchActiveCards()" @open-settings="openSettingsTab" />
		<TipsPanel :show="showTipsPanel" @close="showTipsPanel = false" />
		<ReservationDialog :show="showReservationDialog" @close="showReservationDialog = false" />

			<!-- Cash In/Out -->
			<CashInOutDialog
				v-model="showCashInOut"
				:pos-profile="shiftStore.profileName"
				:company="shiftStore.profileCompany"
				:pos-opening-shift="cartStore.posOpeningShift"
				:currency="shiftStore.profileCurrency"
			/>

			<!-- Invoice Management -->
			<!-- //// Neoffice — :pos-opening-shift inside this tag, taken from the cart rather -->
			<!-- //// than the shift store, so the invoice list is scoped to the shift the cart -->
			<!-- //// actually belongs to (a0084ae0, 2026-03-24). -->
			<InvoiceManagement
				v-model="showInvoiceManagement"
				:pos-profile="shiftStore.profileName"
				:currency="shiftStore.profileCurrency"
				:pos-opening-shift="cartStore.posOpeningShift"
				:history-invoices="invoiceHistoryData"
				:draft-invoices="draftsStore.drafts"
				@view-invoice="handleViewInvoice"
				@print-invoice="handlePrintInvoice"
				@load-draft="handleLoadDraftFromManagement"
				@delete-draft="handleDeleteDraft"
				@refresh-history="loadInvoiceHistoryData"
			/>

			<!-- Invoice Detail Dialog -->
			<InvoiceDetailDialog
				v-model="showInvoiceDetail"
				:invoice-name="selectedInvoiceForView"
				:pos-profile="shiftStore.profileName"
				:currency="shiftStore.profileCurrency"
				@print-invoice="handlePrintInvoice"
			/>

			<!-- Clear Cart Confirmation Dialog -->
			<Dialog
				v-model="uiStore.showClearCartDialog"
				:options="{ title: __('Clear Cart?'), size: 'xs' }"
			>
				<template #body-content>
					<!-- //// Neoffice — the clear-cart confirmation had to grow a second line. Money -->
					<!-- //// already taken on the terminal but not yet booked lives in the cart store, -->
					<!-- //// so this dialog can name it: emptying the cart here is what made 10.- and -->
					<!-- //// 40.- vanish at guigoz on 2026-08-18 (92c0c5ed, 2026-08-19 — the commit -->
					<!-- //// that made a collected payment impossible to lose in silence). -->
					<div class="py-3 flex flex-col gap-3">
						<p class="text-sm text-gray-600">
							{{ __("Remove all {0} items from cart?", [cartStore.itemCount]) }}
						</p>
						<!-- //// Neoffice — the irreversible step. If a terminal payment was
						     already collected for this cart, clearing it loses the money:
						     the customer is charged and no sale exists. This dialog used to
						     talk only about items (guigoz, 18.08 — 10.- and 40.- lost that
						     way). Name the amount, and make the button say what it does. -->
						<div
							v-if="cartStore.collectedUnbookedTotal > 0"
							class="flex items-start gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2"
						>
							<span class="text-base leading-none mt-0.5">⚠️</span>
							<div class="text-xs text-red-900 leading-snug">
								<div class="font-bold">
									{{ __("{0} has already been charged to the customer", [formatCurrency(cartStore.collectedUnbookedTotal)]) }}
								</div>
								<div>
									{{ __("Clearing the cart abandons that payment: the money stays taken and no sale is recorded. Finish the sale, or refund the customer first.") }}
								</div>
							</div>
						</div>
					</div>
				</template>
				<template #actions>
					<div class="flex gap-2 w-full">
						<Button
							class="flex-1"
							variant="subtle"
							@click="uiStore.showClearCartDialog = false"
						>
							{{ __("Cancel") }}
						</Button>
						<Button
							class="flex-1"
							variant="solid"
							theme="red"
							@click="confirmClearCart"
						>
							<!-- //// Neoffice — the destructive button renames itself: "Abandon the payment" -->
							<!-- //// instead of "Clear All" as soon as money was collected and not booked, so -->
							<!-- //// the cashier cannot read it as "just remove the items" (92c0c5ed, -->
							<!-- //// 2026-08-19). The two dialogs that follow this one are ours as well: the -->
							<!-- //// purge dialog that guards switching restaurant mode with live orders -->
							<!-- //// (59599289 2026-03-21; 1e73b40d; ab2ee852 server-side reset_all_tables) and -->
							<!-- //// the notice that a customer was just created on the second screen -->
							<!-- //// (912ef092, 2026-02-04 "improve UX for customer creation flow"). -->
							{{ cartStore.collectedUnbookedTotal > 0 ? __("Abandon the payment") : __("Clear All") }}
						</Button>
					</div>
				</template>
			</Dialog>

			<!-- Purge & Toggle Restaurant Mode Dialog -->
			<Dialog
				v-model="showPurgeDialog"
				:options="{ title: __('Switch Restaurant Mode?'), size: 'xs' }"
			>
				<template #body-content>
					<div class="py-3">
						<p class="text-sm text-gray-600">{{ purgeDialogMessage }}</p>
					</div>
				</template>
				<template #actions>
					<div class="flex gap-2 w-full">
						<Button class="flex-1" variant="subtle" @click="showPurgeDialog = false">
							{{ __("Cancel") }}
						</Button>
						<Button class="flex-1" variant="solid" theme="red" @click="handlePurgeAndToggle">
							{{ __("Clear & Switch") }}
						</Button>
					</div>
				</template>
			</Dialog>

			<!-- Customer Created from Display Dialog -->
			<Dialog
				v-model="uiStore.showCustomerCreatedDialog"
				:options="{ title: __('New Customer'), size: 'sm' }"
			>
				<template #body-content>
					<div class="py-4 text-center">
						<div class="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-green-100 mb-4">
							<svg class="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
							</svg>
						</div>
						<p class="text-gray-700 text-base mb-2">
							{{ __("Customer created from display:") }}
						</p>
						<p class="font-semibold text-lg text-gray-900">
							{{ uiStore.customerCreatedData?.customer_name }}
						</p>
						<p class="text-sm text-gray-500 mt-1">
							{{ __("Do you want to select this customer for the current sale?") }}
						</p>
					</div>
				</template>
				<template #actions>
					<div class="flex gap-2 w-full">
						<Button
							class="flex-1"
							variant="subtle"
							@click="uiStore.clearCustomerCreatedNotification()"
						>
							{{ __("No") }}
						</Button>
						<Button
							class="flex-1"
							variant="solid"
							@click="selectCustomerFromDisplay"
						>
							{{ __("Yes, select") }}
						</Button>
					</div>
				</template>
			</Dialog>

			<!-- Logout Confirmation Dialog -->
			<Dialog
				v-model="uiStore.showLogoutDialog"
				:options="{ title: __('Sign Out Confirmation'), size: 'md' }"
				:dismissable="!session.logout.loading"
			>
				<template #body-content>
					<!-- WITH SHIFT OPEN -->
					<div v-if="shiftStore.hasOpenShift" class="px-4 py-5">
						<div class="text-center mb-6">
							<div
								class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-red-100 to-red-200 shadow-md mb-4"
							>
								<svg
									class="h-8 w-8 text-red-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									/>
								</svg>
							</div>
							<h3 class="text-lg font-bold text-red-600 mb-2">
								{{ __("Your Shift is Still Open!") }}
							</h3>
							<p class="text-sm text-gray-600 max-w-sm mx-auto">
								{{
									__("Close your shift first to save all transactions properly")
								}}
							</p>
						</div>

						<!-- Action Buttons -->
						<div class="space-y-3 max-w-md mx-auto">
							<!-- Recommended Action - BLUE -->
							<button
								@click="logoutWithCloseShift"
								:disabled="session.logout.loading"
								class="w-full flex items-center justify-center px-5 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg shadow-lg hover:shadow-blue-500/30 transition-[background,box-shadow,opacity,transform] duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
							>
								<svg
									class="w-5 h-5 me-2"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
									/>
								</svg>
								{{ __("Close Shift & Sign Out") }}
							</button>

							<!-- Alternative Actions -->
							<div class="grid grid-cols-2 gap-2">
								<button
									@click="confirmLogout"
									:disabled="session.logout.loading"
									class="px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold text-sm rounded-lg shadow-md hover:shadow-red-500/30 transition-[background,box-shadow,opacity] duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{{ __("Skip & Sign Out") }}
								</button>
								<button
									@click="uiStore.showLogoutDialog = false"
									:disabled="session.logout.loading"
									class="px-4 py-3 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-lg transition-[background-color,border-color,opacity] duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 hover:border-gray-400"
								>
									{{ __("Cancel") }}
								</button>
							</div>
						</div>
					</div>

					<!-- WITHOUT SHIFT (Simple confirmation) -->
					<div v-else class="px-4 py-5">
						<div class="text-center mb-6">
							<div
								class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-red-100 to-red-200 shadow-md mb-4"
							>
								<svg
									class="h-8 w-8 text-red-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
									/>
								</svg>
							</div>
							<h3 class="text-lg font-bold text-red-600 mb-2">
								{{ __("Sign Out?") }}
							</h3>
							<p class="text-sm text-gray-600">
								<!-- //// Neoffice — product name, same rebrand (771950bd, 2026-04-02). -->
								{{ __("You will be logged out of Neopos") }}
							</p>
						</div>

						<div class="grid grid-cols-2 gap-3 max-w-sm mx-auto">
							<button
								@click="uiStore.showLogoutDialog = false"
								:disabled="session.logout.loading"
								class="px-5 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-blue-500/30 transition-[background-color,box-shadow,opacity,transform] duration-200 disabled:opacity-50 transform hover:scale-[1.02] active:scale-[0.98]"
							>
								{{ __("Cancel") }}
							</button>
							<button
								@click="confirmLogout"
								:disabled="session.logout.loading"
								class="px-5 py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-lg shadow-lg hover:shadow-red-500/30 transition-[background,box-shadow,opacity,transform] duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
							>
								<span v-if="!session.logout.loading">{{ __("Sign Out") }}</span>
								<span v-else class="flex items-center justify-center">
									<svg
										class="animate-spin h-5 w-5 me-2"
										fill="none"
										viewBox="0 0 24 24"
									>
										<circle
											class="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											stroke-width="4"
										></circle>
										<path
											class="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										></path>
									</svg>
									{{ __("Signing Out...") }}
								</span>
							</button>
						</div>
					</div>
				</template>
			</Dialog>

			<!-- Success Dialog -->
			<Dialog
				v-model="uiStore.showSuccessDialog"
				:options="{ title: __('Invoice Created Successfully'), size: 'md' }"
			>
				<template #body-content>
					<div class="text-center py-6">
						<!-- //// Neoffice — bigger success tick (h-12 -> h-14) and the whole icon collapsed -->
						<!-- //// from six lines to three. Cosmetic half of the success-dialog rework -->
						<!-- //// (548757f7, 2026-03-24 "improve payment UX ... better success dialog with -->
						<!-- //// Print/Email/Close buttons"). -->
						<div class="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-green-100">
							<svg class="h-7 w-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
						</div>
						<h3 class="mt-4 text-lg font-medium text-gray-900">
							<!-- //// Neoffice — FORMATTING ONLY: the same interpolation, unwrapped from three -->
							<!-- //// lines to one by the success-dialog rework (548757f7, 2026-03-24). -->
							{{ __("Invoice {0} created successfully!", [uiStore.lastInvoiceName]) }}
						</h3>
						<p class="mt-2 text-sm text-gray-500">
							{{ __("Paid: {0}", [formatCurrency(uiStore.lastPaidAmount)]) }}
						</p>
					</div>
				</template>
				<template #actions>
					<!-- //// Neoffice — the action row is centred and full-width because it now holds -->
					<!-- //// three buttons instead of two (548757f7, 2026-03-24). -->
					<div class="flex justify-center gap-3 w-full">
						<Button variant="subtle" @click="uiStore.showSuccessDialog = false">
							{{ __("Close") }}
						</Button>
						<!-- //// Neoffice — Email button: the receipt can be sent as a PDF straight from -->
						<!-- //// the success dialog. Upstream only prints, which strands a customer who -->
						<!-- //// wants the invoice by mail (4239ea8d, 2026-03-24 "add email invoice -->
						<!-- //// functionality with PDF attachment"). -->
						<Button
							variant="outline"
							@click="showEmailInvoiceDialog = true"
						>
							<template #prefix>
								<FeatherIcon name="mail" class="w-4 h-4" />
							</template>
							{{ __("Email") }}
						</Button>
						<!-- //// Neoffice — the @click inside this tag collapsed from six lines to one, and -->
						<!-- //// the #prefix slot below adds the printer icon, so Print/Email/Close read as -->
						<!-- //// three peers (548757f7 + 4239ea8d, 2026-03-24). The dialog also stays open -->
						<!-- //// after Print or Email so the cashier can do both (39a70d18, 2026-03-24). -->
						<Button
							variant="solid"
							theme="blue"
							@click="handlePrintInvoice({ name: uiStore.lastInvoiceName })"
						>
							<!-- //// Neoffice — printer icon on the Print button, added with the Email peer -->
							<!-- //// (548757f7 + 4239ea8d, 2026-03-24). -->
							<template #prefix>
								<FeatherIcon name="printer" class="w-4 h-4" />
							</template>
							{{ __("Print") }}
						</Button>
					</div>
				</template>
			</Dialog>

			<!-- //// Neoffice — host for the e-mail dialog opened by the Email button above -->
			<!-- //// (4239ea8d, 2026-03-24 "add email invoice functionality with PDF -->
			<!-- //// attachment"). -->
			<!-- Email Invoice Dialog -->
			<EmailInvoiceDialog
				v-model="showEmailInvoiceDialog"
				:invoice-name="uiStore.lastInvoiceName"
			/>

			<!-- Error Dialog -->
			<Dialog
				v-model="uiStore.showErrorDialog"
				:options="{ title: uiStore.errorDialogTitle || __('Error'), size: 'md' }"
			>
				<template #body-content>
					<div class="py-3">
						<p class="text-sm text-gray-700 whitespace-pre-line">
							{{ uiStore.errorDialogMessage || __("An unexpected error occurred.") }}
						</p>
						<div
							v-if="uiStore.errorDetails"
							class="mt-3 pt-3 border-t border-gray-200"
						>
							<p class="text-xs text-gray-500">{{ uiStore.errorDetails }}</p>
						</div>
					</div>
				</template>
				<template #actions>
					<div class="flex justify-between items-center w-full">
						<Button
							v-if="
								uiStore.errorRetryAction === 'sync' &&
								uiStore.errorRetryActionData?.failedInvoiceId
							"
							variant="outline"
							theme="red"
							@click="handleDeleteFailedInvoice"
						>
							{{ __("Delete Invoice") }}
						</Button>
						<div v-else></div>
						<div class="flex gap-2">
							<Button variant="subtle" @click="uiStore.clearError()">
								{{ __("Close") }}
							</Button>
							<Button
								v-if="uiStore.errorRetryAction"
								variant="solid"
								@click="handleErrorRetry"
							>
								{{ __("Try Again") }}
							</Button>
						</div>
					</div>
				</template>
			</Dialog>

			<!-- Clear Cache Overlay -->
			<ClearCacheOverlay
				ref="clearCacheOverlayRef"
				:show="showClearCacheDialog"
				@cancel="showClearCacheDialog = false"
				@confirm="confirmClearCache"
			/>

		<!-- //// Neoffice — the upstream Footer comment and its POSFooter element were -->
		<!-- //// REMOVED here: that strip was the BrainWise branding, and dropping it both -->
		<!-- //// removes the vendor mark and gives the till back a screen row (458d81a9 -->
		<!-- //// 2026-03-20 "remove BrainWise branding"; db22e2ae 2026-03-20 "remove -->
		<!-- //// POSFooter branding component to reclaim screen space"). -->
		</template>

		<!-- Session Lock Screen (outside v-if/v-else so it renders even during loading) -->
		<SessionLockScreen />

		<!-- //// Neoffice — ▼▼▼ ~95 lines of QR self-ordering and table-lifecycle dialogs, -->
		<!-- //// none of them upstream: confirm before opening a table to guest ordering -->
		<!-- //// and show the QR itself (c5208ba7 2026-03-28 "QR button on table view", -->
		<!-- //// f3affeaa replaced a raw window.confirm with a real Dialog), then the -->
		<!-- //// end-of-service dialog on a table that guests already paid from their -->
		<!-- //// phones — Paid (blue) and Cleaning (green) are distinct states with -->
		<!-- //// different exits, and the dialog shows what was actually collected, tips -->
		<!-- //// included (07d0d493 2026-03-29, 2aad6b2a + 34751a29 + 6bfa3117 2026-03-30, -->
		<!-- //// ddf510f6 2026-03-31, 3b805c88 2026-03-29). -->
		<!-- QR Self-Ordering Confirmation Dialog -->
		<Dialog v-model="showQRConfirmDialog" :options="{ title: __('QR Self-Ordering'), size: 'sm' }">
			<template #body-content>
				<div class="flex flex-col items-center text-center p-4">
					<div class="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
						<svg class="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
						</svg>
					</div>
					<p class="text-base font-semibold text-gray-900 mb-2">{{ currentQR.tableName }}</p>
					<p class="text-sm text-gray-600">{{ __('Open this table for QR self-ordering? Customers will be able to scan a QR code and order directly from their phone.') }}</p>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" @click="showQRConfirmDialog = false">{{ __('Cancel') }}</Button>
					<Button class="flex-1" variant="solid" theme="green" @click="confirmQRGeneration">
						<template #prefix>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
						</template>
						{{ __('Generate QR') }}
					</Button>
				</div>
			</template>
		</Dialog>

		<!-- QR Code Dialog for Guest Ordering -->
		<TableQRCode
			v-if="showQRDialog"
			:token="currentQR.token"
			:url="currentQR.url"
			:tableName="currentQR.tableName"
			@close="showQRDialog = false"
		/>

		<!-- Paid/Cleaning Table Dialog -->
		<Dialog v-model="showCleaningDialog" :options="{ title: cleaningTable?.table_name || __('Table'), size: 'sm' }">
			<template #body-content>
				<div class="flex flex-col items-center text-center p-4">
					<div class="w-12 h-12 rounded-full flex items-center justify-center mb-3"
						:class="cleaningTable?.status === 'Paid' ? 'bg-blue-100' : 'bg-emerald-100'">
						<svg class="w-7 h-7" :class="cleaningTable?.status === 'Paid' ? 'text-blue-600' : 'text-emerald-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
						</svg>
					</div>
					<p class="text-base font-semibold text-gray-900">
						{{ cleaningTable?.status === 'Paid' ? __('Table paid') : __('Table ready for cleanup') }}
					</p>
				</div>

				<!-- Payment summary -->
				<div v-if="tablePaymentSummary" class="mx-4 mb-4 bg-gray-50 rounded-xl p-4 text-left">
					<!-- Items -->
					<div class="space-y-1 mb-3">
						<div v-for="(item, idx) in tablePaymentSummary.items" :key="idx"
							class="flex justify-between text-sm">
							<span class="text-gray-700">{{ item.qty }}× {{ item.item_name }}</span>
							<span class="text-gray-500">{{ formatCleaningPrice(item.amount) }}</span>
						</div>
					</div>
					<div class="border-t border-dashed border-gray-300 pt-2 space-y-1">
						<div class="flex justify-between text-sm">
							<span class="text-gray-700">{{ __('Order') }}</span>
							<span class="font-semibold">{{ formatCleaningPrice(tablePaymentSummary.grand_total) }}</span>
						</div>
						<div v-if="tablePaymentSummary.tip_total > 0" class="flex justify-between text-sm">
							<span class="text-gray-700">{{ __('Tips') }}</span>
							<span class="text-green-600 font-semibold">+{{ formatCleaningPrice(tablePaymentSummary.tip_total) }}</span>
						</div>
						<div class="flex justify-between text-sm font-bold pt-1 border-t border-gray-200">
							<span class="text-gray-900">{{ __('Total collected') }}</span>
							<span class="text-green-700">{{ formatCleaningPrice(tablePaymentSummary.paid_amount + tablePaymentSummary.tip_total) }}</span>
						</div>
					</div>
					<!-- Invoice ref -->
					<p class="text-[10px] text-gray-400 mt-2">{{ tablePaymentSummary.invoice }}</p>
				</div>
				<div v-else-if="loadingPaymentSummary" class="flex justify-center py-4">
					<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="solid" @click="markTableAvailable">
						{{ __('Available') }}
					</Button>
					<Button v-if="cleaningTable?.status === 'Paid'" class="flex-1" variant="solid" theme="green" @click="confirmTableCleaning">
						{{ __('Cleaning') }}
					</Button>
				</div>
			</template>
		</Dialog>
	<!-- //// Neoffice — ▲▲▲ end of the QR / table-lifecycle dialog region opened above. -->
	</div>
</template>

<script>
// Module-scoped init guard — prevents redundant heavy initialization
// when component remounts due to translationVersion changes.
// Tracks the profile+shift key so a user/shift change correctly re-initializes.
let _initializedKey = null
let _posInitPromise = null
</script>

<script setup>
import ShiftClosingDialog from "@/components/ShiftClosingDialog.vue";
import ShiftOpeningDialog from "@/components/ShiftOpeningDialog.vue";
import ClearCacheOverlay from "@/components/common/ClearCacheOverlay.vue";
import SessionLockScreen from "@/components/common/SessionLockScreen.vue";
//// Neoffice — `import POSFooter from "@/components/common/POSFooter.vue";` was
//// REMOVED here with the BrainWise branding footer it imported (458d81a9 2026-03-20;
//// db22e2ae 2026-03-20 "remove POSFooter branding component to reclaim screen space").
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ManagementSlider from "@/components/pos/ManagementSlider.vue";
//// Neoffice — imports for the restaurant authoring dialogs rendered above: cash in/out
//// via Journal Entry Templates (6c598630, 2026-03-28), preparation workflows and
//// product options (d59036f1 2026-03-23, f23daabe 2026-03-27), the carte editor
//// (f2392119, 2026-03-22), the tips panel (c4460c61 + d08c57e7, 2026-03-23/29) and the
//// reservation dialog (ebc3ecc5, 2026-03-29). No upstream equivalent for any of them.
import CashInOutDialog from "@/components/pos/CashInOutDialog.vue";
import WorkflowEditor from "@/components/restaurant/WorkflowEditor.vue";
import ProductOptionsEditor from "@/components/restaurant/ProductOptionsEditor.vue";
import CardEditor from "@/components/restaurant/CardEditor.vue";
import TipsPanel from "@/components/restaurant/TipsPanel.vue";
import ReservationDialog from "@/components/restaurant/ReservationDialog.vue";
import POSHeader from "@/components/pos/POSHeader.vue";
import BatchSerialDialog from "@/components/sale/BatchSerialDialog.vue";
import CouponDialog from "@/components/sale/CouponDialog.vue";
import CreateCustomerDialog from "@/components/sale/CreateCustomerDialog.vue";
//// Neoffice — the meta-driven customer editor (82fbfd9e, 2026-07-10) and the gift-card
//// hand-over dialog (703f2046, 2026-01-14); neither exists upstream.
import EditCustomerDialog from "@/components/sale/EditCustomerDialog.vue";
import GiftCardCreatedDialog from "@/components/sale/GiftCardCreatedDialog.vue";
import CustomerDialog from "@/components/sale/CustomerDialog.vue";
import DraftInvoicesDialog from "@/components/sale/DraftInvoicesDialog.vue";
//// Neoffice — send-to-kitchen dialog: the restaurant cart's non-payment exit
//// (c7f6932c, 2026-03-23).
import SendToKitchenDialog from "@/components/sale/SendToKitchenDialog.vue";
import InvoiceCart from "@/components/sale/InvoiceCart.vue";
import InvoiceHistoryDialog from "@/components/sale/InvoiceHistoryDialog.vue";
import ItemSelectionDialog from "@/components/sale/ItemSelectionDialog.vue";
//// Neoffice — modifiers, the zero-price numpad and course selection: what a dish needs
//// and an article does not (4df0caf1 + 9f4e85df 2026-03-21, 1ff2fba2 2026-03-27).
import ItemModifiersDialog from "@/components/sale/ItemModifiersDialog.vue";
import PriceEntryDialog from "@/components/sale/PriceEntryDialog.vue";
import MenuSelectionDialog from "@/components/sale/MenuSelectionDialog.vue";
import ItemsSelector from "@/components/sale/ItemsSelector.vue";
//// Neoffice — table selection, the floor-plan editor and the per-table QR code: the POS
//// starts from the room, not the catalogue (0ebfda03 2026-03-20 "Phase 2 - visual floor
//// plan editor"; c5208ba7 2026-03-28 "QR button on table view").
import TableSelector from "@/components/pos/TableSelector.vue";
import FloorPlanEditor from "@/components/pos/FloorPlanEditor.vue";
import TableQRCode from "@/components/restaurant/TableQRCode.vue";
import OffersDialog from "@/components/sale/OffersDialog.vue";
import OfflineInvoicesDialog from "@/components/sale/OfflineInvoicesDialog.vue";
import PaymentDialog from "@/components/sale/PaymentDialog.vue";
import PromotionManagement from "@/components/sale/PromotionManagement.vue";
//// Neoffice — e-mail-the-invoice dialog (4239ea8d, 2026-03-24 "add email invoice
//// functionality with PDF attachment").
import EmailInvoiceDialog from "@/components/sale/EmailInvoiceDialog.vue";
import ReturnInvoiceDialog from "@/components/sale/ReturnInvoiceDialog.vue";
import WarehouseAvailabilityDialog from "@/components/sale/WarehouseAvailabilityDialog.vue";
import POSSettings from "@/components/settings/POSSettings.vue";
import InvoiceManagement from "@/components/invoices/InvoiceManagement.vue";
import InvoiceDetailDialog from "@/components/invoices/InvoiceDetailDialog.vue";
import { useRealtimeStock } from "@/composables/useRealtimeStock";
// Card realtime updates are handled in restaurant.js store via startRealtimeCardListeners()
import { useSessionLock } from "@/composables/useSessionLock";
import { usePOSEvents } from "@/composables/usePOSEvents";
//// Neoffice — gift cards live on ERPNext-native Coupon Code / Promotional Scheme in our
//// fork, so the till needs this composable to read back the codes an invoice created
//// (703f2046, 2026-01-14 "add GiftCardCreatedDialog and debug logging").
import { useGiftCard } from "@/composables/useGiftCard";
import { useLocale } from "@/composables/useLocale";
//// Neoffice — the sync layer for the second, customer-facing screen; upstream has one
//// screen and no such composable (185c3c50, 2026-02-03 "use dynamic customer group and
//// territory lookup for customer display").
import { useCustomerDisplaySync } from "@/composables/useCustomerDisplaySync";
import { session } from "@/data/session";
import { useUserData } from "@/data/user";
import { parseError } from "@/utils/errorHandler";
import { cleanupUserSession } from "@/utils/sessionCleanup";
import { offlineWorker } from "@/utils/offline/workerClient";
import { cacheOfflineReceiptPayload } from "@/utils/offline/offlineReceiptCache";
import { cacheInvoiceHistory, getCachedInvoiceHistory } from "@/utils/offline/sync";
import {
	hydrateLocalOnlyInvoice,
	printInvoice,
	printInvoiceByName,
	printWithSilentFallback,
	//// Neoffice — the pre-payment (provisional) ticket a restaurant hands the table before
	//// cashing in; it prints "THIS IS NOT A RECEIPT" (71050faf, 2026-03-25 "add provisional
	//// ticket print button in restaurant table view"). `git blame` credits the merge node
	//// c87d0e93 (2026-05-14) because that merge re-resolved this import list.
	printProvisionalTicket,
} from "@/utils/printInvoice";
import { qzConnected, connect as qzConnect, disconnect as qzDisconnect } from "@/utils/qzTray";

//// Neoffice — FeatherIcon added to the frappe-ui import: the Neoffice header, the table
//// banner and the reworked success dialog draw their icons with it (87f168fe 2026-03-20
//// "align POS design with Neoffice theme"; 548757f7 2026-03-24).
import { Button, Dialog, FeatherIcon, createResource } from "frappe-ui";
import { call } from "@/utils/apiWrapper";
//// Neoffice — nextTick added to the vue import: several of our flows have to wait for
//// the cart to render before reaching into it — auto-opening the price numpad on a
//// zero-price item (5dddc528, 2026-01-14) and the modifiers dialog on a dish just added
//// (4df0caf1, 2026-03-21).
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useToast } from "@/composables/useToast";
//// Neoffice — a dish has a colour, an article has a barcode: the card and the cart show
//// a colour tile when there is no photo, and this decides black or white text on it
//// (6a4ff7b3, 2026-03-25 "apply color/name display to restaurant card view").
import { isLightColor } from "@/utils/itemColors";

import { useCustomerSearchStore } from "@/stores/customerSearch";
import { useItemSearchStore } from "@/stores/itemSearch";
import { useStockStore } from "@/stores/stock";
//// Neoffice — used to decide from the CARD data whether a line is a stock item, instead
//// of inferring it from the stock store being populated (1a0abef1, 2026-03-31; import
//// blamed to 02f74451, 2026-03-31).
import { useStock } from "@/composables/useStock";
// Pinia Stores
import { usePOSCartStore } from "@/stores/posCart";
import { usePOSDraftsStore } from "@/stores/posDrafts";
import { usePOSSettingsStore } from "@/stores/posSettings";
import { usePOSShiftStore } from "@/stores/posShift";
import { usePOSSyncStore } from "@/stores/posSync";
//// Neoffice — the restaurant store: tables, areas, cards, menus, modifiers, preparation
//// stations. The whole table-service model upstream does not have (87f168fe, 2026-03-20).
import { useRestaurantStore } from "@/stores/restaurant";
import { usePOSUIStore } from "@/stores/posUI";
import { useBootstrapStore } from "@/stores/bootstrap";
import { logger } from "@/utils/logger";
import { shouldValidateItemStock } from "@/utils/stockValidator";

// Initialize stores
const cartStore = usePOSCartStore();
const shiftStore = usePOSShiftStore();
const uiStore = usePOSUIStore();
const offlineStore = usePOSSyncStore();
const draftsStore = usePOSDraftsStore();
const posSettingsStore = usePOSSettingsStore();
const itemStore = useItemSearchStore();
const stockStore = useStockStore();
//// Neoffice — stock status per line, used by the restaurant card view which has no
//// stock column of its own (02f74451, 2026-03-31).
const { getStockStatus } = useStock();
const customerSearchStore = useCustomerSearchStore();
//// Neoffice — restaurant store instance for this page (87f168fe, 2026-03-20).
const restaurantStore = useRestaurantStore();
const bootstrapStore = useBootstrapStore();
// Note: settingsStore is an alias to posSettingsStore (same Pinia store singleton)
const settingsStore = posSettingsStore;

// Real-time stock updates
const { onStockUpdate } = useRealtimeStock();

//// Neoffice — the second screen is driven from here: enable/disable the mirror for the
//// open shift, tell it a sale completed, and be told when the CUSTOMER created their own
//// account on it. Upstream POSNext has one screen (185c3c50 2026-02-03; 912ef092
//// 2026-02-04 "improve UX for customer creation flow").
// Customer display sync
const {
	enableSync: enableDisplaySync,
	disableSync: disableDisplaySync,
	notifySaleComplete,
	onCustomerCreated,
} = useCustomerDisplaySync();

// Session lock (inactivity + tab-refocus)
const { lock: lockSession, configure: configureSessionLock, startActivityTracking, stopActivityTracking } = useSessionLock();

// POS Events system
const {
	onWarehouseChanged,
	onPricingChanged,
	onStockPolicyChanged,
	onSettingsChanged,
	onSalesOperationsChanged,
} = usePOSEvents();

// Initialize toast
const { showSuccess, showError, showWarning } = useToast();

// Initialize logger
const log = logger.create("POSSale");

// User data composable
const { userName, userImage } = useUserData();

// Locale composable for RTL support
const { isRTL } = useLocale();

// Component refs
const itemsSelectorRef = ref(null);
const offersDialogRef = ref(null);
//// Neoffice — handles the page needs on children that upstream does not have: the
//// send-to-kitchen dialog (c7f6932c), the cart itself so a zero-price line can be opened
//// for editing (5dddc528), the modifiers dialog (4df0caf1), the price numpad (1ff2fba2)
//// and the menu course selector (9f4e85df).
const kitchenDialogRef = ref(null);
const invoiceCartRef = ref(null);
const itemModifiersRef = ref(null);
const priceEntryRef = ref(null);
const menuSelectionRef = ref(null);
const containerRef = ref(null);
const dividerRef = ref(null);
const pendingPaymentAfterCustomer = ref(false);
const logoutAfterClose = ref(false);
const editCustomer = ref(null); // Customer being edited (null for create mode)
//// Neoffice — the cart pencil now opens the full meta-driven editor, kept separate from
//// the quick-create form above it (82fbfd9e, 2026-07-10 "full meta-driven customer edit
//// dialog (stays in the POS)").
const showEditCustomerDialog = ref(false); // Full meta-driven edit dialog
const showClearCacheDialog = ref(false);
const clearCacheOverlayRef = ref(null);
//// Neoffice — ▼▼▼ ~145 lines of restaurant state with no upstream counterpart: the
//// selected carte and category and their search / grid-list filtering (f2392119
//// 2026-03-22 "restaurant card system", c56eed4f + e172bdba + 8357bf87 2026-03-22), the
//// live QR tokens per table (c5208ba7 + f3affeaa, 2026-03-28), and the click paths that
//// turn a card entry into a cart line — colour and image carried over (6a4ff7b3,
//// 983130d3, f1e01ff1), price asked when it is 0 (c7696bb1, 2026-03-27), modifiers
//// opened by themselves and resolved with findLast so the dialog edits the line just
//// added rather than the first one with the same code (7e1376a3, 2026-03-31; b98cca7e,
//// eabe35e7, 5982e48e 2026-03-25), and menus routed to the course dialog (9f4e85df).
const showMenus = ref(false);

// Restaurant card selection
const selectedCard = ref(null)
const selectedCardCategory = ref(null)

// QR Self-Ordering state
const activeQRTokens = ref(new Map()) // table name → { token, url }
const showQRDialog = ref(false)
const showQRConfirmDialog = ref(false)
const currentQR = ref({ token: "", url: "", tableName: "" })
const cardSearchQuery = ref("")
const cardViewMode = ref("grid")
const cardCategories = computed(() => {
	return selectedCardItems.value
		.filter(i => i.item_type === "Category")
		.map(i => i.label)
})
const filteredCardGroups = computed(() => {
	let groups = cardItemGroups.value
	if (selectedCardCategory.value) {
		const group = groups.find(g => g.category === selectedCardCategory.value)
		groups = group ? [{ category: null, items: group.items }] : []
	}
	// Apply search filter
	const q = cardSearchQuery.value?.toLowerCase().trim()
	if (!q) return groups
	return groups.map(g => ({
		category: g.category,
		items: g.items.filter(i =>
			(i.item_name || i.menu_name || i.label || "").toLowerCase().includes(q)
		)
	})).filter(g => g.items.length > 0)
})
const cardItemGroups = computed(() => {
	const groups = []
	let current = { category: null, items: [] }
	for (const item of selectedCardItems.value) {
		if (item.item_type === "Category") {
			if (current.items.length > 0 || current.category) groups.push(current)
			current = { category: item.label, items: [] }
		} else {
			current.items.push(item)
		}
	}
	if (current.items.length > 0 || current.category) groups.push(current)
	return groups
})
const selectedCardItems = computed(() => {
	if (!selectedCard.value) return []
	const card = restaurantStore.activeCards.find(c => c.name === selectedCard.value)
	return card?.items || []
})

watch(() => restaurantStore.activeCards, (cards) => {
	if (cards.length > 0 && !selectedCard.value) {
		selectedCard.value = cards[0].name
	}
}, { immediate: true })

// Card item stock helpers
function getCardItemStock(cardItem) {
	if (!cardItem.item || cardItem.item_type !== 'Item') return null
	if (!cardItem.is_stock_item) return null
	return stockStore.getDisplayStock(cardItem.item)
}
function isCardItemOutOfStock(cardItem) {
	const stock = getCardItemStock(cardItem)
	if (stock === null) return false // non-stock items are always available
	return stock <= 0
}

// Card item display helpers (image / color / name fallback)
function getCardItemBgStyle(item) {
	if (item.image) return {}
	if (item.custom_color) return { backgroundColor: item.custom_color }
	return { backgroundColor: '#F3F4F6' }
}
function getCardItemTextClasses(item) {
	const base = 'font-bold line-clamp-3'
	if (item.custom_color) {
		return `${base} ${isLightColor(item.custom_color) ? 'text-gray-800' : 'text-white'} text-sm sm:text-base`
	}
	return `${base} text-gray-500 text-xs sm:text-sm`
}

function handleCardItemClick(cardItem) {
	if (isCardItemOutOfStock(cardItem)) return
	const item = {
		item_code: cardItem.item,
		item_name: cardItem.item_name || cardItem.label,
		item_group: cardItem.item_group || "",
		rate: cardItem.price || cardItem.default_price || 0,
		image: cardItem.image || "",
		custom_color: cardItem.custom_color || "",
	}
	const stationInfo = restaurantStore.getStationForItem(item.item_code, item.item_group)
	if (stationInfo) {
		item.preparation_station = stationInfo.station
	}

	// Check for zero-price items
	const itemRate = item.rate || 0;
	if (itemRate === 0) {
		// Restaurant mode with modifiers: show options first, price entry after if still 0
		const modGroups = restaurantStore.getModifiersForItem(item.item_code, item.item_group);
		if (modGroups.length > 0) {
			cartStore.addItem(item, 1);
			nextTick(() => {
				// Use findLast to get the NEWEST item (just added), not the first match
				const cartItem = cartStore.invoiceItems.findLast(i => i.item_code === item.item_code);
				if (cartItem && itemModifiersRef.value) {
					itemModifiersRef.value.open(cartItem);
				}
			});
			return;
		}
		// No modifiers: show price entry dialog
		if (priceEntryRef.value) {
			priceEntryRef.value.open(item);
		}
		return;
	}

	cartStore.addItem(item, 1)

	// Auto-open modifiers dialog if item has required modifier groups
	const modGroups = restaurantStore.getModifiersForItem(item.item_code, item.item_group)
	if (modGroups.length > 0) {
		nextTick(() => {
			// Use findLast to get the NEWEST item (just added), not the first match
			const cartItem = cartStore.invoiceItems.findLast(i => i.item_code === item.item_code)
			if (cartItem && itemModifiersRef.value) {
				itemModifiersRef.value.open(cartItem)
			}
		})
	}
}

function handleCardMenuClick(cardItem) {
	const menu = restaurantStore.activeMenus.find(m => m.name === cardItem.menu)
	if (menu) {
		menuSelectionRef.value?.open(menu)
	}
}

//// Neoffice — ▲▲▲ end of the restaurant carte / QR state region opened above.
// Debounce timer for offer reapplication
const offerReapplyTimer = ref(null);

// Performance: Cache previous cart state to avoid unnecessary reapplications
let previousCartHash = "";

// Tracks the in-flight edit of a queued offline invoice. Set by
// handleEditOfflineInvoice, consumed by the offline branch of
// handlePaymentCompleted to supersede the original row, and cleared
// whenever the edit is abandoned (cart cleared without checkout).
let editingOfflineContext = null;

// Helper function to compute cart hash
function computeCartHash() {
	return cartStore.invoiceItems
		.map(
			(i) =>
				`${i.item_code}-${i.quantity}-${i.rate}-${i.discount_percentage || 0}-${
					i.discount_amount || 0
				}-${i.uom || ""}-${i.warehouse || ""}`
		)
		.join("|");
}

// Promotion dialog
const showPromotionManagement = ref(false);

// Settings dialog
const showPOSSettings = ref(false);
//// Neoffice — lets a caller open POS Settings directly on one tab, so "edit the
//// schedule" from the card editor lands on the schedule instead of the first tab
//// (6b38498b, 2026-03-27 "hide permanent card from schedule settings, add edit
//// schedule link").
const settingsInitialTab = ref("");

function openSettingsTab(tab) {
	settingsInitialTab.value = tab || ""
	showPOSSettings.value = true
}

// Stock Lookup dialog (Products menu)
const showStockLookup = ref(false);

// Invoice Management dialog
const showInvoiceManagement = ref(false);

//// Neoffice — visibility flags for the sidebar tools upstream has no equivalent of:
//// cash in/out posted as a Journal Entry (6c598630, 2026-03-28), the carte / options /
//// workflow editors (f2392119, f23daabe, d59036f1), the tips panel (c4460c61 + d08c57e7)
//// and the reservation dialog (ebc3ecc5, 2026-03-29).
// Cash In/Out dialog
const showCashInOut = ref(false);

// Restaurant editors
const showCardEditor = ref(false);
const showProductOptionsEditor = ref(false);
const showWorkflowEditor = ref(false);
const showTipsPanel = ref(false);
const showReservationDialog = ref(false);

// Invoice Detail dialog
const showInvoiceDetail = ref(false);
const selectedInvoiceForView = ref(null);

//// Neoffice — state for e-mailing the invoice (4239ea8d, 2026-03-24) and for handing
//// over the gift-card codes an invoice just created (703f2046, 2026-01-14).
// Email Invoice dialog
const showEmailInvoiceDialog = ref(false);

// Gift Card Created dialog
const showGiftCardCreatedDialog = ref(false);
const createdGiftCards = ref([]);

// Gift Card composable
const { getGiftCardsFromInvoice } = useGiftCard();

// Invoice history data (used by InvoiceManagement component)
const invoiceHistoryData = ref([]);

// Stock sync status
const isStockSyncActive = ref(false);

// Warehouses state and resource
const warehousesList = ref([]);

const warehousesResource = createResource({
	url: "pos_next.api.pos_profile.get_warehouses",
	makeParams() {
		return {
			pos_profile: shiftStore.profileName,
		};
	},
	auto: false,
	onSuccess(data) {
		const warehouses = data?.message || data || [];
		warehousesList.value = warehouses;
	},
	onError(error) {
		log.error("Error loading warehouses:", error);
		warehousesList.value = [];
	},
});

// Watch for profile changes to load warehouses
watch(
	() => shiftStore.profileName,
	(newProfile) => {
		if (newProfile) {
			warehousesResource.reload();
		}
	},
	{ immediate: true }
);

// Computed for warehouses - returns all warehouses for the company
const profileWarehouses = computed(() => {
	if (warehousesList.value.length > 0) {
		return warehousesList.value.map((w) => ({
			name: w.name,
			warehouse: w.warehouse_name || w.name,
		}));
	}
	// Fallback to profile warehouse if API hasn't loaded yet
	if (shiftStore.profileWarehouse) {
		return [
			{
				name: shiftStore.profileWarehouse,
				warehouse: shiftStore.profileWarehouse,
			},
		];
	}
	return [];
});

//// Neoffice — switching between retail and table service is refused while a cart is
//// open, and when LEAVING restaurant mode also while any table is still occupied:
//// flipping the mode strands live orders nobody can reach any more (8aa35c29, 2026-03-20
//// "Phase 1 restaurant module - header toggle").
// Restaurant mode toggle computed
const canToggleRestaurant = computed(() => {
	const noItems = cartStore.invoiceItems.length === 0
	const noOccupiedTables = restaurantStore.totalOccupiedCount === 0
	const isDisabling = restaurantStore.isEnabled
	if (isDisabling) {
		return noItems && noOccupiedTables
	}
	return noItems
})

const canAccessShiftActions = computed(() => shiftStore.hasOpenShift);

/** Desk link only for users with the Nexus POS Manager role (from bootstrap API). */
const canSwitchToDesk = computed(() => Boolean(bootstrapStore.data?.can_switch_to_desk));

// Resize state
let resizeState = null;
let bodyStyleSnapshot = null;

//// Neoffice — when the guard above refuses, offer the purge instead of failing silently:
//// the dialog names what will be lost, then clears the cart and resets every occupied
//// table server-side. Doing it from the client left tables Occupied with no order behind
//// them (59599289 2026-03-21 "purge dialog when toggling restaurant mode with active
//// orders"; 1e73b40d; ab2ee852 "use server-side reset_all_tables API").
// Handle restaurant mode toggle
const showPurgeDialog = ref(false);
const purgeDialogMessage = ref("");

async function handleToggleRestaurant() {
	if (!canToggleRestaurant.value) {
		const isDisabling = restaurantStore.isEnabled
		if (isDisabling && restaurantStore.totalOccupiedCount > 0) {
			purgeDialogMessage.value = __("There are {0} occupied tables. Clear all orders and disable restaurant mode?", [restaurantStore.totalOccupiedCount])
		} else if (cartStore.invoiceItems.length > 0) {
			purgeDialogMessage.value = __("There are items in the cart. Clear the cart and toggle restaurant mode?")
		}
		showPurgeDialog.value = true
		return
	}

	await doToggleRestaurant()
}

async function doToggleRestaurant() {
	try {
		const newValue = !restaurantStore.isEnabled
		await cartStore.clearCart()

		// When disabling, reset all occupied tables to Empty via server API
		if (!newValue) {
			await call("pos_next.api.restaurant.reset_all_tables")
		}

		await posSettingsStore.toggleRestaurantMode()
		if (newValue) {
			await restaurantStore.fetchFromNetwork()
			showSuccess(__("Restaurant mode enabled"))
		} else {
			showSuccess(__("Restaurant mode disabled"))
		}
	} catch (error) {
		showError(__("Failed to toggle restaurant mode"), String(error))
	}
}

async function handlePurgeAndToggle() {
	showPurgeDialog.value = false
	await doToggleRestaurant()
}

onMounted(async () => {
	// Window resize listeners (passive for better performance)
	const handleResize = () => {
		uiStore.setWindowWidth(window.innerWidth);
		updateLayoutBounds();
	};
	window.addEventListener("resize", handleResize, { passive: true });

	//// Neoffice — the guests at the table order from their own phones, so the cashier's cart
	//// has to follow a cart it does not own. Debounce plus a running flag because the
	//// realtime event can arrive several times for one order and each pass re-added the
	//// items (259cdb72 2026-03-31 "debounce guest update handler"; e7628309 2026-04-01 mutex
	//// guard). replaceAllItems bypasses addItem's dedup, which merged distinct lines
	//// (707a330c, 2026-04-01), and modifiers are carried so two identical dishes with
	//// different options stay two lines (165065fa, 2026-03-31). Guest payments and tips are
	//// mirrored into the cart (34751a29, 2026-03-30; 1c05e7c7 keeps the TIP item out of the
	//// visible cart).
	// Listen for guest order updates to refresh POS cart when a guest orders on the active table
	// Guest update handler with debounce + mutex to prevent item duplication
	let _guestUpdateTimer = null
	let _guestUpdateRunning = false
	const handleGuestUpdate = (e) => {
		const table = cartStore.restaurantTable
		if (!table || e.detail?.table !== table.name) return
		if (_guestUpdateRunning) return

		clearTimeout(_guestUpdateTimer)
		_guestUpdateTimer = setTimeout(async () => {
			if (_guestUpdateRunning) return
			_guestUpdateRunning = true
			try {
				const orderData = await call("pos_next.api.restaurant.get_table_order", { table_name: table.name })
				if (orderData?.items) {
					// Direct replacement — bypasses addItem dedup logic entirely
					await cartStore.clearCart()
					cartStore.setRestaurantTable(table)
					cartStore.replaceAllItems(orderData.items)
					cartStore.$patch({
						currentDraftId: orderData.name,
						hasUnsentChanges: false,
						guestPaidAmount: orderData.paid_amount || 0,
						guestTipAmount: orderData.tip_total || 0,
						kdsStatus: orderData.kds_status || "Pending",
					})
					if (orderData.customer) cartStore.setCustomer(orderData.customer)
				}
			} catch { /* ignore */ }
			finally { _guestUpdateRunning = false }
		}, 500)
	}
	window.addEventListener("pos:guest-order-update", handleGuestUpdate)

	// Set up real-time stock update listener
	const cleanup = onStockUpdate(async (stockUpdates) => {
		// Filter updates to only include items from our warehouse(s)
		const profileWarehouses = shiftStore.profileWarehouse
			? [shiftStore.profileWarehouse]
			: warehousesList.value.map((w) => w.warehouse_name || w.name);

		const relevantUpdates = stockUpdates.filter((update) =>
			profileWarehouses.includes(update.warehouse)
		);

		if (relevantUpdates.length > 0) {
			// Apply stock updates - Pinia auto-updates UI!
			stockStore.update(relevantUpdates);
			await offlineWorker.updateStockQuantities(relevantUpdates);
		}
	});

	// Set up POS events listeners
	// Listen to warehouse changes from settings
	onWarehouseChanged(async ({ newWarehouse, oldWarehouse }) => {
		log.info(`Event: Warehouse changed from ${oldWarehouse} to ${newWarehouse}`);
		await handleWarehouseChanged(newWarehouse);
	});

	// Listen to pricing changes from settings
	onPricingChanged(async ({ changes }) => {
		log.info("Event: Pricing settings changed", changes);

		// Update tax_inclusive setting if it changed
		if (changes.hasOwnProperty("tax_inclusive")) {
			const newTaxInclusive = changes.tax_inclusive.new;
			log.info(
				`Updating tax_inclusive from ${changes.tax_inclusive.old} to ${newTaxInclusive}`
			);

			// Update the cart store tax inclusive setting
			cartStore.setTaxInclusive(newTaxInclusive);

			// Reload tax rules to ensure they're applied with the new setting
			// This is critical because tax_inclusive affects how taxes are calculated
			try {
				log.info("Reloading tax rules with new tax_inclusive setting...");
				await cartStore.loadTaxRules(shiftStore.currentShift?.pos_profile, {
					tax_inclusive: newTaxInclusive,
				});
				log.info("Tax rules reloaded successfully");
			} catch (error) {
				log.error("Failed to reload tax rules:", error);
			}
		}

		// Recalculate cart items if there are any
		if (cartStore.invoiceItems.length > 0) {
			cartStore.invoiceItems.forEach((item) => {
				cartStore.recalculateItem(item);
			});
			cartStore.rebuildIncrementalCache();

			const message = changes.hasOwnProperty("tax_inclusive")
				? __("Tax mode updated. Cart recalculated with new tax settings.")
				: __("Discount settings changed. Cart recalculated.");

			showSuccess(message);
		} else if (changes.hasOwnProperty("tax_inclusive")) {
			// Show feedback even if cart is empty
			showSuccess(
				changes.tax_inclusive.new
					? __(
							"Prices are now tax-inclusive. This will apply to new items added to cart."
					  )
					: __(
							"Prices are now tax-exclusive. This will apply to new items added to cart."
					  )
			);
		}
	});

	// Listen to stock policy changes
	onStockPolicyChanged(({ changes, requiresReload }) => {
		log.info("Event: Stock policy changed", changes);

		if (changes.allow_negative_stock) {
			const isNowAllowed = changes.allow_negative_stock.new;

			const message = isNowAllowed
				? __("Negative stock sales are now allowed")
				: __("Negative stock sales are now restricted");

			showSuccess(message);
		}
	});

	// Listen to sales operations changes
	onSalesOperationsChanged(({ changes }) => {
		log.info("Event: Sales operations settings changed", changes);

		// Reload settings in the store to get fresh values
		posSettingsStore.reloadSettings();

		// Show notification for specific important changes
		const changeLabels = {
			allow_credit_sale: __("Credit Sale"),
			allow_return: __("Returns"),
			allow_write_off_change: __("Write Off Change"),
			allow_partial_payment: __("Partial Payment"),
			silent_print: __("Silent Print"),
		};

		const changedSettings = Object.keys(changes)
			.map((key) => changeLabels[key])
			.filter(Boolean)
			.join(", ");

		if (changedSettings) {
			showSuccess(__("{0} settings applied immediately", [changedSettings]));
		}
	});

	// Listen to general settings changes (catch-all for any setting change)
	onSettingsChanged(async ({ changes }) => {
		log.info("Event: Settings changed", changes);

		// Reload settings to ensure all computed properties are fresh
		await posSettingsStore.reloadSettings();

		// Reconfigure session lock in case security settings changed
		configureSessionLock({
			enabled: posSettingsStore.enableSessionLock,
			timeoutMinutes: posSettingsStore.sessionLockTimeout,
		});
	});

	// QZ Tray lifecycle — lazy connect when silent print is enabled
	watch(
		() => posSettingsStore.silentPrint,
		async (enabled) => {
			if (enabled) {
				await qzConnect();
			} else {
				await qzDisconnect();
			}
		},
		{ immediate: true }
	);

	// Store cleanup function for unmount
	onUnmounted(() => {
		cleanup();
		stopActivityTracking();
		qzDisconnect();
	});

	try {
		// Start timers for current time and shift duration
		shiftStore.startTimers();

		// Skip heavy initialization if already completed for this profile+shift
		// (e.g., remount from translationVersion change). Pinia stores are
		// singletons — their state survives component remounts.
		// We include the shift name in the key so that a different user's shift
		// (even on the same POS Profile) correctly triggers re-initialization.
		const currentInitKey = `${shiftStore.profileName}::${shiftStore.currentShift?.name}`;
		if (_initializedKey && _initializedKey === currentInitKey) {
			log.debug("Skipping init — already initialized (remount)");
			startActivityTracking();
			updateLayoutBounds();
			return;
		}

		// If another mount is already running init, wait for it instead of duplicating
		if (_posInitPromise) {
			log.debug("Init already in progress, waiting...");
			try {
				await _posInitPromise;
			} catch {
				// Original caller handles errors; this mount just waits
			}
			if (_initializedKey) startActivityTracking();
			updateLayoutBounds();
			return;
		}

		_posInitPromise = initPOS();
		await _posInitPromise;
		_posInitPromise = null;

		// Start session lock tracking only after POS is fully ready
		if (_initializedKey) startActivityTracking();

		updateLayoutBounds();
	} catch (error) {
		_posInitPromise = null;
		log.error("Error checking shift:", error);
	} finally {
		uiStore.setLoading(false);
	}

	async function initPOS() {
		const hasShift = await shiftStore.checkShift();

		if (!hasShift) {
			uiStore.showOpenShiftDialog = true;
			return;
		}

		if (!shiftStore.currentProfile) return;

		//// Neoffice — setters instead of `cartStore.posProfile = ...`. The production Vite build
		//// turns a direct write to a store-destructured binding into "Assignment to constant
		//// variable" at runtime — invisible in dev (b44f194b, 2026-03-21).
		cartStore.setPosProfile(shiftStore.profileName);
		cartStore.setPosOpeningShift(shiftStore.currentShift?.name);

		// Set warehouse context early (synchronous, no API call)
		if (shiftStore.profileWarehouse) {
			stockStore.setWarehouse(shiftStore.profileWarehouse);
		}

		// Fire independent operations in parallel while settings load.
		// Settings must complete before tax rules, but the rest are independent.
		const settingsPromise = posSettingsStore.loadSettings(shiftStore.profileName);

		const backgroundOps = Promise.allSettled([
			cartStore.setDefaultCustomer(),
			offlineStore.isOffline
				? offlineStore.checkOfflineCacheAvailability()
				: offlineStore.preloadDataForOffline(shiftStore.currentProfile),
			draftsStore.updateDraftsCount(),
		]);

		// Wait for settings (required for tax rules) + all background ops
		const [settingsResult] = await Promise.allSettled([settingsPromise, backgroundOps]);

		if (settingsResult.status === "rejected") {
			log.error("Failed to load POS settings:", settingsResult.reason);
			return;
		}

		log.info("POS Settings loaded:", {
			allowPartialPayment: posSettingsStore.allowPartialPayment,
		});

		// Configure session lock from settings
		configureSessionLock({
			enabled: posSettingsStore.enableSessionLock,
			timeoutMinutes: posSettingsStore.sessionLockTimeout,
		});

		// Load tax rules (depends on settings being loaded)
		await cartStore.loadTaxRules(shiftStore.profileName, posSettingsStore.settings);

		//// Neoffice — start mirroring to the second screen for this shift, and register the
		//// callback for a customer the CUSTOMER created on it: the new record is pushed into the
		//// cashier's search cache so it can be picked immediately instead of only after a
		//// refresh (185c3c50 2026-02-03; 912ef092 + f3cccb1b 2026-02-04).
		// Enable customer display sync
		if (shiftStore.currentShift?.name) {
			enableDisplaySync(
				shiftStore.currentShift.name,
				shiftStore.currentProfile?.currency || "EUR"
			);

			// Register callback for customer created from display
			onCustomerCreated(async (customerData) => {
				log.info("Customer created from display notification", customerData);
				// Add customer to search cache so they appear in search results
				await customerSearchStore.addCustomerToCache({
					name: customerData.name,
					customer_name: customerData.customer_name,
					mobile_no: customerData.mobile_no || "",
					email_id: customerData.email || "",
				});
				uiStore.showCustomerCreatedNotification(customerData);
			});
		}

		_initializedKey = `${shiftStore.profileName}::${shiftStore.currentShift?.name}`;
	}
});

watch(
	() => shiftStore.hasOpenShift,
	(value) => {
		if (value && typeof window !== "undefined") {
			updateLayoutBounds();
			return;
		}

		uiStore.showDraftDialog = false;
		uiStore.showHistoryDialog = false;
		uiStore.showReturnDialog = false;
	}
);

// Watch for cart changes to re-apply offers
// Comprehensive watcher that detects all cart changes including:
// - Items added/removed (length changes)
// - Quantity changes
// - Rate/price changes
// - Discount changes
// - Item properties that affect offers
watch(
	() => computeCartHash(),
	(newHash) => {
		// Only proceed if there are applied offers
		if (cartStore.appliedOffers.length === 0) {
			return;
		}

		// Skip if cart content hasn't actually changed
		if (newHash === previousCartHash) {
			return;
		}

		previousCartHash = newHash;

		// Clear existing timer to prevent multiple API calls
		if (offerReapplyTimer.value) {
			clearTimeout(offerReapplyTimer.value);
		}

		// Set new timer - reapply offers after 500ms of no changes
		offerReapplyTimer.value = setTimeout(async () => {
			await cartStore.reapplyOffer(shiftStore.currentProfile);
		}, 500);
	}
);

// Watch for customer changes - customer affects which offers are applicable
watch(
	() => cartStore.customer,
	(newCustomer, oldCustomer) => {
		const newCustomerName = newCustomer?.name || newCustomer;
		const oldCustomerName = oldCustomer?.name || oldCustomer;

		// Only reapply if customer actually changed
		if (newCustomerName !== oldCustomerName) {
			// Clear existing timer
			if (offerReapplyTimer.value) {
				clearTimeout(offerReapplyTimer.value);
			}

			// Reapply offers immediately when customer changes
			// This will discover newly eligible offers even if cart has no current offers
			offerReapplyTimer.value = setTimeout(async () => {
				await cartStore.reapplyOffer(shiftStore.currentProfile);
			}, 300);
		}
	},
	{ deep: true }
);

// Watch for applied offers changes - handle when offers are added/removed
watch(
	() => cartStore.appliedOffers.length,
	() => {
		// When offers are added or removed, update the cart hash to reflect new state
		if (cartStore.invoiceItems.length > 0) {
			previousCartHash = computeCartHash();
		}
	}
);

// ============================================================================
// PERIODIC STOCK SYNC - Setup when items are loaded
// ============================================================================

// Track if periodic sync has been initialized
let periodicSyncConfigured = false;
let lastSyncWarehouse = null;
let lastSyncItemSignature = "";

// Watch for items to be loaded or changed, then configure periodic stock sync
watch(
	() => {
		const items = itemStore.allItems;
		const warehouse = shiftStore.profileWarehouse;
		const count = items.length;

		// Create signature from item codes to detect catalog changes even with same count
		const signature =
			count > 0
				? `${items[0]?.item_code || ""}-${items[Math.floor(count / 2)]?.item_code || ""}-${
						items[count - 1]?.item_code || ""
				  }`
				: "";

		return { count, warehouse, signature };
	},
	async ({ count, warehouse, signature }, oldValue) => {
		// Only proceed if we have a warehouse and items are loaded
		if (!warehouse || count === 0) return;

		const warehouseChanged = warehouse !== lastSyncWarehouse;
		const itemsChanged = signature !== lastSyncItemSignature;

		// Initial configuration when items first load
		if (!periodicSyncConfigured && count > 0) {
			log.info(`Items loaded (${count}), configuring periodic stock sync`);
			await setupPeriodicStockSync(warehouse);
			periodicSyncConfigured = true;
			lastSyncWarehouse = warehouse;
			lastSyncItemSignature = signature;
		}
		// Update configuration when warehouse changes or items change (including replacements)
		else if (periodicSyncConfigured && (warehouseChanged || itemsChanged)) {
			if (warehouseChanged) {
				log.info(
					`Warehouse changed (${lastSyncWarehouse} → ${warehouse}), updating periodic stock sync`
				);
			} else {
				log.info(
					`Items changed (catalog replacement or new items), updating periodic stock sync`
				);
			}
			await updatePeriodicStockSyncItems(warehouse);
			lastSyncWarehouse = warehouse;
			lastSyncItemSignature = signature;
		}
	}
);

onUnmounted(() => {
	window.removeEventListener("resize", () => {
		uiStore.setWindowWidth(window.innerWidth);
		updateLayoutBounds();
	});
	stopResize();

	// Stop periodic stock sync on unmount
	offlineWorker.stopStockSync().catch(() => {});
});

// ============================================================================
// PERIODIC STOCK SYNC
// ============================================================================

/**
 * Setup and start periodic stock sync from worker (called when items first load)
 */
async function setupPeriodicStockSync(warehouse) {
	try {
		// Check if user has enabled stock sync in settings
		let syncEnabled = false;
		let syncIntervalMs = 60000; // Default 60 seconds

		try {
			const savedSettings = localStorage.getItem("pos_stock_sync_settings");
			if (savedSettings) {
				const parsed = JSON.parse(savedSettings);
				syncEnabled = parsed.enabled ?? false;
				syncIntervalMs = (parsed.intervalSeconds ?? 60) * 1000;
			}
		} catch (error) {
			log.error("Failed to load stock sync settings:", error);
		}

		// Get all currently loaded item codes from the item store
		const itemCodes = itemStore.allItems.map((item) => item.item_code);

		// Configure stock sync with warehouse and items
		const config = await offlineWorker.configureStockSync({
			warehouse,
			itemCodes,
			intervalMs: syncIntervalMs,
		});

		log.info("Periodic stock sync configured:", config);

		// Only start sync if user has enabled it
		if (syncEnabled) {
			const result = await offlineWorker.startStockSync();
			log.success("Periodic stock sync started:", result.status);
			isStockSyncActive.value = true;
		} else {
			log.info("Stock sync is disabled in settings (not starting)");
			isStockSyncActive.value = false;
		}

		// Listen for stock sync completion events (regardless of enabled state)
		window.addEventListener("stockSyncComplete", handleStockSyncComplete);
		window.addEventListener("stockSyncError", handleStockSyncError);

		// Poll stock sync status every 10 seconds to update the indicator
		const statusPollInterval = setInterval(async () => {
			try {
				const status = await offlineWorker.getStockSyncStatus();
				isStockSyncActive.value = status.enabled;
			} catch (error) {
				// Ignore errors
			}
		}, 10000);

		// Cleanup on unmount
		onUnmounted(() => {
			clearInterval(statusPollInterval);
		});
	} catch (error) {
		log.error("Failed to setup periodic stock sync:", error);
	}
}

/**
 * Handle stock sync completion from worker
 */
async function handleStockSyncComplete(event) {
	const { updated, total, duration } = event.detail;

	log.success(`Background stock sync: ${updated}/${total} items updated in ${duration}ms`);

	// The worker has already updated IndexedDB
	// Now we need to refresh the Pinia stock store from IndexedDB or server
	if (updated > 0) {
		// Trigger a refresh of displayed stock
		// Note: refresh() now preserves reservations internally
		try {
			await stockStore.refresh(null, shiftStore.profileWarehouse);
		} catch (err) {
			log.error("Failed to refresh stock after background sync:", err);
		}

		// Refresh cache stats to update the "Last Sync" timestamp in the tooltip
		try {
			const stats = await offlineWorker.getCacheStats();
			itemStore.cacheStats = stats;
		} catch (error) {
			log.error("Failed to refresh cache stats:", error);
		}
	}
}

/**
 * Handle stock sync errors from worker
 */
function handleStockSyncError(event) {
	const { message } = event.detail;
	log.warn("Background stock sync error:", message);
}

/**
 * Update periodic stock sync with newly loaded items
 * Called when more items are loaded dynamically (pagination, background cache)
 */
async function updatePeriodicStockSyncItems(warehouse) {
	try {
		// Get all currently loaded item codes
		const itemCodes = itemStore.allItems.map((item) => item.item_code);

		// Reconfigure worker with updated item list
		await offlineWorker.configureStockSync({
			warehouse,
			itemCodes,
			// Keep existing interval setting
		});

		log.info(`Updated periodic stock sync with ${itemCodes.length} items`);
	} catch (error) {
		log.error("Failed to update periodic stock sync items:", error);
	}
}

// Cleanup event listeners on unmount
onUnmounted(() => {
	window.removeEventListener("stockSyncComplete", handleStockSyncComplete);
	window.removeEventListener("stockSyncError", handleStockSyncError);
});

// Handlers
async function handleShiftOpened() {
	uiStore.showOpenShiftDialog = false;
	if (!shiftStore.currentProfile) return;

	//// Neoffice — setters again, same production-build hazard as above (b44f194b,
	//// 2026-03-21 "use setter functions for posProfile/posOpeningShift").
	cartStore.setPosProfile(shiftStore.profileName);
	cartStore.setPosOpeningShift(shiftStore.currentShift?.name);

	// Set warehouse context early (synchronous, no API call)
	if (shiftStore.profileWarehouse) {
		stockStore.setWarehouse(shiftStore.profileWarehouse);
	}

	// Mirror initPOS: fire independent operations in parallel while settings load
	const settingsPromise = posSettingsStore.loadSettings(shiftStore.profileName);

	const backgroundOps = Promise.allSettled([
		cartStore.setDefaultCustomer(),
		offlineStore.isOffline
			? offlineStore.checkOfflineCacheAvailability()
			: offlineStore.preloadDataForOffline(shiftStore.currentProfile),
		draftsStore.updateDraftsCount(),
	]);

	// Wait for settings (required for tax rules) + all background ops
	const [settingsResult] = await Promise.allSettled([settingsPromise, backgroundOps]);

	if (settingsResult.status === "rejected") {
		log.error("Failed to load POS settings:", settingsResult.reason);
		return;
	}

	// Configure session lock from settings
	configureSessionLock({
		enabled: posSettingsStore.enableSessionLock,
		timeoutMinutes: posSettingsStore.sessionLockTimeout,
	});

	// Load tax rules (depends on settings being loaded)
	await cartStore.loadTaxRules(shiftStore.profileName, posSettingsStore.settings);

	//// Neoffice — the second screen must also come up when a shift is opened from here, not
	//// only on page init (185c3c50, 2026-02-03 "use dynamic customer group and territory
	//// lookup for customer display"); blame also names the merge 7604810e, which re-resolved
	//// this block.
	// Enable customer display sync when new shift opens
	if (shiftStore.currentShift?.name) {
		enableDisplaySync(
			shiftStore.currentShift.name,
			shiftStore.currentProfile?.currency || "EUR"
		);
	}

	_initializedKey = `${shiftStore.profileName}::${shiftStore.currentShift?.name}`;

	// Start session lock tracking now that a shift is open and POS is ready
	startActivityTracking();
	showSuccess(__("You can now start making sales"));
}

async function handleShiftClosed() {
	uiStore.showCloseShiftDialog = false;
	showSuccess(__("Shift closed successfully"));

	//// Neoffice — and it must stop when the shift closes: otherwise the customer display
	//// keeps showing the last cart of a closed shift (185c3c50, 2026-02-03).
	// Disable customer display sync when shift closes
	disableDisplaySync();

	// Check if logout should happen after closing shift
	if (logoutAfterClose.value) {
		logoutAfterClose.value = false;
		_initializedKey = null;
		await cleanupUserSession();
		session.logout.submit();
	} else {
		setTimeout(() => {
			uiStore.showOpenShiftDialog = true;
		}, 500);
	}
}

//// Neoffice — ▼▼▼ ~280 lines of restaurant handlers, none of them upstream. Selecting,
//// releasing and cleaning a table (87f168fe 2026-03-20; 2aad6b2a 2026-03-30 makes Paid a
//// state distinct from Cleaning; 07d0d493 2026-03-29 expires the guest tokens with it),
//// the payment summary shown on a table guests paid themselves (34751a29 + 6bfa3117,
//// 2026-03-30), loading the SERVER draft when returning to an occupied table rather than
//// a local one (c8f9a36c + 8098e70a, 2026-03-21; c89fb981 2026-03-24 keeps local-draft
//// deletion out of restaurant mode), send-to-kitchen with a double-click guard
//// (b26150cc 2026-03-21; a1a74052 2026-03-22), modifiers priced into the grand total
//// (87b37ffd 2026-03-23) and free-text instructions kept apart from the modifier choices
//// (135bad1d 2026-03-23), takeaway tickets (80c90631 2026-03-26), the QR flow and the
//// receipt with VAT (c5208ba7 + f3affeaa 2026-03-28; 25ef6b34 2026-03-29). $patch is
//// used throughout because direct store writes break the production build (dd33c2f6,
//// 2026-03-21).
// Restaurant mode handlers
function handleTableSelected(table) {
	// Table selected, cart already configured by TableSelector
}

const cleaningTable = ref(null)
const showCleaningDialog = ref(false)
const tablePaymentSummary = ref(null)
const loadingPaymentSummary = ref(false)

function formatCleaningPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: shiftStore.currency || "CHF",
		minimumFractionDigits: 2,
	}).format(amount || 0)
}

async function handleCleaningTableClicked(table) {
	cleaningTable.value = table
	tablePaymentSummary.value = null
	showCleaningDialog.value = true
	// Load payment details
	loadingPaymentSummary.value = true
	try {
		const result = await call("pos_next.api.restaurant.get_table_payment_summary", {
			table_name: table.name,
		})
		tablePaymentSummary.value = result
	} catch { /* ignore */ }
	loadingPaymentSummary.value = false
}

async function confirmTableCleaning() {
	if (!cleaningTable.value) return
	try {
		await call("pos_next.api.restaurant.update_table_status", {
			table_name: cleaningTable.value.name,
			status: "Cleaning",
		})
		activeQRTokens.value.delete(cleaningTable.value.name)
		showCleaningDialog.value = false
		showSuccess(__("Table marked for cleaning"))
		cleaningTable.value = null
	} catch (e) {
		showError(e.message || __("Failed to update table status"))
	}
}

async function markTableAvailable() {
	if (!cleaningTable.value) return
	try {
		await call("pos_next.api.restaurant.mark_table_available", {
			table_name: cleaningTable.value.name,
		})
		activeQRTokens.value.delete(cleaningTable.value.name)
		showCleaningDialog.value = false
		cleaningTable.value = null
	} catch (e) {
		showError(e.message || __("Failed to update table status"))
	}
}

async function handleQRButtonClick() {
	const table = cartStore.restaurantTable
	if (!table) return

	const tableName = table.name || table.table_name
	// If we already have a token for this table, show QR directly
	if (activeQRTokens.value.has(tableName)) {
		const qr = activeQRTokens.value.get(tableName)
		currentQR.value = { token: qr.token, url: qr.url, tableName: table.table_name || tableName }
		showQRDialog.value = true
		return
	}

	// Show confirmation dialog
	currentQR.value = { token: "", url: "", tableName: table.table_name || tableName }
	showQRConfirmDialog.value = true
}

async function confirmQRGeneration() {
	showQRConfirmDialog.value = false
	const table = cartStore.restaurantTable
	if (!table) return
	const tableName = table.name || table.table_name

	try {
		const result = await call("pos_next.api.guest_ordering.create_table_token", {
			table: tableName,
			pos_profile: settingsStore.settings.pos_profile || settingsStore.posProfile,
		})
		if (result?.token) {
			const siteUrl = window.location.origin
			const url = result.url || `${siteUrl}/pos/guest/${result.token}`
			activeQRTokens.value.set(tableName, { token: result.token, url })
			currentQR.value = { token: result.token, url, tableName: table.table_name || tableName }
			showQRDialog.value = true
		}
	} catch (err) {
		showError(__("Failed to generate QR code: {0}", [err.message || err]))
	}
}

async function handleStartTakeaway() {
	await cartStore.clearCart()
	try {
		const number = await call("pos_next.api.restaurant.get_next_takeaway_number")
		cartStore.$patch({
			isTakeaway: true,
			takeawayNumber: number,
		})
	} catch (err) {
		cartStore.$patch({
			isTakeaway: true,
			takeawayNumber: "T-???",
		})
	}
}

function handleLoadTableDraft(draft) {
	// Set the restaurant table so the UI switches from floor plan to items view
	const table = restaurantStore.tables.find(t => t.name === draft.restaurant_table)
	if (table) {
		cartStore.setRestaurantTable(table)
	}

	// Restore cart items from the draft
	if (draft.items && draft.items.length > 0) {
		for (const item of draft.items) {
			cartStore.addItem(item, item.quantity || item.qty || 1)
		}
	}

	// Restore customer
	if (draft.customer) {
		cartStore.setCustomer(draft.customer)
	}

	// Restore draft ID for future updates
	if (draft.draft_id) {
		cartStore.$patch({ currentDraftId: draft.draft_id })
	}

	// Restore KDS status
	if (draft.kds_status) {
		cartStore.setKdsStatus(draft.kds_status)
	}

	// Mark as no unsent changes since we just loaded
	cartStore.markChangesSent()

	showSuccess(__("Draft invoice loaded successfully"))
}

function handleLoadServerDraft(order) {
	// Restore cart items from server draft
	if (order.items && order.items.length > 0) {
		for (const item of order.items) {
			// Calculate modifier price adjustment from saved JSON
			let modifierPriceAdjustment = 0
			if (item.posa_item_modifiers) {
				try {
					const mods = JSON.parse(item.posa_item_modifiers)
					for (const mod of mods) {
						for (const opt of (mod.options || [])) {
							modifierPriceAdjustment += (opt.price_adjustment || opt.price || 0)
						}
					}
				} catch { /* ignore parse errors */ }
			}
			cartStore.addItem({
				item_code: item.item_code,
				item_name: item.item_name,
				rate: item.rate,
				uom: item.uom,
				preparation_station: item.preparation_station,
				posa_special_instructions: item.posa_special_instructions,
				posa_item_modifiers: item.posa_item_modifiers,
				_modifiers_applied: modifierPriceAdjustment || 0,
			}, item.qty || 1)
		}
	}

	// Restore customer
	if (order.customer) {
		cartStore.setCustomer(order.customer)
	}

	// Store the server draft ID for future updates
	cartStore.$patch({ currentDraftId: order.name })

	// Restore KDS status
	if (order.kds_status) {
		cartStore.setKdsStatus(order.kds_status)
	}

	// Mark as no unsent changes since we just loaded from server
	cartStore.markChangesSent()
}

function closeTable() {
	cartStore.clearCart();
}

async function handleItemsSentToKitchen() {
	// Items already have their kds_status updated by the SendToKitchenDialog
	// Derive order-level status from item statuses
	const activeStatuses = cartStore.invoiceItems
		.map(i => i.kds_status)
		.filter(s => s && s !== "Waiting")
	if (activeStatuses.length > 0) {
		cartStore.setKdsStatus(activeStatuses[0])
	}
	await handleSendToKitchen()
}

async function handleSendSingleItem(item) {
	// Quick-send a single Waiting item to the kitchen
	//// Neoffice — was a lookup by item_code + UOM, which addressed the FIRST line carrying
	//// them. The row arrives here straight out of the cart list (useCartSort.sortedItems only
	//// copies the ARRAY, the rows are the store's own objects), and in restaurant mode the
	//// same dish ordered twice is deliberately two lines, so the code lookup marked the wrong
	//// course as sent and left the one the waiter clicked Waiting. Address the row by
	//// identity, exactly as removeItem() has done since 7e1376a3. The code+UOM lookup stays
	//// as a fallback for a caller handing over a detached copy, and takes the LAST match
	//// there because that is the most recently added line.
	const cartItem = cartStore.invoiceItems.includes(item)
		? item
		: cartStore.invoiceItems.findLast(
				ci => ci.item_code === item.item_code && (ci.uom || "") === (item.uom || "")
			)
	if (cartItem) {
		cartItem.kds_status = "Pending"
		const activeStatuses = cartStore.invoiceItems
			.map(i => i.kds_status)
			.filter(s => s && s !== "Waiting")
		if (activeStatuses.length > 0) {
			cartStore.setKdsStatus(activeStatuses[0])
		}
		await handleSendToKitchen()
	}
}

let isSendingToKitchen = false
const isProcessingPayment = ref(false)
async function handleSendToKitchen() {
	if (cartStore.invoiceItems.length === 0) return
	if (isSendingToKitchen) return
	isSendingToKitchen = true

	try {
		// Build invoice data for server-side draft creation
		const currentProfile = shiftStore.currentProfile
		const invoiceData = cartStore.buildOfferEvaluationPayload(currentProfile)
		invoiceData.kds_status = "Pending"
		invoiceData.is_pos = 1
		invoiceData.docstatus = 0
		invoiceData.posa_pos_opening_shift = cartStore.posOpeningShift

		// If we already have a server draft, include its name for update
		if (cartStore.currentDraftId) {
			invoiceData.name = cartStore.currentDraftId
		}

		// Create/update server-side draft invoice via API
		const result = await call("pos_next.api.invoices.update_invoice", {
			data: JSON.stringify(invoiceData)
		})

		if (result?.name) {
			// Store the server draft ID for future updates
			cartStore.$patch({ currentDraftId: result.name })
		}

		// Mark changes as sent
		cartStore.markChangesSent()
		cartStore.setKdsStatus("Pending")

		showSuccess(__("Order validated"))

		// Return to floor plan and refresh table data for badges
		cartStore.clearCart()
		restaurantStore.fetchFromNetwork()
	} catch (error) {
		console.error("Failed to send to kitchen:", error)
		showError(__("Failed to send order to kitchen"))
	} finally {
		isSendingToKitchen = false
	}
}

//// Neoffice — ▲▲▲ end of the restaurant handlers region opened above.
function handleItemSelected(item, autoAdd = false) {
	// Auto-add mode
	if (autoAdd) {
		try {
			//// Neoffice — a dish has to reach a preparation station (bar, kitchen) or it never
			//// appears on any KDS screen. The station is resolved from the Preparation Station child
			//// table by item, then by item group, at the moment the line enters the cart — we
			//// deliberately do NOT store it as a custom field on Item (831857f2, 2026-03-21 "move
			//// station-item relation into Preparation Station child table"; 34ee11a8, 2026-03-25).
			// Assign preparation station from restaurant store map
			if (restaurantStore.isEnabled && !item.preparation_station) {
				const stationInfo = restaurantStore.getStationForItem(item.item_code, item.item_group)
				if (stationInfo) {
					item.preparation_station = stationInfo.station
				}
			}

			// Check if item has resolved barcode data (weighted/priced)
			if (item.resolved_qty && item.resolved_barcode_type) {
				// Get the unit price for the resolved UOM from uom_prices, or fall back to item rate
				const resolvedUom = item.resolved_uom || item.uom;
				const unitRate = item.uom_prices?.[resolvedUom] || item.rate;

				const resolvedItem = {
					...item,
					uom: resolvedUom,
					rate: unitRate,
					price_list_rate: unitRate,
					is_resolved_barcode: true, // Mark as readonly
				};
				cartStore.addItem(resolvedItem, item.resolved_qty, true, shiftStore.currentProfile);
			} else {
				cartStore.addItem(item, 1, true, shiftStore.currentProfile);
			}
		} catch (error) {
			uiStore.showError(
				__("Insufficient Stock"),
				error.message,
				__("Item: {0}", [item.item_code])
			);
		}
		return;
	}

	// Early out-of-stock guard — prevent opening dialogs for zero-stock items
	// Full qty validation happens in cartStore.addItem()
	if (!item.has_variants && settingsStore.shouldEnforceStockValidation() && shouldValidateItemStock(item)) {
		const actualQty = item.actual_qty ?? item.stock_qty ?? 0;
		if (actualQty <= 0) {
			uiStore.showError(
				__("Insufficient Stock"),
				__('"{0}" is out of stock in warehouse "{1}".', [
					item.item_name,
					item.warehouse || shiftStore.profileWarehouse,
				]),
				__("Item: {0}", [item.item_code])
			);
			return;
		}
	}

	//// Neoffice — same station assignment on the manual (non auto-add) path; both entries
	//// into the cart must set it or half the order is invisible to the kitchen (831857f2,
	//// 2026-03-21; 34ee11a8, 2026-03-25).
	// Assign preparation station from restaurant store map
	if (restaurantStore.isEnabled && !item.preparation_station) {
		const stationInfo = restaurantStore.getStationForItem(item.item_code, item.item_group)
		if (stationInfo) {
			item.preparation_station = stationInfo.station
		}
	}

	// Check for variants
	if (item.has_variants) {
		cartStore.setPendingItem(item, 1, "variant");
		uiStore.showItemSelectionDialog = true;
		return;
	}

	// Check for UOMs
	if (item.item_uoms && item.item_uoms.length > 0) {
		cartStore.setPendingItem(item, 1, "uom");
		uiStore.showItemSelectionDialog = true;
		return;
	}

	// Check for batch/serial
	if (item.has_batch_no || item.has_serial_no) {
		cartStore.setPendingItem(item, 1);
		uiStore.showBatchSerialDialog = true;
		return;
	}

	//// Neoffice — upstream refuses a zero rate. We sell items whose price is decided at the
	//// till (gift cards, open-price dishes), so a zero rate opens a numpad instead of an
	//// error — and in restaurant mode the modifiers come FIRST, because choosing them may
	//// set the price and make the numpad unnecessary (5dddc528 2026-01-14 "auto-open edit
	//// dialog for zero-price items"; 1ff2fba2 2026-03-27 the dedicated numpad; f23daabe).
	// Check for zero-price items (e.g., gift cards that need custom value)
	const itemRate = item.price_list_rate || item.rate || 0;
	if (itemRate === 0) {
		// Restaurant mode with modifiers: show options first, price entry after if still 0
		if (restaurantStore.isEnabled) {
			const modGroups = restaurantStore.getModifiersForItem(item.item_code, item.item_group);
			if (modGroups.length > 0) {
				// Add item at price 0, then open modifiers dialog
				try {
					cartStore.addItem(item, 1, false, shiftStore.currentProfile);
				} catch (error) {
					uiStore.showError(
						__("Insufficient Stock"),
						error.message,
						__("Item: {0}", [item.item_code])
					);
					return;
				}
				nextTick(() => {
					//// Neoffice — findLast, not find: the line to configure is the one addItem() just
					//// appended. With find() the modifiers dialog opened on the FIRST line carrying
					//// that item_code, so a second identical dish got its options written onto the
					//// first one. Same rule as 7e1376a3, which only reached two of the eight call
					//// sites that resolve a cart line by item code.
					const cartItem = cartStore.invoiceItems.findLast(i => i.item_code === item.item_code);
					if (cartItem && itemModifiersRef.value) {
						itemModifiersRef.value.open(cartItem);
					}
				});
				return;
			}
		}
		// No modifiers or not restaurant: show price entry dialog directly
		if (priceEntryRef.value) {
			priceEntryRef.value.open(item);
		}
		return;
	}

	// Add to cart
	try {
		cartStore.addItem(item, 1, false, shiftStore.currentProfile);
	} catch (error) {
		uiStore.showError(
			__("Insufficient Stock"),
			error.message,
			__("Item: {0}", [item.item_code])
		);
	}

	//// Neoffice — a dish with modifier groups must be configured before it means anything on
	//// a kitchen ticket, so the dialog opens by itself. It opens for ANY group, not only a
	//// required one: an optional cooking temperature was being skipped silently (4df0caf1
	//// 2026-03-21; eabe35e7 + 5982e48e, 2026-03-25 "auto-open modifiers dialog for any
	//// modifier group, not just required").
	// Auto-open modifiers dialog if item has required modifier groups
	if (restaurantStore.isEnabled) {
		const modGroups = restaurantStore.getModifiersForItem(item.item_code, item.item_group)
		if (modGroups.length > 0) {
			nextTick(() => {
				// Find the item in cart and open modifiers
				//// Neoffice — findLast, not find: the line to configure is the one addItem() just
				//// appended, not the first line that happens to share the item_code (7e1376a3).
				const cartItem = cartStore.invoiceItems.findLast(i => i.item_code === item.item_code)
				if (cartItem && itemModifiersRef.value) {
					itemModifiersRef.value.open(cartItem)
				}
			})
		}
	}
}

async function handleEditItem(updatedItem) {
	await cartStore.updateItemDetails(updatedItem.item_code, updatedItem);
}

//// Neoffice — the numpad's answer. Two paths on purpose: in restaurant mode the line is
//// already in the cart (modifiers were shown first), so its rate is updated in place;
//// otherwise the item is added with the entered price. is_rate_manually_edited stops a
//// pricing rule from overwriting what the cashier typed (1ff2fba2 + f23daabe,
//// 2026-03-27).
function handlePriceConfirmed({ item, price }) {
	// Check if item is already in cart (restaurant flow: modifiers were shown first)
	//// Neoffice — findLast, not find. In the restaurant flow the line waiting for its price is
	//// the one just appended at rate 0; find() wrote the amount the cashier typed onto the
	//// FIRST line with that item_code instead — a second gift card at 100 rewrote the first
	//// one, which was already priced at 30, and the till was short. Same rule as 7e1376a3.
	const existingCartItem = cartStore.invoiceItems.findLast(i => i.item_code === item.item_code);
	if (existingCartItem) {
		// Update existing cart item's rate
		existingCartItem.rate = price;
		existingCartItem.price_list_rate = price;
		existingCartItem.is_rate_manually_edited = 1;
		cartStore.recalculateItem(existingCartItem);
		cartStore.rebuildIncrementalCache();
		return;
	}

	// New item: add to cart with entered price
	const pricedItem = {
		...item,
		rate: price,
		price_list_rate: price,
		is_rate_manually_edited: 1,
		original_rate: 0,
	};
	try {
		cartStore.addItem(pricedItem, 1, false, shiftStore.currentProfile);
	} catch (error) {
		uiStore.showError(
			__("Insufficient Stock"),
			error.message,
			__("Item: {0}", [item.item_code])
		);
	}
}

function handleModifiersSaved(cartItem) {
	// After modifiers are saved, if the item's rate is still 0, open price entry
	if (cartItem && (cartItem.rate || 0) === 0 && priceEntryRef.value) {
		nextTick(() => {
			priceEntryRef.value.open(cartItem);
		});
	}
}

function handleAdditionalDiscountUpdate(discountAmount) {
	// Update the additional discount value in the cart store
	//// Neoffice — $patch instead of a direct store write: the production build turns the
	//// direct form into "Assignment to constant variable" (dd33c2f6, 2026-03-21).
	cartStore.$patch({ additionalDiscount: discountAmount });

	// Rebuild the cache to recalculate totals
	cartStore.rebuildIncrementalCache();
}

//// Neoffice — open the modifiers dialog on demand from the cart (4df0caf1, 2026-03-21),
//// and turn a chosen menu into one cart line per course, tagged with the menu and course
//// name so the kitchen ticket reads correctly (9f4e85df, 2026-03-21 "Phase 4B -
//// restaurant menus with course selection dialog").
function handleOpenModifiers(item) {
	if (itemModifiersRef.value) {
		itemModifiersRef.value.open(item)
	}
}

function handleMenuConfirmed(menuItems) {
	for (const menuItem of menuItems) {
		const fullItem = {
			item_code: menuItem.item_code,
			item_name: menuItem.item_name,
			rate: menuItem.price_override,
			is_menu_item: true,
			menu_name: menuItem.menu_name,
			posa_special_instructions: `[${menuItem.menu_name}] ${menuItem.course_name}`
		}
		cartStore.addItem(fullItem, 1)
	}
}

function handleCustomerSelected(selectedCustomer) {
	if (selectedCustomer) {
		cartStore.setCustomer(selectedCustomer);
		uiStore.showCustomerDialog = false;
		showSuccess(__("{0} selected", [selectedCustomer.customer_name]));

		if (pendingPaymentAfterCustomer.value) {
			pendingPaymentAfterCustomer.value = false;
			//// Neoffice — resuming a payment that was parked to pick a customer re-enters
			//// handleProceedToPayment instead of opening the payment dialog directly, so the Sales Order
			//// guard runs again: picking the default / walk-in customer a second time must re-prompt
			//// rather than slip through (f9e41abf, 2026-05-29 "require a specific customer for POS
			//// orders").
			//// re-run guards (incl. Sales Order customer check) before opening payment
			handleProceedToPayment();
		}
	} else {
		cartStore.setCustomer(null);
	}
}

function handleCreateCustomer(searchValue) {
	editCustomer.value = null; // Clear edit mode
	uiStore.setInitialCustomerName(searchValue || "");
	uiStore.showCreateCustomerDialog = true;
}

//// pencil opens the full meta-driven Customer edit dialog (not the small form)
function handleEditCustomer(customer) {
	editCustomer.value = customer; // Set customer for edit mode
	//// Neoffice — the pencil now opens the meta-driven EditCustomerDialog instead of reopening
	//// the quick-create form in edit mode; that small form has no tabs and shows no custom fields
	//// (82fbfd9e, 2026-07-10 "full meta-driven customer edit dialog (stays in the POS)").
	showEditCustomerDialog.value = true;
}

function handleProceedToPayment() {
	if (cartStore.isEmpty) {
		showWarning(__("Please add items to cart before proceeding to payment"));
		return;
	}

	//// Neoffice — the Sales Order guard added just below: an order is fulfilled later, for a
	//// named customer, so creating one under the POS Profile's default / walk-in customer
	//// (Passage) is meaningless — and upstream lets it through. The cashier is warned, the
	//// default customer cleared and the search dialog opened; the resume path above re-enters
	//// this function so re-picking the default re-prompts (f9e41abf, 2026-05-29 "require a
	//// specific customer for POS orders").
	const customerValue = cartStore.customer?.name || cartStore.customer;

	//// block Sales Order for the POS default/walk-in customer (e.g. Passage)
	// A Sales Order is fulfilled later for a named customer, so creating one for
	// the POS Profile's default customer makes no sense. Force the cashier to pick
	// a real customer: clear the default and open the customer search dialog.
	if (cartStore.targetDoctype === "Sales Order") {
		const defaultCustomer = shiftStore.profileCustomer;
		const isDefaultCustomer = !customerValue || customerValue === defaultCustomer;
		if (isDefaultCustomer) {
			showWarning(__("Please select a specific customer for the order"));
			cartStore.setCustomer(null);
			uiStore.showCustomerDialog = true;
			pendingPaymentAfterCustomer.value = true;
			return;
		}
	}

	if (!customerValue && !shiftStore.profileCustomer) {
		showWarning(__("Please select a customer before proceeding"));
		uiStore.showCustomerDialog = true;
		pendingPaymentAfterCustomer.value = true;
		return;
	}

	uiStore.showPaymentDialog = true;
}

async function handleDeleteFailedInvoice() {
	if (!uiStore.errorRetryActionData?.failedInvoiceId) return;

	const invoiceId = uiStore.errorRetryActionData.failedInvoiceId;
	uiStore.clearError();

	try {
		await offlineStore.deleteOfflineInvoice(invoiceId);
	} catch (error) {
		// Error is handled in the store
	}
}

async function handleErrorRetry() {
	uiStore.clearError();
	if (uiStore.errorRetryAction === "payment") {
		setTimeout(() => {
			uiStore.showPaymentDialog = true;
		}, 300);
	} else if (uiStore.errorRetryAction === "sync") {
		await offlineStore.loadPendingInvoices();
		setTimeout(() => {
			handleSyncClick();
		}, 300);
	}
}

async function handlePaymentCompleted(paymentData) {
	try {
		const customerValue = cartStore.customer?.name || cartStore.customer;
		if (!customerValue && !shiftStore.profileCustomer) {
			showWarning(__("Please select a customer before proceeding"));
			uiStore.showPaymentDialog = false;
			uiStore.showCustomerDialog = true;
			return;
		}

		//// Neoffice — $patch, same production-build hazard as above (dd33c2f6, 2026-03-21).
		cartStore.$patch({ payments: [] });
		if (paymentData.payments && Array.isArray(paymentData.payments)) {
			paymentData.payments.forEach((p) => {
				cartStore.payments.push({
					...p,
					mode_of_payment: p.mode_of_payment,
					amount: p.amount,
					type: p.type,
				});
			});
		}

		// Store sales team data if provided
		if (paymentData.sales_team && Array.isArray(paymentData.sales_team)) {
			//// Neoffice — $patch on both branches, same production-build hazard (dd33c2f6,
			//// 2026-03-21 "replace all direct cartStore property assignments with $patch").
			cartStore.$patch({ salesTeam: paymentData.sales_team });
		} else {
			//// Neoffice — $patch on the else branch too: a direct `cartStore.salesTeam = []` becomes an
			//// assignment to a const binding once the bundle is minified, so it threw at the till while
			//// dev mode worked (dd33c2f6, 2026-03-21 "replace all direct cartStore property assignments
			//// with $patch").
			cartStore.$patch({ salesTeam: [] });
		}

		// Set delivery date for Sales Orders
		if (paymentData.delivery_date) {
			cartStore.setDeliveryDate(paymentData.delivery_date);
		}

		// Set write-off amount if provided
		if (paymentData.write_off_amount && paymentData.write_off_amount > 0) {
			cartStore.setWriteOffAmount(paymentData.write_off_amount);
		}

		//// Neoffice — the tip has to travel the whole payment chain (PaymentDialog -> here ->
		//// posCart -> useInvoice -> submit_invoice) or it is collected and never posted; it
		//// lands on an Income Account, not on sales (e9d1622a + d08c57e7, 2026-03-23). Loyalty
		//// redemption is likewise handed to the cart (104959e6, 2026-03-19).
		// Set tip amount if provided
		if (paymentData.tip_amount && paymentData.tip_amount > 0) {
			cartStore.$patch({ tipAmount: paymentData.tip_amount });
		} else {
			cartStore.$patch({ tipAmount: 0 });
		}

		// Set loyalty redemption data if provided
		if (paymentData.loyalty) {
			cartStore.setLoyaltyData(paymentData.loyalty);
		}

		// Capture restaurant table before clearCart resets it
		const restaurantTableName = cartStore.restaurantTable?.name || null
		//// Neoffice — was console.log, which prints in production too and dumped the whole
		//// restaurant table object into the console of a shop-floor till on every payment.
		//// log.* is the app's own namespaced logger and is silent outside dev.
		log.debug("Payment: restaurant table", restaurantTableName, cartStore.restaurantTable)
		// Delete draft if it exists (since we're submitting/saving invoice)
		const draftIdToDelete = cartStore.currentDraftId;

		if (offlineStore.isOffline) {
			// Use the same item transformation as online flow for consistency
			// This ensures rate, discount_percentage, discount_amount, and pricing_rules
			// are all correctly formatted for ERPNext
			const preparedItems = cartStore.formatItemsForSubmission(cartStore.invoiceItems);

			const invoiceData = {
				pos_profile: cartStore.posProfile,
				posa_pos_opening_shift: cartStore.posOpeningShift,
				company: shiftStore.profileCompany,
				customer: customerValue || shiftStore.profileCustomer,
				items: preparedItems,
				payments: JSON.parse(JSON.stringify(cartStore.payments)),
				sales_team: JSON.parse(JSON.stringify(cartStore.salesTeam || [])),
				//// Neoffice — the offline invoice is built with the CHF-rounded total and carries the
				//// rounding adjustment, so an invoice synced later matches the receipt the customer
				//// already has in hand (4fdb5df4, 2026-04-04 "rounding total, tips visibility, cash
				//// quick amounts").
				grand_total: cartStore.roundedGrandTotal,
				rounding_adjustment: cartStore.roundingAdjustment,
				total_tax: cartStore.totalTax,
				total_discount: cartStore.totalDiscount,
				write_off_amount: paymentData.write_off_amount || 0,
				//// Neoffice — the offline invoice carries the EFFECTIVE header discount (transaction-rule
				//// amount, else coupon/manual) in ERPNext's discount_amount with apply_discount_on set, while
				//// posa_gift_card_amount_used keeps the coupon/manual part alone so a rule discount never
				//// inflates the gift-card balance consumed; posa_coupon_code is upper-cased to match the
				//// native Coupon Code we migrated to (b657e65f, 2026-01-30; 56877dce, 2026-01-14; 44ea4e9a,
				//// 2026-07-09 "apply transaction-level rule discount in the cart").
				//// use the effective header discount (rule/coupon/manual) — feature b
				// Document-level discount: transaction-rule discount OR coupon/manual
				// (effectiveHeaderDiscount merges them). Gift-card field stays the
				// coupon/manual amount so a rule discount never inflates it.
				discount_amount: cartStore.effectiveHeaderDiscount || 0,
				apply_discount_on: cartStore.effectiveHeaderDiscount > 0 ? "Grand Total" : null,
				coupon_code: cartStore.couponCode || null,
				posa_coupon_code: cartStore.couponCode ? cartStore.couponCode.toUpperCase() : null,
				posa_gift_card_amount_used: cartStore.additionalDiscount || 0,
				is_pos: 1,
				update_stock: 1,
				change_amount: paymentData.change_amount || 0,
				edited_from: editingOfflineContext?.originalOfflineId || null,
			};

			// Save to the offline queue first so we can use the worker's
			// canonical pos_offline_<uuid> id as the cache key — keeping
			// IndexedDB and sessionStorage aligned on a single identifier.
			const saveResult = await offlineStore.saveInvoiceOffline(invoiceData);
			const offlineReceiptName =
				saveResult?.offline_id || invoiceData.offline_id || `pos_offline_${Date.now()}`;

			// If this checkout was an edit of a previously-queued invoice, mark
			// the original row as superseded (keeps audit trail, excludes from sync).
			if (editingOfflineContext?.originalQueueId) {
				try {
					await offlineWorker.supersedeOfflineInvoice(
						editingOfflineContext.originalQueueId,
						offlineReceiptName,
					);
				} catch (err) {
					log.error("Failed to supersede original offline invoice:", err);
				}
				editingOfflineContext = null;
			}

			const paidAmount = paymentData.paid_amount ?? cartStore.grandTotal ?? 0;
			const grandTotal = cartStore.grandTotal || 0;
			const customerLabel =
				cartStore.customer?.customer_name ||
				cartStore.customer?.name ||
				customerValue ||
				shiftStore.profileCustomer;

			const offlinePrintDoc = {
				name: offlineReceiptName,
				doctype: "Sales Invoice",
				is_offline: true,
				pos_profile: cartStore.posProfile,
				posting_date: new Date().toISOString().slice(0, 10),
				company: shiftStore.profileCompany || undefined,
				customer_name: customerLabel,
				items: preparedItems.map((item) => ({
					...item,
					quantity: item.qty ?? item.quantity,
				})),
				grand_total: grandTotal,
				total_taxes_and_charges: cartStore.totalTax,
				payments: invoiceData.payments,
				paid_amount: paidAmount,
				change_amount: paymentData.change_amount || 0,
				outstanding_amount: Math.max(0, grandTotal - paidAmount),
				status: Math.max(0, grandTotal - paidAmount) < 0.01 ? "Paid" : "Unpaid",
				docstatus: 0,
			};
			uiStore.setLastOfflinePrintDoc(offlinePrintDoc);
			cacheOfflineReceiptPayload(offlineReceiptName, offlinePrintDoc);
			uiStore.showPaymentDialog = false;

			//// Neoffice — the second screen must be told the sale completed even offline, otherwise
			//// it keeps showing the cart of a sale that is already done (185c3c50, 2026-02-03;
			//// rounded total from 4fdb5df4, 2026-04-04).
			// Notify customer display that sale is complete (even offline)
			notifySaleComplete(cartStore.roundedGrandTotal, `OFFLINE-${Date.now()}`);

			cartStore.clearCart();
			// Reset cart hash after successful payment
			previousCartHash = "";

			// Delete draft after successful save
			if (draftIdToDelete) {
				draftsStore.deleteDraft(draftIdToDelete);
			}

			if (shiftStore.autoPrintEnabled || posSettingsStore.silentPrint) {
				try {
					await handlePrintInvoice({ name: offlineReceiptName });
					showSuccess(
						__("Invoice {0} saved offline and sent to printer — will sync when online", [
							offlineReceiptName,
						]),
					);
				} catch (error) {
					log.error("Offline auto-print error:", error);
					uiStore.showSuccess(offlineReceiptName, grandTotal, paymentData.paid_amount);
					showWarning(
						__("Invoice {0} saved offline but print failed — open Print from the success dialog", [
							offlineReceiptName,
						]),
					);
				}
			} else {
				uiStore.showSuccess(offlineReceiptName, grandTotal, paymentData.paid_amount);
				showSuccess(__("Invoice saved offline. Will sync when online"));
			}
		} else {
			// Get item codes from cart before clearing
			const soldItemCodes = cartStore.invoiceItems.map((item) => item.item_code);

			//// Neoffice — the overlay goes up and the payment dialog comes down BEFORE submitting,
			//// so a second tap cannot start a second submit (2584aa58, 2026-03-24). Then, in
			//// restaurant mode, anything still unsent is fired to the kitchen first: paying is also
			//// validating, and an item paid for but never sent is an item never cooked (f295bbeb,
			//// 2026-03-26 "payment = auto-validate + partial payment confirmation dialog").
			// Show processing overlay
			isProcessingPayment.value = true
			uiStore.showPaymentDialog = false

			console.time("[Payment] Total")

			// Auto-send unsent items to kitchen before payment (Payer = Valider)
			if (restaurantStore.isEnabled) {
				const unsentItems = cartStore.invoiceItems.filter(
					i => !i.kds_status || i.kds_status === "Waiting"
				)
				if (unsentItems.length > 0) {
					try {
						// Mark unsent items as Pending
						for (const item of unsentItems) {
							item.kds_status = "Pending"
						}
						cartStore.setKdsStatus("Pending")

						const invoiceData = cartStore.buildOfferEvaluationPayload(shiftStore.currentProfile)
						invoiceData.kds_status = "Pending"
						invoiceData.is_pos = 1
						invoiceData.docstatus = 0
						invoiceData.posa_pos_opening_shift = cartStore.posOpeningShift
						if (cartStore.currentDraftId) {
							invoiceData.name = cartStore.currentDraftId
						}
						await call("pos_next.api.invoices.update_invoice", {
							data: JSON.stringify(invoiceData)
						})
						//// Neoffice — was console.log; the app's logger is silent outside dev.
						log.debug("Payment: auto-sent unsent items to kitchen")
					} catch (err) {
						// Non-blocking: payment continues even if kitchen send fails
						console.error("[Payment] Failed to auto-send to kitchen:", err)
					}
				}
			}

			console.time("[Payment] submitInvoice")
			const result = await cartStore.submitInvoice();
			//// Neoffice — submit timing probe kept from the payment-latency work (2584aa58,
			//// 2026-03-24 "performance timing logs").
			console.timeEnd("[Payment] submitInvoice")

			if (result) {
				uiStore.clearLastOfflinePrintDoc();

				// If this online checkout originated from editing a still-queued
				// offline invoice, mark the original row as superseded so the
				// background sync doesn't push it as a duplicate. We pass the
				// server invoice name as replaced_by for audit trail.
				if (editingOfflineContext?.originalQueueId) {
					const serverName = result.name || result.message?.name || null;
					try {
						await offlineWorker.supersedeOfflineInvoice(
							editingOfflineContext.originalQueueId,
							serverName,
						);
					} catch (err) {
						log.error("Failed to supersede edited offline invoice after online submit:", err);
					}
					editingOfflineContext = null;
					// Refresh pending count so the OfflineInvoicesDialog badge updates.
					await offlineStore.updatePendingCount();
				}

				const invoiceName = result.name || result.message?.name || __("Unknown");
				const invoiceTotal = result.grand_total || result.total || 0;
				const paidAmount = paymentData.paid_amount || invoiceTotal;

				//// Neoffice — upstream closed the payment dialog HERE, after submission returned. It is
				//// now closed before the call, together with raising the processing overlay, so the
				//// cashier never faces a live dialog over a request already in flight (2584aa58,
				//// 2026-03-24 "processing overlay with spinner").
				cartStore.clearCart();
				// Reset cart hash after successful payment
				previousCartHash = "";

				//// Neoffice — restaurant drafts are server-side Sales Invoices, not local drafts, so
				//// deleting a local draft here raised "Draft not found" on every table sale (c89fb981,
				//// 2026-03-24 "skip local draft deletion in restaurant mode").
				// Delete local draft after successful submission (not for restaurant — those are server-side)
				if (draftIdToDelete && !restaurantStore.isEnabled) {
					draftsStore.deleteDraft(draftIdToDelete);
				}

				// Refresh stock - Direct API (50-200ms), no Socket.IO lag!
				//// Neoffice — stock-refresh timing probe (2584aa58, 2026-03-24).
				console.time("[Payment] stockRefresh")
				await stockStore.refresh(soldItemCodes, shiftStore.profileWarehouse);
				//// Neoffice — the table is released to Empty as soon as the bill is paid, and the floor
				//// plan re-read from the server: leaving it Occupied blocks the next guests (130a6130,
				//// 2026-03-24 "release restaurant table to Empty after successful payment"). The second
				//// screen is told the sale completed (185c3c50, 2026-02-03).
				console.timeEnd("[Payment] stockRefresh")

				// Release restaurant table after successful payment
				if (restaurantTableName) {
					restaurantStore.updateTableStatus(restaurantTableName, "Empty")
					restaurantStore.fetchFromNetwork()
				}

				// Notify customer display that sale is complete
				notifySaleComplete(invoiceTotal, invoiceName);

				// Refresh invoice history cache in background (non-blocking)
				loadInvoiceHistoryData().catch((err) =>
					log.debug("Background invoice cache refresh failed:", err)
				);

				//// Neoffice — a gift card sold here has to be handed over with its code, so the codes
				//// the invoice created are read back and shown once. Failure is logged, never fatal: the
				//// sale is already booked (703f2046, 2026-01-14).
				// Check if gift cards were created from this invoice
				try {
					const giftCards = await getGiftCardsFromInvoice(invoiceName);
					if (giftCards && giftCards.length > 0) {
						createdGiftCards.value = giftCards;
						showGiftCardCreatedDialog.value = true;
					}
				} catch (err) {
					log.warn("Failed to check for created gift cards:", err);
				}

				if (shiftStore.autoPrintEnabled || posSettingsStore.silentPrint) {
					try {
						await handlePrintInvoice({ name: invoiceName });
						showSuccess(__("Invoice {0} created and sent to printer", [invoiceName]));
					} catch (error) {
						log.error("Auto-print error:", error);
						showWarning(__("Invoice {0} created but print failed", [invoiceName]));
					}
				} else {
					uiStore.showSuccess(invoiceName, invoiceTotal, paidAmount);
					showSuccess(__("Invoice {0} created successfully", [invoiceName]));
				}

				//// Neoffice — end of the payment timing probe (2584aa58, 2026-03-24).
				console.timeEnd("[Payment] Total")
			}
			//// Neoffice — drop the processing overlay on the success path (2584aa58, 2026-03-24).
			isProcessingPayment.value = false
		}
	} catch (error) {
		//// Neoffice — and on the failure path too: without this the till stays frozen behind the
		//// spinner after a failed submit (2584aa58, 2026-03-24).
		isProcessingPayment.value = false
		log.error("Error submitting invoice:", error);
		uiStore.showPaymentDialog = false;

		// Checkout failed mid-edit — clear the edit context so the NEXT
		// checkout doesn't supersede the wrong row on a fresh, unrelated sale.
		editingOfflineContext = null;

		const errorContext = parseError(error);
		uiStore.showError(
			errorContext.title || __("Error"),
			errorContext.message || __("An unexpected error occurred"),
			errorContext.technicalDetails || null,
			errorContext.retryable ? "payment" : null
		);

		if (errorContext.type === "error") {
			showError(errorContext.message);
		} else if (errorContext.type === "warning") {
			showWarning(errorContext.message);
		} else {
			showWarning(errorContext.message);
		}
	}
}

function handleClearCart() {
	if (cartStore.isEmpty) return;
	uiStore.showClearCartDialog = true;
}

function confirmClearCart() {
	//// Neoffice — the cashier has been told what they are giving up (see the
	//// dialog body); from here the collected money is no longer dangling for
	//// the till. The server-side reconciler still reports it within the hour,
	//// so it can never be lost quietly.
	if (cartStore.collectedUnbookedTotal > 0) {
		log.warn(
			"[POSSale] Cart cleared while a terminal payment was already collected:",
			cartStore.collectedUnbooked,
		);
		cartStore.clearCollected();
	}
	cartStore.clearCart();
	// Reset cart hash when cart is cleared
	previousCartHash = "";
	editingOfflineContext = null;
	uiStore.showClearCartDialog = false;
	showSuccess(__("All items removed from cart"));
}

//// Neoffice — the customer created by the CUSTOMER on the second screen can be adopted
//// by the cart in one click, instead of the cashier retyping a record that already exists
//// (912ef092, 2026-02-04 "improve UX for customer creation flow").
/**
 * Select customer created from customer display
 */
function selectCustomerFromDisplay() {
	const customerData = uiStore.customerCreatedData;
	if (customerData) {
		cartStore.setCustomer({
			name: customerData.name,
			customer_name: customerData.customer_name,
		});
		showSuccess(__("Customer {0} selected", [customerData.customer_name]));
	}
	uiStore.clearCustomerCreatedNotification();
}

async function handleOptionSelected(option) {
	if (!cartStore.pendingItem) return;

	try {
		if (option.type === "variant") {
			const variant = option.data;

			// Early out-of-stock guard for variants
			// Full qty validation happens in cartStore.addItem()
			if (settingsStore.shouldEnforceStockValidation() && shouldValidateItemStock(variant)) {
				const actualQty = variant.actual_qty ?? 0;
				if (actualQty <= 0) {
					uiStore.showError(
						__("Insufficient Stock"),
						__('"{0}" is out of stock in warehouse "{1}".', [
							variant.item_name,
							variant.warehouse || shiftStore.profileWarehouse,
						]),
						__("Item: {0}", [variant.item_code])
					);
					return;
				}
			}

			if (variant.item_uoms && variant.item_uoms.length > 0) {
				cartStore.setPendingItem(variant, cartStore.pendingItemQty, "uom");
				return;
			}

			if (variant.has_batch_no || variant.has_serial_no) {
				cartStore.setPendingItem(variant, cartStore.pendingItemQty);
				uiStore.showItemSelectionDialog = false;
				uiStore.showBatchSerialDialog = true;
			} else {
				try {
					cartStore.addItem(
						variant,
						cartStore.pendingItemQty,
						false,
						shiftStore.currentProfile
					);
					uiStore.showItemSelectionDialog = false;
					cartStore.clearPendingItem();
					showSuccess(__("{0} added to cart", [variant.item_name]));

					//// Neoffice — same auto-open of the modifiers dialog on the VARIANT path: a variant is
					//// still a dish and still needs its options (4df0caf1 2026-03-21; eabe35e7 + 5982e48e,
					//// 2026-03-25).
					// Auto-open modifiers dialog if item has required modifier groups
					if (restaurantStore.isEnabled) {
						const modGroups = restaurantStore.getModifiersForItem(variant.item_code, variant.item_group)
						if (modGroups.length > 0) {
							nextTick(() => {
								//// Neoffice — findLast, not find: the line to configure is the variant addItem()
								//// just appended, not the first line sharing its item_code (7e1376a3).
								const cartItem = cartStore.invoiceItems.findLast(i => i.item_code === variant.item_code)
								if (cartItem && itemModifiersRef.value) {
									itemModifiersRef.value.open(cartItem)
								}
							})
						}
					}
				} catch (error) {
					showError(error.message);
				}
			}
		} else if (option.type === "uom") {
			const qty = option.quantity || cartStore.pendingItemQty;
			const pricing = await cartStore.resolveUomPricing(
				cartStore.pendingItem, option.uom, option.conversion_factor, qty
			);

			const itemToAdd = {
				...cartStore.pendingItem,
				uom: option.uom,
				conversion_factor: option.conversion_factor,
				rate: pricing.rate,
				price_list_rate: pricing.price_list_rate,
			};

			if (itemToAdd.has_batch_no || itemToAdd.has_serial_no) {
				cartStore.setPendingItem(itemToAdd, qty);
				uiStore.showItemSelectionDialog = false;
				uiStore.showBatchSerialDialog = true;
			} else {
				try {
					cartStore.addItem(itemToAdd, qty, false, shiftStore.currentProfile);
					uiStore.showItemSelectionDialog = false;
					cartStore.clearPendingItem();
					showSuccess(__("{0} ({1}) added to cart", [itemToAdd.item_name, option.uom]));

					//// Neoffice — and on the UOM path, for the same reason (4df0caf1 2026-03-21; eabe35e7 +
					//// 5982e48e, 2026-03-25).
					// Auto-open modifiers dialog if item has required modifier groups
					if (restaurantStore.isEnabled) {
						const modGroups = restaurantStore.getModifiersForItem(itemToAdd.item_code, itemToAdd.item_group)
						if (modGroups.length > 0) {
							nextTick(() => {
								//// Neoffice — findLast, not find. This path matters twice over: the lookup drops
								//// the UOM, so find() could return a line of the same item in another unit
								//// entirely. The line to configure is the one addItem() just appended (7e1376a3).
								const cartItem = cartStore.invoiceItems.findLast(i => i.item_code === itemToAdd.item_code)
								if (cartItem && itemModifiersRef.value) {
									itemModifiersRef.value.open(cartItem)
								}
							})
						}
					}
				} catch (error) {
					showError(error.message);
				}
			}
		}
	} catch (error) {
		log.error("Error handling option selection:", error);
		showError(__("Failed to process selection. Please try again."));
	}
}

function handleCloseShift() {
	if (!canAccessShiftActions.value) {
		return;
	}

	uiStore.showCloseShiftDialog = true;
}

function openDraftDialog() {
	if (!canAccessShiftActions.value) {
		return;
	}

	uiStore.showDraftDialog = true;
}

function openHistoryDialog() {
	if (!canAccessShiftActions.value) {
		return;
	}

	uiStore.showHistoryDialog = true;
}

function openReturnDialog() {
	if (!canAccessShiftActions.value) {
		return;
	}

	uiStore.showReturnDialog = true;
}

function switchToDesk() {
	if (!canAccessShiftActions.value || !canSwitchToDesk.value || typeof window === "undefined") {
		return;
	}

	window.location.assign("/app");
}

function formatCurrency(amount) {
	return Number.parseFloat(amount || 0).toFixed(2);
}

async function confirmLogout() {
	logoutAfterClose.value = false;
	_initializedKey = null;
	await cleanupUserSession();
	session.logout.submit();
}

function logoutWithCloseShift() {
	// Open close shift dialog and remember to logout after closing
	logoutAfterClose.value = true;
	uiStore.showLogoutDialog = false;
	uiStore.showCloseShiftDialog = true;
}

async function handleSaveDraft() {
	const savedDraft = await draftsStore.saveDraftInvoice(
		cartStore.invoiceItems,
		cartStore.customer,
		cartStore.posProfile,
		cartStore.appliedOffers,
		cartStore.currentDraftId
	);
	if (savedDraft) {
		cartStore.clearCart();
		// Reset cart hash when cart is saved as draft and cleared
		previousCartHash = "";
	}
}

async function handleLoadDraft(draft) {
	try {
		// If current cart has items, save it as draft before loading new one
		if (!cartStore.isEmpty) {
			const saved = await draftsStore.saveDraftInvoice(
				cartStore.invoiceItems,
				cartStore.customer,
				cartStore.posProfile,
				cartStore.appliedOffers,
				cartStore.currentDraftId
			);

			if (!saved) {
				showError(
					__(
						"Failed to save current cart. Draft loading cancelled to prevent data loss."
					)
				);
				return;
			}
			// No need to clear here as we're about to overwrite cart contents
		}

		const draftData = await draftsStore.loadDraft(draft);
		//// Neoffice — items are restored through addItem instead of assigning invoiceItems: the
		//// direct assignment is what the production build rejects with "Assignment to constant
		//// variable" (cdef7347, 2026-03-21).
		// Restore items via addItem to ensure proper reactivity
		if (draftData.items && draftData.items.length > 0) {
			for (const item of draftData.items) {
				cartStore.addItem(item, item.quantity || item.qty || 1)
			}
		}
		cartStore.setCustomer(draftData.customer);
		//// Neoffice — $patch, same production-build hazard (dd33c2f6, 2026-03-21).
		cartStore.$patch({ currentDraftId: draft.draft_id }); // Set current draft ID

		// Rebuild incremental cache to recalculate totals
		cartStore.rebuildIncrementalCache();

		// Restore applied offers if they were saved
		if (draftData.applied_offers && draftData.applied_offers.length > 0) {
			//// Neoffice — $patch, same production-build hazard (dd33c2f6, 2026-03-21).
			cartStore.$patch({ appliedOffers: draftData.applied_offers });
			// Trigger offer reapplication to ensure they apply to all items
			await cartStore.reapplyOffer(shiftStore.currentProfile);
		}

		// Initialize cart hash for the loaded cart so watchers work correctly
		previousCartHash = computeCartHash();

		uiStore.showDraftDialog = false;
	} catch (error) {
		log.error("Error loading draft:", error);
	}
}

function handleReturnCreated(returnInvoice) {
	// Success message is already shown by ReturnInvoiceDialog
	log.debug("Return invoice created:", returnInvoice.name)
}

function handleDiscountApplied(discount) {
	cartStore.applyDiscountToCart(discount);
	uiStore.showCouponDialog = false;
}

function handleDiscountRemoved() {
	cartStore.removeDiscountFromCart();
}

async function handleApplyOffer(offer) {
	const success = await cartStore.applyOffer(
		offer,
		shiftStore.currentProfile,
		offersDialogRef.value
	);
	if (success) {
		uiStore.showOffersDialog = false;
	}
}

function handleBatchSerialSelected(batchSerial) {
	if (cartStore.pendingItem) {
		// Use quantity from batchSerial if provided (for multiple serial numbers), otherwise use pendingItemQty
		const qty = batchSerial.quantity || cartStore.pendingItemQty;
		const itemToAdd = {
			...cartStore.pendingItem,
			quantity: qty,
			...batchSerial,
		};
		try {
			cartStore.addItem(itemToAdd, qty, false, shiftStore.currentProfile);
			cartStore.clearPendingItem();
		} catch (error) {
			showError(error.message);
		}
	}
}

async function handleCustomerCreated(newCustomer) {
	cartStore.setCustomer(newCustomer);
	uiStore.showCreateCustomerDialog = false;
	editCustomer.value = null; // Clear edit mode

	// Add new customer to IndexedDB cache for instant search availability
	await customerSearchStore.addCustomerToCache(newCustomer);

	showSuccess(__("{0} created and selected", [newCustomer.customer_name]));
}

async function handleCustomerUpdated(updatedCustomer) {
	cartStore.setCustomer(updatedCustomer);
	uiStore.showCreateCustomerDialog = false;
	editCustomer.value = null; // Clear edit mode

	// Update customer in IndexedDB cache for instant search availability
	await customerSearchStore.addCustomerToCache(updatedCustomer);

	showSuccess(__("{0} updated", [updatedCustomer.customer_name]));
}

async function handleRefresh() {
	try {
		log.info("Manual refresh initiated (items, customers, stock)");

		// Refresh items, customers, and stock in parallel
		await Promise.all([
			// Refresh items from server (force server fetch)
			itemStore.loadAllItems(shiftStore.profileName, true),
			// Refresh customers from server (force reload)
			customerSearchStore.loadAllCustomers(shiftStore.profileName, true),
			// Refresh stock from server (preserves reservations internally)
			stockStore.refresh(null, shiftStore.profileWarehouse),
		]);

		// Refresh cache stats to update "Last Updated" timestamp
		const stats = await offlineWorker.getCacheStats();
		itemStore.cacheStats = stats;

		log.success("Manual refresh completed (items, customers, stock)");
	} catch (error) {
		log.error("Manual refresh failed:", error);
	}
}

function handleClearCache() {
	showClearCacheDialog.value = true;
}

async function confirmClearCache() {
	try {
		// Keep overlay open to show clearing animation
		log.info("Clearing cached data...");

		// Import the clear functions from db.js
		const { clearCachedData, clearBrowserCache } = await import("@/utils/offline/db.js");

		// Clear IndexedDB cache (preserves invoices, drafts, and settings by default)
		const dbResult = await clearCachedData({
			preserveInvoices: true,
			preserveDrafts: true,
			preserveSettings: true,
		});

		// Clear browser localStorage and sessionStorage
		const browserResult = clearBrowserCache();

		if (dbResult.success && browserResult.success) {
			log.success("Cache cleared successfully", {
				db: dbResult.cleared,
				browser: browserResult.cleared,
			});

			// Invalidate item store cache
			itemStore.invalidateCache();

			// Reload items to fetch fresh data
			if (itemsSelectorRef.value) {
				await itemsSelectorRef.value.loadItems();
			}

			// Refresh stock
			await stockStore.refresh(null, shiftStore.profileWarehouse);

			// Update cache stats
			const stats = await offlineWorker.getCacheStats();
			itemStore.cacheStats = stats;

			// Close overlay and reset state
			showClearCacheDialog.value = false;
			if (clearCacheOverlayRef.value) {
				clearCacheOverlayRef.value.reset();
			}

			showSuccess(__("All cached data has been cleared successfully"));
		} else {
			throw new Error("Failed to clear cache completely");
		}
	} catch (error) {
		log.error("Error clearing cache:", error);

		// Close overlay on error
		showClearCacheDialog.value = false;
		if (clearCacheOverlayRef.value) {
			clearCacheOverlayRef.value.reset();
		}

		showError(__("Failed to clear cache. Please try again."));
	}
}

async function handleEditOfflineInvoice(invoice) {
	try {
		if (offlineStore.isSyncing) {
			showWarning(__("Cannot edit while syncing — please wait for sync to finish."));
			return;
		}

		if (invoice.data?.was_printed) {
			uiStore.showError(
				__("Cannot edit printed invoice"),
				__(
					"A receipt for this invoice was already printed — the customer may have a physical copy. Use Return Invoice to issue a credit note instead.",
				),
			);
			return;
		}

		cartStore.clearCart();

		const invoiceData = invoice.data;

		if (invoiceData.customer) {
			cartStore.setCustomer(invoiceData.customer);
		}

		if (invoiceData.items && invoiceData.items.length > 0) {
			for (const item of invoiceData.items) {
				// Use autoAdd=true to skip stock validation when loading saved invoices
				// Check both quantity and qty fields since items are stored with 'quantity'
				cartStore.addItem(
					item,
					item.quantity || item.qty || 1,
					true,
					shiftStore.currentProfile
				);
			}
		}

		// Initialize cart hash for the loaded cart so watchers work correctly
		previousCartHash = computeCartHash();

		// Record the edit source so the next checkout can supersede the
		// original queue row (preserving audit trail instead of deleting it).
		editingOfflineContext = {
			originalQueueId: invoice.id,
			originalOfflineId: invoice.offline_id,
		};

		showSuccess(__("Invoice loaded to cart for editing"));
	} catch (error) {
		log.error("Error editing offline invoice:", error);
	}
}

async function handleDeleteOfflineInvoice(invoiceId) {
	try {
		if (offlineStore.isSyncing) {
			showWarning(__("Cannot delete while syncing — please wait for sync to finish."));
			return;
		}
		await offlineStore.deleteOfflineInvoice(invoiceId);
	} catch (error) {
		log.error("Error deleting offline invoice:", error);
	}
}

async function handleSyncClick() {
	if (offlineStore.hasPendingInvoices) {
		await offlineStore.loadPendingInvoices();
		uiStore.showOfflineInvoicesDialog = true;
		return;
	}

	showSuccess(__("No pending invoices to sync"));
}

async function handleSyncAll() {
	if (offlineStore.isOffline) {
		showWarning(__("Cannot sync while offline"));
		return;
	}

	try {
		const result = await offlineStore.syncAllPending();

		// Refresh stock after successful sync (when online)
		if (result.success > 0 && itemsSelectorRef.value) {
			await itemsSelectorRef.value.loadItems();
		}

		if (result.failed > 0 && result.errors && result.errors.length > 0) {
			const firstError = result.errors[0];
			const errorContext = parseError(firstError.error);

			uiStore.showError(
				errorContext.title,
				__(
					"Failed to sync invoice for {0}\n\n${1}\n\nYou can delete this invoice from the offline queue if you don't need it.",
					[firstError.customer, errorContext.message]
				),
				errorContext.technicalDetails || __("Invoice ID: {0}", [firstError.invoiceId]),
				"sync",
				{ failedInvoiceId: firstError.invoiceId }
			);
		} else if (result.failed > 0) {
			showWarning(__("{0} invoice(s) failed to sync", [result.failed]));
		}
	} catch (error) {
		log.error("Sync error:", error);
		const errorContext = parseError(error);
		uiStore.showError(
			errorContext.title,
			errorContext.message,
			errorContext.technicalDetails,
			"sync"
		);
	}
}

// Resizable layout helpers
function updateLayoutBounds() {
	if (!containerRef.value) return;
	const containerWidth = containerRef.value.offsetWidth;
	uiStore.updateLayoutBounds(containerWidth);
}

function startResize(event) {
	if (!containerRef.value || !dividerRef.value) {
		return;
	}
	if (event.isPrimary === false) {
		return;
	}
	if (event.button !== undefined && event.button !== 0 && event.pointerType !== "touch") {
		return;
	}

	updateLayoutBounds();

	resizeState = {
		pointerId: event.pointerId,
		startX: event.clientX,
		startWidth: uiStore.leftPanelWidth,
		containerWidth: containerRef.value?.offsetWidth ?? 1120,
	};

	uiStore.setResizing(true);

	bodyStyleSnapshot = {
		cursor: document.body.style.cursor,
		userSelect: document.body.style.userSelect,
	};

	// Add document-level event listeners for dragging
	document.addEventListener("pointermove", handleResize);
	document.addEventListener("pointerup", stopResize);
	document.addEventListener("pointercancel", stopResize);

	dividerRef.value.setPointerCapture?.(event.pointerId);
	document.body.style.cursor = "col-resize";
	document.body.style.userSelect = "none";
	event.preventDefault();
}

function handleResize(event) {
	if (
		!uiStore.isResizing ||
		!resizeState ||
		(event.pointerId ?? resizeState.pointerId) !== resizeState.pointerId
	) {
		return;
	}

	event.preventDefault();

	const containerWidth = containerRef.value?.offsetWidth ?? resizeState.containerWidth;
	resizeState.containerWidth = containerWidth;

	const deltaX = event.clientX - resizeState.startX;
	// In RTL, dragging right should decrease width, so invert deltaX
	const adjustedDelta = isRTL.value ? -deltaX : deltaX;
	const rawWidth = resizeState.startWidth + adjustedDelta;

	uiStore.setLeftPanelWidth(rawWidth, containerWidth);
}

function stopResize(event) {
	if (!uiStore.isResizing || !resizeState) {
		return;
	}

	if (event?.pointerId !== undefined && event.pointerId !== resizeState.pointerId) {
		return;
	}

	if (event?.preventDefault) {
		event.preventDefault();
	}

	// Remove document-level event listeners
	document.removeEventListener("pointermove", handleResize);
	document.removeEventListener("pointerup", stopResize);
	document.removeEventListener("pointercancel", stopResize);

	if (dividerRef.value?.hasPointerCapture?.(resizeState.pointerId)) {
		dividerRef.value.releasePointerCapture(resizeState.pointerId);
	}

	uiStore.setResizing(false);
	resizeState = null;
	restoreBodyStyles();
	updateLayoutBounds();
}

function restoreBodyStyles() {
	if (!bodyStyleSnapshot) {
		return;
	}

	document.body.style.cursor = bodyStyleSnapshot.cursor || "";
	document.body.style.userSelect = bodyStyleSnapshot.userSelect || "";
	bodyStyleSnapshot = null;
}

// Management and Promotion handlers
function handleManagementMenuClick(menuItem) {
	if (menuItem === "promotions") {
		showPromotionManagement.value = true;
	} else if (menuItem === "settings") {
		showPOSSettings.value = true;
	} else if (menuItem === "invoices") {
		// Load invoice history data before showing
		loadInvoiceHistoryData();
		// Load drafts data
		draftsStore.loadDrafts();
		showInvoiceManagement.value = true;
	} else if (menuItem === "products") {
		// Open Stock Lookup dialog in search mode
		showStockLookup.value = true;
	//// Neoffice — the sidebar entries that only exist in our fork: carte, product options,
	//// preparation workflows, cash in/out, tips and reservations (f2392119 2026-03-22;
	//// f23daabe + d59036f1 2026-03-23/27; 6c598630 2026-03-28; c4460c61 + d08c57e7
	//// 2026-03-23/29; ebc3ecc5 2026-03-29).
	} else if (menuItem === "cards") {
		showCardEditor.value = true;
	} else if (menuItem === "options") {
		showProductOptionsEditor.value = true;
	} else if (menuItem === "workflows") {
		showWorkflowEditor.value = true;
	} else if (menuItem === "cash-entry") {
		showCashInOut.value = true;
	} else if (menuItem === "tips") {
		showTipsPanel.value = true;
	} else if (menuItem === "reservations") {
		showReservationDialog.value = true;
	}
}

// Load invoice history data
async function loadInvoiceHistoryData() {
	log.info("Loading invoice history data for profile:", shiftStore.profileName);

	// Also reload drafts
	await draftsStore.loadDrafts();

	// Check if offline - use cached data
	if (offlineStore.isOffline) {
		log.info("Offline mode - loading invoice history from cache");
		try {
			const cachedInvoices = await getCachedInvoiceHistory(shiftStore.profileName, {
				limit: 100,
			});
			invoiceHistoryData.value = cachedInvoices || [];
			log.info("Loaded", invoiceHistoryData.value.length, "invoices from offline cache");
		} catch (error) {
			log.error("Error loading cached invoice history:", error);
			invoiceHistoryData.value = [];
		}
		return;
	}

	try {
		// Use custom API from pos_next.api.invoices
		const result = await call("pos_next.api.invoices.get_invoices", {
			pos_profile: shiftStore.profileName,
			limit: 100,
		});

		invoiceHistoryData.value = result || [];
		log.info("Loaded invoice history:", invoiceHistoryData.value.length, "invoices");

		// Cache invoices for offline use
		if (result && result.length > 0) {
			cacheInvoiceHistory(result, shiftStore.profileName);
		}
	} catch (error) {
		log.error("Error loading invoice history:", error);

		// Fallback to cached data on error
		try {
			const cachedInvoices = await getCachedInvoiceHistory(shiftStore.profileName, {
				limit: 100,
			});
			if (cachedInvoices && cachedInvoices.length > 0) {
				invoiceHistoryData.value = cachedInvoices;
				log.info("Loaded", cachedInvoices.length, "invoices from cache (fallback)");
				return;
			}
		} catch (cacheError) {
			log.error("Error loading fallback cache:", cacheError);
		}

		invoiceHistoryData.value = [];
	}
}

// Handle invoice actions from InvoiceManagement
function handleViewInvoice(invoice) {
	selectedInvoiceForView.value = invoice.name || invoice;
	showInvoiceDetail.value = true;
}

// Centralized print handler - uses printInvoice.js utilities

async function handlePrintInvoice(invoiceData) {
	try {
		invoiceData = await hydrateLocalOnlyInvoice(invoiceData || {});
		const offlineSnapshot = uiStore.lastOfflinePrintDoc;
		if (
			invoiceData?.name &&
			offlineSnapshot?.name === invoiceData.name &&
			offlineSnapshot.items?.length > 0
		) {
			invoiceData = offlineSnapshot;
		}

		// Silent print path — send directly to thermal printer via QZ Tray
		if (posSettingsStore.silentPrint) {
			const result = await printWithSilentFallback(invoiceData);
			if (result.method === "browser") {
				log.info("Used browser print fallback");
			}
			return;
		}

		// Standard browser print path
		if (invoiceData.items && Array.isArray(invoiceData.items)) {
			await printInvoice(invoiceData);
		} else {
			// If it's just an invoice object with name, fetch and print
			// printInvoiceByName will automatically fetch the print format from the invoice's POS Profile
			await printInvoiceByName(invoiceData.name);
		}
	} catch (error) {
		log.error("Error printing invoice:", error);
		window.frappe?.msgprint({
			title: "Error",
			message: "Failed to print invoice",
			indicator: "red",
		});
	}
}

//// Neoffice — the provisional ticket: a restaurant hands the table a priced summary
//// before cashing in, printed with "THIS IS NOT A RECEIPT". Upstream prints only the
//// final invoice (71050faf, 2026-03-25 "add provisional ticket print button in
//// restaurant table view"); total is the CHF-rounded one (4fdb5df4, 2026-04-04).
function handlePrintProvisionalTicket() {
	try {
		printProvisionalTicket({
			tableName: cartStore.restaurantTable?.table_name || cartStore.restaurantTable?.name,
			company: shiftStore.profileCompany,
			items: cartStore.invoiceItems,
			grand_total: cartStore.roundedGrandTotal,
			customer_name: cartStore.customer?.customer_name || cartStore.customer?.name || null,
			total_taxes_and_charges: cartStore.totalTax || 0,
		})
	} catch (error) {
		log.error("Error printing provisional ticket:", error)
		showError(__("Failed to print provisional ticket"))
	}
}

// Note: handleLoadDraft already exists above, will delegate to it
function handleLoadDraftFromManagement(draft) {
	handleLoadDraft(draft);
	showInvoiceManagement.value = false;
}

function handleDeleteDraft(draftId) {
	draftsStore.deleteDraft(draftId);
}

async function handleWarehouseChanged(newWarehouse) {
	log.info("Warehouse changed to:", newWarehouse);

	try {
		// Update the shift store with new warehouse
		if (shiftStore.currentProfile) {
			shiftStore.currentProfile.warehouse = newWarehouse;
		}

		// Clear item search cache to force reload from new warehouse
		itemStore.invalidateCache();

		// Reload items with new warehouse stock quantities
		if (itemsSelectorRef.value) {
			await itemsSelectorRef.value.loadItems();
		}

		showSuccess(__("Switched to {0}. Stock quantities refreshed.", [newWarehouse]));
	} catch (error) {
		log.error("Error handling warehouse change:", error);
		showWarning(__("Warehouse updated but failed to reload stock. Please refresh manually."));
	}
}

function handlePromotionSaved(data) {
	showSuccess(data.message || __("Promotion saved successfully"));
}

// Optimized tab switching for mobile with RAF for smooth transitions
function handleTabSwitch(tab) {
	// Use requestAnimationFrame to ensure smooth transitions
	requestAnimationFrame(() => {
		uiStore.setMobileTab(tab);
	});
}
</script>
