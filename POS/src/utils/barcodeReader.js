//// Neoffice — added file (no upstream equivalent). The camera's barcode reader of the shop scan (lot 2). The browser's own
//// reader (BarcodeDetector: Chrome on Android) where it exists; else zxing, loaded only by the page that asks for it (Safari
//// on an iPhone has no BarcodeDetector). A code read again within two seconds counts once: a phone held over a label reads
//// it many times a second.

export const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];
export const REPEAT_MS = 2000;
// The back camera when there is one; the reader decodes about five frames a second
const CAMERA = { video: { facingMode: { ideal: "environment" } }, audio: false };
const FRAME_MS = 200;

/** `onCode`, called once for a code read over and over: again only after `ms`, or for another code. */
export function onceEvery(onCode, ms = REPEAT_MS, now = () => Date.now()) {
	let last = { code: null, at: 0 };
	return (code) => {
		const at = now();
		if (!code || (code === last.code && at - last.at < ms)) return false;
		last = { code, at };
		onCode(code);
		return true;
	};
}

/** The browser's own reader, for the formats of the shop's labels it reads; null where it has none. */
export async function nativeDetector() {
	if (typeof window === "undefined" || !("BarcodeDetector" in window)) return null;
	try {
		const supported = await window.BarcodeDetector.getSupportedFormats();
		const formats = FORMATS.filter((format) => supported.includes(format));
		return formats.length ? new window.BarcodeDetector({ formats }) : null;
	} catch {
		return null;
	}
}

/**
 * Open the camera into `video` and call `onCode(text)` for each label read: {stop()}. Rejects when the page may not use the
 * camera (refused, none, an insecure page): the page then offers to type the code.
 */
export async function startReader(video, onCode) {
	const emit = onceEvery(onCode);
	const detector = await nativeDetector();
	if (detector) {
		const stream = await navigator.mediaDevices.getUserMedia(CAMERA);
		video.srcObject = stream;
		await video.play();
		let running = true;
		const frame = async () => {
			if (!running) return;
			try {
				const found = await detector.detect(video);
				if (found && found.length) emit(found[0].rawValue);
			} catch {
				// A frame the reader could not read: the next one
			}
			if (running) setTimeout(frame, FRAME_MS);
		};
		frame();
		return {
			stop() {
				running = false;
				stream.getTracks().forEach((track) => track.stop());
				video.srcObject = null;
			},
		};
	}
	const { BrowserMultiFormatReader } = await import("@zxing/browser");
	const reader = new BrowserMultiFormatReader();
	const controls = await reader.decodeFromConstraints(CAMERA, video, (result) => {
		if (result) emit(result.getText());
	});
	return {
		stop() {
			controls.stop();
		},
	};
}
