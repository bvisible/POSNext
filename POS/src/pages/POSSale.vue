<template>
	<div
		class="flex flex-col bg-[var(--neo-bg)] overflow-x-hidden"
		style="height: 100vh; max-height: 100vh"
	>
		<!-- Loading State -->
		<LoadingSpinner v-if="uiStore.isLoading" />

		<!-- Payment Processing Overlay -->
		<div v-if="isProcessingPayment" class="fixed inset-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm z-[400] flex flex-col items-center justify-center">
			<div class="animate-spin rounded-full h-12 w-12 border-b-3 border-blue-500 mb-4"></div>
			<p class="text-lg font-medium text-gray-700 dark:text-gray-200">{{ __('Processing payment...') }}</p>
			<p class="text-sm text-gray-400 mt-1">{{ __('Please wait') }}</p>
		</div>

		<!-- Main App -->
		<template v-else>
			<!-- Header -->
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
				@printer-click="uiStore.showHistoryDialog = true"
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
						@click="uiStore.showDraftDialog = true"
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
						@click="uiStore.showHistoryDialog = true"
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
						@click="uiStore.showReturnDialog = true"
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
													class="group relative bg-white border border-gray-200 rounded-neo-md p-1.5 sm:p-2.5 touch-manipulation transition-[border-color,box-shadow] duration-100 cursor-pointer hover:border-blue-400 hover:shadow-neo-md"
												>
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
													class="flex items-center gap-3 px-2 py-2 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
												>
													<img v-if="li_item.image" :src="li_item.image" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
													<div v-else class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
														:style="getCardItemBgStyle(li_item)">
														<svg v-if="li_item.item_type === 'Menu'" class="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>
														<span v-else class="text-[7px] font-bold leading-tight text-center px-0.5"
															:class="li_item.custom_color && !isLightColor(li_item.custom_color) ? 'text-white' : 'text-gray-500'">
															{{ (li_item.item_name || li_item.label || '').substring(0, 6) }}
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
					<keep-alive>
						<div
							v-if="uiStore.isDesktop || uiStore.mobileActiveTab === 'cart'"
							:class="[
								'flex flex-col bg-gray-50 overflow-hidden',
								uiStore.isDesktop ? 'flex-1' : 'flex-1',
							]"
							style="min-width: 450px; contain: layout style paint"
						>
							<InvoiceCart
								ref="invoiceCartRef"
								:items="cartStore.invoiceItems"
								:customer="cartStore.customer"
								:subtotal="cartStore.subtotal"
								:tax-amount="cartStore.totalTax"
								:discount-amount="cartStore.totalDiscount"
								:grand-total="cartStore.grandTotal"
								:pos-profile="shiftStore.profileName"
								:currency="shiftStore.profileCurrency"
								:applied-offers="cartStore.appliedOffers"
								:warehouses="profileWarehouses"
								@update-quantity="cartStore.updateItemQuantity"
								@remove-item="
									(itemCode, uom) => cartStore.removeItem(itemCode, uom)
								"
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
								@show-drafts="uiStore.showDraftDialog = true"
								@show-history="uiStore.showHistoryDialog = true"
								@show-return="uiStore.showReturnDialog = true"
								@close-shift="handleCloseShift()"
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
						{{ __("Welcome to POS Next") }}
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
		<PaymentDialog
			v-model="uiStore.showPaymentDialog"
			:grand-total="cartStore.grandTotal"
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
			@payment-completed="handlePaymentCompleted"
			@update-additional-discount="handleAdditionalDiscountUpdate"
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

			<!-- Send to Kitchen Dialog -->
			<SendToKitchenDialog
				ref="kitchenDialogRef"
				@items-sent="handleItemsSentToKitchen"
			/>

			<!-- Coupon Dialog -->
			<CouponDialog
				v-model="uiStore.showCouponDialog"
				:subtotal="cartStore.subtotal"
				:net-total="cartStore.netTotalBeforeAdditionalDiscount"
				:items="cartStore.invoiceItems"
				:pos-profile="shiftStore.profileName"
				:customer="cartStore.customer?.name || cartStore.customer"
				:company="shiftStore.profileCompany"
				:currency="shiftStore.profileCurrency"
				:applied-coupon="cartStore.appliedCoupon"
				@discount-applied="handleDiscountApplied"
				@discount-removed="handleDiscountRemoved"
			/>

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
				@refresh="offlineStore.loadPendingInvoices"
			/>

			<!-- Create/Edit Customer Dialog -->
			<CreateCustomerDialog
				v-model="uiStore.showCreateCustomerDialog"
				:pos-profile="shiftStore.profileName"
				:initial-name="uiStore.initialCustomerName"
				:customer="editCustomer"
				@customer-created="handleCustomerCreated"
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
					<div class="py-3">
						<p class="text-sm text-gray-600">
							{{ __("Remove all {0} items from cart?", [cartStore.itemCount]) }}
						</p>
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
							{{ __("Clear All") }}
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
								{{ __("You will be logged out of POS Next") }}
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
						<div class="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-green-100">
							<svg class="h-7 w-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
						</div>
						<h3 class="mt-4 text-lg font-medium text-gray-900">
							{{ __("Invoice {0} created successfully!", [uiStore.lastInvoiceName]) }}
						</h3>
						<p class="mt-2 text-sm text-gray-500">
							{{ __("Paid: {0}", [formatCurrency(uiStore.lastPaidAmount)]) }}
						</p>
					</div>
				</template>
				<template #actions>
					<div class="flex justify-center gap-3 w-full">
						<Button variant="subtle" @click="uiStore.showSuccessDialog = false">
							{{ __("Close") }}
						</Button>
						<Button
							variant="outline"
							@click="showEmailInvoiceDialog = true"
						>
							<template #prefix>
								<FeatherIcon name="mail" class="w-4 h-4" />
							</template>
							{{ __("Email") }}
						</Button>
						<Button
							variant="solid"
							theme="blue"
							@click="handlePrintInvoice({ name: uiStore.lastInvoiceName })"
						>
							<template #prefix>
								<FeatherIcon name="printer" class="w-4 h-4" />
							</template>
							{{ __("Print") }}
						</Button>
					</div>
				</template>
			</Dialog>

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

		</template>

		<!-- Session Lock Screen (outside v-if/v-else so it renders even during loading) -->
		<SessionLockScreen />

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
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ManagementSlider from "@/components/pos/ManagementSlider.vue";
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
import GiftCardCreatedDialog from "@/components/sale/GiftCardCreatedDialog.vue";
import CustomerDialog from "@/components/sale/CustomerDialog.vue";
import DraftInvoicesDialog from "@/components/sale/DraftInvoicesDialog.vue";
import SendToKitchenDialog from "@/components/sale/SendToKitchenDialog.vue";
import InvoiceCart from "@/components/sale/InvoiceCart.vue";
import InvoiceHistoryDialog from "@/components/sale/InvoiceHistoryDialog.vue";
import ItemSelectionDialog from "@/components/sale/ItemSelectionDialog.vue";
import ItemModifiersDialog from "@/components/sale/ItemModifiersDialog.vue";
import PriceEntryDialog from "@/components/sale/PriceEntryDialog.vue";
import MenuSelectionDialog from "@/components/sale/MenuSelectionDialog.vue";
import ItemsSelector from "@/components/sale/ItemsSelector.vue";
import TableSelector from "@/components/pos/TableSelector.vue";
import FloorPlanEditor from "@/components/pos/FloorPlanEditor.vue";
import TableQRCode from "@/components/restaurant/TableQRCode.vue";
import OffersDialog from "@/components/sale/OffersDialog.vue";
import OfflineInvoicesDialog from "@/components/sale/OfflineInvoicesDialog.vue";
import PaymentDialog from "@/components/sale/PaymentDialog.vue";
import PromotionManagement from "@/components/sale/PromotionManagement.vue";
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
import { useGiftCard } from "@/composables/useGiftCard";
import { useLocale } from "@/composables/useLocale";
import { useCustomerDisplaySync } from "@/composables/useCustomerDisplaySync";
import { session } from "@/data/session";
import { useUserData } from "@/data/user";
import { parseError } from "@/utils/errorHandler";
import { cleanupUserSession } from "@/utils/sessionCleanup";
import { offlineWorker } from "@/utils/offline/workerClient";
import { cacheInvoiceHistory, getCachedInvoiceHistory } from "@/utils/offline/sync";
import { printInvoice, printInvoiceByName, printWithSilentFallback, printProvisionalTicket } from "@/utils/printInvoice";
import { qzConnected, connect as qzConnect, disconnect as qzDisconnect } from "@/utils/qzTray";

import { Button, Dialog, FeatherIcon, createResource } from "frappe-ui";
import { call } from "@/utils/apiWrapper";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useToast } from "@/composables/useToast";
import { isLightColor } from "@/utils/itemColors";

import { useCustomerSearchStore } from "@/stores/customerSearch";
import { useItemSearchStore } from "@/stores/itemSearch";
import { useStockStore } from "@/stores/stock";
// Pinia Stores
import { usePOSCartStore } from "@/stores/posCart";
import { usePOSDraftsStore } from "@/stores/posDrafts";
import { usePOSSettingsStore } from "@/stores/posSettings";
import { usePOSShiftStore } from "@/stores/posShift";
import { usePOSSyncStore } from "@/stores/posSync";
import { useRestaurantStore } from "@/stores/restaurant";
import { usePOSUIStore } from "@/stores/posUI";
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
const customerSearchStore = useCustomerSearchStore();
const restaurantStore = useRestaurantStore();
// Note: settingsStore is an alias to posSettingsStore (same Pinia store singleton)
const settingsStore = posSettingsStore;

// Real-time stock updates
const { onStockUpdate } = useRealtimeStock();

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
const showClearCacheDialog = ref(false);
const clearCacheOverlayRef = ref(null);
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
				const cartItem = cartStore.invoiceItems.find(i => i.item_code === item.item_code);
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
			const cartItem = cartStore.invoiceItems.find(i => i.item_code === item.item_code)
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

// Debounce timer for offer reapplication
const offerReapplyTimer = ref(null);

// Performance: Cache previous cart state to avoid unnecessary reapplications
let previousCartHash = "";

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
const settingsInitialTab = ref("");

function openSettingsTab(tab) {
	settingsInitialTab.value = tab || ""
	showPOSSettings.value = true
}

// Stock Lookup dialog (Products menu)
const showStockLookup = ref(false);

// Invoice Management dialog
const showInvoiceManagement = ref(false);

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

// Resize state
let resizeState = null;
let bodyStyleSnapshot = null;

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

	// Listen for guest order updates to refresh POS cart when a guest orders on the active table
	const handleGuestUpdate = async (e) => {
		const table = cartStore.restaurantTable
		if (table && e.detail?.table === table.name) {
			try {
				const orderData = await call("pos_next.api.restaurant.get_table_order", { table_name: table.name })
				if (orderData?.items) {
					await cartStore.clearCart()
					for (const item of orderData.items) {
						cartStore.addItem({
							item_code: item.item_code,
							item_name: item.item_name,
							rate: item.rate,
							uom: item.uom,
							kds_status: item.kds_status || "Pending",
						}, item.qty || 1)
					}
					cartStore.$patch({ currentDraftId: orderData.name, hasUnsentChanges: false, guestPaidAmount: orderData.paid_amount || 0 })
				}
			} catch { /* ignore */ }
		}
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
		}
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
	const cartItem = cartStore.invoiceItems.find(
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

function handleItemSelected(item, autoAdd = false) {
	// Auto-add mode
	if (autoAdd) {
		try {
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
					const cartItem = cartStore.invoiceItems.find(i => i.item_code === item.item_code);
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

	// Auto-open modifiers dialog if item has required modifier groups
	if (restaurantStore.isEnabled) {
		const modGroups = restaurantStore.getModifiersForItem(item.item_code, item.item_group)
		if (modGroups.length > 0) {
			nextTick(() => {
				// Find the item in cart and open modifiers
				const cartItem = cartStore.invoiceItems.find(i => i.item_code === item.item_code)
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

function handlePriceConfirmed({ item, price }) {
	// Check if item is already in cart (restaurant flow: modifiers were shown first)
	const existingCartItem = cartStore.invoiceItems.find(i => i.item_code === item.item_code);
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
	cartStore.$patch({ additionalDiscount: discountAmount });

	// Rebuild the cache to recalculate totals
	cartStore.rebuildIncrementalCache();
}

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
			uiStore.showPaymentDialog = true;
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

function handleEditCustomer(customer) {
	editCustomer.value = customer; // Set customer for edit mode
	uiStore.setInitialCustomerName("");
	uiStore.showCreateCustomerDialog = true;
}

function handleProceedToPayment() {
	if (cartStore.isEmpty) {
		showWarning(__("Please add items to cart before proceeding to payment"));
		return;
	}

	const customerValue = cartStore.customer?.name || cartStore.customer;
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

		cartStore.$patch({ payments: [] });
		if (paymentData.payments && Array.isArray(paymentData.payments)) {
			paymentData.payments.forEach((p) => {
				cartStore.payments.push({
					mode_of_payment: p.mode_of_payment,
					amount: p.amount,
					type: p.type,
				});
			});
		}

		// Store sales team data if provided
		if (paymentData.sales_team && Array.isArray(paymentData.sales_team)) {
			cartStore.$patch({ salesTeam: paymentData.sales_team });
		} else {
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
		console.log("[Payment] restaurantTableName:", restaurantTableName, "restaurantTable:", JSON.stringify(cartStore.restaurantTable))
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
				customer: customerValue || shiftStore.profileCustomer,
				items: preparedItems,
				payments: JSON.parse(JSON.stringify(cartStore.payments)),
				sales_team: JSON.parse(JSON.stringify(cartStore.salesTeam || [])),
				grand_total: cartStore.grandTotal,
				total_tax: cartStore.totalTax,
				total_discount: cartStore.totalDiscount,
				write_off_amount: paymentData.write_off_amount || 0,
				// Document-level discount for coupons and gift cards
				discount_amount: cartStore.additionalDiscount || 0,
				apply_discount_on: cartStore.additionalDiscount > 0 ? "Grand Total" : null,
				coupon_code: cartStore.couponCode || null,
				posa_coupon_code: cartStore.couponCode ? cartStore.couponCode.toUpperCase() : null,
				posa_gift_card_amount_used: cartStore.additionalDiscount || 0,
				is_pos: 1,
				update_stock: 1,
			};

			await offlineStore.saveInvoiceOffline(invoiceData);
			uiStore.showSuccess(
				`OFFLINE-${Date.now()}`,
				cartStore.grandTotal,
				paymentData.paid_amount
			);
			uiStore.showPaymentDialog = false;

			// Notify customer display that sale is complete (even offline)
			notifySaleComplete(cartStore.grandTotal, `OFFLINE-${Date.now()}`);

			cartStore.clearCart();
			// Reset cart hash after successful payment
			previousCartHash = "";

			// Delete draft after successful save
			if (draftIdToDelete) {
				draftsStore.deleteDraft(draftIdToDelete);
			}

			showSuccess(__("Invoice saved offline. Will sync when online"));
		} else {
			// Get item codes from cart before clearing
			const soldItemCodes = cartStore.invoiceItems.map((item) => item.item_code);

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
						console.log("[Payment] Auto-sent unsent items to kitchen")
					} catch (err) {
						// Non-blocking: payment continues even if kitchen send fails
						console.error("[Payment] Failed to auto-send to kitchen:", err)
					}
				}
			}

			console.time("[Payment] submitInvoice")
			const result = await cartStore.submitInvoice();
			console.timeEnd("[Payment] submitInvoice")

			if (result) {
				const invoiceName = result.name || result.message?.name || __("Unknown");
				const invoiceTotal = result.grand_total || result.total || 0;
				const paidAmount = paymentData.paid_amount || invoiceTotal;

				cartStore.clearCart();
				// Reset cart hash after successful payment
				previousCartHash = "";

				// Delete local draft after successful submission (not for restaurant — those are server-side)
				if (draftIdToDelete && !restaurantStore.isEnabled) {
					draftsStore.deleteDraft(draftIdToDelete);
				}

				// Refresh stock - Direct API (50-200ms), no Socket.IO lag!
				console.time("[Payment] stockRefresh")
				await stockStore.refresh(soldItemCodes, shiftStore.profileWarehouse);
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

				console.timeEnd("[Payment] Total")
			}
			isProcessingPayment.value = false
		}
	} catch (error) {
		isProcessingPayment.value = false
		log.error("Error submitting invoice:", error);
		uiStore.showPaymentDialog = false;

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
	cartStore.clearCart();
	// Reset cart hash when cart is cleared
	previousCartHash = "";
	uiStore.showClearCartDialog = false;
	showSuccess(__("All items removed from cart"));
}

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

					// Auto-open modifiers dialog if item has required modifier groups
					if (restaurantStore.isEnabled) {
						const modGroups = restaurantStore.getModifiersForItem(variant.item_code, variant.item_group)
						if (modGroups.length > 0) {
							nextTick(() => {
								const cartItem = cartStore.invoiceItems.find(i => i.item_code === variant.item_code)
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

					// Auto-open modifiers dialog if item has required modifier groups
					if (restaurantStore.isEnabled) {
						const modGroups = restaurantStore.getModifiersForItem(itemToAdd.item_code, itemToAdd.item_group)
						if (modGroups.length > 0) {
							nextTick(() => {
								const cartItem = cartStore.invoiceItems.find(i => i.item_code === itemToAdd.item_code)
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
	uiStore.showCloseShiftDialog = true;
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
		// Restore items via addItem to ensure proper reactivity
		if (draftData.items && draftData.items.length > 0) {
			for (const item of draftData.items) {
				cartStore.addItem(item, item.quantity || item.qty || 1)
			}
		}
		cartStore.setCustomer(draftData.customer);
		cartStore.$patch({ currentDraftId: draft.draft_id }); // Set current draft ID

		// Rebuild incremental cache to recalculate totals
		cartStore.rebuildIncrementalCache();

		// Restore applied offers if they were saved
		if (draftData.applied_offers && draftData.applied_offers.length > 0) {
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

		await offlineStore.deleteOfflineInvoice(invoice.id);

		showSuccess(__("Invoice loaded to cart for editing"));
	} catch (error) {
		log.error("Error editing offline invoice:", error);
	}
}

async function handleDeleteOfflineInvoice(invoiceId) {
	try {
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

function handlePrintProvisionalTicket() {
	try {
		printProvisionalTicket({
			tableName: cartStore.restaurantTable?.table_name || cartStore.restaurantTable?.name,
			company: shiftStore.profileCompany,
			items: cartStore.invoiceItems,
			grand_total: cartStore.grandTotal,
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
