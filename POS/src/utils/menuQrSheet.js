//// Neoffice — added file (no upstream equivalent). The sheet that carries the QR code of a restaurant's public menu, to
//// be printed and stood on the tables (NeoResto lot 1, task 17): the code large, the restaurant's logo (or its name), and
//// one line that says what to do with it. The restaurant shows it to its own guests: it carries the restaurant's logo as
//// it keeps it and none of Neoffice's design (05.11.2026, design system §7.6): the system's sans-serif face, ink and
//// gray, no web font fetched. It is a page of its own, printed through a hidden frame like the receipts of the
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

// A white page in the system's sans-serif face: the printer leaves the margins of a page unpainted, so a tinted one would
// show as a frame
const STYLE = `
	@page { size: A4 portrait; margin: 18mm; }
	* { box-sizing: border-box; }
	html, body { margin: 0; background: #ffffff; color: #171717; }
	body { font-family: "Inter", system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
	.sheet { display: flex; flex-direction: column; align-items: center; gap: 9mm; padding-top: 14mm; text-align: center; }
	.sheet__logo { display: block; max-width: 90mm; max-height: 32mm; width: auto; height: auto; object-fit: contain; }
	.sheet__name { margin: 0; max-width: 100%; font-size: 34pt; font-weight: 700; line-height: 1.15; color: #171717; overflow-wrap: anywhere; }
	.sheet__qr { width: 130mm; max-width: 100%; }
	.sheet__qr svg { display: block; width: 100%; height: auto; }
	.sheet__caption { margin: 0; font-size: 26pt; font-weight: 700; line-height: 1.2; color: #171717; }
	.sheet__url { margin: 0; max-width: 100%; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 10pt; line-height: 1.4; color: #7c7c7c; overflow-wrap: anywhere; }
`

/**
 * The page to print: the restaurant's logo (or its name), the QR code of the address of its public menu, and « Scan to see
 * the menu ». The name and the address are written as text, escaped; the code is drawn from the address alone. The logo,
 * where the restaurant has one, stands at the top in its own proportions, in place of the name.
 */
export async function menuQrSheetHtml({ restaurantName, logo, url }) {
	const svg = await menuQrSvg(url)
	const name = escapeHtml(restaurantName)
	return `<!DOCTYPE html>
<html lang="${escapeHtml(document.documentElement.lang || "en")}">
<head>
<meta charset="utf-8">
<title>${name}</title>
<style>${STYLE}</style>
</head>
<body>
<main class="sheet">
${logo ? `<img class="sheet__logo" src="${escapeHtml(logo)}" alt="${name}">` : `<h1 class="sheet__name">${name}</h1>`}
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
export async function printMenuQr({ restaurantName, logo, url }) {
	await printHtml(await menuQrSheetHtml({ restaurantName, logo, url }))
}
