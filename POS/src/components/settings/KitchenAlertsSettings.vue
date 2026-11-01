<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The « Kitchen alerts » section of the till's settings (NeoRestau lot 1, Daniel, 01.11: « le son doit être dans les réglages de la caisse, et peut-être même choisir -->
	<!-- //// le son avec des choix »). It is handed the five settings of the till's POS Settings as props and says every change with a v-model event per field; the settings screen saves them with the others (update_pos_settings). -->
	<!-- //// The popup on the kitchen screen when the next course is ordered, how long it stays, the sound of that notice, the sound of the runner's screen when dishes come up ready, and the volume. Each sound has a « Listen » button. -->
	<div :class="classes.container" data-test="kitchen-alerts-settings">
		<div class="flex items-center gap-2 mb-4">
			<LucideBellRing :class="classes.icon" aria-hidden="true" />
			<h4 class="text-sm font-bold text-gray-900">{{ __("Kitchen alerts") }}</h4>
		</div>

		<CheckboxField
			:model-value="popupOn ? 1 : 0"
			:label="__('Popup when the next course is ordered')"
			:description="__('Show a notice at the top of the kitchen screen when the next course of a table is ordered')"
			@update:model-value="emit('update:kitchenNextCoursePopup', $event ? 1 : 0)"
		/>
		<NumberField
			v-if="popupOn"
			:model-value="seconds"
			:label="__('Popup stays (seconds)')"
			:description="__('Seconds the notice stays on the kitchen screen. 0 = until somebody dismisses it')"
			:min="0"
			:max="MAX_POPUP_SECONDS"
			:step="1"
			@update:model-value="emit('update:kitchenPopupSeconds', wholeSeconds($event))"
		/>

		<!-- The two sounds, each with its own Listen button: they are played at the volume below -->
		<div v-for="row in soundRows" :key="row.id" class="p-2 rounded hover:bg-gray-50 transition-colors">
			<label :for="row.fieldId" class="block text-sm font-medium text-gray-900 mb-1">{{ row.label }}</label>
			<div class="flex items-center gap-2">
				<select
					:id="row.fieldId"
					:value="row.word"
					:data-test="`sound-${row.id}`"
					class="min-w-0 flex-1 px-2.5 h-11 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white cursor-pointer"
					@change="emit(row.event, $event.target.value)"
				>
					<option v-for="option in soundOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
				</select>
				<button
					type="button"
					:data-test="`listen-${row.id}`"
					:disabled="row.sound === 'none'"
					:aria-label="__('Listen to the sound: {0}', [row.label])"
					class="inline-flex h-11 flex-none items-center gap-1.5 rounded border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 touch-manipulation hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
					@click="listen(row.sound)"
				>
					<LucideVolume2 class="h-5 w-5" aria-hidden="true" />
					{{ __("Listen") }}
				</button>
			</div>
			<p class="text-xs text-gray-500 mt-0.5 leading-tight">{{ row.description }}</p>
		</div>

		<div class="p-2 rounded hover:bg-gray-50 transition-colors">
			<label :for="volumeFieldId" class="block text-sm font-medium text-gray-900 mb-1">{{ __("Alert volume") }}</label>
			<select
				:id="volumeFieldId"
				:value="volumeWord(volume)"
				data-test="volume"
				class="w-full px-2.5 h-11 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white cursor-pointer"
				@change="emit('update:kitchenAlertVolume', $event.target.value)"
			>
				<option v-for="option in volumeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
			</select>
			<p class="text-xs text-gray-500 mt-0.5 leading-tight">{{ __("A tablet plays the sounds once somebody has touched its screen.") }}</p>
		</div>
		<p v-if="listenFailed" data-test="listen-failed" role="status" class="px-2 pt-1 text-xs font-medium text-red-700">
			{{ __("This browser cannot play the sound.") }}
		</p>
	</div>
</template>

<script setup>
import { computed, ref } from "vue"
import LucideBellRing from "~icons/lucide/bell-ring"
import LucideVolume2 from "~icons/lucide/volume-2"
import CheckboxField from "@/components/settings/CheckboxField.vue"
import NumberField from "@/components/settings/NumberField.vue"
import { getSubsectionClasses } from "@/components/settings/settingsConfig"
import { previewAlertSound } from "@/utils/alertSoundPlayer"
import {
	DEFAULT_NEXT_COURSE_SOUND,
	DEFAULT_RUNNER_SOUND,
	DEFAULT_VOLUME,
	SOUND_IDS,
	VOLUME_IDS,
	normaliseSound,
	normaliseVolume,
	soundLabel,
	soundWord,
	volumeLabel,
	volumeWord,
} from "@/utils/alertSounds"

/**
 * The Kitchen alerts of a till. The props are the fields of the till's POS Settings, in camelCase, with the values the doctype stores (a Check as 1 or 0, an Int, a Select as its English word,
 * « Double beep »); each is optional, and a till that has none yet (a site not migrated) reads as the defaults. Every change is said by `update:<prop>` with the value to store.
 *
 * kitchenNextCoursePopup:  `kitchen_next_course_popup`  (Check, on)       a notice on the kitchen screen when the next course is ordered
 * kitchenPopupSeconds:     `kitchen_popup_seconds`      (Int, 30)         how long it stays; 0 = until it is dismissed (0 to 600)
 * kitchenNextCourseSound:  `kitchen_next_course_sound`  (Select, Bell)    None, Bell, Double beep, Chime, Gong or Beep
 * runnerReadySound:        `runner_ready_sound`         (Select, Beep)    the same choices, for the runner's dishes ready
 * kitchenAlertVolume:      `kitchen_alert_volume`       (Select, Medium)  Low, Medium or High
 */
const props = defineProps({
	kitchenNextCoursePopup: { type: [Number, Boolean, String], default: undefined },
	kitchenPopupSeconds: { type: [Number, String], default: undefined },
	kitchenNextCourseSound: { type: String, default: undefined },
	runnerReadySound: { type: String, default: undefined },
	kitchenAlertVolume: { type: String, default: undefined },
})
const emit = defineEmits([
	"update:kitchenNextCoursePopup",
	"update:kitchenPopupSeconds",
	"update:kitchenNextCourseSound",
	"update:runnerReadySound",
	"update:kitchenAlertVolume",
])

// The longest a popup may stay, ten minutes: the same range the server holds (POS Settings, pos_next.restaurant.kitchen_alerts)
const MAX_POPUP_SECONDS = 600
const DEFAULT_POPUP_SECONDS = 30

const classes = computed(() => getSubsectionClasses("amber"))
const unique = Math.random().toString(36).slice(2, 11)
const volumeFieldId = `kitchen-alert-volume-${unique}`

const popupOn = computed(() => {
	const value = props.kitchenNextCoursePopup
	return value == null || value === "" ? true : Boolean(Number(value))
})
const seconds = computed(() => {
	const value = props.kitchenPopupSeconds
	if (value == null || value === "") return DEFAULT_POPUP_SECONDS
	return Number.isNaN(Number(value)) ? DEFAULT_POPUP_SECONDS : Number(value)
})
const volume = computed(() => normaliseVolume(props.kitchenAlertVolume))
const wholeSeconds = (value) => Math.min(MAX_POPUP_SECONDS, Math.max(0, Math.round(Number(value) || 0)))

// The options carry the word the doctype stores as their value and the user's language as their label
const soundOptions = computed(() => SOUND_IDS.map((id) => ({ value: soundWord(id), label: soundLabel(id) })))
const volumeOptions = computed(() => VOLUME_IDS.map((id) => ({ value: volumeWord(id), label: volumeLabel(id) })))

const soundRows = computed(() => {
	const rows = [
		{
			id: "next-course",
			event: "update:kitchenNextCourseSound",
			sound: normaliseSound(props.kitchenNextCourseSound, DEFAULT_NEXT_COURSE_SOUND),
			label: __("Next course sound"),
			description: __("Sound of the kitchen screen when the next course is ordered"),
		},
		{
			id: "runner",
			event: "update:runnerReadySound",
			sound: normaliseSound(props.runnerReadySound, DEFAULT_RUNNER_SOUND),
			label: __("Dishes ready sound"),
			description: __("Sound of the runner screen when dishes come up ready"),
		},
	]
	return rows.map((row) => ({ ...row, word: soundWord(row.sound), fieldId: `kitchen-alert-${row.id}-${unique}` }))
})

// The « Listen » press is a touch, so it is also what unlocks the browser's audio (utils/alertSoundPlayer)
const listenFailed = ref(false)
async function listen(sound) {
	try {
		listenFailed.value = !(await previewAlertSound(sound, volume.value))
	} catch {
		listenFailed.value = true
	}
}
</script>
