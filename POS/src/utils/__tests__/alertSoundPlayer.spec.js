/**
 * //// Neoffice — added file (no upstream equivalent). The player of the alert sounds (NeoRestau lot 1, Daniel's request of 01.11). A browser lets no page make a sound before somebody has touched it
 * //// (the autoplay policy), and a tablet in a kitchen is left alone for hours: there is ONE shared audio context, created and resumed on the first touch of the page, and a sound asked for before
 * //// that is not played late, it is dropped (a bell ringing twenty minutes after the dish, when somebody finally taps, would be worse than none). A fake audio context records what is played.
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { soundSchedule } from "../alertSounds"
import {
	alertSoundsLocked,
	alertSoundsSupported,
	listenForFirstTouch,
	playAlertSound,
	previewAlertSound,
	resetAlertSoundPlayer,
	unlockAlertSounds,
} from "../alertSoundPlayer"

/** What `new AudioContext()` is in a browser, as far as the player uses it: it records the oscillators it is asked for and the automation of their gain. */
class FakeAudioContext {
	static created = []
	static startsRunning = false

	constructor() {
		this.state = FakeAudioContext.startsRunning ? "running" : "suspended"
		this.currentTime = 10
		this.destination = { name: "destination" }
		this.oscillators = []
		this.onstatechange = null
		FakeAudioContext.created.push(this)
	}

	setState(state) {
		this.state = state
		this.onstatechange?.()
	}

	resume() {
		this.setState("running")
		return Promise.resolve()
	}

	createGain() {
		const calls = []
		const param = {
			calls,
			setValueAtTime: (value, at) => calls.push(["set", value, at]),
			linearRampToValueAtTime: (value, at) => calls.push(["linear", value, at]),
			exponentialRampToValueAtTime: (value, at) => calls.push(["exponential", value, at]),
		}
		return { gain: param, connect: vi.fn(), disconnect: vi.fn() }
	}

	createOscillator() {
		const oscillator = {
			type: "",
			frequency: { value: 0 },
			connect: vi.fn(),
			disconnect: vi.fn(),
			start: vi.fn(),
			stop: vi.fn(),
			onended: null,
		}
		this.oscillators.push(oscillator)
		return oscillator
	}
}

const touch = (type = "pointerdown") => document.dispatchEvent(new Event(type, { bubbles: true }))

beforeEach(() => {
	resetAlertSoundPlayer()
	FakeAudioContext.created = []
	FakeAudioContext.startsRunning = false
	window.AudioContext = FakeAudioContext
	delete window.webkitAudioContext
})

describe("the shared audio context", () => {
	it("is not created before somebody touches the page, so a page that is never touched never trips the autoplay policy", () => {
		listenForFirstTouch()

		expect(FakeAudioContext.created).toHaveLength(0)
		expect(alertSoundsLocked.value).toBe(true)
	})

	it("is created and resumed on the first touch, whichever way the page is touched", async () => {
		for (const type of ["pointerdown", "touchend", "click", "keydown"]) {
			resetAlertSoundPlayer()
			FakeAudioContext.created = []
			listenForFirstTouch()

			touch(type)
			await Promise.resolve()

			expect(FakeAudioContext.created, type).toHaveLength(1)
			expect(FakeAudioContext.created[0].state, type).toBe("running")
			expect(alertSoundsLocked.value, type).toBe(false)
		}
	})

	it("is ONE context for the whole page: a second touch, a second unlock and the sounds all use it", async () => {
		listenForFirstTouch()
		touch()
		await unlockAlertSounds()
		await unlockAlertSounds()
		touch("click")
		playAlertSound("bell", "medium")

		expect(FakeAudioContext.created).toHaveLength(1)
		expect(FakeAudioContext.created[0].oscillators.length).toBeGreaterThan(0)
	})

	it("stops listening to the page once it is unlocked", async () => {
		const added = vi.spyOn(document, "addEventListener")
		const removed = vi.spyOn(document, "removeEventListener")
		listenForFirstTouch()
		touch()
		await Promise.resolve()

		const types = added.mock.calls.map(([type]) => type)
		expect(types.length).toBeGreaterThan(0)
		for (const type of types) expect(removed.mock.calls.map(([name]) => name)).toContain(type)
		added.mockRestore()
		removed.mockRestore()
	})

	it("is locked again when the system takes the audio back (a tablet put to sleep), and listens for the next touch", async () => {
		listenForFirstTouch()
		touch()
		await Promise.resolve()
		expect(alertSoundsLocked.value).toBe(false)

		FakeAudioContext.created[0].setState("interrupted")
		expect(alertSoundsLocked.value).toBe(true)
		expect(playAlertSound("bell", "medium")).toBe(false)

		touch("click")
		await Promise.resolve()
		expect(alertSoundsLocked.value).toBe(false)
		expect(FakeAudioContext.created).toHaveLength(1)
	})

	it("says it cannot sound at all on a browser with no Web Audio, and never throws", async () => {
		delete window.AudioContext

		expect(alertSoundsSupported()).toBe(false)
		expect(await unlockAlertSounds()).toBe(false)
		expect(playAlertSound("bell", "medium")).toBe(false)
		expect(() => listenForFirstTouch()).not.toThrow()
		expect(alertSoundsLocked.value).toBe(true)
	})

	it("uses the prefixed constructor of an older Safari", async () => {
		delete window.AudioContext
		window.webkitAudioContext = FakeAudioContext

		expect(alertSoundsSupported()).toBe(true)
		expect(await unlockAlertSounds()).toBe(true)
	})
})

describe("playing a sound", () => {
	async function unlocked() {
		await unlockAlertSounds()
		return FakeAudioContext.created[0]
	}

	it("drops a sound asked for before the page was touched, and does not create a context to hold it", () => {
		expect(playAlertSound("bell", "medium")).toBe(false)

		expect(FakeAudioContext.created).toHaveLength(0)
	})

	it("drops a sound while the context is still suspended, rather than playing it late", async () => {
		const context = await unlocked()
		context.setState("suspended")

		expect(playAlertSound("bell", "medium")).toBe(false)
		expect(context.oscillators).toHaveLength(0)
	})

	it("schedules one oscillator per note, at the context's clock plus the note's start", async () => {
		const context = await unlocked()
		const notes = soundSchedule("chime", "high")

		expect(playAlertSound("chime", "high")).toBe(true)

		expect(context.oscillators).toHaveLength(notes.length)
		notes.forEach((note, index) => {
			const oscillator = context.oscillators[index]
			expect(oscillator.type).toBe(note.type)
			expect(oscillator.frequency.value).toBe(note.frequency)
			expect(oscillator.start).toHaveBeenCalledWith(10 + note.start)
			expect(oscillator.stop.mock.calls[0][0]).toBeGreaterThanOrEqual(10 + note.start + note.duration)
		})
	})

	it("rises over a few milliseconds and dies away exponentially to near silence", async () => {
		const context = await unlocked()
		const [note] = soundSchedule("beep", "medium")
		const gains = []
		const original = context.createGain.bind(context)
		context.createGain = () => {
			const node = original()
			gains.push(node)
			return node
		}

		playAlertSound("beep", "medium")

		const [kind1, from, at1] = gains[0].gain.calls[0]
		expect([kind1, at1]).toEqual(["set", 10])
		expect(from).toBeLessThan(0.01)
		expect(gains[0].gain.calls[1]).toEqual(["linear", note.gain, expect.closeTo(10.005, 5)])
		const last = gains[0].gain.calls.at(-1)
		expect(last[0]).toBe("exponential")
		expect(last[1]).toBeLessThan(0.01)
		expect(last[2]).toBeCloseTo(10 + note.duration, 5)
	})

	it("plays nothing, and says so, for the sound none", async () => {
		const context = await unlocked()

		expect(playAlertSound("none", "medium")).toBe(false)
		expect(context.oscillators).toHaveLength(0)
	})

	it("lets a note go once it has ended: its nodes are disconnected", async () => {
		const context = await unlocked()
		playAlertSound("beep", "medium")

		const oscillator = context.oscillators[0]
		oscillator.onended()

		expect(oscillator.disconnect).toHaveBeenCalled()
	})

	it("survives a context that throws, and says nothing was played", async () => {
		const context = await unlocked()
		context.createOscillator = () => {
			throw new Error("boom")
		}

		expect(playAlertSound("bell", "medium")).toBe(false)
	})
})

describe("the preview of the settings screen", () => {
	it("unlocks the context from the press that asked for it, then plays", async () => {
		const played = await previewAlertSound("gong", "low")

		expect(played).toBe(true)
		expect(FakeAudioContext.created).toHaveLength(1)
		expect(FakeAudioContext.created[0].oscillators).toHaveLength(soundSchedule("gong", "low").length)
		expect(alertSoundsLocked.value).toBe(false)
	})

	it("plays through the context that already runs", async () => {
		await unlockAlertSounds()
		await previewAlertSound("beep", "high")

		expect(FakeAudioContext.created).toHaveLength(1)
	})

	it("says nothing was played when the browser cannot", async () => {
		delete window.AudioContext

		expect(await previewAlertSound("bell", "medium")).toBe(false)
	})
})
