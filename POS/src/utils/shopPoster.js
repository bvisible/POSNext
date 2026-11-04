//// Neoffice — added file (no upstream equivalent). The poster of a shop's QR code (scanning in the shop, lot 5): the
//// shop's name, « Scan your articles », the code large and the three steps the phone's page says, to show at the
//// entrance and in the aisles. The sheet of the restaurant's public menu (menuQrSheet) on the same page and through the
//// same hidden frame: the Design System's faces, a white page, nothing of the till on the paper.
import { escapeHtml, menuQrSvg, printHtml } from "@/utils/menuQrSheet"

const FONTS =
	"https://fonts.googleapis.com/css2?family=Forum&family=Karla:wght@400;600&display=swap"

const STYLE = `
	@page { size: A4 portrait; margin: 16mm; }
	* { box-sizing: border-box; }
	html, body { margin: 0; background: #ffffff; color: #141414; }
	body { font-family: "Karla", "Inter", system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
	.poster { display: flex; flex-direction: column; align-items: center; gap: 7mm; padding-top: 8mm; text-align: center; }
	.poster__name { margin: 0; max-width: 100%; font-size: 14pt; font-weight: 600; letter-spacing: 0.04em; color: #524b41; overflow-wrap: anywhere; }
	.poster__title { margin: 0; font-family: "Forum", serif; font-size: 44pt; font-weight: 400; line-height: 1.08; color: #141414; }
	.poster__rule { width: 14mm; height: 0; margin: 0; border: 0; border-top: 0.6mm solid #f55d1a; }
	.poster__qr { width: 110mm; max-width: 100%; }
	.poster__qr svg { display: block; width: 100%; height: auto; }
	.poster__steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; width: 100%; margin: 0; padding: 0; list-style: none; text-align: left; }
	.poster__step { display: flex; flex-direction: column; gap: 1.5mm; }
	.poster__step .poster__number { font-family: "Forum", serif; font-size: 22pt; line-height: 1; color: #aa3700; }
	.poster__step strong { font-size: 13pt; color: #141414; }
	.poster__step span { font-size: 11pt; line-height: 1.35; color: #524b41; }
	.poster__url { margin: 0; max-width: 100%; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 9pt; line-height: 1.4; color: #6f665a; overflow-wrap: anywhere; }
`

/** The three steps of the phone's page, as the poster writes them: [title, text]. */
export function posterSteps() {
	return [
		[__("Scan"), __("The shop's articles, with their price.")],
		[__("Go to the till"), __("Show your code to the seller.")],
		[__("Checked and paid"), __("A seller checks your cart, then you pay.")],
	]
}

/** The page to print. The name and the address are written as text, escaped; the code is drawn from the address alone. */
export async function shopPosterHtml({ shopName, url }) {
	const svg = await menuQrSvg(url)
	const steps = posterSteps()
		.map(
			([title, text], index) =>
				`<li class="poster__step"><span class="poster__number">${index + 1}</span><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></li>`,
		)
		.join("")
	return `<!DOCTYPE html>
<html lang="${escapeHtml(document.documentElement.lang || "en")}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(shopName)}</title>
<link rel="stylesheet" href="${escapeHtml(FONTS)}">
<style>${STYLE}</style>
</head>
<body>
<main class="poster">
<p class="poster__name">${escapeHtml(shopName)}</p>
<h1 class="poster__title">${escapeHtml(__("Scan your articles"))}</h1>
<hr class="poster__rule">
<div class="poster__qr" data-url="${escapeHtml(url)}">${svg}</div>
<ol class="poster__steps">${steps}</ol>
<p class="poster__url">${escapeHtml(url)}</p>
</main>
</body>
</html>`
}

/** Print the poster of the shop's QR code. */
export async function printShopPoster({ shopName, url }) {
	await printHtml(await shopPosterHtml({ shopName, url }))
}
