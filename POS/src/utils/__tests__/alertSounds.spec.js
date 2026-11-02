/**
 * //// Neoffice — added file (no upstream equivalent). The sounds of the kitchen's and the runner's screens (NeoResto lot 1, Daniel's request of 01.11: « un son pour aviser […] dans les réglages de la caisse,
 * //// et peut-être même choisir le son avec des choix »). A sound is a SCHEDULE of notes (a pure table, tested here without any audio); a thin player turns it into oscillators (alertSoundPlayer).
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import {
	DEFAULT_NEXT_COURSE_SOUND,
	DEFAULT_RUNNER_SOUND,
	DEFAULT_VOLUME,
	SOUND_IDS,
	VOLUME_IDS,
	normaliseSound,
	normaliseVolume,
	soundLabel,
	soundLength,
	soundSchedule,
	soundWord,
	volumeLabel,
	volumeWord,
} from "../alertSounds"

beforeAll(() => {
	globalThis.__ = (text) => text
})

const ROOT = path.resolve(__dirname, "../../../../pos_next")
const doctype = JSON.parse(readFileSync(path.join(ROOT, "pos_next/doctype/pos_settings/pos_settings.json"), "utf8"))
const optionsOf = (fieldname) => doctype.fields.find((field) => field.fieldname === fieldname).options.split("\n")

describe("the table of sounds", () => {
	it("names the sounds the product owner asked for, none first", () => {
		expect(SOUND_IDS).toEqual(["none", "bell", "double_beep", "chime", "gong", "beep"])
		expect(VOLUME_IDS).toEqual(["low", "medium", "high"])
	})

	it("defaults to the bell for the next course and to the runner's old beep for the runner", () => {
		expect(DEFAULT_NEXT_COURSE_SOUND).toBe("bell")
		expect(DEFAULT_RUNNER_SOUND).toBe("beep")
		expect(DEFAULT_VOLUME).toBe("medium")
	})

	it("plays nothing for none", () => {
		expect(soundSchedule("none", "high")).toEqual([])
		expect(soundLength([])).toBe(0)
	})

	it("keeps the runner's beep exactly: one sine of 880 Hz, 0.3 s, at the gain 0.3 it always had", () => {
		expect(soundSchedule("beep", "medium")).toEqual([
			{ frequency: 880, type: "sine", start: 0, duration: 0.3, gain: 0.3 },
		])
	})

	it("makes the double beep two beeps, the second after the first has gone", () => {
		const notes = soundSchedule("double_beep", "medium")
		expect(notes).toHaveLength(2)
		expect(notes[1].start).toBeGreaterThanOrEqual(notes[0].start + notes[0].duration)
		expect(new Set(notes.map((note) => note.frequency)).size).toBe(1)
	})

	it("makes the chime three rising notes", () => {
		const notes = soundSchedule("chime", "medium")
		expect(notes).toHaveLength(3)
		const frequencies = notes.map((note) => note.frequency)
		expect([...frequencies].sort((a, b) => a - b)).toEqual(frequencies)
		expect(new Set(frequencies).size).toBe(3)
		const starts = notes.map((note) => note.start)
		expect([...starts].sort((a, b) => a - b)).toEqual(starts)
	})

	it("makes the bell one strike with overtones that die before its fundamental, and the gong lower and longer", () => {
		const bell = soundSchedule("bell", "medium")
		expect(bell.length).toBeGreaterThan(1)
		expect(new Set(bell.map((note) => note.start))).toEqual(new Set([0]))
		const fundamental = bell.reduce((a, b) => (a.duration >= b.duration ? a : b))
		expect(Math.min(...bell.map((note) => note.frequency))).toBe(fundamental.frequency)
		const gong = soundSchedule("gong", "medium")
		expect(Math.min(...gong.map((note) => note.frequency))).toBeLessThan(Math.min(...bell.map((note) => note.frequency)))
		expect(soundLength(gong)).toBeGreaterThan(soundLength(bell))
	})

	it("scales every note by the volume, low under medium under high", () => {
		const peak = (volume) => Math.max(...soundSchedule("bell", volume).map((note) => note.gain))
		expect(peak("low")).toBeLessThan(peak("medium"))
		expect(peak("medium")).toBeLessThan(peak("high"))
	})

	it("never lets the notes that sound together add up past full scale, at any volume", () => {
		for (const sound of SOUND_IDS) {
			for (const volume of VOLUME_IDS) {
				const notes = soundSchedule(sound, volume)
				for (const at of notes.map((note) => note.start)) {
					const together = notes
						.filter((note) => note.start <= at && at < note.start + note.duration)
						.reduce((sum, note) => sum + note.gain, 0)
					expect(together, `${sound} at ${volume}`).toBeLessThanOrEqual(1)
				}
			}
		}
	})

	it("gives every note a frequency, a shape, a start, a length and a gain it can be played with", () => {
		for (const sound of SOUND_IDS) {
			for (const note of soundSchedule(sound, "medium")) {
				expect(note.frequency).toBeGreaterThan(50)
				expect(note.frequency).toBeLessThan(8000)
				expect(["sine", "triangle"]).toContain(note.type)
				expect(note.start).toBeGreaterThanOrEqual(0)
				expect(note.duration).toBeGreaterThan(0.05)
				expect(note.gain).toBeGreaterThan(0)
			}
		}
	})

	it("reads an unknown sound or volume as the fallback, never as a crash", () => {
		expect(soundSchedule("whistle", "medium")).toEqual(soundSchedule("beep", "medium"))
		expect(soundSchedule("bell", "deafening")).toEqual(soundSchedule("bell", "medium"))
		expect(soundSchedule(undefined, undefined)).toEqual(soundSchedule("beep", "medium"))
	})
})

describe("the words of the settings", () => {
	it("reads the choice as the doctype stores it (« Double beep ») or as the server resolves it (double_beep)", () => {
		expect(normaliseSound("Double beep", "bell")).toBe("double_beep")
		expect(normaliseSound("double_beep", "bell")).toBe("double_beep")
		expect(normaliseSound(" GONG ", "bell")).toBe("gong")
		expect(normaliseSound("None", "bell")).toBe("none")
	})

	it("falls back on what nobody chose or nobody knows", () => {
		expect(normaliseSound("", "bell")).toBe("bell")
		expect(normaliseSound(null, "beep")).toBe("beep")
		expect(normaliseSound("whistle", "bell")).toBe("bell")
		expect(normaliseVolume("High")).toBe("high")
		expect(normaliseVolume("")).toBe("medium")
		expect(normaliseVolume("loud")).toBe("medium")
	})

	it("labels each sound and volume once, in the user's language", () => {
		expect(SOUND_IDS.map(soundLabel)).toEqual(["None", "Bell", "Double beep", "Chime", "Gong", "Beep"])
		expect(VOLUME_IDS.map(volumeLabel)).toEqual(["Low", "Medium", "High"])
		expect(soundLabel("whistle")).toBe("")
	})

	it("is the very list of choices the POS Settings doctype offers, so a choice saved on the desk always plays and one saved by the till is one the desk accepts", () => {
		for (const name of ["kitchen_next_course_sound", "runner_ready_sound"]) {
			const options = optionsOf(name)
			expect(options.map((option) => normaliseSound(option, "?"))).toEqual(SOUND_IDS)
			expect(SOUND_IDS.map(soundWord)).toEqual(options)
		}
		const volumes = optionsOf("kitchen_alert_volume")
		expect(volumes.map(normaliseVolume)).toEqual(VOLUME_IDS)
		expect(VOLUME_IDS.map(volumeWord)).toEqual(volumes)
	})

	it("also defaults, in the doctype, to the sounds the engine defaults to", () => {
		const defaultOf = (name) => doctype.fields.find((field) => field.fieldname === name).default
		expect(normaliseSound(defaultOf("kitchen_next_course_sound"), "?")).toBe(DEFAULT_NEXT_COURSE_SOUND)
		expect(normaliseSound(defaultOf("runner_ready_sound"), "?")).toBe(DEFAULT_RUNNER_SOUND)
		expect(normaliseVolume(defaultOf("kitchen_alert_volume"))).toBe(DEFAULT_VOLUME)
	})
})
