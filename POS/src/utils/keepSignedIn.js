//// Neoffice — added file (no upstream equivalent). The till keeps its staff signed in for the number of days its POS Settings
//// say (`keep_signed_in_days`, NeoRestau lot 1, product owner, 01.11.2026: a waiter's phone must not ask for a password every
//// morning). The length is the till's own setting, not the ERP's: the server stamps the session with it (pos_next.api.session).
////
//// The till asks ONCE per page load, as soon as its POS Profile is known (posSettings.loadSettings, which both the page's
//// start and a shift opened later go through), and again after a sign-in or a sign-out (forgetKeepSignedIn: a new sign-in is
//// a new session, which has to be stamped). A call that fails (offline, a server error) is swallowed to the console and tried
//// again the next time the profile is loaded: it must NEVER block the till, whose sale does not depend on it.
import { call } from "@/utils/apiWrapper";
import { logger } from "@/utils/logger";

const log = logger.create("KeepSignedIn");

export const KEEP_SIGNED_IN_METHOD = "pos_next.api.session.keep_signed_in";

// The profiles already asked for in this page load (and not forgotten since)
const asked = new Set();

/**
 * Ask the server to keep this session open for the days the till's settings say. Fire-and-forget: it returns at once,
 * and never throws.
 * @param {string} posProfile - the till's POS Profile name
 */
export function keepStaffSignedIn(posProfile) {
	if (!posProfile || asked.has(posProfile)) return;
	asked.add(posProfile);
	// Started on a microtask so that anything that goes wrong in `call` itself (not only its promise) is swallowed too
	Promise.resolve()
		.then(() => call(KEEP_SIGNED_IN_METHOD, { pos_profile: posProfile }))
		.then((answer) => log.debug("Staff kept signed in", answer))
		.catch((error) => {
			// Tried again at the next load of the profile's settings
			asked.delete(posProfile);
			log.warn("Could not keep the staff signed in (the till is not affected)", error);
		});
}

/** Forget what was asked: the next sign-in is a session of its own, stamped on its own. */
export function forgetKeepSignedIn() {
	asked.clear();
}
