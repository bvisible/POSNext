import { defineStore } from "pinia"
import { ref, computed } from "vue"
import { usePOSSettingsStore } from "./posSettings"
import { db } from "../utils/offline/db"
import { logger } from "../utils/logger"
import { call } from "../utils/apiWrapper"

const log = logger.create("RestaurantStore")

export const useRestaurantStore = defineStore("restaurant", () => {
	const posSettingsStore = usePOSSettingsStore()

	// State
	const tables = ref([])
	const areas = ref([])
	const activeCards = ref([])
	const floorStations = ref([])
	const stationItemsMap = ref({})
	const stationGroupsMap = ref({})
	const modifierGroups = ref([])
	const activeMenus = ref([])
	const takeawayOrders = ref([])
	const restaurantSettings = ref({ opening_hours: [], enable_tips: false, auto_detect_tip: true, tip_item: null, enable_runner: true, enable_takeaway: false, takeaway_card: null })
	const restaurantStatus = ref({ isOpen: true, currentSlot: null, hasActiveCards: true, warning: null })
	const isEnabled = computed(() => posSettingsStore.settings.enable_restaurant_mode)
	const defaultArea = computed(() => posSettingsStore.settings.default_restaurant_area)
	const hasCardWarning = computed(() => restaurantStatus.value.isOpen && !restaurantStatus.value.hasActiveCards)
	let statusInterval = null

	// Computed - Occupied counts by area
	const occupiedCountByArea = computed(() => {
		const counts = {}
		areas.value.forEach(area => {
			counts[area.area_name] = tables.value.filter(
				t => t.area === area.name && t.status === 'Occupied'
			).length
		})
		return counts
	})

	const totalOccupiedCount = computed(() => {
		return tables.value.filter(t => t.status === 'Occupied').length
	})

	// Actions
	async function loadTablesAndAreas() {
		if (!isEnabled.value) return

		try {
			log.info("Loading tables and areas from local cache")
			areas.value = await db.restaurant_areas.toArray()
			tables.value = await db.restaurant_tables.toArray()
		} catch (error) {
			log.error("Failed to load tables from cache:", error)
		}
	}

	async function fetchFromNetwork() {
		if (!isEnabled.value) return

		try {
			log.info("Fetching tables from network")
			const res = await call("pos_next.api.restaurant.get_tables")

			if (res) {
				const { areas: fetchedAreas, tables: fetchedTables, stations: fetchedStations } = res

				areas.value = fetchedAreas || []
				tables.value = fetchedTables || []
				floorStations.value = fetchedStations || []

				await db.transaction("rw", db.restaurant_areas, db.restaurant_tables, async () => {
					await db.restaurant_areas.clear()
					if (areas.value.length) await db.restaurant_areas.bulkPut(areas.value)

					await db.restaurant_tables.clear()
					if (tables.value.length) await db.restaurant_tables.bulkPut(tables.value)
				})
			}
		} catch (error) {
			log.error("Failed to fetch tables from network:", error)
		}

		await fetchStationItemsMap()
		await fetchModifierGroups()
		await fetchActiveMenus()
		await fetchActiveCards()
		await fetchRestaurantSettings()
	}

	async function fetchActiveCards() {
		if (!isEnabled.value) return
		try {
			const res = await call("pos_next.api.restaurant.get_active_cards")
			if (res) activeCards.value = res
		} catch (error) {
			log.error("Failed to fetch active cards:", error)
		}
	}

	async function updateTableStatus(tableName, status) {
		try {
			const table = tables.value.find(t => t.name === tableName)
			if (table) {
				table.status = status
				await db.restaurant_tables.put(table)
			}

			if (navigator.onLine) {
				await call("pos_next.api.restaurant.update_table_status", {
					table_name: tableName,
					status
				})
			}
		} catch (error) {
			log.error(`Failed to update status for table ${tableName}:`, error)
		}
	}

	async function updateTablePosition(tableName, pos_x, pos_y, width, height) {
		try {
			const table = tables.value.find(t => t.name === tableName)
			if (table) {
				table.pos_x = pos_x
				table.pos_y = pos_y
				table.width = width
				table.height = height
				await db.restaurant_tables.put(table)
			}
		} catch (error) {
			log.error(`Failed to update position for table ${tableName}:`, error)
		}
	}

	async function saveAllPositions() {
		try {
			const positions = tables.value.map(t => ({
				name: t.name,
				pos_x: t.pos_x,
				pos_y: t.pos_y,
				width: t.width,
				height: t.height
			}))

			await call("pos_next.api.restaurant.save_table_positions", {
				positions: JSON.stringify(positions)
			})
		} catch (error) {
			log.error("Failed to save table positions:", error)
			throw error
		}
	}

	async function addTable(tableData) {
		try {
			const newTable = await call("pos_next.api.restaurant.create_table", tableData)
			if (newTable) {
				tables.value.push(newTable)
				await db.restaurant_tables.put(newTable)
				await fetchFromNetwork()
			}
		} catch (error) {
			log.error("Failed to add table:", error)
			throw error
		}
	}

	async function fetchStationItemsMap() {
		try {
			const res = await call("pos_next.api.restaurant.get_station_items_map")
			if (res) {
				if (res.items && res.groups) {
					stationItemsMap.value = res.items
					stationGroupsMap.value = res.groups
				} else {
					// Backward compat: old flat format
					stationItemsMap.value = res
					stationGroupsMap.value = {}
				}
			}
		} catch (error) {
			log.error("Failed to fetch station items map:", error)
		}
	}

	async function fetchModifierGroups() {
		try {
			const res = await call("pos_next.api.restaurant.get_all_product_option_groups")
			if (res) modifierGroups.value = res
		} catch (error) {
			log.error("Failed to fetch modifier groups:", error)
		}
	}

	async function fetchActiveMenus() {
		try {
			const res = await call("pos_next.api.restaurant.get_active_menus")
			if (res) activeMenus.value = res
		} catch (error) {
			log.error("Failed to fetch active menus:", error)
		}
	}

	async function updateStationPosition(stationName, pos_x, pos_y, width, height) {
		try {
			const station = floorStations.value.find(s => s.name === stationName)
			if (station) {
				station.pos_x = pos_x
				station.pos_y = pos_y
				station.width = width
				station.height = height
			}
		} catch (error) {
			log.error(`Failed to update position for station ${stationName}:`, error)
		}
	}

	async function saveStationPositions() {
		try {
			const positions = floorStations.value.map(s => ({
				name: s.name,
				pos_x: s.pos_x,
				pos_y: s.pos_y,
				width: s.width,
				height: s.height
			}))
			await call("pos_next.api.restaurant.save_station_positions", {
				positions: JSON.stringify(positions)
			})
		} catch (error) {
			log.error("Failed to save station positions:", error)
			throw error
		}
	}

	async function reorderAreas(orderedNames) {
		try {
			await call("pos_next.api.restaurant.reorder_areas", { order: JSON.stringify(orderedNames) })
			await fetchFromNetwork()
		} catch (error) {
			log.error("Failed to reorder areas:", error)
		}
	}

	async function createArea(areaName) {
		const res = await call("pos_next.api.restaurant.create_area", { area_name: areaName })
		if (res) await fetchFromNetwork()
		return res
	}

	async function renameArea(name, newName) {
		await call("pos_next.api.restaurant.rename_area", { name, new_name: newName })
		await fetchFromNetwork()
	}

	async function deleteArea(name) {
		await call("pos_next.api.restaurant.delete_area", { name })
		await fetchFromNetwork()
	}

	async function fetchRestaurantSettings() {
		try {
			const res = await call("pos_next.api.restaurant.get_restaurant_settings")
			if (res) {
				restaurantSettings.value = res
				restaurantStatus.value = {
					isOpen: res.is_open !== false,
					currentSlot: res.current_slot || null,
					hasActiveCards: true,
					warning: null,
				}
			}
		} catch (error) {
			log.error("Failed to fetch restaurant settings:", error)
		}
	}

	async function saveRestaurantSettings(openingHours) {
		try {
			await call("pos_next.api.restaurant.save_restaurant_settings", {
				opening_hours: JSON.stringify(openingHours)
			})
			await fetchRestaurantSettings()
		} catch (error) {
			log.error("Failed to save restaurant settings:", error)
			throw error
		}
	}

	async function fetchRestaurantStatus() {
		if (!isEnabled.value) return
		try {
			const previousSlot = restaurantStatus.value.currentSlot
			const res = await call("pos_next.api.restaurant.get_restaurant_status")
			if (res) {
				restaurantStatus.value = {
					isOpen: res.is_open !== false,
					currentSlot: res.current_slot || null,
					hasActiveCards: res.has_active_cards !== false,
					warning: res.warning || null,
				}
				// If time slot changed (e.g. Lunch → Dinner), refresh active cards
				if (previousSlot && res.current_slot !== previousSlot) {
					log.info("Time slot changed:", previousSlot, "→", res.current_slot)
					await fetchActiveCards()
				}
			}
		} catch (error) {
			log.error("Failed to fetch restaurant status:", error)
		}
	}

	function startStatusPolling() {
		if (statusInterval) return
		fetchRestaurantStatus()
		statusInterval = setInterval(fetchRestaurantStatus, 60000)
		// Start listening for realtime card/settings updates
		startRealtimeCardListeners()
	}

	let _cardRealtimeStarted = false
	function startRealtimeCardListeners() {
		if (_cardRealtimeStarted) return
		const rt = window.frappe?.realtime
		if (!rt) {
			// Retry after 2s if realtime not ready yet
			setTimeout(startRealtimeCardListeners, 2000)
			return
		}
		let debounce = null
		const refresh = () => {
			clearTimeout(debounce)
			debounce = setTimeout(() => {
				log.info("Realtime card update → refreshing active cards")
				fetchActiveCards()
			}, 500)
		}
		rt.on("pos_card_updated", refresh)
		rt.on("pos_restaurant_settings_updated", () => {
			clearTimeout(debounce)
			debounce = setTimeout(() => {
				log.info("Realtime settings update → refreshing cards + settings")
				fetchActiveCards()
				fetchRestaurantSettings()
			}, 500)
		})
		_cardRealtimeStarted = true
		log.info("Realtime card listeners started")
	}

	function stopStatusPolling() {
		if (statusInterval) {
			clearInterval(statusInterval)
			statusInterval = null
		}
	}

	function getStationForItem(itemCode, itemGroup) {
		// Priority 1: individual item match
		const itemMatch = stationItemsMap.value[itemCode]
		if (itemMatch) return itemMatch
		// Priority 2: item group match
		if (itemGroup) {
			const groupMatch = stationGroupsMap.value[itemGroup]
			if (groupMatch) return groupMatch
		}
		return null
	}

	function getModifiersForItem(itemCode, itemGroup) {
		return modifierGroups.value.filter(g =>
			g.apply_to_all_items
			|| g.applicable_items.includes(itemCode)
			|| (itemGroup && g.applicable_item_groups?.includes(itemGroup))
		)
	}

	async function fetchTakeawayOrders() {
		try {
			const res = await call("pos_next.api.restaurant.get_takeaway_orders", { _: Date.now() })
			if (res) takeawayOrders.value = res
		} catch (error) {
			console.error("Failed to fetch takeaway orders:", error)
		}
	}

	const runnerEnabled = computed(() => restaurantSettings.value.enable_runner !== false && restaurantSettings.value.enable_runner !== 0)
	const takeawayEnabled = computed(() => !!restaurantSettings.value.enable_takeaway)
	const takeawayCard = computed(() => restaurantSettings.value.takeaway_card)
	const tipsEnabled = computed(() => !!restaurantSettings.value.enable_tips)
	const autoDetectTip = computed(() => restaurantSettings.value.auto_detect_tip !== false)
	const tipItem = computed(() => restaurantSettings.value.tip_item)

	return {
		tables,
		areas,
		floorStations,
		stationItemsMap,
		stationGroupsMap,
		modifierGroups,
		activeMenus,
		activeCards,
		restaurantSettings,
		restaurantStatus,
		hasCardWarning,
		runnerEnabled,
		takeawayEnabled,
		takeawayCard,
		takeawayOrders,
		fetchTakeawayOrders,
		tipsEnabled,
		autoDetectTip,
		tipItem,
		isEnabled,
		defaultArea,
		occupiedCountByArea,
		totalOccupiedCount,
		loadTablesAndAreas,
		fetchFromNetwork,
		updateTableStatus,
		updateTablePosition,
		saveAllPositions,
		addTable,
		updateStationPosition,
		saveStationPositions,
		reorderAreas,
		createArea,
		renameArea,
		deleteArea,
		fetchStationItemsMap,
		getStationForItem,
		fetchModifierGroups,
		getModifiersForItem,
		fetchActiveMenus,
		fetchActiveCards,
		fetchRestaurantSettings,
		saveRestaurantSettings,
		fetchRestaurantStatus,
		startStatusPolling,
		stopStatusPolling
	}
})
