//// Neoffice — added file (no upstream equivalent). The kitchen screen's choice to follow the order of the meal (NeoResto lot 1, Daniel, 01.11), shared by the cards that read it and the panel that
//// changes it, and kept on the device like the size of the text (utils/courseOrder holds the rule and the storage).
import { ref } from "vue"
import { readCourseOrder, saveCourseOrder } from "@/utils/courseOrder"

// One value for the whole page: a card and the settings panel never disagree
const courseOrder = ref(readCourseOrder())

/** @returns {{ courseOrder: import("vue").Ref<boolean>, setCourseOrder: (value: boolean) => void }} */
export function useCourseOrder() {
	function setCourseOrder(value) {
		courseOrder.value = Boolean(value)
		saveCourseOrder(courseOrder.value)
	}
	return { courseOrder, setCourseOrder }
}
