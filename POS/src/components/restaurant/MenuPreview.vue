<template>
	<div class="menu-preview-container h-full overflow-auto bg-gray-200 p-6 flex justify-center">
		<div
			class="menu-preview-page bg-white shadow-xl overflow-hidden"
			:style="pageStyle"
		>
			<div class="p-8" :style="contentStyle">
				<!-- Cover page / Header -->
				<div v-if="design.show_header !== false" class="text-center mb-8">
					<!-- Company logo -->
					<div v-if="showCoverPage && companyLogo" class="mb-4">
						<img :src="companyLogo" alt="" class="mx-auto max-h-20 object-contain" />
					</div>
					<!-- Title -->
					<h1 :style="{ fontFamily: design.font_header + ', serif', color: design.color_primary, fontSize: '28px', fontWeight: '700', letterSpacing: '1px' }">
						{{ design.header_text || card.card_name || '' }}
					</h1>
					<!-- Decorative line -->
					<div class="mx-auto mt-3 mb-2" :style="{ width: '60px', height: '2px', backgroundColor: design.color_accent || design.color_primary }"></div>
				</div>

				<!-- Categories & Items -->
				<div :style="columnsStyle">
					<div v-for="(category, ci) in categories" :key="ci" class="mb-6 break-inside-avoid">
						<!-- Category header -->
						<div v-if="category.label" class="mb-3" :class="categoryClass">
							<h2 :style="{ fontFamily: design.font_header + ', serif', color: design.color_accent || design.color_primary, fontSize: '16px', fontWeight: '600' }">
								{{ category.label }}
							</h2>
						</div>

						<!-- Items -->
						<div v-for="(item, ii) in category.menu_items" :key="ii" class="mb-2.5 break-inside-avoid">
							<!-- Dotted leader layout -->
							<div v-if="design.price_alignment === 'dotted'" class="flex items-baseline">
								<span :style="{ fontFamily: design.font_body, color: design.color_primary, fontSize: '13px', fontWeight: '600' }">
									{{ item.item_name }}
								</span>
								<span v-if="item.spice_level > 0" class="ml-1 text-xs">
									<span v-for="s in item.spice_level" :key="s">🌶</span>
								</span>
								<span v-if="design.show_allergens && item.badges?.length" class="inline-flex gap-1 ml-1 items-center">
									<span v-for="badge in item.badges" :key="badge.badge_name" class="flex items-center gap-0.5">
										<img :src="`/assets/pos_next/icons/badges/${badge.icon}`"
											:title="badge.badge_name" class="w-4 h-4 inline-block" />
										<span class="text-[8px]" :style="{ color: design.color_secondary }">{{ badge.badge_name }}</span>
									</span>
								</span>
								<span class="flex-1 mx-1 border-b border-dotted" :style="{ borderColor: design.color_secondary || '#ccc', marginBottom: '3px' }"></span>
								<span v-if="priceDisplay(item)" :style="{ fontFamily: design.font_body, color: design.color_primary, fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap' }">
									{{ priceDisplay(item) }}
								</span>
							</div>
							<!-- Standard layout (right or inline) -->
							<div v-else class="flex justify-between items-baseline gap-2">
								<div class="flex-1 min-w-0">
									<span :style="{ fontFamily: design.font_body, color: design.color_primary, fontSize: '13px', fontWeight: '600' }">
										{{ item.item_name }}
									</span>
									<span v-if="item.spice_level > 0" class="ml-1 text-xs">
										<span v-for="s in item.spice_level" :key="s">🌶</span>
									</span>
									<span v-if="design.show_allergens && item.badges?.length" class="inline-flex gap-1 ml-1 items-center">
										<span v-for="badge in item.badges" :key="badge.badge_name" class="flex items-center gap-0.5">
											<img :src="`/assets/pos_next/icons/badges/${badge.icon}`"
												:title="badge.badge_name" class="w-4 h-4 inline-block" />
											<span class="text-[8px]" :style="{ color: design.color_secondary }">{{ badge.badge_name }}</span>
										</span>
									</span>
									<!-- Inline price -->
									<span v-if="design.price_alignment === 'inline' && priceDisplay(item)" class="ml-2"
										:style="{ fontFamily: design.font_body, color: design.color_secondary, fontSize: '13px' }">
										{{ priceDisplay(item) }}
									</span>
								</div>
								<!-- Right-aligned price -->
								<span v-if="design.price_alignment !== 'inline' && priceDisplay(item)"
									:style="{ fontFamily: design.font_body, color: design.color_primary, fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap' }">
									{{ priceDisplay(item) }}
								</span>
							</div>
							<!-- Description -->
							<p v-if="design.show_descriptions && item.description"
								:style="{ fontFamily: design.font_body, color: design.color_secondary, fontSize: '11px', fontStyle: 'italic' }"
								class="mt-0.5 line-clamp-2 pl-0">
								{{ item.description }}
							</p>
							<!-- Product options -->
							<div v-if="design.show_options && item.product_options?.length" class="mt-0.5">
								<span v-for="opt in item.product_options" :key="opt.group_name"
									:style="{ fontFamily: design.font_body, color: design.color_secondary, fontSize: '10px' }">
									{{ opt.group_name }}: {{ opt.options.join(', ') }}
								</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Allergen Legend -->
				<div v-if="design.show_allergens && usedBadges.length" class="mt-6 pt-3 border-t" :style="{ borderColor: '#ddd' }">
					<p class="text-[9px] font-bold mb-1" :style="{ color: design.color_secondary }}>{{ __('Allergens') }}</p>
					<div class="flex flex-wrap gap-2">
						<span v-for="badge in usedBadges" :key="badge.badge_name" class="flex items-center gap-1">
							<img :src="`/assets/pos_next/icons/badges/${badge.icon}`" class="w-3 h-3" />
							<span class="text-[8px]" :style="{ color: design.color_secondary }">{{ badge.badge_name }}</span>
						</span>
					</div>
				</div>

				<!-- Footer -->
				<div v-if="design.footer_text" class="text-center mt-8 pt-4 border-t" :style="{ borderColor: design.color_accent || '#ddd' }">
					<p :style="{ fontFamily: design.font_body, color: design.color_secondary, fontSize: '10px', fontStyle: 'italic' }">
						{{ design.footer_text }}
					</p>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue"

const props = defineProps({
	card: { type: Object, default: () => ({}) },
	categories: { type: Array, default: () => [] },
	design: { type: Object, default: () => ({}) },
	currency: { type: String, default: "CHF" },
	companyLogo: { type: String, default: "" },
	showCoverPage: { type: Boolean, default: true },
})

// Compute all unique badges used across all items
const usedBadges = computed(() => {
	const seen = new Set()
	const badges = []
	for (const cat of props.categories) {
		for (const item of cat.menu_items || []) {
			for (const badge of item.badges || []) {
				if (!seen.has(badge.badge_name)) {
					seen.add(badge.badge_name)
					badges.push(badge)
				}
			}
		}
	}
	return badges
})

const pageStyle = computed(() => {
	const t = props.design
	const bg =
		t.style_theme === "ardoise"
			? "#2D2D2D"
			: t.style_theme === "elegant"
				? "#FFF8F0"
				: t.style_theme === "bistrot"
					? "#F5F0EB"
					: "#FFFFFF"
	return {
		backgroundColor: bg,
		width: "210mm",
		minHeight: "297mm",
		maxWidth: "100%",
		transformOrigin: "top center",
	}
})

const contentStyle = computed(() => {
	const t = props.design
	return {
		fontFamily: t.font_body || "Inter, sans-serif",
		color: t.color_primary || "#1a1a1a",
	}
})

const columnsStyle = computed(() => {
	const cols = props.design.columns || 1
	if (cols <= 1) return {}
	return { columnCount: cols, columnGap: "2rem" }
})

const categoryClass = computed(() => {
	const theme = props.design.style_theme
	if (theme === "elegant") return "text-center border-t border-b py-2"
	if (theme === "ardoise") return "text-center"
	if (theme === "bistrot") return ""
	return "border-b pb-1"
})

function priceDisplay(item) {
	if (item.price_text) return item.price_text
	if (item.price > 0) return `${props.currency} ${item.price.toFixed(2)}`
	return ""
}
</script>
