//// Neoffice — added file (no upstream equivalent).
////
//// Before a run: take away the tables an earlier run abandoned (its clean-up failed on a busy instance, or it was
//// killed). The suite's tables are all named "E2E …"; only those older than half an hour are touched.

const { sweepStale } = require("./server");

module.exports = async () => {
	const stale = sweepStale();
	if (stale.tables.length)
		console.log(`swept ${stale.tables.length} table(s) an earlier run abandoned`);
};
