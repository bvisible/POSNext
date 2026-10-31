/**
 * //// Neoffice — added file (no upstream equivalent). The remark for the kitchen can be dictated on the phone
 * //// (NeoRestau lot 1, task 27): the browser's speech recognition, in Swiss French unless the till speaks German
 * //// or Italian, found only where the browser has it, started by the waiter's press and by nothing else.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dictationLanguage, useDictation } from "../useDictation"

class FakeRecognition {
	static made = []
	constructor() {
		this.start = vi.fn()
		this.stop = vi.fn()
		this.abort = vi.fn()
		FakeRecognition.made.push(this)
	}
	hear(...phrases) {
		this.onresult?.({ resultIndex: 0, results: phrases.map((text) => Object.assign([{ transcript: text }], { isFinal: true })) })
	}
}

beforeEach(() => {
	FakeRecognition.made = []
})

afterEach(() => {
	delete window.SpeechRecognition
	delete window.webkitSpeechRecognition
})

describe("the language of the dictation", () => {
	it("is the Swiss form of the till's language, Swiss French otherwise", () => {
		expect(dictationLanguage("fr")).toBe("fr-CH")
		expect(dictationLanguage("de")).toBe("de-CH")
		expect(dictationLanguage("de-CH")).toBe("de-CH")
		expect(dictationLanguage("it")).toBe("it-CH")
		expect(dictationLanguage("en")).toBe("fr-CH")
		expect(dictationLanguage("")).toBe("fr-CH")
		expect(dictationLanguage(undefined)).toBe("fr-CH")
	})
})

describe("dictation", () => {
	it("is not offered where the browser has no speech recognition", () => {
		const dictation = useDictation({ onText: vi.fn() })

		expect(dictation.supported).toBe(false)
		dictation.toggle()
		expect(dictation.listening.value).toBe(false)
	})

	it("is offered where the browser has it, prefixed or not", () => {
		window.webkitSpeechRecognition = FakeRecognition
		expect(useDictation({ onText: vi.fn() }).supported).toBe(true)
		delete window.webkitSpeechRecognition
		window.SpeechRecognition = FakeRecognition
		expect(useDictation({ onText: vi.fn() }).supported).toBe(true)
	})

	it("listens only once pressed, in the language given", () => {
		window.SpeechRecognition = FakeRecognition
		const dictation = useDictation({ onText: vi.fn(), language: () => "fr-CH" })

		expect(FakeRecognition.made).toHaveLength(0)
		dictation.toggle()

		expect(FakeRecognition.made).toHaveLength(1)
		const [recognition] = FakeRecognition.made
		expect(recognition.lang).toBe("fr-CH")
		expect(recognition.start).toHaveBeenCalledTimes(1)
		expect(dictation.listening.value).toBe(true)
	})

	it("hands over what it heard, and stops listening at the end", () => {
		window.SpeechRecognition = FakeRecognition
		const onText = vi.fn()
		const dictation = useDictation({ onText })
		dictation.toggle()
		const [recognition] = FakeRecognition.made

		recognition.hear("no butter")
		recognition.onend?.()

		expect(onText).toHaveBeenCalledWith("no butter")
		expect(dictation.listening.value).toBe(false)
	})

	it("stays off when the browser refuses to start it", () => {
		window.SpeechRecognition = class extends FakeRecognition {
			constructor() {
				super()
				this.start = vi.fn(() => {
					throw new Error("InvalidStateError")
				})
			}
		}
		const dictation = useDictation({ onText: vi.fn() })

		expect(() => dictation.toggle()).not.toThrow()
		expect(dictation.listening.value).toBe(false)
	})

	it("the end of a dictation that failed does not stop the one pressed after it", () => {
		window.SpeechRecognition = FakeRecognition
		const onText = vi.fn()
		const dictation = useDictation({ onText })
		dictation.toggle()
		const [first] = FakeRecognition.made
		first.onerror?.({ error: "network" })

		dictation.toggle()
		first.onend?.()
		first.hear("from the first one")

		expect(dictation.listening.value).toBe(true)
		expect(onText).not.toHaveBeenCalled()
		dictation.toggle()
		expect(FakeRecognition.made[1].stop).toHaveBeenCalled()
	})

	it("a second press stops it", () => {
		window.SpeechRecognition = FakeRecognition
		const dictation = useDictation({ onText: vi.fn() })
		dictation.toggle()
		dictation.toggle()

		expect(FakeRecognition.made[0].stop).toHaveBeenCalled()
	})

	it("says when the microphone is refused, and stops", () => {
		window.SpeechRecognition = FakeRecognition
		const dictation = useDictation({ onText: vi.fn() })
		dictation.toggle()
		FakeRecognition.made[0].onerror?.({ error: "not-allowed" })

		expect(dictation.denied.value).toBe(true)
		expect(dictation.listening.value).toBe(false)
	})

	it("finishing waits for the last words, then hands them over", async () => {
		window.SpeechRecognition = FakeRecognition
		const onText = vi.fn()
		const dictation = useDictation({ onText })
		dictation.toggle()
		const [recognition] = FakeRecognition.made
		let done = false

		const finished = dictation.finish().then(() => {
			done = true
		})
		expect(recognition.stop).toHaveBeenCalled()
		await Promise.resolve()
		expect(done).toBe(false)

		recognition.hear("extra lemon")
		recognition.onend?.()
		await finished
		expect(onText).toHaveBeenCalledWith("extra lemon")
		expect(dictation.listening.value).toBe(false)
	})

	it("finishing gives up after a short while, and drops what comes later", async () => {
		vi.useFakeTimers()
		try {
			window.SpeechRecognition = FakeRecognition
			const onText = vi.fn()
			const dictation = useDictation({ onText })
			dictation.toggle()
			const [recognition] = FakeRecognition.made

			const finished = dictation.finish()
			vi.advanceTimersByTime(2000)
			await finished

			expect(recognition.abort).toHaveBeenCalled()
			expect(dictation.listening.value).toBe(false)
			recognition.hear("too late")
			expect(onText).not.toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	})

	it("finishing with nothing open is done at once", async () => {
		const dictation = useDictation({ onText: vi.fn() })

		await expect(dictation.finish()).resolves.toBeUndefined()
	})

	it("reset forgets a refused microphone", () => {
		window.SpeechRecognition = FakeRecognition
		const dictation = useDictation({ onText: vi.fn() })
		dictation.toggle()
		FakeRecognition.made[0].onerror?.({ error: "not-allowed" })

		dictation.reset()

		expect(dictation.denied.value).toBe(false)
		expect(dictation.listening.value).toBe(false)
	})

	it("is cut when the sheet closes", () => {
		window.SpeechRecognition = FakeRecognition
		const dictation = useDictation({ onText: vi.fn() })
		dictation.toggle()
		dictation.abort()

		expect(FakeRecognition.made[0].abort).toHaveBeenCalled()
		expect(dictation.listening.value).toBe(false)
	})
})
