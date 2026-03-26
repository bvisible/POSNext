<template>
	<div class="menu-preview-container h-full overflow-auto bg-gray-200 p-6 flex justify-center">
		<div
			class="menu-preview-page bg-white shadow-xl overflow-hidden"
			:style="pageStyle"
		>
			<div class="p-8" :style="contentStyle">
				<!-- Header -->
				<div v-if="template.header_text" class="text-center mb-6">
					<h1 :style="{ fontFamily: template.font_header, color: template.color_primary, fontSize: '28px', fontWeight: '700' }">
						{{ template.header_text || card.card_name }}
					</h1>
				</div>
				<div v-else-if="card.card_name" class="text-center mb-6">
					<h1 :style="{ fontFamily: template.font_header, color: template.color_primary, fontSize: '28px', fontWeight: '700' }">
						{{ card.card_name }}
					</h1>
				</div>

				<!-- Categories & Items -->
				<div :style="columnsStyle">
					<div v-for="(category, ci) in categories" :key="ci" class="mb-6 break-inside-avoid">
						<!-- Category header -->
						<div v-if="category.label" class="mb-3" :class="categoryClass">
							<h2 :style="{ fontFamily: template.font_header, color: template.color_accent || template.color_primary, fontSize: '18px', fontWeight: '600' }">
								{{ category.label }}
							</h2>
						</div>

						<!-- Items -->
						<div v-for="(item, ii) in category.items" :key="ii" class="mb-3 break-inside-avoid">
							<div class="flex justify-between items-baseline gap-2">
								<div class="flex-1 min-w-0">
									<!-- Item name -->
									<span :style="{ fontFamily: template.font_body, color: template.color_primary, fontSize: '14px', fontWeight: '600' }">
										{{ item.item_name }}
									</span>
									<!-- Spice level -->
									<span v-if="item.spice_level > 0" class="ml-1">
										<span v-for="s in item.spice_level" :key="s" class="text-xs">🌶</span>
									</span>
									<!-- Badges -->
									<span v-if="template.show_allergens && item.badges && item.badges.length" class="inline-flex gap-0.5 ml-1 align-middle">
										<img
											v-for="badge in item.badges"
											:key="badge.badge_name"
											:src="`/assets/pos_next/icons/badges/${badge.icon}`"
											:title="badge.badge_name"
											class="w-3.5 h-3.5 inline-block"
											:style="{ color: badge.color }"
										/>
									</span>
								</div>
								<!-- Price -->
								<div v-if="priceDisplay(item)" :style="{ fontFamily: template.font_body, color: template.color_primary, fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap' }"
									:class="template.price_alignment === 'dotted' ? 'border-b border-dotted border-gray-400 flex-shrink-0 pl-2' : 'flex-shrink-0'">
									{{ priceDisplay(item) }}
								</div>
							</div>
							<!-- Description -->
							<p v-if="template.show_descriptions && item.description"
								:style="{ fontFamily: template.font_body, color: template.color_secondary, fontSize: '12px', fontStyle: 'italic' }"
								class="mt-0.5 line-clamp-2">
								{{ item.description }}
							</p>
							<!-- Product options -->
							<div v-if="template.show_options && item.product_options && item.product_options.length" class="mt-1">
								<div v-for="opt in item.product_options" :key="opt.group_name"
									:style="{ fontFamily: template.font_body, color: template.color_secondary, fontSize: '11px' }">
									{{ opt.group_name }}: {{ opt.options.join(', ') }}
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div v-if="template.footer_text" class="text-center mt-8 pt-4 border-t" :style="{ borderColor: template.color_accent }">
					<p :style="{ fontFamily: template.font_body, color: template.color_secondary, fontSize: '11px', fontStyle: 'italic' }">
						{{ template.footer_text }}
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
	template: { type: Object, default: () => ({}) },
	currency: { type: String, default: "CHF" },
})

const pageStyle = computed(() => {
	const t = props.template
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
	const t = props.template
	return {
		fontFamily: t.font_body || "Inter, sans-serif",
		color: t.color_primary || "#1a1a1a",
	}
})

const columnsStyle = computed(() => {
	const cols = props.template.columns || 1
	if (cols <= 1) return {}
	return { columnCount: cols, columnGap: "2rem" }
})

const categoryClass = computed(() => {
	const theme = props.template.style_theme
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
