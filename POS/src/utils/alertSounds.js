//// Neoffice — added file (no upstream equivalent). The sounds of the kitchen's and the runner's screens (NeoRestau lot 1, Daniel's request of 01.11: « un son pour aviser […] dans les réglages de la
//// caisse, et peut-être même choisir le son avec des choix »). Every sound is SYNTHESISED, no audio file, no binary asset: a sound here is a table of notes (a frequency, a shape, when it starts, how long
//// it rings, how loud), and `schedule` hands that table back as plain data, so the sounds are tested without any audio. The player that turns a schedule into oscillators is alertSoundPlayer.
////
//// The choices are the ones the POS Settings doctype offers (`kitchen_next_course_sound`, `runner_ready_sound`, `kitchen_alert_volume`): the doctype stores the words (« Double beep »), the server
//// resolves them to the ids below (pos_next/restaurant/kitchen_alerts.py), and `normaliseSound` reads either. The engine is for any event of the kitchen (a new ticket, a dish ready): an event is
//// only a setting that names one of these sounds.

export const SOUND_NONE = "none"
export const SOUND_IDS = ["none", "bell", "double_beep", "chime", "gong", "beep"]
export const VOLUME_IDS = ["low", "medium", "high"]

/** What the settings default to: the bell when the next course is ordered, the runner's beep (the sound it always had) when dishes come up ready. */
export const DEFAULT_NEXT_COURSE_SOUND = "bell"
export const DEFAULT_RUNNER_SOUND = "beep"
export const DEFAULT_VOLUME = "medium"

/**
 * The master gain of each volume. `medium` is 0.3, the gain the runner's beep has always had, so that the runner sounds the same unless somebody turns it up or down.
 */
const MASTER_GAIN = { low: 0.12, medium: 0.3, high: 0.6 }

/**
 * The notes of each sound. `gain` is RELATIVE (1 = the master gain of the volume): the notes that ring together add up to 1 at most, so that `high` never goes past full scale.
 * A note rises in 5 ms (no click), then dies away exponentially over its `duration` (a struck bell, not an organ).
 *
 * - beep: the runner's beep, one sine of 880 Hz for 0.3 s.
 * - double_beep: that beep twice, the second after the first has gone.
 * - chime: three rising notes (C5, E5, G5), each starting while the one before is still ringing (never more than two at once).
 * - bell: one strike, a fundamental (B5) with two overtones that die away before it.
 * - gong: a low strike (G3), the longest of them, with a fifth and an octave above that fade sooner.
 */
const SOUNDS = {
	none: [],
	beep: [{ frequency: 880, type: "sine", start: 0, duration: 0.3, gain: 1 }],
	double_beep: [
		{ frequency: 880, type: "sine", start: 0, duration: 0.15, gain: 1 },
		{ frequency: 880, type: "sine", start: 0.22, duration: 0.15, gain: 1 },
	],
	chime: [
		{ frequency: 523.25, type: "sine", start: 0, duration: 0.3, gain: 0.5 },
		{ frequency: 659.25, type: "sine", start: 0.18, duration: 0.3, gain: 0.5 },
		{ frequency: 783.99, type: "sine", start: 0.36, duration: 0.7, gain: 0.5 },
	],
	bell: [
		{ frequency: 987.77, type: "sine", start: 0, duration: 1.4, gain: 0.5 },
		{ frequency: 1975.53, type: "sine", start: 0, duration: 0.9, gain: 0.3 },
		{ frequency: 2667.0, type: "sine", start: 0, duration: 0.5, gain: 0.15 },
	],
	gong: [
		{ frequency: 196.0, type: "sine", start: 0, duration: 2.4, gain: 0.5 },
		{ frequency: 294.0, type: "sine", start: 0, duration: 1.8, gain: 0.25 },
		{ frequency: 392.0, type: "triangle", start: 0, duration: 1.2, gain: 0.15 },
	],
}

/** The rise of a note, in seconds (the player ramps the gain over it). */
export const ATTACK = 0.005

const round = (value) => Math.round(value * 10000) / 10000

/** The id of a sound from what a setting holds: the doctype's words (« Double beep ») or an id (`double_beep`), the fallback for anything else. */
export function normaliseSound(value, fallback) {
	const id = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_")
	return SOUND_IDS.includes(id) ? id : fallback
}

/** The id of a volume from what a setting holds, `medium` for anything else. */
export function normaliseVolume(value) {
	const id = String(value ?? "")
		.trim()
		.toLowerCase()
	return VOLUME_IDS.includes(id) ? id : DEFAULT_VOLUME
}

/**
 * The notes of a sound at a volume, as data.
 *
 * @param {string} sound - A sound id (`bell`…); an unknown one plays the runner's beep rather than nothing at all
 * @param {string} [volume] - `low`, `medium` or `high`; an unknown one is `medium`
 * @returns {Array<{ frequency: number, type: string, start: number, duration: number, gain: number }>} The notes, `start` and `duration` in seconds from the moment the sound is played
 */
export function soundSchedule(sound, volume) {
	const notes = SOUNDS[normaliseSound(sound, DEFAULT_RUNNER_SOUND)]
	const master = MASTER_GAIN[normaliseVolume(volume)]
	return notes.map((note) => ({ ...note, gain: round(note.gain * master) }))
}

/** How long a schedule rings, in seconds: the end of its last note. */
export function soundLength(notes) {
	return (notes || []).reduce((end, note) => Math.max(end, note.start + note.duration), 0)
}

/** The label of a sound, in the user's language ("" for an unknown id). One literal `__()` per word: the catalogue extraction reads the msgid from the source, it cannot follow a variable. */
export function soundLabel(sound) {
	switch (sound) {
		case "none":
			return __("None", null, "Alert sound")
		case "bell":
			return __("Bell", null, "Alert sound")
		case "double_beep":
			return __("Double beep", null, "Alert sound")
		case "chime":
			return __("Chime", null, "Alert sound")
		case "gong":
			return __("Gong", null, "Alert sound")
		case "beep":
			return __("Beep", null, "Alert sound")
		default:
			return ""
	}
}

/** The label of a volume, in the user's language ("" for an unknown id). */
export function volumeLabel(volume) {
	switch (volume) {
		case "low":
			return __("Low", null, "Alert volume")
		case "medium":
			return __("Medium", null, "Alert volume")
		case "high":
			return __("High", null, "Alert volume")
		default:
			return ""
	}
}
