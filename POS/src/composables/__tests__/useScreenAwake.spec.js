/**
 * //// Neoffice — added file (no upstream equivalent). Keep the screen on, and let it rest on purpose (NeoResto lot 1, task 47). TWO different things:
 * //// (1) the browser's Screen Wake Lock keeps the physical screen on (it is released by the browser whenever the page is hidden, so it is asked for
 * //// again); (2) a web page cannot switch the physical screen off nor dim it, so after N minutes without a touch the page draws a near-black layer
 * //// itself while the lock and the live updates keep running, and the first touch wakes it WITHOUT reaching the control under the finger.
 * //// The browser's API, the clock and the document's visibility are all mocked here.
 * @vitest-environment jsdom
 */
import { nextTick, ref } from "vue"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useScreenAwake } from "../useScreenAwake"

const MINUTE = 60 * 1000
const wait = (ms) => vi.advanceTimersByTimeAsync(ms)

// ---- the browser's Screen Wake Lock, as a mock ---------------------------------------------------------------------
let sentinels
let request
function installWakeLock(behaviour) {
	sentinels = []
	request = vi.fn(async (type) => {
		if (behaviour) await behaviour(type)
		const sentinel = new EventTarget()
		sentinel.type = type
		sentinel.released = false
		sentinel.release = vi.fn(async () => {
			if (sentinel.released) return
			sentinel.released = true
			sentinel.dispatchEvent(new Event("release"))
		})
		sentinels.push(sentinel)
		return sentinel
	})
	Object.defineProperty(navigator, "wakeLock", {
		configurable: true,
		value: { request },
	})
}
function removeWakeLock() {
	Object.defineProperty(navigator, "wakeLock", {
		configurable: true,
		value: undefined,
	})
}
// What the browser does when the page is hidden: it lets the lock go, and says so
async function hidePage() {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => "hidden",
	})
	document.dispatchEvent(new Event("visibilitychange"))
	for (const sentinel of sentinels) {
		if (!sentinel.released) {
			sentinel.released = true
			sentinel.dispatchEvent(new Event("release"))
		}
	}
	await wait(0)
}
async function showPage() {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => "visible",
	})
	document.dispatchEvent(new Event("visibilitychange"))
	await wait(0)
}

// ---- a control on the page, to see whether a touch reaches it ---------------------------------------------------------------
let control
let reached
function touch(target = control, { holdMs = 80 } = {}) {
	const fire = (type, Kind = Event) =>
		target.dispatchEvent(new Kind(type, { bubbles: true, cancelable: true }))
	fire("pointerdown")
	fire("touchstart")
	fire("mousedown", MouseEvent)
	return async () => {
		await wait(holdMs)
		fire("pointerup")
		fire("touchend")
		fire("mouseup", MouseEvent)
		fire("click", MouseEvent)
	}
}
async function tap(target = control) {
	await touch(target)()
}

let opened
function open(screen = "kitchen", options = {}) {
	const awake = useScreenAwake(screen, options)
	awake.start()
	opened.push(awake)
	return awake
}

beforeEach(() => {
	vi.useFakeTimers()
	localStorage.clear()
	opened = []
	reached = []
	control = document.createElement("button")
	for (const type of [
		"pointerdown",
		"touchstart",
		"mousedown",
		"pointerup",
		"touchend",
		"mouseup",
		"click",
		"keydown",
	])
		control.addEventListener(type, () => reached.push(type))
	document.body.appendChild(control)
	installWakeLock()
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => "visible",
	})
})
afterEach(() => {
	for (const awake of opened) awake.stop()
	control.remove()
	removeWakeLock()
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("keeping the screen on (Screen Wake Lock)", () => {
	it("asks the browser for a SCREEN lock when the page opens, on the kitchen, the runner and the customer display", async () => {
		for (const screen of ["kitchen", "runner", "display"]) {
			installWakeLock()
			const awake = open(screen)
			await wait(0)

			expect(request).toHaveBeenCalledTimes(1)
			expect(request).toHaveBeenCalledWith("screen")
			expect(awake.wakeLockActive.value).toBe(true)
			awake.stop()
		}
	})

	it("asks for nothing on a screen that is not one of them", async () => {
		const awake = open("till")
		await wait(0)

		expect(request).not.toHaveBeenCalled()
		expect(awake.wakeLockActive.value).toBe(false)
	})

	it("asks for nothing when this device was told not to keep the screen on", async () => {
		localStorage.setItem("pos_screen_awake_keep_screen_on", "0")
		const awake = open("kitchen")
		await wait(0)

		expect(request).not.toHaveBeenCalled()
		expect(awake.settings.value.keep_screen_on).toBe(false)
	})

	it("asks for it again when the page comes back, the browser having let it go while the page was hidden", async () => {
		const awake = open("kitchen")
		await wait(0)
		expect(request).toHaveBeenCalledTimes(1)

		await hidePage()
		expect(awake.wakeLockActive.value).toBe(false)
		expect(request).toHaveBeenCalledTimes(1)

		await showPage()
		expect(request).toHaveBeenCalledTimes(2)
		expect(awake.wakeLockActive.value).toBe(true)
	})

	it("does not ask while the page is hidden: the browser would refuse", async () => {
		await hidePage()
		open("kitchen")
		await wait(0)

		expect(request).not.toHaveBeenCalled()
		await showPage()
		expect(request).toHaveBeenCalledTimes(1)
	})

	it("asks for it again after a 'release' event while the page is visible (the system let it go)", async () => {
		const awake = open("kitchen")
		await wait(0)

		await sentinels[0].release()
		await wait(0)

		expect(request).toHaveBeenCalledTimes(2)
		expect(awake.wakeLockActive.value).toBe(true)
	})

	it("asks again later after a rejection (a low battery), not in a loop, and again at the next touch or when the page is back", async () => {
		let refuse = true
		installWakeLock(async () => {
			if (refuse)
				throw Object.assign(new Error("battery"), { name: "NotAllowedError" })
		})
		const awake = open("kitchen")
		await wait(0)
		expect(request).toHaveBeenCalledTimes(1)
		expect(awake.wakeLockActive.value).toBe(false)

		await wait(10 * 1000)
		expect(request).toHaveBeenCalledTimes(1)

		refuse = false
		await wait(30 * 1000)
		expect(request).toHaveBeenCalledTimes(2)
		expect(awake.wakeLockActive.value).toBe(true)
	})

	it("a touch is another chance when the lock is missing", async () => {
		let refuse = true
		installWakeLock(async () => {
			if (refuse) throw new Error("denied")
		})
		open("kitchen")
		await wait(0)
		refuse = false

		await tap()
		await wait(0)

		expect(request).toHaveBeenCalledTimes(2)
	})

	it("never asks twice at once", async () => {
		let letGo
		installWakeLock(
			() =>
				new Promise((resolve) => {
					letGo = resolve
				}),
		)
		open("kitchen")
		await showPage()
		await showPage()
		expect(request).toHaveBeenCalledTimes(1)
		letGo()
		await wait(0)
		expect(request).toHaveBeenCalledTimes(1)
	})

	it("does nothing, and says so, where the browser has no Screen Wake Lock (an address without https, an old browser)", async () => {
		removeWakeLock()
		const awake = open("kitchen")
		await wait(0)

		expect(awake.wakeLockSupported.value).toBe(false)
		expect(awake.wakeLockActive.value).toBe(false)
		// the rest still works
		await wait(30 * MINUTE)
		expect(awake.resting.value).toBe(true)
	})

	it("says it is supported where the browser has it", async () => {
		const awake = open("kitchen")
		await wait(0)

		expect(awake.wakeLockSupported.value).toBe(true)
	})

	it("lets the lock go when it is switched off in the settings, and asks for it when it is switched on", async () => {
		const awake = open("kitchen")
		await wait(0)

		awake.setSetting("keep_screen_on", false)
		await wait(0)
		expect(sentinels[0].release).toHaveBeenCalledTimes(1)
		expect(awake.wakeLockActive.value).toBe(false)

		awake.setSetting("keep_screen_on", true)
		await wait(0)
		expect(request).toHaveBeenCalledTimes(2)
		expect(awake.wakeLockActive.value).toBe(true)
	})

	it("lets the lock go when the page closes, and listens to nothing afterwards", async () => {
		const awake = open("kitchen")
		await wait(0)

		awake.stop()
		await wait(0)
		expect(sentinels[0].release).toHaveBeenCalled()

		await hidePage()
		await showPage()
		expect(request).toHaveBeenCalledTimes(1)
	})

	it("lets a lock go that the browser grants after the page closed", async () => {
		let grant
		installWakeLock(
			() =>
				new Promise((resolve) => {
					grant = resolve
				}),
		)
		const awake = open("kitchen")
		awake.stop()
		grant()
		await wait(0)

		expect(sentinels[0].release).toHaveBeenCalled()
		expect(awake.wakeLockActive.value).toBe(false)
	})
})

describe("the rest (a near-black layer, drawn by the page)", () => {
	it("begins after 30 minutes without a touch, not a second before", async () => {
		const awake = open("kitchen")

		await wait(30 * MINUTE - 1000)
		expect(awake.resting.value).toBe(false)
		await wait(1000)
		expect(awake.resting.value).toBe(true)
	})

	it("starts again from each touch", async () => {
		const awake = open("kitchen")

		await wait(29 * MINUTE)
		await tap()
		await wait(29 * MINUTE)
		expect(awake.resting.value).toBe(false)
		await wait(MINUTE)
		expect(awake.resting.value).toBe(true)
	})

	it("a touch reaches the control under the finger as long as the screen is not at rest", async () => {
		open("kitchen")

		await tap()

		expect(reached).toContain("click")
		expect(reached).toContain("pointerdown")
	})

	it("never begins when the device says 0 minutes", async () => {
		localStorage.setItem("pos_screen_awake_rest_after_minutes", "0")
		const awake = open("kitchen")

		await wait(24 * 60 * MINUTE)

		expect(awake.resting.value).toBe(false)
	})

	it("follows the minutes this device chose, and the choice is kept on it", async () => {
		const awake = open("kitchen")
		awake.setSetting("rest_after_minutes", 5)

		expect(localStorage.getItem("pos_screen_awake_rest_after_minutes")).toBe(
			"5",
		)
		await wait(5 * MINUTE)
		expect(awake.resting.value).toBe(true)
	})

	it("counts the new delay from the choice, not from the last touch", async () => {
		const awake = open("kitchen")
		await wait(20 * MINUTE)

		awake.setSetting("rest_after_minutes", 10)
		await wait(9 * MINUTE)
		expect(awake.resting.value).toBe(false)
		await wait(MINUTE)
		expect(awake.resting.value).toBe(true)
	})

	it("opens on the minutes this device kept", async () => {
		localStorage.setItem("pos_screen_awake_rest_after_minutes", "10")
		const awake = open("runner")

		await wait(10 * MINUTE)

		expect(awake.resting.value).toBe(true)
	})

	it("takes the restaurant's value when the device has none, and the device's when it has", async () => {
		const awake = open("kitchen", {
			restaurantDefaults: { rest_after_minutes: 15 },
		})
		await wait(15 * MINUTE)
		expect(awake.resting.value).toBe(true)

		awake.stop()
		localStorage.setItem("pos_screen_awake_rest_after_minutes", "20")
		const other = open("kitchen", {
			restaurantDefaults: { rest_after_minutes: 15 },
		})
		await wait(15 * MINUTE)
		expect(other.resting.value).toBe(false)
		await wait(5 * MINUTE)
		expect(other.resting.value).toBe(true)
	})

	it("keeps the wake lock and goes on listening: resting is a drawing, not a sleep", async () => {
		const awake = open("kitchen")
		await wait(30 * MINUTE)

		expect(awake.resting.value).toBe(true)
		expect(awake.wakeLockActive.value).toBe(true)
		expect(sentinels[0].release).not.toHaveBeenCalled()
	})

	it("does not rest at all on a page that asks for no rest (the customer display)", async () => {
		const awake = open("display", { rest: false })

		await wait(24 * 60 * MINUTE)

		expect(awake.resting.value).toBe(false)
		expect(request).toHaveBeenCalledTimes(1)
	})

	it("is at rest at once when the page comes back after a long absence", async () => {
		const awake = open("kitchen")
		await hidePage()
		// a frozen page: its timers do not run, the clock does
		vi.setSystemTime(Date.now() + 45 * MINUTE)

		await showPage()

		expect(awake.resting.value).toBe(true)
	})

	it("is not at rest when the page comes back after a short absence", async () => {
		const awake = open("kitchen")
		await hidePage()
		vi.setSystemTime(Date.now() + 5 * MINUTE)

		await showPage()

		expect(awake.resting.value).toBe(false)
	})

	it("lets the tablet sleep by itself when asked: the lock is released N minutes into the rest", async () => {
		localStorage.setItem(
			"pos_screen_awake_release_wake_lock_after_minutes",
			"60",
		)
		const awake = open("kitchen")
		await wait(30 * MINUTE)
		expect(awake.resting.value).toBe(true)

		await wait(59 * MINUTE)
		expect(sentinels[0].release).not.toHaveBeenCalled()
		await wait(MINUTE)
		expect(sentinels[0].release).toHaveBeenCalledTimes(1)
		expect(awake.wakeLockActive.value).toBe(false)
	})

	it("does not ask for the lock again when the page comes back to a rest that let it go; the next touch does", async () => {
		localStorage.setItem(
			"pos_screen_awake_release_wake_lock_after_minutes",
			"10",
		)
		const awake = open("kitchen")
		await wait(40 * MINUTE)
		expect(awake.wakeLockActive.value).toBe(false)

		await hidePage()
		await showPage()
		expect(request).toHaveBeenCalledTimes(1)

		await tap()
		await wait(0)
		expect(request).toHaveBeenCalledTimes(2)
		expect(awake.wakeLockActive.value).toBe(true)
		expect(awake.resting.value).toBe(false)
	})

	it("never lets the lock go by itself with the default (0 minutes: never)", async () => {
		const awake = open("kitchen")

		await wait(48 * 60 * MINUTE)

		expect(awake.resting.value).toBe(true)
		expect(sentinels[0].release).not.toHaveBeenCalled()
	})

	it("a rest that is switched off while it lasts is over", async () => {
		const awake = open("kitchen")
		await wait(30 * MINUTE)

		awake.setSetting("rest_after_minutes", 0)

		expect(awake.resting.value).toBe(false)
	})
})

describe("waking up", () => {
	it("a touch wakes the screen, and the rest begins again 30 minutes later", async () => {
		const awake = open("kitchen")
		await wait(30 * MINUTE)
		expect(awake.resting.value).toBe(true)

		await tap()

		expect(awake.resting.value).toBe(false)
		await wait(29 * MINUTE)
		expect(awake.resting.value).toBe(false)
		await wait(MINUTE)
		expect(awake.resting.value).toBe(true)
	})

	it("the first touch is swallowed: the control under the finger does not fire, whatever the browser sends", async () => {
		const awake = open("kitchen")
		await wait(30 * MINUTE)

		await tap()

		expect(awake.resting.value).toBe(false)
		expect(reached).toEqual([])
	})

	it("swallows the whole touch, down to the click the browser sends after the layer is gone", async () => {
		const awake = open("kitchen")
		await wait(30 * MINUTE)

		const lift = touch()
		expect(awake.resting.value).toBe(false)
		await lift()
		// the browser's late click, 300 ms after the finger left
		await wait(300)
		control.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		)

		expect(reached).toEqual([])
	})

	it("the next touch is a touch like any other", async () => {
		open("kitchen")
		await wait(30 * MINUTE)
		await tap()
		await wait(1000)

		await tap()

		expect(reached).toEqual(
			expect.arrayContaining([
				"pointerdown",
				"touchstart",
				"mousedown",
				"pointerup",
				"touchend",
				"mouseup",
				"click",
			]),
		)
	})

	it("stops swallowing by itself if the touch never ends (a finger lifted off the screen's edge)", async () => {
		open("kitchen")
		await wait(30 * MINUTE)
		touch()

		await wait(3000)
		control.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		)

		expect(reached).toEqual(["click"])
	})

	it("a key wakes the screen and is swallowed too", async () => {
		const awake = open("kitchen")
		await wait(30 * MINUTE)

		control.dispatchEvent(
			new Event("keydown", { bubbles: true, cancelable: true }),
		)

		expect(awake.resting.value).toBe(false)
		expect(reached).toEqual([])
	})

	it("wakes the screen from the code (wakeUp)", async () => {
		const awake = open("kitchen")
		await wait(30 * MINUTE)

		awake.wakeUp()

		expect(awake.resting.value).toBe(false)
	})
})

describe("a new ticket", () => {
	it("wakes the screen at rest (a kitchen must never miss a ticket)", async () => {
		const awake = open("kitchen")
		awake.noteTickets({ A: 1 })
		await wait(30 * MINUTE)
		expect(awake.resting.value).toBe(true)

		awake.noteTickets({ A: 1, B: 2 })

		expect(awake.resting.value).toBe(false)
	})

	it("wakes the screen for a dish added to a ticket it already knew", async () => {
		const awake = open("kitchen")
		awake.noteTickets({ A: 1 })
		await wait(30 * MINUTE)

		awake.noteTickets({ A: 2 })

		expect(awake.resting.value).toBe(false)
	})

	it("the first reading of the screen is no ticket: it is what the next ones are compared with", async () => {
		const awake = open("kitchen")
		await wait(30 * MINUTE)

		awake.noteTickets({ A: 1, B: 2 })

		expect(awake.resting.value).toBe(true)
	})

	it("a ticket that leaves, or the same screen read again, wakes nothing", async () => {
		const awake = open("kitchen")
		awake.noteTickets({ A: 1, B: 2 })
		await wait(30 * MINUTE)

		awake.noteTickets({ A: 1, B: 2 })
		awake.noteTickets({ A: 1 })

		expect(awake.resting.value).toBe(true)
	})

	it("wakes nothing when the device says no", async () => {
		localStorage.setItem("pos_screen_awake_wake_on_new_ticket", "0")
		const awake = open("kitchen")
		awake.noteTickets({ A: 1 })
		await wait(30 * MINUTE)

		awake.noteTickets({ A: 1, B: 1 })

		expect(awake.resting.value).toBe(true)
	})

	it("also keeps a screen awake that was about to rest: the delay starts again from the ticket", async () => {
		const awake = open("kitchen")
		awake.noteTickets({ A: 1 })
		await wait(29 * MINUTE)

		awake.noteTickets({ A: 1, B: 1 })
		await wait(2 * MINUTE)

		expect(awake.resting.value).toBe(false)
		await wait(28 * MINUTE)
		expect(awake.resting.value).toBe(true)
	})

	it("a ticket needs no touch: it is not swallowing anything, the next touch reaches its control", async () => {
		const awake = open("kitchen")
		awake.noteTickets({ A: 1 })
		await wait(30 * MINUTE)
		awake.noteTickets({ A: 1, B: 1 })

		await tap()

		expect(reached).toContain("click")
	})

	it("does not wake a page that has no rest", async () => {
		const awake = open("display", { rest: false })
		awake.noteTickets({ A: 1 })

		awake.noteTickets({ A: 1, B: 1 })

		expect(awake.resting.value).toBe(false)
	})
})

describe("the settings of this device", () => {
	it("are the defaults of the screen when nothing was ever chosen", () => {
		const awake = useScreenAwake("kitchen")

		expect(awake.settings.value).toEqual({
			keep_screen_on: true,
			rest_after_minutes: 30,
			wake_on_new_ticket: true,
			release_wake_lock_after_minutes: 0,
			rest_style: "clock",
		})
	})

	it("are read when the screen is made, not when it is mounted: the first paint is already the right one", () => {
		localStorage.setItem("pos_screen_awake_wake_on_new_ticket", "0")

		expect(useScreenAwake("runner").settings.value.wake_on_new_ticket).toBe(
			false,
		)
	})

	it("hold as long as the screen is open when the storage refuses, and the page works", async () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("denied")
		})
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("denied")
		})
		const awake = open("kitchen")

		awake.setSetting("rest_after_minutes", 5)

		expect(awake.settings.value.rest_after_minutes).toBe(5)
		await wait(5 * MINUTE)
		expect(awake.resting.value).toBe(true)
	})

	it("ignore a setting that is not one, and a value that is not one of it", () => {
		const awake = useScreenAwake("kitchen")

		awake.setSetting("brightness", 3)
		awake.setSetting("rest_after_minutes", "soon")

		expect(awake.settings.value.rest_after_minutes).toBe(30)
		expect(awake.settings.value).not.toHaveProperty("brightness")
	})
})

describe("a ticket that blinks keeps the screen awake (product owner, 05.11.2026: « faut la laisser clignoter jusqu'à ce qu'on ait validé »)", () => {
	it("does not rest while something is held, however long, and rests the delay after it is taken up", async () => {
		const held = ref(true)
		const awake = open("kitchen", { hold: held })

		await wait(90 * MINUTE)
		expect(awake.resting.value).toBe(false)

		held.value = false
		await nextTick()
		await wait(30 * MINUTE - 1000)
		expect(awake.resting.value).toBe(false)
		await wait(1000)
		expect(awake.resting.value).toBe(true)
	})

	it("wakes a screen that was resting when something starts to be held, and keeps it awake", async () => {
		const held = ref(false)
		const awake = open("kitchen", { hold: held })
		await wait(30 * MINUTE)
		expect(awake.resting.value).toBe(true)

		held.value = true
		await nextTick()
		expect(awake.resting.value).toBe(false)
		await wait(120 * MINUTE)
		expect(awake.resting.value).toBe(false)
	})

	it("counts the delay from the moment the last ticket is taken up, not from the wake", async () => {
		const held = ref(false)
		const awake = open("kitchen", { hold: held })
		await wait(30 * MINUTE)
		held.value = true
		await nextTick()
		await wait(20 * MINUTE)

		held.value = false
		await nextTick()
		await wait(29 * MINUTE)
		expect(awake.resting.value).toBe(false)
		await wait(MINUTE)
		expect(awake.resting.value).toBe(true)
	})

	it("takes a function as well as a ref, and a screen with no hold rests as it always did", async () => {
		let blinking = true
		const withFunction = open("kitchen", { hold: () => blinking })
		await wait(40 * MINUTE)
		expect(withFunction.resting.value).toBe(false)
		withFunction.stop()

		blinking = false
		const plain = open("kitchen")
		await wait(30 * MINUTE)
		expect(plain.resting.value).toBe(true)
	})

	it("a touch still starts the count again while a ticket is held, and the held screen never rests under the finger", async () => {
		const held = ref(true)
		const awake = open("kitchen", { hold: held })

		await tap()
		await wait(60 * MINUTE)

		expect(awake.resting.value).toBe(false)
		expect(reached).toContain("click")
	})
})
