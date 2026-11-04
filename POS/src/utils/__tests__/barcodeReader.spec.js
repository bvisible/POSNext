/**
 * //// Neoffice — added file (no upstream equivalent). The camera's reader of the shop scan (utils/barcodeReader): a label
 * //// read over and over counts once, and the browser's own reader is used only where it reads the shop's labels.
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { FORMATS, nativeDetector, onceEvery, REPEAT_MS } = await import("../barcodeReader");

describe("the reader of the shop's labels", () => {
	afterEach(() => {
		delete window.BarcodeDetector;
	});

	it("counts a label read over and over once, and again after two seconds", () => {
		let now = 0;
		const read = vi.fn();
		const emit = onceEvery(read, REPEAT_MS, () => now);

		emit("7612345678900");
		now = 500;
		emit("7612345678900");
		now = 2600;
		emit("7612345678900");

		expect(read).toHaveBeenCalledTimes(2);
	});

	it("counts another label at once", () => {
		const read = vi.fn();
		const emit = onceEvery(read, REPEAT_MS, () => 0);

		emit("111");
		emit("222");
		emit("");

		expect(read.mock.calls).toEqual([["111"], ["222"]]);
	});

	it("has no reader of its own where the browser has none", async () => {
		expect(await nativeDetector()).toBeNull();
	});

	it("asks the browser's reader for the shop's formats it reads", async () => {
		const made = [];
		window.BarcodeDetector = class {
			static getSupportedFormats() {
				return Promise.resolve(["qr_code", "ean_13", "code_128"]);
			}

			constructor(options) {
				made.push(options);
			}
		};

		expect(await nativeDetector()).not.toBeNull();
		expect(made).toEqual([{ formats: ["ean_13", "code_128"] }]);
		expect(FORMATS).toContain("ean_8");
	});

	it("leaves the browser's reader aside when it reads none of them", async () => {
		window.BarcodeDetector = class {
			static getSupportedFormats() {
				return Promise.resolve(["qr_code"]);
			}
		};

		expect(await nativeDetector()).toBeNull();
	});
});
