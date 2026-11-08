//// Neoffice — added file (no upstream equivalent). Whether this till is the phone of a waiter, which keeps the waiter inside the app (utils/leaveTheApp.js; the product owner, 08.11.2026).
import { computed } from "vue"
import { useTablesView } from "@/composables/useTablesView"
import { useRestaurantStore } from "@/stores/restaurant"
import { isTheWaitersPhone } from "@/utils/leaveTheApp"

/**
 * @returns {{ locked: import("vue").ComputedRef<boolean>, mayLeave: import("vue").ComputedRef<boolean> }} `locked`: the phone of a waiter; `mayLeave`: the way out to the back office is there
 */
export function useWaiterLock() {
	const restaurantStore = useRestaurantStore()
	const { isPhone } = useTablesView()
	// Locked until the till has told what the user may do: a phone that has not heard yet is a waiter's
	const locked = computed(() =>
		isTheWaitersPhone({
			restaurant: Boolean(restaurantStore.isEnabled),
			phone: isPhone.value,
			canManageFloor: Boolean(restaurantStore.can?.manage_floor),
		}),
	)
	return { locked, mayLeave: computed(() => !locked.value) }
}
