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
	const isEnabled = computed(() => posSettingsStore.settings.enable_restaurant_mode)
	const defaultArea = computed(() => posSettingsStore.settings.default_restaurant_area)

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
				const { areas: fetchedAreas, tables: fetchedTables } = res

				areas.value = fetchedAreas || []
				tables.value = fetchedTables || []

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

	return {
		tables,
		areas,
		isEnabled,
		defaultArea,
		occupiedCountByArea,
		totalOccupiedCount,
		loadTablesAndAreas,
		fetchFromNetwork,
		updateTableStatus
	}
})
