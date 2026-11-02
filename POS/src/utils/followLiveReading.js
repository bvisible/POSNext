//// Neoffice — added file (no upstream equivalent). How a service screen keeps up with the room (NeoResto lot 1, Daniel, 01.11: « le délai entre l'envoi de la suite et la réception à la cuisine prend environ 10 secondes »).
////
//// The server tells the screens the moment an order changes (`kds_update`, `table_update`) and the screen reads again. Measured on osiris: the save takes about 1.6 s, the signal reaches a connected page in under a second, the
//// kitchen's reading takes 0.2 s. What made it ten seconds is a signal that arrives while the tablet's connection is down (a restart of the server, a page that sleeps, the Wi-Fi): it is lost, and the screen only found the order
//// at its next TIMED reading, up to 15 seconds later (30 on the runner). So the screen also reads again when the connection comes back and when the page is looked at again, and it reads every few seconds while the connection
//// is down (the connection says so by its `disconnect` event), instead of waiting for the long pace.

/**
 * @param {{
 *   socket?: { connected?: boolean, on: Function, off: Function } | null,
 *   events?: string[],
 *   read: () => void,
 *   everyMs?: number,
 *   whileCutMs?: number,
 * }} options - `socket`: the page's realtime connection (none: only the timed reading); `events`: the server's signals that make the screen read again; `read`: one reading; `everyMs`: the pace while the connection is up;
 *   `whileCutMs`: the pace while it is down
 * @returns {() => void} Lets go of every listener and timer the call took
 */
export function followLiveReading({ socket = null, events = ["kds_update"], read, everyMs = 15000, whileCutMs = 4000 }) {
	// Every reading, whatever asked for it, restarts the count of the timed one
	let last = Date.now()
	let timer = null
	// A connection that says it is not connected is down; no connection object at all keeps the usual pace
	const paceNow = () => (socket?.connected === false ? whileCutMs : everyMs)
	const arm = () => {
		clearTimeout(timer)
		timer = setTimeout(readNow, Math.max(0, paceNow() - (Date.now() - last)))
	}
	function readNow() {
		last = Date.now()
		read()
		arm()
	}

	const onSignal = [...events, "connect"]
	for (const event of onSignal) socket?.on?.(event, readNow)
	// A connection that is cut is noticed at once: the quick pace counts from the last reading, so a reading that is already late is made now
	socket?.on?.("disconnect", arm)

	const onVisible = () => {
		if (!document.hidden) readNow()
	}
	document.addEventListener("visibilitychange", onVisible)
	arm()

	return () => {
		clearTimeout(timer)
		for (const event of onSignal) socket?.off?.(event, readNow)
		socket?.off?.("disconnect", arm)
		document.removeEventListener("visibilitychange", onVisible)
	}
}
