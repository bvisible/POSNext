<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The Listen buttons of the kitchen alerts (NeoRestau lot 1, Daniel, 01.11: « choisir le son avec des choix »): one per sound, each playing the sound chosen
	     above it at the volume chosen above it. The press is a touch, so it is also what unlocks the browser's audio (utils/alertSoundPlayer). -->
	<div class="flex flex-wrap items-center gap-2" :data-test="which === 'floor' ? 'floor-alert-listen' : 'kitchen-alert-listen'">
		<button
			v-for="row in rows"
			:key="row.id"
			type="button"
			:data-test="`listen-${row.id}`"
			:disabled="row.sound === 'none'"
			:aria-label="__('Listen to the sound: {0}', [row.label])"
			class="inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-[10px] border border-pos-line bg-white px-3 text-[13px] font-bold text-pos-ink transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-[0.42]"
			@click="listen(row.sound)"
		>
			<LucideVolume2 class="h-5 w-5 flex-none" aria-hidden="true" />
			{{ __("Listen") }} · {{ row.label }}
		</button>
		<p v-if="failed" data-test="listen-failed" role="status" class="w-full text-[12.5px] font-semibold text-red-700">
			{{ __("This browser cannot play the sound.") }}
		</p>
	</div>
</template>

<script setup>
import { computed, ref } from "vue"
import LucideVolume2 from "~icons/lucide/volume-2"
import { previewAlertSound } from "@/utils/alertSoundPlayer"
import { DEFAULT_GUEST_SOUND, DEFAULT_NEXT_COURSE_SOUND, DEFAULT_RUNNER_SOUND, normaliseSound, normaliseVolume } from "@/utils/alertSounds"

// The values are the words the doctype stores (« Double beep », « High »); each is optional and a missing one reads as its default
//// Neoffice — `which` is "kitchen" (the default: the two sounds of the kitchen's and the runner's screens) or "floor": the one sound of the till itself when a guest orders or pays from the QR code of a table (`guestSound`),
//// which plays at the same volume (NeoRestau lot 1, Daniel, 01.11).
const props = defineProps({
	which: { type: String, default: "kitchen" },
	nextCourseSound: { type: String, default: undefined },
	runnerSound: { type: String, default: undefined },
	guestSound: { type: String, default: undefined },
	volume: { type: String, default: undefined },
})

const rows = computed(() =>
	props.which === "floor"
		? [{ id: "guest", sound: normaliseSound(props.guestSound, DEFAULT_GUEST_SOUND), label: __("Guest order sound") }]
		: [
				{ id: "next-course", sound: normaliseSound(props.nextCourseSound, DEFAULT_NEXT_COURSE_SOUND), label: __("Next course sound") },
				{ id: "runner", sound: normaliseSound(props.runnerSound, DEFAULT_RUNNER_SOUND), label: __("Dishes ready sound") },
			],
)

const failed = ref(false)
async function listen(sound) {
	try {
		failed.value = !(await previewAlertSound(sound, normaliseVolume(props.volume)))
	} catch {
		failed.value = true
	}
}
</script>
