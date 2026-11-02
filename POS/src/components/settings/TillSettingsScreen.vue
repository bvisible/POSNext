<!-- //// Neoffice — added file (no upstream equivalent). The till's settings screen, drawn from ONE list of settings -->
<!-- //// (NeoResto lot 1, task 13; product owner, 30.10.2026: « the till manager does not leave the till »): eleven -->
<!-- //// tabs in a rail (the restaurant's four on a restaurant till only, then the till's seven), every setting with -->
<!-- //// its help behind the lightbulb, a setting that depends on another shown greyed while that one is off, and one -->
<!-- //// « Save » for the whole screen. The list, its tabs, help texts and rules are served by pos_next.till_settings -->
<!-- //// (registry.py is the list); what lives on this computer (stock sync, the QZ Tray printer) and on the cloudprnt -->
<!-- //// printer rows is saved by the same button. Only the till manager opens it (Admin, Nexus POS Manager); the -->
<!-- //// restaurant's manager opens the restaurant's tabs of a restaurant till. Upstream's POSSettings.vue, which wrote -->
<!-- //// each field by hand, now only opens this screen. -->
<template>
	<!-- //// Neoffice — the screen of the list: a rail of tabs, the groups of the open tab in columns, one Save. -->
	<Transition name="fade">
		<div
			v-if="show"
			class="fixed inset-0 z-[300] bg-black/50"
			data-testid="till-settings"
			@click.self="close"
		>
			<!-- A tablet (narrower than 1280 px) gives the screen all its height and width but a margin of 8 px -->
			<div class="fixed inset-0 flex items-center justify-center p-2 min-[1280px]:p-4">
				<div
					role="dialog"
					aria-modal="true"
					:aria-label="__('Till settings')"
					class="flex h-[min(724px,calc(100vh-24px))] w-[min(1300px,calc(100vw-24px))] flex-col overflow-hidden rounded-[20px] bg-white shadow-2xl max-[1279px]:h-[calc(100vh-16px)] max-[1279px]:w-[calc(100vw-16px)]"
				>
					<!-- //// Neoffice — the head: the till (and its restaurant), who the screen is for, Cancel and Save. -->
					<header
						class="flex h-[70px] flex-none items-center justify-between gap-4 border-b border-pos-line px-6 max-[1279px]:h-[60px]"
					>
						<div class="relative min-w-0">
							<h2 class="font-display text-[30px] leading-none text-pos-ink">
								{{ __("Till settings") }}
							</h2>
							<div class="mt-[5px] flex min-w-0 items-center gap-2 text-[13px] text-pos-muted">
								<span class="truncate">{{ subtitle }}</span>
								<span v-if="screen" class="flex flex-none items-center gap-1.5 italic">
									<span aria-hidden="true">·</span>
									{{ screen.can.till ? __("Till manager") : __("Restaurant manager") }}
									<HelpBulb v-model:open="roleHelpOpen" :text="roleHelp" />
								</span>
							</div>
							<p
								v-if="roleHelpOpen"
								class="absolute left-0 top-full z-10 mt-1.5 w-[330px] rounded-lg border-l-[3px] border-blue-400 bg-pos-action-soft px-2.5 py-2 text-[12.5px] leading-[1.45] text-pos-ink shadow-lg"
							>
								{{ roleHelp }}
							</p>
						</div>
						<div class="flex flex-none items-center gap-2">
							<button
								type="button"
								class="h-[38px] rounded-[10px] border border-pos-line bg-white px-4 text-[14px] font-semibold text-pos-ink hover:bg-pos-panel"
								@click="close"
							>
								{{ __("Cancel") }}
							</button>
							<button
								type="button"
								data-action="save"
								class="h-[38px] rounded-[10px] bg-pos-ink px-4 text-[14px] font-bold text-pos-surface hover:opacity-90 disabled:cursor-default disabled:opacity-40"
								:disabled="!canSave"
								@click="save"
							>
								{{ saving ? __("Saving...") : __("Save") }}
							</button>
							<button
								type="button"
								class="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-[20px] text-pos-muted hover:bg-pos-panel"
								:aria-label="__('Close')"
								@click="close"
							>
								×
							</button>
						</div>
					</header>

					<div class="flex min-h-0 flex-1">
						<!-- //// Neoffice — the rail: the restaurant's tabs first on a restaurant till, then the till's. -->
						<nav
							class="flex w-[214px] flex-none flex-col gap-[3px] overflow-y-auto border-e border-pos-line bg-pos-panel px-2.5 py-3"
							role="tablist"
							:aria-label="__('Tabs of the settings')"
						>
							<template v-for="(section, index) in sections" :key="section.key">
								<div
									class="px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-pos-muted"
									:class="index ? 'mt-2' : ''"
								>
									{{ section.key === "restaurant" ? __("Restaurant") : __("Till") }}
								</div>
								<button
									v-for="tab in section.tabs"
									:key="tab.key"
									type="button"
									role="tab"
									class="flex items-center justify-between gap-2 rounded-[10px] px-3 py-[9px] text-start text-[14.5px] font-semibold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-400/50"
									:class="
										activeTab === tab.key
											? 'bg-pos-ink text-pos-surface'
											: 'text-pos-muted hover:bg-pos-line'
									"
									:aria-selected="activeTab === tab.key ? 'true' : 'false'"
									:data-tab="tab.key"
									@click="activeTab = tab.key"
								>
									<span>{{ tab.label }}</span>
								</button>
							</template>
						</nav>

						<!-- //// Neoffice — the body: the groups of the open tab, in columns (two on a tablet). -->
						<div
							ref="body"
							class="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-[22px] pb-2.5 pt-[18px] max-[1279px]:pt-3.5"
						>
							<div v-if="loading" class="flex h-full items-center justify-center text-[14px] text-pos-muted">
								{{ __("Loading settings...") }}
							</div>
							<div
								v-else-if="loadError"
								class="flex h-full flex-col items-center justify-center gap-3 text-center text-[14px] text-pos-muted"
							>
								<p>{{ loadError }}</p>
								<button
									type="button"
									class="h-[38px] rounded-[10px] border border-pos-line bg-white px-4 font-semibold text-pos-ink"
									@click="load"
								>
									{{ __("Try again") }}
								</button>
							</div>
							<div
								v-else-if="screen"
								class="grid content-start gap-6"
								:style="{ gridTemplateColumns: columnTemplate }"
								:data-panel="activeTab"
							>
								<div v-for="(column, columnIndex) in columns" :key="columnIndex" class="min-w-0">
									<section
										v-for="group in column"
										:key="group.key"
										class="mb-4 flex flex-col gap-[7px]"
										:data-group="group.key"
									>
										<h3
											class="mb-[3px] flex flex-wrap items-center gap-2 border-b border-pos-line pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-pos-muted"
										>
											{{ group.label }}
											<HelpBulb
												v-if="titleCarriesHelp(group)"
												v-model:open="groupHelp[group.key]"
												:text="group.settings[0].help"
											/>
											<span
												v-if="badgeOf(group)"
												class="rounded-[9px] px-[7px] py-px text-[10.5px] font-bold normal-case leading-4 tracking-normal"
												:class="badgeOf(group).classes"
											>
												{{ badgeOf(group).label }}
											</span>
										</h3>
										<p
											v-if="titleCarriesHelp(group) && groupHelp[group.key]"
											class="rounded-lg border-l-[3px] border-blue-400 bg-pos-action-soft px-2.5 py-2 text-[12.5px] leading-[1.45] text-pos-ink"
										>
											{{ group.settings[0].help }}
										</p>

										<template v-for="block in blocksOf(group)" :key="block.key">
											<!-- The Star CloudPRNT printing, drawn by its own component -->
											<CloudPrntTillSettings
												v-if="block.kind === 'cloudprnt'"
												v-model="printingDraft"
												:part="block.part"
												:definitions="settingsByKey"
											/>

											<!-- The opening hours of the restaurant, with the card of each slot -->
											<div v-else-if="block.setting.key === 'opening_hours'" data-setting="opening_hours">
												<OpeningHoursEditor
													v-model="draft.opening_hours"
													:cards="cardChoices"
													:class="block.setting.editable ? '' : 'pointer-events-none opacity-[0.42]'"
												/>
											</div>

											<!-- The cards of the restaurant and their slots -->
											<!-- A card opens in the till's own card editor (emitted to the till), for whoever may edit the cards there -->
											<div
												v-else-if="block.setting.key === 'restaurant_cards'"
												class="flex flex-col"
												data-setting="restaurant_cards"
											>
												<div
													v-for="card in cardChoices"
													:key="card.name"
													class="flex items-center justify-between gap-2.5 border-b border-pos-line py-[7px]"
												>
													<div class="min-w-0">
														<b class="block truncate text-[13.5px] text-pos-ink">{{ card.card_name }}</b>
														<small class="block text-[12px] text-pos-muted">{{ slotsOf(card.name) }}</small>
													</div>
													<button
														v-if="restaurantStore.can?.manage_cards"
														type="button"
														class="whitespace-nowrap text-[12.5px] font-bold text-blue-700 hover:underline"
														:data-card="card.name"
														@click="emit('open-card', card.name)"
													>
														{{ __("Edit") }}
													</button>
												</div>
												<p class="pt-2 text-[12.5px] leading-[1.45] text-pos-muted">
													{{ __("The permanent card is served at all hours: it takes no time slot.") }}
												</p>
											</div>

											<!-- //// Neoffice — the Listen buttons of the kitchen alerts: they play the sound and the volume chosen in the lines above (NeoResto lot 1, Daniel, 01.11) -->
											<div
												v-else-if="block.setting.key === 'kitchen_alert_listen'"
												:class="greyed(block.setting) ? 'opacity-[0.42]' : ''"
												data-setting="kitchen_alert_listen"
											>
												<KitchenAlertListen
													:next-course-sound="draft.kitchen_next_course_sound"
													:runner-sound="draft.runner_ready_sound"
													:volume="draft.kitchen_alert_volume"
												/>
											</div>

											<!-- //// Neoffice — the Listen button of the floor alerts: it plays the till's own sound (a guest orders or pays from the QR code of a table) at the volume of the kitchen alerts (NeoResto lot 1, Daniel, 01.11) -->
											<div
												v-else-if="block.setting.key === 'floor_alert_listen'"
												:class="greyed(block.setting) ? 'opacity-[0.42]' : ''"
												data-setting="floor_alert_listen"
											>
												<KitchenAlertListen
													which="floor"
													:guest-sound="draft.floor_guest_sound"
													:volume="draft.kitchen_alert_volume"
												/>
											</div>

											<!-- Whether the tip item and account are ready -->
											<div
												v-else-if="block.setting.key === 'tip_status'"
												:class="['ml-[9px] border-l-2 border-pos-line pl-[19px]', greyed(block.setting) ? 'opacity-[0.42]' : '']"
												data-setting="tip_status"
											>
												<span
													class="inline-flex items-center gap-[7px] rounded-[9px] px-2.5 py-[5px] text-[12.5px] font-semibold"
													:class="tipsReady ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'"
												>
													<span class="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true"></span>
													{{
														tipsReady
															? __("Tip item and transit account ready")
															: __("Save to auto-create the TIP item and transit account (2211)")
													}}
												</span>
											</div>

											<!-- The state of the stock sync of this computer -->
											<div
												v-else-if="block.setting.key === 'stock_sync_status'"
												:class="['ml-[9px] border-l-2 border-pos-line pl-[19px]', greyed(block.setting) ? 'opacity-[0.42]' : '']"
												data-setting="stock_sync_status"
											>
												<span
													class="inline-flex items-center gap-[7px] rounded-[9px] px-2.5 py-[5px] text-[12.5px] font-semibold"
													:class="stockSyncStatus.enabled ? 'bg-green-50 text-green-700' : 'bg-pos-panel text-pos-muted'"
												>
													<span class="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true"></span>
													{{
														stockSyncStatus.enabled
															? __("Running · {0} items followed · {1}", [
																	stockSyncStatus.itemCount || 0,
																	formatSyncTime(stockSyncStatus.lastSync),
															  ])
															: __("Stopped")
													}}
												</span>
											</div>

											<!-- A pointer to a setting kept at the office -->
											<p
												v-else-if="block.setting.kind === 'info' && block.setting.help"
												class="flex gap-2 py-1 text-[13px] leading-[1.45] text-pos-muted"
												:data-setting="block.setting.key"
											>
												<span class="font-bold text-blue-400" aria-hidden="true">→</span>
												{{ block.setting.help }}
											</p>

											<!-- The QZ Tray printer of this computer -->
											<div
												v-else-if="block.setting.key === 'qz_printer'"
												:class="['ml-[9px] border-l-2 border-pos-line pl-[19px]', greyed(block.setting) ? 'opacity-[0.42]' : '']"
												data-setting="qz_printer"
											>
												<div class="mb-[5px] flex flex-wrap items-center gap-1.5 text-[12.5px] text-pos-muted">
													<label for="till-setting-qz_printer">{{ block.setting.label }}</label>
													<HelpBulb v-model:open="groupHelp.qz_printer" :text="block.setting.help" />
													<span class="ms-auto text-[12px]" :class="qzConnected ? 'text-green-700' : 'text-amber-700'">
														{{
															qzConnecting
																? __("Connecting to QZ Tray...")
																: qzConnected
																? __("QZ Tray Connected")
																: __("QZ Tray Not Connected")
														}}
													</span>
												</div>
												<div class="flex items-center gap-1.5">
													<select
														id="till-setting-qz_printer"
														class="h-9 w-full min-w-0 rounded-[10px] border border-pos-line bg-white px-3 py-0 text-[14px] text-pos-ink"
														:value="draft.qz_printer || ''"
														:disabled="greyed(block.setting)"
														@change="draft.qz_printer = $event.target.value"
													>
														<option value="">{{ __("Choose a printer") }}</option>
														<option v-for="option in qzPrinterOptions" :key="option.value" :value="option.value">
															{{ option.label }}
														</option>
													</select>
													<button
														type="button"
														class="h-9 flex-none rounded-[10px] border border-pos-line bg-white px-2.5 text-[12.5px] font-semibold text-pos-ink"
														:disabled="greyed(block.setting) || loadingPrinters"
														@click="qzConnected ? handleRefreshPrinters() : handleQzConnect()"
													>
														{{ qzConnected ? __("Refresh") : __("Retry") }}
													</button>
												</div>
												<p
													v-if="groupHelp.qz_printer"
													class="mb-1 mt-1.5 rounded-lg border-l-[3px] border-blue-400 bg-pos-action-soft px-2.5 py-2 text-[12.5px] leading-[1.45] text-pos-ink"
												>
													{{ block.setting.help }}
												</p>
											</div>

											<!-- The signing certificate of QZ Tray on this computer -->
											<div
												v-else-if="block.setting.key === 'qz_certificate'"
												:class="['ml-[9px] border-l-2 border-pos-line pl-[19px]', greyed(block.setting) ? 'opacity-[0.42]' : '']"
												data-setting="qz_certificate"
											>
												<p class="mb-1.5 text-[12.5px] text-pos-muted">
													{{ block.setting.label }} ·
													{{
														qzCertStatus === "trusted"
															? __("Installed")
															: qzCertStatus === "untrusted"
															? __("Not Installed")
															: __("Checking...")
													}}
												</p>
												<div class="flex flex-wrap gap-2">
													<button
														v-if="qzCertStatus !== 'trusted'"
														type="button"
														class="h-8 rounded-[10px] border border-pos-line bg-white px-3 text-[12.5px] font-semibold text-pos-ink"
														:disabled="greyed(block.setting) || qzCertLoading"
														@click="handleSetupQzCertificate"
													>
														{{ __("Generate Certificate") }}
													</button>
													<button
														v-if="qzCertReady"
														type="button"
														class="h-8 rounded-[10px] border border-pos-line bg-white px-3 text-[12.5px] font-semibold text-pos-ink"
														:disabled="greyed(block.setting)"
														@click="handleDownloadQzCertificate"
													>
														{{ __("Download Certificate") }}
													</button>
												</div>
											</div>

											<!-- Every other setting: a box, a number, a choice, a list, a table, a text -->
											<TillSettingField
												v-else
												v-model="draft[block.setting.key]"
												:setting="block.setting"
												:choices="screen.choices[block.setting.key] || []"
												:greyed="greyed(block.setting)"
												:locked="!block.setting.editable"
											/>
										</template>
									</section>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup>
//// Neoffice — the screen reads the list and the values from the server, keeps the changes in a draft and saves
//// what changed in one go: the till's documents through pos_next.till_settings.api (one transaction), then the
//// cloudprnt printing through that app, then this computer's own settings. What the till must take again after a
//// save (its settings, its POS Profile, its items, its restaurant) is said by the list (`applies`).
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue"
import { call } from "frappe-ui"
import CloudPrntTillSettings from "@/components/settings/CloudPrntTillSettings.vue"
import HelpBulb from "@/components/settings/HelpBulb.vue"
import KitchenAlertListen from "@/components/settings/KitchenAlertListen.vue"
import OpeningHoursEditor from "@/components/settings/OpeningHoursEditor.vue"
import TillSettingField from "@/components/settings/TillSettingField.vue"
import {
	changedValues,
	columnsOf,
	conditionsHold,
	effectsOf,
	openingTab,
	railSections,
	untickExcluded,
	withinBounds,
} from "@/components/settings/tillSettingsForm"
import { usePOSEvents } from "@/composables/usePOSEvents"
import { useQzTray } from "@/composables/useQzTray"
import { useToast } from "@/composables/useToast"
import { useCloudPrntStore } from "@/stores/cloudPrnt"
import { usePOSShiftStore } from "@/stores/posShift"
import { useRestaurantStore } from "@/stores/restaurant"
import { formatTime } from "@/utils/currency"
import { logger } from "@/utils/logger"
import { offlineWorker } from "@/utils/offline/workerClient"
import { savePrinterName } from "@/utils/qzTray"

const log = logger.create("POSSettings")
const { detectSettingsChanges, emit: emitEvent } = usePOSEvents()
const { showSuccess, showError } = useToast()

const props = defineProps({
	modelValue: Boolean,
	posProfile: String,
	//// Neoffice — kept for the callers: the warehouse is now read with the till's other settings.
	currentWarehouse: String,
	//// Neoffice — lets a caller open the screen on one tab: the card editor's « edit the schedule » opens the
	//// hours (6b38498b, 2026-03-27; the tab is "hours" since NeoResto lot 1, task 13).
	initialTab: { type: String, default: "" },
})

// open-card: the till opens that card in its own card editor, above this screen (which keeps its changes)
const emit = defineEmits(["update:modelValue", "open-card"])

const SAVE = "pos_next.till_settings.api.save_till_settings"
const READ = "pos_next.till_settings.api.get_till_settings"
// The keys of the settings this computer keeps (browser storage), saved by the screen itself. The stock refresh is
// not one of them: it is always on (ruling 84), and the screen only shows its state
const DEVICE_KEYS = ["qz_printer"]
// The column widths of a tab: three equal columns, the hours wide beside their cards
const COLUMN_TEMPLATES = {
	hours: "minmax(0,1fr) 300px",
	online: "minmax(0,1.2fr) minmax(0,1fr)",
}
// The width of the body (px) under which a tab takes two columns: three of them need about 330 px each (the tiles
// per row, the drawer's three choices, a printer's name beside its Retry): 1366 px screens keep three, 1280 px and
// tablets (1180, 1024) take two
const NARROW_BODY = 1020

const show = ref(props.modelValue)
const screen = ref(null)
const loading = ref(false)
const loadError = ref("")
const saving = ref(false)
const activeTab = ref("")
// The values as read (the till's documents, then this computer's) and as edited
const read = ref({})
const draft = reactive({})
// The cloudprnt printing as read, and as edited
const printingRead = ref(null)
const printingDraft = ref({ receipt_printer: null, auto_print: 0, open_drawer: "Cash payments", stations: {} })
const roleHelpOpen = ref(false)
const groupHelp = reactive({})

const restaurantStore = useRestaurantStore()
const shiftStore = usePOSShiftStore()
const cloudPrntStore = useCloudPrntStore()
const {
	qzConnected,
	qzConnecting,
	qzCertStatus,
	selectedPrinter,
	loadingPrinters,
	printerOptions: qzPrinterOptions,
	certLoading: qzCertLoading,
	certReady: qzCertReady,
	handleConnect: handleQzConnect,
	refreshPrinters: handleRefreshPrinters,
	generateCertificate: handleSetupQzCertificate,
	downloadCertificate: handleDownloadQzCertificate,
} = useQzTray()

const sections = computed(() => railSections(screen.value))
// The width of the body, followed: below NARROW_BODY (a tablet in landscape, 1180 or 1024 px wide) a tab takes two
// columns (the third column's groups go under the shorter one) and the hours one, so that nothing is cut or scrolls
// sideways
const body = ref(null)
const bodyWidth = ref(Infinity)
const narrow = computed(() => bodyWidth.value < NARROW_BODY)
const columnCount = computed(() => (narrow.value ? (activeTab.value === "hours" ? 1 : 2) : 3))
const columns = computed(() => columnsOf(screen.value, activeTab.value, columnCount.value))
const columnTemplate = computed(() => {
	if (narrow.value) return `repeat(${Math.min(columnCount.value, columns.value.length) || 1},minmax(0,1fr))`
	return COLUMN_TEMPLATES[activeTab.value] || "repeat(3,minmax(0,1fr))"
})
let bodyObserver = null
watch(body, (element) => {
	bodyObserver?.disconnect()
	bodyObserver = null
	if (!element || typeof ResizeObserver === "undefined") return
	bodyObserver = new ResizeObserver(([entry]) => {
		bodyWidth.value = entry.contentRect.width
	})
	bodyObserver.observe(element)
})
const settingsByKey = computed(() =>
	Object.fromEntries((screen.value?.settings || []).map((setting) => [setting.key, setting]))
)
const subtitle = computed(() => {
	if (!screen.value) return props.posProfile || ""
	const name = screen.value.restaurant_name
	return name ? `${screen.value.pos_profile} · ${name}` : screen.value.pos_profile
})
const roleHelp = __(
	"These settings are for the managers: the till manager (roles Admin or Nexus POS Manager) sets every tab, the restaurant manager the tabs of the restaurant."
)
const cardChoices = computed(() =>
	(screen.value?.choices?.opening_hours || screen.value?.choices?.restaurant_cards || []).map((choice) => ({
		name: choice.value,
		card_name: choice.label,
	}))
)
const tipsReady = computed(() => Boolean(screen.value?.status?.tip_item && screen.value?.status?.tip_account))

// ---------------------------------------------------------------- what is shown
// Greyed while a setting it depends on is off, or while the site does not allow what it is about (the server says so:
// « Block a sale beyond the stock » where the site refuses negative stock, ruling 82)
function greyed(setting) {
	return Boolean(setting.greyed) || !conditionsHold(setting, draft)
}

// A group of one setting that is the group itself (the opening hours): its title carries the setting's bulb
function titleCarriesHelp(group) {
	return group.settings.length === 1 && group.settings[0].help && group.settings[0].label === group.label
}

// What the group's settings apply to, when it is not plain from the tab: the restaurant's tabs say it for every
// group, the till's tabs only for what is not the till's (the site, this computer)
function badgeOf(group) {
	const restaurantTab = screen.value?.tabs?.some((tab) => tab.key === group.tab && tab.section === "restaurant")
	const badges = {
		restaurant: { label: __("Whole restaurant"), classes: "bg-pos-action-soft text-blue-700" },
		till: { label: __("This till"), classes: "bg-pos-line text-pos-muted" },
		site: { label: __("Whole site"), classes: "bg-amber-50 text-amber-700" },
		device: { label: __("This device"), classes: "bg-pos-line text-pos-muted" },
		computer: { label: __("This computer"), classes: "bg-pos-line text-pos-muted" },
	}
	if (group.scope === "till" && !restaurantTab) return null
	return badges[group.scope] || null
}

// The blocks a group draws: its settings one by one, the cloudprnt ones together in their component
function blocksOf(group) {
	const blocks = []
	for (const setting of group.settings) {
		if (setting.store === "cloudprnt") {
			const part = setting.key === "station_printers" ? "stations" : "receipt"
			if (!blocks.some((block) => block.kind === "cloudprnt" && block.part === part)) {
				blocks.push({ key: `cloudprnt-${part}`, kind: "cloudprnt", part })
			}
			continue
		}
		blocks.push({ key: setting.key, kind: "setting", setting })
	}
	return blocks
}

function slotsOf(cardName) {
	const slots = (draft.opening_hours || []).filter((slot) => slot.restaurant_card === cardName)
	if (!slots.length) return __("Not assigned to any slot")
	return slots.map((slot) => `${__(slot.day_of_week)} ${slot.label || `${slot.from_time}–${slot.to_time}`}`).join(", ")
}

// ---------------------------------------------------------------- what changed
const documentChanges = computed(() => changedValues(screen.value?.settings, read.value, draft))
const deviceChanged = computed(() =>
	DEVICE_KEYS.some((key) => key in draft && JSON.stringify(draft[key]) !== JSON.stringify(read.value[key]))
)
const printingChanges = computed(() => {
	if (!printingRead.value) return null
	const before = printingRead.value
	const after = printingDraft.value
	const stations = Object.fromEntries(
		Object.entries(after.stations || {}).filter(
			([station, printer]) => (before.stationPrinters?.[station] || null) !== (printer || null)
		)
	)
	const changed =
		(before.receipt_printer || null) !== (after.receipt_printer || null) ||
		Number(before.auto_print || 0) !== Number(after.auto_print || 0) ||
		before.open_drawer !== after.open_drawer ||
		Object.keys(stations).length > 0
	if (!changed) return null
	return {
		receipt_printer: after.receipt_printer || null,
		auto_print: Number(after.auto_print || 0),
		open_drawer: after.open_drawer,
		...(Object.keys(stations).length ? { stations } : {}),
	}
})
const dirty = computed(
	() => Object.keys(documentChanges.value).length > 0 || deviceChanged.value || Boolean(printingChanges.value)
)
// A number out of its bounds is never sent: the field says so in red, and Save waits. Only a number the user may
// change: one he may not is not sent, and must never keep his own changes from being saved
const invalid = computed(() =>
	(screen.value?.settings || []).some(
		(setting) =>
			setting.editable &&
			["int", "float", "percent"].includes(setting.widget) &&
			setting.key in draft &&
			!greyed(setting) &&
			!(setting.placeholder && !draft[setting.key]) &&
			!withinBounds(setting, draft[setting.key])
	)
)
const canSave = computed(() => Boolean(screen.value) && dirty.value && !invalid.value && !saving.value)

// ---------------------------------------------------------------- reading
function clone(value) {
	return JSON.parse(JSON.stringify(value ?? null))
}

function takeAnswer(answer) {
	screen.value = answer
	read.value = { ...read.value, ...clone(answer.values || {}) }
	for (const key of Object.keys(draft)) delete draft[key]
	Object.assign(draft, clone(read.value))
}

async function load() {
	if (!props.posProfile) return
	loading.value = true
	loadError.value = ""
	try {
		read.value = { qz_printer: selectedPrinter.value || "" }
		const answer = await call(READ, { pos_profile: props.posProfile })
		takeAnswer(answer)
		activeTab.value = openingTab(answer, props.initialTab)
		if (answer.settings.some((setting) => setting.store === "cloudprnt")) await loadPrinting()
		if (draft.silent_print) handleQzConnect()
	} catch (error) {
		log.error("Error loading the till's settings:", error)
		loadError.value = error?.messages?.[0] || error?.message || __("Failed to load settings")
	} finally {
		loading.value = false
	}
}

async function loadPrinting() {
	const config = await cloudPrntStore.load(props.posProfile)
	if (!config) {
		printingRead.value = null
		return
	}
	printingRead.value = {
		receipt_printer: config.receipt_printer || null,
		auto_print: Number(config.auto_print || 0),
		open_drawer: config.open_drawer,
		stationPrinters: Object.fromEntries((config.stations || []).map((row) => [row.station, row.printer || null])),
	}
	printingDraft.value = {
		receipt_printer: printingRead.value.receipt_printer,
		auto_print: printingRead.value.auto_print,
		open_drawer: printingRead.value.open_drawer,
		stations: {},
	}
}

// ---------------------------------------------------------------- saving
async function save() {
	if (!canSave.value) return
	saving.value = true
	const values = { ...documentChanges.value }
	const before = clone(read.value)
	try {
		if (Object.keys(values).length) {
			const answer = await call(SAVE, { pos_profile: props.posProfile, values })
			const device = Object.fromEntries(DEVICE_KEYS.map((key) => [key, draft[key]]))
			takeAnswer(answer)
			Object.assign(draft, device)
			await refreshTheTill(values, before)
		}
		if (printingChanges.value) {
			try {
				await cloudPrntStore.save(printingChanges.value)
				await loadPrinting()
			} catch (error) {
				showError(
					error?.messages?.[0] || error?.message || __("The printing settings could not be saved")
				)
				return
			}
		}
		if (deviceChanged.value) await saveThisComputer()
		showSuccess(__("Settings saved successfully"))
	} catch (error) {
		log.error("Error saving the till's settings:", error)
		showError(error?.messages?.[0] || error?.message || __("Failed to save settings"))
	} finally {
		saving.value = false
	}
}

// What the till takes again once its documents are saved: its own settings (the change events of the till),
// its copy of the POS Profile, its items, its restaurant
async function refreshTheTill(values, before) {
	const keys = Object.keys(values)
	const byKey = settingsByKey.value
	const changedNow = {}
	const changedBefore = {}
	for (const key of keys) {
		// The till's settings store takes them again (`settings:changed`): its POS Settings, its warehouse, and what the
		// server derives into them from its POS Profile (the block box of its stock guard)
		if (byKey[key]?.doctype === "POS Settings" || key === "warehouse" || byKey[key]?.applies === "settings") {
			changedNow[key] = values[key]
			changedBefore[key] = before[key]
		}
	}
	if (Object.keys(changedNow).length) detectSettingsChanges(changedNow, changedBefore)

	const profile = shiftStore.currentProfile
	if (profile) {
		for (const key of keys) {
			if (byKey[key]?.doctype === "POS Profile" && !Array.isArray(values[key])) profile[key] = values[key]
		}
	}
	const effects = effectsOf(screen.value?.settings, keys)
	// What the till sells came from the server again (useCatalogueRefresh). A new warehouse changes it too (its stock,
	// the unavailable items): its own event reloads the items from the browser's copy, and the refresh waits for that
	// load before it fetches them from the server
	if (effects.has("catalogue") || "warehouse" in values) {
		emitEvent("settings:catalogue-changed", { changes: keys })
	}
	if (effects.has("restaurant")) {
		await restaurantStore.fetchRestaurantSettings()
		restaurantStore.fetchActiveCards?.()
		restaurantStore.fetchRestaurantStatus?.()
	}
}

// This computer's settings: the QZ Tray printer
async function saveThisComputer() {
	// Cleared, the printer is forgotten, in the browser's storage too: the composable keeps only a chosen name there,
	// and printing falls back to the stored one, so a printer cleared in memory came back at the next reload
	selectedPrinter.value = draft.qz_printer || ""
	savePrinterName(draft.qz_printer || "")
	read.value = { ...read.value, qz_printer: draft.qz_printer }
}

function close() {
	show.value = false
}

// ---------------------------------------------------------------- the stock sync status, while the screen is open
const stockSyncStatus = ref({ enabled: false, itemCount: 0, lastSync: null })
let statusTimer = null

async function updateStockSyncStatus() {
	try {
		stockSyncStatus.value = (await offlineWorker.getStockSyncStatus()) || stockSyncStatus.value
	} catch (error) {
		log.error("Failed to get stock sync status:", error)
	}
}

function formatSyncTime(timestamp) {
	if (!timestamp) return __("Never")
	const diff = Date.now() - timestamp
	if (diff < 60000) return __("{0}s ago", [Math.floor(diff / 1000)])
	if (diff < 3600000) return __("{0}m ago", [Math.floor(diff / 60000)])
	return formatTime(new Date(timestamp))
}

// ---------------------------------------------------------------- opening and closing
watch(
	() => props.modelValue,
	(value) => {
		show.value = value
	}
)

function opened() {
	load()
	updateStockSyncStatus()
	statusTimer = setInterval(updateStockSyncStatus, 5000)
}

watch(show, (value) => {
	emit("update:modelValue", value)
	clearInterval(statusTimer)
	statusTimer = null
	roleHelpOpen.value = false
	if (value) opened()
})

// A screen mounted open (not opened by its caller later) reads its settings too
onMounted(() => {
	if (show.value) opened()
})

// A box ticked that another cannot go with (credit sales, partial payment against the exact amount) unticks that one:
// the documents would refuse the pair, and the greyed box could not be unticked by hand. Its bulb says why.
watch(
	() => JSON.stringify(draft),
	() => untickExcluded(screen.value?.settings, draft)
)

// QZ Tray is looked for as soon as silent printing is ticked, so that its printers can be chosen
watch(
	() => draft.silent_print,
	(enabled, before) => {
		if (enabled && before !== undefined) handleQzConnect()
	}
)

onUnmounted(() => {
	clearInterval(statusTimer)
	bodyObserver?.disconnect()
})
</script>

<style scoped>
/* //// Neoffice — upstream's fade of the overlay, kept. */
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
