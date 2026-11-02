//// Neoffice — added file (no upstream equivalent). The device's choice to fold the courses that are all delivered in the cart of a table's order (NeoResto lot 1, Daniel, 01.11), shared by
//// the cart that reads it and the switch in its header that changes it, and kept on the device (utils/foldDelivered holds the default and the storage).
import { ref } from "vue"
import { readFoldDelivered, saveFoldDelivered } from "@/utils/foldDelivered"

// One value for the whole page: the cart and its switch never disagree
const foldDelivered = ref(readFoldDelivered())

/** @returns {{ foldDelivered: import("vue").Ref<boolean>, setFoldDelivered: (value: boolean) => void }} */
export function useFoldDelivered() {
	function setFoldDelivered(value) {
		foldDelivered.value = Boolean(value)
		saveFoldDelivered(foldDelivered.value)
	}
	return { foldDelivered, setFoldDelivered }
}
