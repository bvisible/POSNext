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

let read
beforeEach(() => {
	vi.useFakeTimers()
	read = vi.fn()
})
afterEach(() => {
	vi.useRealTimers()
})

describe("a screen that follows the server's signals", () => {
	it("reads again on each signal it listens to", () => {
		const socket = fakeSocket()
		followLiveReading({ socket, events: ["kds_update", "table_update"], read })

		socket.fire("kds_update")
		socket.fire("table_update")

		expect(read).toHaveBeenCalledTimes(2)
	})

	it("reads again when the connection comes back: a signal sent while it was down is lost, the order is not", () => {
		const socket = fakeSocket()
		followLiveReading({ socket, read })

		socket.fire("connect")

		expect(read).toHaveBeenCalledTimes(1)
	})

	it("reads on its own every 15 seconds while the connection is up (a signal can still be lost)", () => {
		followLiveReading({ socket: fakeSocket(true), read })

		vi.advanceTimersByTime(14_999)
		expect(read).not.toHaveBeenCalled()
		vi.advanceTimersByTime(1)
		expect(read).toHaveBeenCalledTimes(1)
		vi.advanceTimersByTime(15_000)
		expect(read).toHaveBeenCalledTimes(2)
	})

	it("reads every 4 seconds while the connection is down, and goes back to 15 once it is up", () => {
		const socket = fakeSocket(false)
		followLiveReading({ socket, read })

		vi.advanceTimersByTime(12_000)
		expect(read).toHaveBeenCalledTimes(3)

		socket.connected = true
		vi.advanceTimersByTime(4_000)
		expect(read).toHaveBeenCalledTimes(4)
		vi.advanceTimersByTime(14_999)
		expect(read).toHaveBeenCalledTimes(4)
		vi.advanceTimersByTime(1)
		expect(read).toHaveBeenCalledTimes(5)
	})

	it("takes the pace it is told (the runner reads every 30 seconds)", () => {
		followLiveReading({ socket: fakeSocket(true), read, everyMs: 30_000 })

		vi.advanceTimersByTime(29_999)
		expect(read).not.toHaveBeenCalled()
		vi.advanceTimersByTime(1)
		expect(read).toHaveBeenCalledTimes(1)
	})

	it("reads every 15 seconds all the same where there is no connection object at all", () => {
		followLiveReading({ socket: null, read })

		vi.advanceTimersByTime(15_000)

		expect(read).toHaveBeenCalledTimes(1)
	})

	it("reads again when the page is looked at again, not when it is put away", () => {
		followLiveReading({ socket: fakeSocket(), read })
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
		const stop = followLiveReading({ socket, events: ["kds_update", "table_update"], read })

		stop()
		socket.fire("kds_update")
		socket.fire("table_update")
		socket.fire("connect")
		vi.advanceTimersByTime(60_000)
		document.dispatchEvent(new Event("visibilitychange"))

		expect(read).not.toHaveBeenCalled()
		expect(other).toHaveBeenCalledTimes(1)
		expect(vi.getTimerCount()).toBe(0)
	})
})
