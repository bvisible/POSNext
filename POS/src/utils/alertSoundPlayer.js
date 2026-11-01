//// Neoffice — added file (no upstream equivalent). The player of the alert sounds (NeoRestau lot 1, Daniel's request of 01.11). It turns a schedule of notes (utils/alertSounds) into Web Audio oscillators,
//// and owns the one thing a browser makes difficult: a page may not make a sound before somebody has touched it (the autoplay policy), and a kitchen tablet is left alone for hours.
////
//// - ONE shared audio context for the whole page. It is created and resumed from the first touch of the page (`listenForFirstTouch`), never before: a context made on load would only log the browser's
////   warning and stay suspended.
//// - A sound asked for while the context is not running is DROPPED, not queued: a context that is resumed later plays what was scheduled on its clock, and a bell ringing twenty minutes after the dish,
////   when somebody finally taps the screen, is worse than none. The screens show a discreet chip meanwhile (`alertSoundsLocked`: « Touch the screen to enable the sound »).
//// - A system that takes the audio back (a tablet put to sleep: the state goes `interrupted` or `suspended`) locks it again, and the next touch unlocks it.

import { readonly, ref } from "vue"
import { ATTACK, soundSchedule } from "@/utils/alertSounds"

// Any of these is a touch a browser accepts as a gesture to start the audio with (iOS Safari counts `touchend` and `click`, not `pointerdown`)
const TOUCHES = ["pointerdown", "touchend", "click", "keydown"]
const LISTEN = { capture: true, passive: true }
// The gain a note rises from, and the one it dies away to: an exponential ramp cannot start from, or reach, zero
const SILENT = 0.0001
const NEAR_SILENCE = 0.001
// The oscillator is stopped a hair after its note has died away, so that the end of the ramp is never cut
const RELEASE = 0.02

let context = null
let listening = false
let wantsTouch = false
const locked = ref(true)

/** Whether the page is still waiting for a touch before it may sound. The screens show their chip while a sound is enabled and this is true. */
export const alertSoundsLocked = readonly(locked)

function contextClass() {
	return typeof window === "undefined" ? null : window.AudioContext || window.webkitAudioContext || null
}

/** Whether this browser has Web Audio at all. */
export function alertSoundsSupported() {
	return !!contextClass()
}

function onTouch() {
	unlockAlertSounds()
}

function stopListening() {
	if (!listening) return
	listening = false
	for (const type of TOUCHES) document.removeEventListener(type, onTouch, LISTEN)
}

function startListening() {
	if (listening || !wantsTouch || typeof document === "undefined") return
	listening = true
	for (const type of TOUCHES) document.addEventListener(type, onTouch, LISTEN)
}

// The context says what the system did to it; the lock follows, and the page waits for a touch again whenever the audio was taken back
function sync() {
	locked.value = context?.state !== "running"
	if (locked.value) startListening()
	else stopListening()
}

/**
 * Waits for the first touch of the page and unlocks the audio with it. Safe to call from every screen and as often as needed.
 */
export function listenForFirstTouch() {
	wantsTouch = true
	if (!alertSoundsSupported()) return
	if (context?.state === "running") return
	startListening()
}

/**
 * Creates the shared context if it does not exist, and resumes it. To be called from a touch (the listener above does), or the browser refuses.
 *
 * @returns {Promise<boolean>} Whether the audio is running
 */
export async function unlockAlertSounds() {
	const Context = contextClass()
	if (!Context) return false
	try {
		if (!context) {
			context = new Context()
			context.onstatechange = sync
		}
		if (context.state !== "running") await context.resume()
	} catch {
		/* the browser refused: the page stays locked and waits for the next touch */
	}
	sync()
	return context?.state === "running"
}

function playNote(note, now) {
	const at = now + note.start
	const oscillator = context.createOscillator()
	const envelope = context.createGain()
	oscillator.type = note.type
	oscillator.frequency.value = note.frequency
	envelope.gain.setValueAtTime(SILENT, at)
	envelope.gain.linearRampToValueAtTime(note.gain, at + ATTACK)
	envelope.gain.exponentialRampToValueAtTime(NEAR_SILENCE, at + note.duration)
	oscillator.connect(envelope)
	envelope.connect(context.destination)
	oscillator.onended = () => {
		oscillator.disconnect()
		envelope.disconnect()
	}
	oscillator.start(at)
	oscillator.stop(at + note.duration + RELEASE)
}

/**
 * Plays a sound now, if the page is allowed to.
 *
 * @param {string} sound - A sound id (utils/alertSounds)
 * @param {string} [volume] - `low`, `medium` or `high`
 * @returns {boolean} Whether anything was played: false for the sound `none`, for a page not touched yet, for a browser with no Web Audio
 */
export function playAlertSound(sound, volume) {
	if (!context || context.state !== "running") return false
	const notes = soundSchedule(sound, volume)
	if (!notes.length) return false
	try {
		const now = context.currentTime
		for (const note of notes) playNote(note, now)
		return true
	} catch (error) {
		console.warn("Alert sound failed:", error)
		return false
	}
}

/**
 * The « Listen » button of the settings: it is a touch, so it unlocks the audio itself, then plays.
 *
 * @returns {Promise<boolean>} Whether anything was played
 */
export async function previewAlertSound(sound, volume) {
	if (!(await unlockAlertSounds())) return false
	return playAlertSound(sound, volume)
}

/** Forgets the context and the listeners: for a test, which must start from a page nobody has touched. */
export function resetAlertSoundPlayer() {
	stopListening()
	context = null
	wantsTouch = false
	locked.value = true
}
