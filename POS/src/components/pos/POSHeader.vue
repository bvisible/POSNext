<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// align POS design with Neoffice theme and improve customer display — 87f168f + 3e25c3b
  //// remove horizontal padding from POS header container — 82265c4
  //// Neoffice — the restaurant switch this header carried (5d4db32, 8aa35c2, e8cecbc, 5959928) is gone: the till's own POS Settings decide restaurant or counter
  //// move language switcher to user menu on mobile for compact header — c3ac72b
  //// Phase 1 restaurant module - header toggle, UI cleanup, multi-room tabs — 8aa35c2
-->
<template>
	<!-- //// Neoffice — upstream's header is a plain white bar (bg-white shadow-sm); the Neoffice -->
	<!-- //// theme uses the glassmorphism surface and the shadow token instead (87f168fe, -->
	<!-- //// 2026-03-20 "align POS design with Neoffice theme and improve customer display"). -->
	<div class="neo-glass shadow-neo sticky top-0 z-[200] border-b border-white/30">
		<!-- //// Neoffice — header height: upstream pads the bar (py-2 sm:py-3), the Neoffice header -->
		<!-- //// is flush so a 10 inch tablet keeps that vertical space for the cart (87f168fe, -->
		<!-- //// 2026-03-20 "align POS design with Neoffice theme"). -->
		<div class="flex py-0">
			<!-- POS Icon - Aligned with Management Sidebar (64px) -->
			<!-- //// Neoffice — upstream shows a blue gradient button labelled "POS Next" that does -->
			<!-- //// nothing. The fork puts the Neoffice logo there and makes it the way back to the -->
			<!-- //// back-office (/app/retail), through the confirmation dialog below: this till is one -->
			<!-- //// app inside Neoffice, not a standalone product. (87f168fe, 2026-03-20 "align POS -->
			<!-- //// design with Neoffice theme and improve customer display") -->
			<div class="w-16 flex-shrink-0 flex items-center justify-center px-2">
				<img
					:src="neofficeLogo"
					alt="Neoffice"
					class="h-8 w-auto cursor-pointer hover:opacity-80 active:scale-95 transition-all"
					:title="__('Back to Neoffice')"
					@click="showExitDialog = true"
				/>
			</div>

			<!-- //// Neoffice — added: a "Leave POS?" confirmation before returning to the back-office. -->
			<!-- //// Upstream has no exit path at all (you close the tab); adding one without a -->
			<!-- //// confirmation would put a mis-tap between a cashier and their open cart. (87f168fe, -->
			<!-- //// 2026-03-20 "align POS design with Neoffice theme and improve customer display") -->
			<!-- Exit POS Confirmation Dialog -->
			<Teleport to="body">
				<div
					v-if="showExitDialog"
					class="fixed inset-0 z-[9999] flex items-center justify-center"
				>
					<div
						class="absolute inset-0 bg-black/40"
						@click="showExitDialog = false"
					></div>
					<div
						class="relative bg-white rounded-neo-lg shadow-neo-lg p-6 max-w-sm w-full mx-4"
					>
						<h3 class="text-lg font-bold text-gray-900 mb-2">
							{{ __("Leave POS?") }}
						</h3>
						<p class="text-sm text-gray-600 mb-5">
							{{ __("You will be redirected to the Neoffice back-office.") }}
						</p>
						<div class="flex gap-3">
							<button
								@click="showExitDialog = false"
								class="flex-1 py-2.5 px-4 rounded-neo-md text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
							>
								{{ __("Cancel") }}
							</button>
							<button
								@click="navigateToBackOffice"
								class="flex-1 py-2.5 px-4 rounded-neo-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
							>
								{{ __("Leave") }}
							</button>
						</div>
					</div>
				</div>
			</Teleport>

			<!-- Main Header Content -->
			<!-- //// Neoffice — the header container no longer carries its own horizontal padding -->
			<!-- //// (upstream: px-2 sm:px-4 md:px-6): it has to line up with the 64px management -->
			<!-- //// sidebar, which that padding pushed out of alignment (82265c45, 2026-04-02 "remove -->
			<!-- //// horizontal padding from POS header container"). -->
			<div class="flex-1 flex justify-between items-center gap-1 sm:gap-2">
				<!-- Left Side: Brand Info -->
				<div class="flex items-center gap-1 sm:gap-4 min-w-0 flex-1 overflow-hidden">
					<div class="min-w-0 flex-shrink overflow-hidden flex items-baseline gap-2">
						<!-- //// Neoffice — upstream prints a hardcoded "POS Next" title before the version. The -->
						<!-- //// title is gone: the logo already says whose product this is (87f168fe, 2026-03-20 -->
						<!-- //// "align POS design with Neoffice theme and improve customer display"). -->
						<span
							class="hidden sm:inline text-xs font-medium text-gray-500 tabular-nums flex-shrink-0"
							dir="ltr"
							>v{{ appVersion }}</span
						>
						<span
							v-if="profileName"
							dir="auto"
							class="text-pos-sm text-gray-600 truncate hidden sm:inline border-s border-gray-300 ps-2"
						>
							{{ profileName }}
						</span>
					</div>

					<!-- Time and Shift Duration - Compact on mobile -->
					<div class="hidden lg:flex items-center gap-4 ms-6 flex-shrink-0">
						<!-- Current Time -->
						<StatusBadge
							variant="blue"
							size="sm"
							:icon="timeIcon"
							:text="currentTime"
						/>

						<!-- Shift Duration -->
						<StatusBadge
							v-if="hasOpenShift && shiftDuration"
							variant="green"
							size="xs"
							:icon="shiftIcon"
							:label="__('Shift Open:')"
							:value="shiftDuration"
						/>
					</div>

					<!-- Mobile Time Display - Very compact -->
					<div
						class="flex lg:hidden items-center text-xs text-gray-600 font-medium flex-shrink-0 ms-1 tabular-nums"
						dir="ltr"
					>
						<span class="hidden sm:inline whitespace-nowrap">{{ currentTime }}</span>
					</div>
				</div>

				<!-- Right Side: Controls -->
				<div class="flex items-center gap-0.5 sm:gap-1 md:gap-2 flex-shrink-0">
					<!-- //// Neoffice — no restaurant-mode switch in the header: a till is a restaurant till or a -->
					<!-- //// counter till by its own POS Settings (Default Restaurant Mode on its POS Profile), a -->
					<!-- //// device switch is not wanted. The switch (8aa35c29, 2026-03-20 "Phase 1 restaurant -->
					<!-- //// module"; 5d4db328, 924e688c, 59599289) stood here. -->

					<!-- WiFi/Offline Status -->
					<!-- //// Neoffice — Neoffice theme tokens on the sync button below: upstream uses rounded-lg -->
					<!-- //// and opaque hover greys, the fork uses rounded-neo-sm and the translucent /70 greys -->
					<!-- //// that sit on the glass header (87f168fe, 2026-03-20 "align POS design with Neoffice -->
					<!-- //// theme"). Marker sits above the tag: the changed line is inside the :class binding, -->
					<!-- //// where no HTML comment may go. -->
					<button
						@click="$emit('sync-click')"
						:class="[
							'flex items-center justify-center min-h-target min-w-target hover:bg-gray-100/70 active:bg-gray-200/70 rounded-neo-sm transition-colors relative group touch-manipulation pos-focus',
							isSyncing ? 'animate-pulse' : '',
						]"
						:title="
							isOffline
								? __('Offline ({0} pending)', [pendingInvoicesCount])
								: __('Online - Click to sync')
						"
						:aria-label="
							isOffline ? __('Offline mode active') : __('Online mode active')
						"
					>
						<svg
							v-if="!isOffline"
							class="w-4 h-4 sm:w-5 sm:h-5 text-green-600"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"
							/>
						</svg>
						<svg
							v-else
							class="w-4 h-4 sm:w-5 sm:h-5 text-orange-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
							/>
						</svg>
						<span
							v-if="pendingInvoicesCount > 0"
							class="absolute -top-1 -end-1 bg-orange-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md"
						>
							{{ pendingInvoicesCount }}
						</span>
					</button>

					<!-- Cache Status Indicator -->
					<div class="relative">
						<!-- //// Neoffice — same theme swap on the cache-status button below: rounded-lg becomes -->
						<!-- //// rounded-neo-sm and the hover greys become translucent for the glass header -->
						<!-- //// (87f168fe, 2026-03-20 "align POS design with Neoffice theme"). Marker sits above -->
						<!-- //// the tag: the changed line is an attribute inside the opening tag. -->
						<button
							@click="showCacheTooltip = !showCacheTooltip"
							@blur="handleBlur"
							class="flex items-center justify-center min-h-target min-w-target hover:bg-gray-100/70 active:bg-gray-200/70 rounded-neo-sm transition-colors relative touch-manipulation pos-focus"
							:aria-label="getCacheAriaLabel()"
						>
							<svg
								class="w-4 h-4 sm:w-5 sm:h-5 transition-colors"
								:class="getCacheIconColor()"
								fill="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M12 2C8.13 2 5 3.12 5 4.5V7c0 1.38 3.13 2.5 7 2.5S19 8.38 19 7V4.5C19 3.12 15.87 2 12 2zM5 9v3c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5V9c0 1.38-3.13 2.5-7 2.5S5 10.38 5 9zm0 5v3c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5v-3c0 1.38-3.13 2.5-7 2.5S5 15.38 5 14z"
								/>
							</svg>
							<svg
								v-if="cacheSyncing || isRefreshing"
								class="w-4 h-4 sm:w-5 sm:h-5 absolute inset-0 m-auto animate-spin opacity-70"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								:class="getCacheIconColor()"
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
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
								></path>
							</svg>
							<!-- Sync progress badge (visible during sync) -->
							<span
								v-if="cacheSyncing && cacheStats?.items > 0"
								class="absolute -bottom-1 -end-1 bg-orange-500 text-white text-[8px] font-bold rounded-full px-1 min-w-[20px] h-4 flex items-center justify-center shadow-md animate-pulse"
								:title="__('Syncing: {0} items', [formatNumber(cacheStats.items)])"
							>
								{{ formatCompactNumber(cacheStats.items) }}
							</span>
						</button>

						<!-- Tooltip -->
						<div
							v-if="showCacheTooltip"
							@mousedown.prevent
							class="absolute top-full mt-2 z-[999] w-[90vw] max-w-[240px] sm:max-w-[260px]"
							:style="{ left: '50%', transform: 'translateX(-50%)' }"
						>
							<!-- //// Neoffice — tooltip surface on the Neoffice radius and shadow tokens (upstream: -->
							<!-- //// rounded-lg shadow-xl) so it matches the rest of the theme (87f168fe, 2026-03-20). -->
							<div
								class="bg-gray-900 text-white text-xs rounded-neo-md shadow-neo-lg py-2 px-2.5 sm:px-3"
							>
								<!-- Arrow -->
								<div class="absolute bottom-full mb-px left-1/2 -translate-x-1/2">
									<div
										class="border-[5px] sm:border-4 border-transparent border-b-gray-900"
									></div>
								</div>

								<!-- Header -->
								<div
									class="flex items-center justify-between mb-1.5 sm:mb-2 pb-1.5 sm:pb-2 border-b border-gray-700"
								>
									<span class="font-semibold text-[11px] sm:text-xs">{{
										__("Cache")
									}}</span>
									<span
										class="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase"
										:class="getCacheStatusBadgeClass()"
									>
										{{ getCacheStatus() }}
									</span>
								</div>

								<!-- Sync Progress Banner (shown during sync) -->
								<div
									v-if="cacheSyncing"
									class="mb-2 p-2 bg-orange-500/20 rounded-lg"
								>
									<div class="flex items-center gap-2 mb-1.5">
										<svg
											class="w-4 h-4 animate-spin text-orange-400"
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
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
											></path>
										</svg>
										<span class="text-orange-300 font-semibold text-[11px]">{{
											__("Syncing for offline...")
										}}</span>
									</div>
									<div class="text-center">
										<span class="text-white font-bold text-lg">{{
											formatNumber(cacheStats?.items || 0)
										}}</span>
										<span class="text-gray-400 text-[10px] ms-1">{{
											__("items cached")
										}}</span>
									</div>
									<div class="mt-1.5 text-[9px] text-gray-400 text-center">
										{{ __("Barcode scanning works for cached items") }}
									</div>
								</div>

								<!-- Stats -->
								<div class="flex flex-col gap-1 sm:gap-1.5 text-[10px] sm:text-xs">
									<div class="flex items-center justify-between">
										<span class="text-gray-400">{{ __("Items:") }}</span>
										<span class="font-semibold">{{
											formatNumber(cacheStats?.items || 0)
										}}</span>
									</div>
									<div
										v-if="cacheStats?.lastSync"
										class="flex items-center justify-between"
									>
										<span class="text-gray-400">{{ __("Last Sync:") }}</span>
										<span class="font-semibold text-[9px] sm:text-[10px]">{{
											formatLastSync()
										}}</span>
									</div>
									<div
										v-if="!cacheSyncing && stockSyncActive"
										class="flex items-center justify-between"
									>
										<span class="text-gray-400">{{ __("Auto-Sync:") }}</span>
										<span
											class="text-green-400 font-semibold flex items-center gap-1"
										>
											<div
												class="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"
											></div>
											{{ __("Active") }}
										</span>
									</div>
								</div>

								<!-- Clear Cache Button -->
								<div
									class="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-gray-700"
								>
									<button
										@click="handleClearCacheClick"
										:disabled="isOffline"
										:class="[
											'w-full px-2 py-1.5 sm:py-2 rounded transition-colors font-semibold text-[10px] sm:text-[11px] flex items-center justify-center gap-1.5',
											isOffline
												? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
												: 'bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 active:scale-95',
										]"
										:title="
											isOffline
												? __('Cannot clear cache while offline')
												: __('Clear all cached data')
										"
									>
										<svg
											class="w-2.5 h-2.5 sm:w-3 sm:h-3"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/>
										</svg>
										{{ __("Clear Cache") }}
									</button>
								</div>
							</div>
						</div>
					</div>

					<!-- Printer - Visible only while shift is open -->
					<div v-if="hasOpenShift" class="hidden md:block relative">
						<!-- //// Neoffice — with a Star CloudPRNT printer on this till, the button's title and dot -->
						<!-- //// show that printer's live state (ready, paper low, paper out or cover open, offline) -->
						<!-- //// instead of QZ Tray's; upstream knows QZ Tray only (maintenance#1935). -->
						<ActionButton
							:icon="printerIcon"
							:title="
								cloudPrinterStatus
									? cloudPrinterTitle
									: silentPrintEnabled
									? qzConnected
										? __('Silent Print: Connected')
										: __('Silent Print: Disconnected')
									: __('Print Invoice')
							"
							@click="$emit('printer-click')"
							class="min-h-target min-w-target flex items-center justify-center"
						/>
						<!-- //// Neoffice — the dot shows the CloudPRNT printer's state when the till has one, -->
						<!-- //// QZ Tray's otherwise (maintenance#1935). -->
						<span
							v-if="cloudPrinterStatus || silentPrintEnabled"
							:class="printerDotClass"
							class="absolute top-0.5 end-0.5 w-2 h-2 rounded-full border border-white"
						></span>
					</div>

					<!-- //// Neoffice — opens the cash drawer wired to the till's CloudPRNT printer, with a reason -->
					<!-- //// (CashDrawerDialog); shown only when the till has such a printer. Upstream has no cash -->
					<!-- //// drawer (maintenance#1935). -->
					<div v-if="hasOpenShift && drawerAvailable" class="hidden md:block">
						<ActionButton
							:icon="drawerIcon"
							:title="__('Open the cash drawer')"
							@click="$emit('drawer-click')"
							class="min-h-target min-w-target flex items-center justify-center"
						/>
					</div>

					<!-- Refresh -->
					<ActionButton
						:icon="refreshIcon"
						:title="isRefreshing ? __('Refreshing...') : __('Refresh')"
						@click="$emit('refresh-click')"
						:class="[
							'touch-manipulation min-h-target min-w-target flex items-center justify-center',
							isRefreshing ? 'animate-spin' : '',
						]"
						:aria-label="
							isRefreshing ? __('Refreshing...') : __('Refresh items and customers')
						"
					/>

					<!-- //// Neoffice — added: opens the customer-facing second screen (/pos/display) in a popup. -->
					<!-- //// Upstream POSNext has no customer display. This button stands where upstream had the -->
					<!-- //// desktop language switcher, which moved into the user menu to keep the header -->
					<!-- //// compact. The URL carries this cashier's opening entry and profile — see -->
					<!-- //// openCustomerDisplay(). (87f168fe, 2026-03-20 "align POS design with Neoffice theme -->
					<!-- //// and improve customer display") -->
					<!-- Customer Display (Second Screen) -->
					<button
						@click="openCustomerDisplay"
						class="hidden md:flex p-1.5 sm:p-2 hover:bg-gray-100/70 active:bg-gray-200/70 rounded-neo-sm transition-colors touch-manipulation items-center justify-center"
						:title="__('Open Customer Display')"
						:aria-label="__('Open customer display on second screen')"
					>
						<svg
							class="w-4 h-4 sm:w-5 sm:h-5 text-gray-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="1.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z"
							/>
						</svg>
					</button>

					<!-- //// Neoffice — NOT our change. This divider is upstream's own line (c3ac72bf, -->
					<!-- //// engahmed1190, 2025-11-26 "move language switcher to user menu on mobile for compact -->
					<!-- //// header"). It only shows up as modified in the BASE..HEAD diff because the fork -->
					<!-- //// deleted the identical divider plus the header LanguageSwitcher just above it -->
					<!-- //// (87f168fe), so the two copies no longer line up. Nothing to carry over at the next -->
					<!-- //// merge. -->
					<div class="w-px h-4 sm:h-6 bg-gray-200 hidden md:block"></div>

					<!-- User Menu -->
					<UserMenu
						:user-name="userName"
						:profile-name="profileName"
						:profile-image="userImage"
						@logout="$emit('logout')"
						@menu-opened="$emit('menu-opened')"
						@menu-closed="$emit('menu-closed')"
					>
						<template #menu-items>
							<slot name="menu-items"></slot>
						</template>
						<template #additional-actions>
							<slot name="additional-actions"></slot>
						</template>
					</UserMenu>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import ActionButton from "@/components/common/ActionButton.vue";
import StatusBadge from "@/components/common/StatusBadge.vue";
import UserMenu from "@/components/common/UserMenu.vue";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.vue";
import { DEFAULT_LOCALE } from "@/utils/currency";
//// Neoffice — computed added for the CloudPRNT printer state (maintenance#1935).
import { computed, ref } from "vue";
import { version } from "../../../package.json";
//// Neoffice — posShift is what pins the customer display to THIS cashier's opening entry
//// (9a807f74, 2026-06-01 "customer display follows the launching POS's exact shift").
//// The posSettings and restaurant imports are dead code: e8cecbcf (2026-03-20) had the
//// header toggle the store itself, 59599289 (2026-03-21) put that decision back in
//// POSSale and left the two imports behind.
import { usePOSSettingsStore } from "@/stores/posSettings";
import { useRestaurantStore } from "@/stores/restaurant";
import { usePOSShiftStore } from "@/stores/posShift";

//// Neoffice — needed by openCustomerDisplay(): given no opening entry, the display resolves
//// "the most recent open shift for this profile, whoever the user", which mirrors another
//// cashier's cart as soon as two shifts share a profile (9a807f74, 2026-06-01).
const shiftStore = usePOSShiftStore();
const showCacheTooltip = ref(false);
//// Neoffice — state of the "Leave POS?" confirmation that comes with the logo exit path
//// (87f168fe, 2026-03-20). Upstream POSNext has no way out of the till.
const showExitDialog = ref(false);
const appVersion = version;
//// Neoffice — added: the Neoffice logo asset, the way back to the back-office (/app/retail)
//// and the customer-display popup, none of which upstream POSNext has. The display URL
//// carries the cashier's own opening entry and POS profile, because the display would
//// otherwise pick the most recent open shift for the profile, whoever the user, and
//// mirror the wrong cart. (87f168fe, 2026-03-20 "align POS design with Neoffice theme
//// and improve customer display"; 9a807f74, 2026-06-01 "customer display follows the
//// launching POS's exact shift")
const neofficeLogo = "/assets/neoffice_theme/images/neoffice_logo.svg";

function navigateToBackOffice() {
	window.location.href = "/app/retail";
}

function openCustomerDisplay() {
	// Pin the display to THIS cashier's exact opening entry (+ profile). The
	// display would otherwise resolve "the most recent open shift for this
	// profile, any user" — which is wrong when several shifts are open at once
	// on the same profile (it would follow another cashier's cart).
	const params = new URLSearchParams();
	const opening = shiftStore.currentShift?.name;
	if (opening) params.set("opening", opening);
	if (props.profileName) params.set("profile", props.profileName);
	const qs = params.toString();
	window.open(
		qs ? `/pos/display?${qs}` : "/pos/display",
		"pos_customer_display",
		"popup,width=1024,height=768"
	);
}

const emit = defineEmits([
	"sync-click",
	"printer-click",
	"refresh-click",
	"menu-click",
	"logout",
	"menu-opened",
	"menu-closed",
	"clear-cache",
	//// Neoffice — no "toggle-restaurant" event: the header has no restaurant switch any more, the
	//// till's own POS Settings decide restaurant or counter (a device switch is not wanted).
	//// Neoffice — the cash drawer button; POSSale opens CashDrawerDialog (maintenance#1935).
	"drawer-click",
]);

//// Neoffice — no onToggleRestaurant: it relayed the removed switch to POSSale, which purged open
//// orders and freed every table before flipping the mode. The mode is the till's own setting now.

function handleClearCacheClick() {
	showCacheTooltip.value = false;
	//// Neoffice — Biome quote style only, no behaviour change (458d81a9, 2026-03-20).
	emit("clear-cache");
}

function handleBlur(event) {
	// Don't close if clicking inside the tooltip
	//// Neoffice — Biome 80-column wrap only, no behaviour change (458d81a9, 2026-03-20).
	if (!event.relatedTarget || !event.currentTarget.parentElement.contains(event.relatedTarget)) {
		setTimeout(() => {
			showCacheTooltip.value = false;
		}, 200);
	}
}

const props = defineProps({
	currentTime: {
		type: String,
		required: true,
	},
	shiftDuration: {
		type: String,
		default: null,
	},
	hasOpenShift: {
		type: Boolean,
		default: false,
	},
	profileName: {
		type: String,
		default: null,
	},
	userName: {
		type: String,
		required: true,
	},
	userImage: {
		type: String,
		default: null,
	},
	isOffline: {
		type: Boolean,
		default: false,
	},
	isSyncing: {
		type: Boolean,
		default: false,
	},
	pendingInvoicesCount: {
		type: Number,
		default: 0,
	},
	isAnyDialogOpen: {
		type: Boolean,
		default: false,
	},
	cacheSyncing: {
		type: Boolean,
		default: false,
	},
	cacheStats: {
		type: Object,
		default: () => ({ items: 0, lastSync: null }),
	},
	stockSyncActive: {
		type: Boolean,
		default: false,
	},
	isRefreshing: {
		type: Boolean,
		default: false,
	},
	silentPrintEnabled: {
		type: Boolean,
		default: false,
	},
	qzConnected: {
		type: Boolean,
		default: false,
	},
	//// Neoffice — no isRestaurantMode / canToggleRestaurant props: they fed the restaurant switch,
	//// which is gone (the till's own POS Settings decide restaurant or counter).
	//// Neoffice — the till's CloudPRNT printer, from the cloudPrnt store: its label, its state
	//// (ready, warning, error, offline; empty without such a printer) and whether a drawer can be
	//// opened through it (maintenance#1935).
	cloudPrinterLabel: {
		type: String,
		default: "",
	},
	cloudPrinterStatus: {
		type: String,
		default: "",
	},
	drawerAvailable: {
		type: Boolean,
		default: false,
	},
});

//// Neoffice — what the printer button says and which colour its dot takes for a CloudPRNT
//// printer (maintenance#1935).
const CLOUD_PRINTER_STATES = {
	ready: { title: __("Ready"), dot: "bg-green-500" },
	warning: { title: __("Paper low"), dot: "bg-orange-400" },
	error: { title: __("Paper out or cover open"), dot: "bg-red-500" },
	offline: { title: __("Offline"), dot: "bg-red-500" },
};
const cloudPrinterTitle = computed(() => {
	const state = CLOUD_PRINTER_STATES[props.cloudPrinterStatus];
	return state ? `${props.cloudPrinterLabel}: ${state.title}` : props.cloudPrinterLabel;
});
//// Neoffice — the dot's colour: the CloudPRNT printer's state, else QZ Tray's connection (maintenance#1935).
const printerDotClass = computed(() => {
	if (props.cloudPrinterStatus) return CLOUD_PRINTER_STATES[props.cloudPrinterStatus]?.dot || "bg-gray-400";
	return props.qzConnected ? "bg-green-500" : "bg-red-500";
});

// Cache status helpers
function getCacheIconColor() {
	if (!props.cacheStats || props.cacheStats.items === 0) {
		return "text-red-600"; // Red: No cache
	}
	if (props.cacheSyncing) {
		return "text-orange-600"; // Orange: Syncing in progress
	}
	return "text-green-600"; // Green: Cache ready
}

function getCacheStatus() {
	if (!props.cacheStats || props.cacheStats.items === 0) {
		return __("Empty");
	}
	if (props.cacheSyncing) {
		return __("Syncing");
	}
	return __("Ready");
}

function getCacheStatusBadgeClass() {
	if (!props.cacheStats || props.cacheStats.items === 0) {
		return "bg-red-500/20 text-red-300";
	}
	if (props.cacheSyncing) {
		return "bg-orange-500/20 text-orange-300";
	}
	return "bg-green-500/20 text-green-300";
}

function formatLastSync() {
	if (!props.cacheStats?.lastSync) {
		return __("Never");
	}
	const date = new Date(props.cacheStats.lastSync);
	return date.toLocaleTimeString(DEFAULT_LOCALE, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function getCacheAriaLabel() {
	if (!props.cacheStats || props.cacheStats.items === 0) {
		return __("Cache empty");
	}
	if (props.cacheSyncing) {
		return __("Cache syncing");
	}
	return __("Cache ready");
}

function formatNumber(num) {
	//// Neoffice — Biome quote style only, no behaviour change (458d81a9, 2026-03-20).
	if (!num) return "0";
	return num.toLocaleString();
}

function formatCompactNumber(num) {
	//// Neoffice — Biome quote style only, no behaviour change (458d81a9, 2026-03-20).
	if (!num) return "0";
	if (num >= 1000) {
		//// Neoffice — Biome quote style only, no behaviour change (458d81a9, 2026-03-20).
		return (num / 1000).toFixed(num >= 10000 ? 0 : 1) + "K";
	}
	return num.toString();
}

// SVG Path Icons
const timeIcon = "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z";
const shiftIcon =
	"M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z";
const printerIcon =
	"M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z";
const refreshIcon =
	"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15";
//// Neoffice — a cash drawer: a box with an open tray and a handle (maintenance#1935).
const drawerIcon = "M3 10h18v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-9zm2-5h14l2 5H3l2-5zm5 9h4";
</script>
