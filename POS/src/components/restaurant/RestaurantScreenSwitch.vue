<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The switch between the restaurant's screens, the same on each of them (NeoResto lot 1, task 38a-2, ruling 132): -->
	<!-- //// Preparation, Runner, Floor plan, the current one lit. It goes to the other screen with the filters the user has on (the room, the station, the restaurant of the -->
	<!-- //// address), so that the bar's kitchen leads to the runner of the bar. It offers only the screens the session may see (utils/restaurantScreens) and is not drawn at -->
	<!-- //// all when there is one: a tablet paired for its screen has nothing to choose, and a switch of one button is a button that does nothing. -->
	<SegmentedControl
		v-if="options.length > 1"
		navigation
		name="screen"
		:label="__('Screen')"
		:options="options"
		:model-value="current"
		@update:model-value="go"
	/>
</template>

<script setup>
import { computed, getCurrentInstance } from "vue"
import SegmentedControl from "@/components/restaurant/SegmentedControl.vue"
import {
	SCREEN_PLAN,
	SCREEN_PREPARATION,
	SCREEN_RUNNER,
	screenLocation,
	screensToChooseFrom,
} from "@/utils/restaurantScreens"

/**
 * current:       the screen this page is (SCREEN_PREPARATION or SCREEN_RUNNER)
 * deskSession:   a desk user's session (a tablet's own account keeps its own screen only)
 * runnerEnabled: the restaurant's own runner switch; off, the runner is not offered
 * filters:       what rides along to the next screen, `{ restaurant, station, room }`
 */
const props = defineProps({
	current: { type: String, required: true },
	deskSession: { type: Boolean, default: true },
	runnerEnabled: { type: Boolean, default: true },
	filters: { type: Object, default: () => ({}) },
})

// One literal `__()` per word, each under its context: the catalogue extraction reads them from the source, and the bare words are the whole site's
const LABELS = {
	[SCREEN_PREPARATION]: () => __("Preparation", null, "Restaurant screen"),
	[SCREEN_RUNNER]: () => __("Runner", null, "Restaurant screen"),
	[SCREEN_PLAN]: () => __("Floor plan", null, "Restaurant screen"),
}
const options = computed(() =>
	screensToChooseFrom({
		current: props.current,
		deskSession: props.deskSession,
		runnerEnabled: props.runnerEnabled,
	}).map((id) => ({ id, label: LABELS[id]() })),
)

// The router is the app's: a page opened on its own (a test, a harness) has none, and a press then does nothing
const instance = getCurrentInstance()
function go(screen) {
	if (screen === props.current) return
	const router = instance?.proxy?.$router
	router?.push(screenLocation(screen, props.filters))
}
</script>
