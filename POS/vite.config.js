import path from "node:path"
import { promises as fs } from "node:fs"
import vue from "@vitejs/plugin-vue"
import frappeui from "frappe-ui/vite"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { viteStaticCopy } from "vite-plugin-static-copy"

// Get build version from environment or use timestamp
const buildVersion = process.env.POS_NEXT_BUILD_VERSION || Date.now().toString()
const enableSourceMap = process.env.POS_NEXT_ENABLE_SOURCEMAP === "true"

/**
 * Vite plugin to write build version to version.json file
 * This enables cache busting and version tracking
 */
function posNextBuildVersionPlugin(version) {
	return {
		name: "pos-next-build-version",
		apply: "build",
		async writeBundle() {
			//// Neoffice — Biome reformat only: the path.resolve() call wrapped onto four lines
			//// (458d81a9, 2026-03-20 "remove BrainWise branding, add restaurant mode, and code
			//// formatting"). Same path.
			//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
			const versionFile = path.resolve(
				__dirname,
				"../pos_next/public/pos/version.json",
			)
			await fs.mkdir(path.dirname(versionFile), { recursive: true })
			await fs.writeFile(
				versionFile,
				JSON.stringify(
					{
						version,
						timestamp: new Date().toISOString(),
						buildDate: new Date().toLocaleDateString("en-US", {
							year: "numeric",
							month: "long",
							day: "numeric",
						}),
					},
					null,
					//// Neoffice — FORMATTING ONLY. Biome pass of 458d81a9 (2026-03-20 "remove BrainWise
					//// branding, add restaurant mode, and code formatting") added the trailing commas here
					//// and on the "utf8" argument below. No behaviour change: at the next merge take
					//// upstream's file and re-run `biome check --write` instead of resolving the noise.
					2,
				),
				//// Neoffice — the trailing comma announced in the block above: Biome only (458d81a9).
				"utf8",
			)
			console.log(`\n✓ Build version written: ${version}`)
		},
	}
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		posNextBuildVersionPlugin(buildVersion),
		frappeui({
			frappeProxy: true,
			jinjaBootData: true,
			lucideIcons: true,
			buildConfig: {
				indexHtmlPath: "../pos_next/www/pos.html",
				outDir: "../pos_next/public/pos",
				emptyOutDir: true,
				sourcemap: enableSourceMap,
			},
		}),
		vue(),
		viteStaticCopy({
			targets: [
				{
					src: "src/workers",
					dest: ".",
				},
			],
		}),
		VitePWA({
			//// Neoffice — was "autoUpdate", which reloads the page the instant a
			//// new service worker activates. On a till that can land mid-sale or
			//// mid-payment. "prompt" hands control to setupTillAutoUpdate, which
			//// applies the update only when the cart is empty and nothing is pending.
			registerType: "prompt",
			includeAssets: ["favicon.png", "icon.svg", "icon-maskable.svg"],
			manifest: {
				//// Neoffice — PWA manifest name: upstream installs as "POSNext", the till is sold as
				//// Neopos, and this is the label under the icon once a cashier adds it to the home
				//// screen (771950bd, 2026-04-02 "rebrand: rename POS Next to Neopos").
				//// rebrand: rename POS Next to Neopos — 771950b
				name: "Neopos",
				short_name: "Neopos",
				description:
					"Point of Sale system with real-time billing, stock management, and offline support",
				theme_color: "#4F46E5",
				background_color: "#ffffff",
				display: "standalone",
				scope: "/assets/pos_next/pos/",
				start_url: "/pos",
				icons: [
					{
						src: "/assets/pos_next/pos/icon.svg",
						sizes: "192x192",
						type: "image/svg+xml",
						purpose: "any",
					},
					{
						src: "/assets/pos_next/pos/icon.svg",
						sizes: "512x512",
						type: "image/svg+xml",
						purpose: "any",
					},
					{
						src: "/assets/pos_next/pos/icon-maskable.svg",
						sizes: "192x192",
						type: "image/svg+xml",
						purpose: "maskable",
					},
					{
						src: "/assets/pos_next/pos/icon-maskable.svg",
						sizes: "512x512",
						type: "image/svg+xml",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 3 MB
				//// Neoffice — added workbox options. Without skipWaiting/clientsClaim a new service
				//// worker sits "waiting" until every till tab is closed, which on a shop floor is never,
				//// so a deployed fix could stay unserved for days (fd65573b, 2026-03-30 "remove CSRF
				//// header from guest calls + SW skipWaiting for instant updates"). NOTE: this worker's
				//// scope is /assets/pos_next/pos/ while the till is served from /pos, so it never
				//// controls the page — keeping the build fresh is setupTillAutoUpdate()'s job, not its
				//// own (7648dbff, 2026-08-18).
				//// remove CSRF header from guest calls + SW skipWaiting for instant upda… — fd65573
				skipWaiting: true,
				clientsClaim: true,
				navigateFallback: null,
				navigateFallbackDenylist: [/^\/api/, /^\/app/],
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
						handler: "CacheFirst",
						options: {
							cacheName: "google-fonts-cache",
							expiration: {
								maxEntries: 10,
								maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
						handler: "CacheFirst",
						options: {
							cacheName: "gstatic-fonts-cache",
							expiration: {
								maxEntries: 10,
								maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: /\/assets\/pos_next\/pos\/.*/i,
						handler: "CacheFirst",
						options: {
							cacheName: "pos-assets-cache",
							expiration: {
								maxEntries: 500,
								maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
							},
						},
					},
					// Cache product images with StaleWhileRevalidate for better UX
					{
						urlPattern: /\/files\/.*\.(jpg|jpeg|png|gif|webp|svg)$/i,
						handler: "StaleWhileRevalidate",
						options: {
							cacheName: "product-images-cache",
							expiration: {
								maxEntries: 200, // Cache up to 200 product images
								maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: /\/api\/.*/i,
						handler: "NetworkFirst",
						options: {
							cacheName: "api-cache",
							networkTimeoutSeconds: 10,
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 60 * 60 * 24, // 24 hours
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: ({ request, url }) =>
							request.mode === "navigate" && url.pathname.startsWith("/pos"),
						handler: "NetworkFirst",
						options: {
							cacheName: "pos-page-cache",
							networkTimeoutSeconds: 3,
							expiration: {
								maxEntries: 1,
								maxAgeSeconds: 60 * 60 * 24, // 24 hours
							},
						},
					},
				],
				cleanupOutdatedCaches: true,
				skipWaiting: true,
				clientsClaim: true,
			},
			devOptions: {
				enabled: true,
				type: "module",
			},
		}),
	],
	build: {
		chunkSizeWarningLimit: 1500,
		outDir: "../pos_next/public/pos",
		emptyOutDir: true,
		target: "es2015",
		sourcemap: enableSourceMap,
	},
	worker: {
		format: "es",
		rollupOptions: {
			output: {
				format: "es",
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			"tailwind.config.js": path.resolve(__dirname, "tailwind.config.js"),
		},
	},
	define: {
		__BUILD_VERSION__: JSON.stringify(buildVersion),
	},
	optimizeDeps: {
		include: [
			"feather-icons",
			"showdown",
			"highlight.js/lib/core",
			"interactjs",
			"qz-tray",
		],
	},
	server: {
		allowedHosts: true,
		port: 8080,
		proxy: {
			"^/(app|api|assets|files|printview)": {
				target: "http://127.0.0.1:8000",
				ws: true,
				changeOrigin: true,
				secure: false,
				cookieDomainRewrite: "localhost",
				router: (req) => {
					const site_name = req.headers.host.split(":")[0]
					// Support both localhost and 127.0.0.1
					const isLocalhost =
						site_name === "localhost" || site_name === "127.0.0.1"
					const targetHost = isLocalhost ? "127.0.0.1" : site_name
					return `http://${targetHost}:8000`
				},
			},
		},
	},
})
