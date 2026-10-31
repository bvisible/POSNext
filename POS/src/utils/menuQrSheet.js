//// Neoffice — added file (no upstream equivalent). The sheet that carries the QR code of a restaurant's public menu, to
//// be printed and stood on the tables (NeoRestau lot 1, task 17): the code large, the restaurant's name, and one line
//// that says what to do with it. It is a page of its own, printed through a hidden frame like the receipts of the
//// till (printInvoice.browserPrintDoc), so that the till under it, whatever is open on it, never ends up on the paper.

/** The text of a name or an address, safe to write into the sheet's HTML. */
export function escapeHtml(text) {
	return String(text ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
}

/** The QR code of an address as an SVG, which prints sharp at any size. `qrcode` is loaded when a sheet is printed. */
export async function menuQrSvg(url) {
	const { default: QRCode } = await import("qrcode")
	return QRCode.toString(url, {
		type: "svg",
		margin: 2,
		errorCorrectionLevel: "M",
		color: { dark: "#141414", light: "#ffffff" },
	})
}

// The faces of the Design System: Forum for the title, Karla for the text. A white page: the printer leaves the margins
// of a page unpainted, so a cream one would show as a frame.
const FONTS = "https://fonts.googleapis.com/css2?family=Forum&family=Karla:wght@400;600&display=swap"

const STYLE = `
	@page { size: A4 portrait; margin: 18mm; }
	* { box-sizing: border-box; }
	html, body { margin: 0; background: #ffffff; color: #141414; }
	body { font-family: "Karla", "Inter", system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
	.sheet { display: flex; flex-direction: column; align-items: center; gap: 9mm; padding-top: 14mm; text-align: center; }
	.sheet__name { margin: 0; max-width: 100%; font-family: "Forum", serif; font-size: 40pt; font-weight: 400; line-height: 1.1; letter-spacing: -0.01em; color: #141414; overflow-wrap: anywhere; }
	.sheet__rule { width: 14mm; height: 0; margin: 0; border: 0; border-top: 0.6mm solid #d68a59; }
	.sheet__qr { width: 130mm; max-width: 100%; }
	.sheet__qr svg { display: block; width: 100%; height: auto; }
	.sheet__caption { margin: 0; font-size: 26pt; font-weight: 600; line-height: 1.2; color: #141414; }
	.sheet__url { margin: 0; max-width: 100%; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 10pt; line-height: 1.4; color: #6f665a; overflow-wrap: anywhere; }
`

/**
 * The page to print: the restaurant's name, the QR code of the address of its public menu, and « Scan to see the menu ».
 * The name and the address are written as text, escaped; the code is drawn from the address alone.
 */
export async function menuQrSheetHtml({ restaurantName, url }) {
	const svg = await menuQrSvg(url)
	const name = escapeHtml(restaurantName)
	return `<!DOCTYPE html>
<html lang="${escapeHtml(document.documentElement.lang || "en")}">
<head>
<meta charset="utf-8">
<title>${name}</title>
<link rel="stylesheet" href="${escapeHtml(FONTS)}">
<style>${STYLE}</style>
</head>
<body>
<main class="sheet">
<h1 class="sheet__name">${name}</h1>
<hr class="sheet__rule">
<div class="sheet__qr" data-url="${escapeHtml(url)}">${svg}</div>
<p class="sheet__caption">${escapeHtml(__("Scan to see the menu"))}</p>
<p class="sheet__url">${escapeHtml(url)}</p>
</main>
</body>
</html>`
}

const FONTS_WAIT_MS = 2000
const FRAME_KEPT_MS = 60_000
// What the frame may do: print (a modal), and be read by the page that holds it (its fonts, its window), which is what a
// frame of the same site is. Not scripts: the sheet is text and a drawing, and if a mistake of escaping ever let a tag
// of a restaurant's through, it would still be inert.
const FRAME_SANDBOX = "allow-same-origin allow-modals"

/**
 * Print an HTML page through the browser's own dialog, from a hidden, sandboxed frame: no pop-up to be blocked, nothing of
 * the page under it on the paper, nothing in it that can run. Waits for the faces of the sheet (a moment at most) so that
 * the paper is not set in the fallback; the frame is removed after the dialog, or a minute at the latest.
 */
export function printHtml(html) {
	return new Promise((resolve, reject) => {
		const frame = document.createElement("iframe")
		frame.setAttribute("aria-hidden", "true")
		frame.setAttribute("sandbox", FRAME_SANDBOX)
		frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;"
		frame.onload = async () => {
			try {
				const faces = frame.contentDocument?.fonts?.ready
				if (faces) {
					await Promise.race([faces, new Promise((done) => setTimeout(done, FONTS_WAIT_MS))])
				}
				frame.contentWindow.focus()
				frame.contentWindow.print()
				resolve()
			} catch (error) {
				reject(error)
			} finally {
				setTimeout(() => frame.remove(), FRAME_KEPT_MS)
			}
		}
		frame.srcdoc = html
		document.body.appendChild(frame)
	})
}

/** Print the sheet of a restaurant's public menu. */
export async function printMenuQr({ restaurantName, url }) {
	await printHtml(await menuQrSheetHtml({ restaurantName, url }))
}
