<!-- //// Neoffice — added file (no upstream equivalent). The help of a setting behind a lightbulb, the house -->
<!-- //// convention (product owner, 30.10.2026: never an « i », never a paragraph under the field): the bulb -->
<!-- //// shows the help on hover, and a click unfolds it under the setting (the parent draws it while `open`). -->
<!-- //// The icon is Lucide's `lightbulb`, the one the theme's add_icon_help draws on the desk. -->
<template>
	<button
		type="button"
		class="help-bulb inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] align-[-3px] text-[#968C7C] transition-colors hover:bg-[#FAEFE6] hover:text-[#A15A2E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D68A59]/60"
		:class="{ 'bg-[#FAEFE6] text-[#A15A2E]': open }"
		:title="text"
		:aria-label="__('Help')"
		:aria-expanded="open ? 'true' : 'false'"
		@click.stop="$emit('update:open', !open)"
	>
		<svg
			class="h-[15px] w-[15px]"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path
				d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"
			/>
			<path d="M9 18h6" />
			<path d="M10 22h4" />
		</svg>
	</button>
</template>

<script setup>
defineProps({
	// What the setting does, in full: the tooltip, and the text unfolded under the setting
	text: { type: String, required: true },
	open: { type: Boolean, default: false },
})

defineEmits(["update:open"])
</script>
