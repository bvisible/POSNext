/**
 * //// Neoffice — added file (no upstream equivalent). How a service screen keeps up with the room (NeoRestau lot 1, Daniel, 01.11: « le délai entre l'envoi de la suite et la réception à la cuisine prend environ 10 secondes »).
 * //// The screen reads again on every signal of the server; a signal that arrives while the tablet's connection is down is lost, and the screen only found the order at its next timed reading, up to 15 seconds later
 * //// (30 on the runner). It now reads again when the connection comes back, when the page is looked at again, and often while the connection is down.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { followLiveReading } from "../followLiveReading"

function fakeSocket(connected = true) {
	const handlers = new Map()
	return {
		connected,
		on: vi.fn((event, handler) => handlers.set(event, [...(handlers.get(event) || []), handler])),
		off: vi.fn((event, handler) => handlers.set(event, (handlers.get(event) || []).filter((h) => h !== handler))),
		fire: (event) => (handlers.get(event) || []).forEach((handler) => handler()),
		count: (event) => (handlers.get(event) || []).length,
	}
}

// Every screen a test follows is let go of at the end: the listeners on `document` are shared by all of them
const stops = []
const follow = (options) => {
	const stop = followLiveReading(options)
	stops.push(stop)
	return stop
}
let read
beforeEach(() => {
	vi.useFakeTimers()
	read = vi.fn()
})
afterEach(() => {
	stops.splice(0).forEach((stop) => stop())
	vi.useRealTimers()
})

describe("a screen that follows the server's signals", () => {
	it("reads again on each signal it listens to", () => {
		const socket = fakeSocket()
		follow({ socket, events: ["kds_update", "table_update"], read })

		socket.fire("kds_update")
		socket.fire("table_update")

		expect(read).toHaveBeenCalledTimes(2)
	})

	it("reads again when the connection comes back: a signal sent while it was down is lost, the order is not", () => {
		const socket = fakeSocket()
		follow({ socket, read })

		socket.fire("connect")

		expect(read).toHaveBeenCalledTimes(1)
	})

	it("reads on its own every 15 seconds while the connection is up (a signal can still be lost)", () => {
		follow({ socket: fakeSocket(true), read })

		vi.advanceTimersByTime(14_999)
		expect(read).not.toHaveBeenCalled()
		vi.advanceTimersByTime(1)
		expect(read).toHaveBeenCalledTimes(1)
		vi.advanceTimersByTime(15_000)
		expect(read).toHaveBeenCalledTimes(2)
	})

	it("reads every 4 seconds while the connection is down, and goes back to 15 once it is up, counted from the last reading", () => {
		const socket = fakeSocket(false)
		follow({ socket, read })

		vi.advanceTimersByTime(12_000)
		expect(read).toHaveBeenCalledTimes(3)

		// the connection comes back: a reading at once (what was sent while it was down), then the long pace
		socket.connected = true
		socket.fire("connect")
		expect(read).toHaveBeenCalledTimes(4)
		vi.advanceTimersByTime(14_999)
		expect(read).toHaveBeenCalledTimes(4)
		vi.advanceTimersByTime(1)
		expect(read).toHaveBeenCalledTimes(5)
	})

	it("goes to the quick pace the moment the connection is cut, not at the next long reading", () => {
		const socket = fakeSocket(true)
		follow({ socket, read })

		vi.advanceTimersByTime(5_000)
		expect(read).not.toHaveBeenCalled()
		socket.connected = false
		socket.fire("disconnect")
		// the last reading is older than the quick pace: it is made now
		vi.advanceTimersByTime(1)

		expect(read).toHaveBeenCalledTimes(1)
		vi.advanceTimersByTime(4_000)
		expect(read).toHaveBeenCalledTimes(2)
	})

	it("counts a reading made for a signal: the timed one is 15 seconds after it, not after the one before", () => {
		const socket = fakeSocket(true)
		follow({ socket, read })

		vi.advanceTimersByTime(10_000)
		socket.fire("kds_update")
		expect(read).toHaveBeenCalledTimes(1)
		vi.advanceTimersByTime(14_999)
		expect(read).toHaveBeenCalledTimes(1)
		vi.advanceTimersByTime(1)
		expect(read).toHaveBeenCalledTimes(2)
	})

	it("takes the pace it is told (the runner reads every 30 seconds)", () => {
		follow({ socket: fakeSocket(true), read, everyMs: 30_000 })

		vi.advanceTimersByTime(29_999)
		expect(read).not.toHaveBeenCalled()
		vi.advanceTimersByTime(1)
		expect(read).toHaveBeenCalledTimes(1)
	})

	it("reads every 15 seconds all the same where there is no connection object at all", () => {
		follow({ socket: null, read })

		vi.advanceTimersByTime(15_000)

		expect(read).toHaveBeenCalledTimes(1)
	})

	it("reads again when the page is looked at again, not when it is put away", () => {
		follow({ socket: fakeSocket(), read })
		const hide = (hidden) => {
			Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
			document.dispatchEvent(new Event("visibilitychange"))
		}

		hide(true)
		expect(read).not.toHaveBeenCalled()
		hide(false)
		expect(read).toHaveBeenCalledTimes(1)
	})

	it("lets go of everything it took when the screen is left, and only of that: another listener of the socket stays", () => {
		const socket = fakeSocket()
		const other = vi.fn()
		socket.on("kds_update", other)
		const stop = follow({ socket, events: ["kds_update", "table_update"], read })

		stop()
		socket.fire("kds_update")
		socket.fire("table_update")
		socket.fire("connect")
		socket.fire("disconnect")
		vi.advanceTimersByTime(60_000)
		document.dispatchEvent(new Event("visibilitychange"))

		expect(read).not.toHaveBeenCalled()
		expect(other).toHaveBeenCalledTimes(1)
		expect(vi.getTimerCount()).toBe(0)
	})
})
