<template>
	<div class="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
		<!-- Header: Area tabs + Edit toggle -->
		<div class="flex items-center justify-between px-4 py-2 border-b dark:border-gray-800">
			<!-- Area Tabs -->
			<div class="flex items-center gap-1 overflow-x-auto" v-if="areas.length > 1">
				<button
					v-for="area in areas"
					:key="area.name"
					@click="selectedArea = area.name"
					:draggable="isEditMode"
					@dragstart="onAreaDragStart($event, area)"
					@dragover.prevent="onAreaDragOver($event, area)"
					@drop="onAreaDrop($event, area)"
					class="relative px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors"
					:class="[
						selectedArea === area.name
							? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
							: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800',
						isEditMode ? 'cursor-grab' : ''
					]"
				>
					{{ area.area_name }}
					<span
						v-if="occupiedCount(area.name) > 0"
						class="ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full"
					>
						{{ occupiedCount(area.name) }}
					</span>
				</button>

				<!-- Area management buttons (edit mode) - outside overflow container -->
				<template v-if="isEditMode && selectedArea">
					<button
						@click.stop="openRenameAreaDialog(areas.find(a => a.name === selectedArea))"
						class="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 transition-colors flex-shrink-0"
						:title="__('Rename area')"
					>
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
						</svg>
					</button>
					<button
						@click.stop="openDeleteAreaDialog(areas.find(a => a.name === selectedArea))"
						class="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors flex-shrink-0"
						:title="__('Delete area')"
					>
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</button>
				</template>

				<!-- Add Area Button (edit mode) -->
				<button
					v-if="isEditMode"
					@click="showAddAreaDialog = true"
					class="w-7 h-7 flex items-center justify-center rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors"
					:title="__('Add Area')"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
				</button>
			</div>
			<div v-else class="text-sm font-medium text-gray-700 dark:text-gray-300">
				{{ __("Floor Plan") }}
			</div>

			<div class="flex items-center gap-2">
				<!-- Edit Mode Toggle -->
				<button
					@click="toggleEditMode"
					class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
					:class="isEditMode
						? 'bg-green-100 text-green-700 hover:bg-green-200'
						: 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path v-if="isEditMode" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						<path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
					</svg>
					{{ isEditMode ? __("Save") : __("Edit") }}
				</button>
				<button
					v-if="isEditMode"
					@click="cancelEditMode"
					class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-red-50 text-red-600 hover:bg-red-100"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
					{{ __("Cancel") }}
				</button>
			</div>
		</div>

		<!-- No active card warning -->
		<div v-if="restaurantStore.hasCardWarning"
			class="mx-4 mt-2 mb-0 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
			<svg class="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
			</svg>
			<span class="text-xs text-amber-800 font-medium">
				{{ restaurantStore.restaurantStatus.warning || __('No active card for the current time slot') }}
			</span>
		</div>

		<!-- Station Activity Bar -->
		<div v-if="!isEditMode && allStations.length > 0"
			class="flex items-center gap-2 px-4 py-1.5 border-b dark:border-gray-800 bg-gray-50/80 dark:bg-gray-850 overflow-x-auto flex-shrink-0">
			<div v-for="station in allStations" :key="'sbar-' + station.name"
				class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all hover:shadow-sm"
				:class="station.area === selectedArea
					? 'border-2'
					: 'border border-dashed opacity-60 hover:opacity-90'"
				:style="{
					borderColor: station.color || '#6B7280',
					backgroundColor: station.area === selectedArea ? (station.color || '#6B7280') + '15' : 'transparent',
					color: station.color || '#6B7280'
				}"
				@click="openStationKDS(station)">
				<span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ backgroundColor: station.color || '#6B7280' }"></span>
				<span class="font-semibold">{{ station.station_name }}</span>
				<span v-if="station.area !== selectedArea" class="text-[9px] opacity-50">
					({{ getAreaName(station.area) }})
				</span>
				<span v-if="getStationPreparingCount(station.name) > 0"
					class="text-[9px] font-bold px-1 py-0.5 rounded"
					:style="{ backgroundColor: '#3B82F620', color: '#3B82F6' }">
					{{ getStationPreparingCount(station.name) }}p
				</span>
				<span v-if="getStationReadyCount(station.name) > 0"
					class="text-[9px] font-bold px-1 py-0.5 rounded animate-pulse"
					:style="{ backgroundColor: '#22C55E30', color: '#16A34A' }">
					{{ getStationReadyCount(station.name) }}✓
				</span>
			</div>

			<!-- Spacer + Runner pill (only when runner is enabled) -->
			<div class="flex-grow"></div>
			<!-- Runner pill -->
			<div v-if="restaurantStore.runnerEnabled"
				class="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all flex-shrink-0"
				:class="totalReadyCount > 0
					? 'bg-green-500 text-white hover:bg-green-600 shadow-sm'
					: 'border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-500'"
				@click="openRunnerTab">
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
				</svg>
				{{ __("Runner") }}
				<span class="bg-white/30 px-1.5 py-0.5 rounded text-[10px]"
					:class="totalReadyCount > 0 ? 'animate-pulse' : ''">
					{{ totalReadyCount }}
				</span>
			</div>
			<!-- Takeaway pill -->
			<div v-if="restaurantStore.takeawayEnabled"
				class="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all flex-shrink-0"
				:class="takeawayReadyCount > 0
					? 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm'
					: 'border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-500'"
				@click="startNewTakeaway">
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
				</svg>
				{{ __("Takeaway") }}
				<span class="bg-white/30 px-1.5 py-0.5 rounded text-[10px] cursor-pointer"
					:class="takeawayReadyCount > 0 ? 'animate-pulse' : ''"
					@click.stop="openTakeawayTab">
					{{ takeawayReadyCount }}/{{ takeawayTotalCount }}
				</span>
			</div>
		</div>

		<!-- Wall Drawing Toolbar (edit mode only) -->
		<div v-if="isEditMode" class="flex items-center gap-1 px-4 py-1.5 border-b bg-blue-50/50 flex-shrink-0" data-gesture-ignore>
			<span class="text-[10px] text-gray-500 font-medium mr-1">{{ __("Draw") }}:</span>
			<button v-for="tool in [
				{ id: 'select', icon: 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z', label: __('Select') },
				{ id: 'wall', icon: 'M4 12h16', label: __('Wall') },
				{ id: 'door', icon: 'M3 12h4l1-4h8l1 4h4', label: __('Door') },
				{ id: 'window', icon: 'M4 8h16M4 12h16M4 16h16', label: __('Window') },
			]" :key="tool.id"
				@click="wallTool = tool.id"
				class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors"
				:class="wallTool === tool.id
					? 'bg-blue-500 text-white'
					: 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'"
				:title="tool.label"
			>
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="tool.icon" />
				</svg>
				{{ tool.label }}
			</button>
			<div class="flex-grow" />
			<!-- Wall opacity -->
			<label class="flex items-center gap-1 text-[10px] text-gray-500">
				{{ __("Opacity") }}
				<input type="range" min="0.1" max="1" step="0.1" v-model.number="wallOpacity"
					class="w-16 h-3 accent-gray-500" />
			</label>
			<!-- Background image toggle -->
			<label v-if="floorPlanBgUrl" class="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
				<input type="checkbox" v-model="showFloorBg" class="w-3 h-3" />
				{{ __("Background") }}
			</label>
			<!-- Upload background image -->
			<label class="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 cursor-pointer">
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
				</svg>
				{{ __("Image") }}
				<input type="file" accept="image/*" class="hidden" @change="onBgImageUpload" />
			</label>
		</div>

		<!-- Canvas -->
		<div
			ref="canvasRef"
			class="flex-1 relative overflow-hidden"
			style="touch-action: none;"
			:style="canvasBackgroundStyle"
		>
			<!-- Zoom controls -->
			<div class="absolute bottom-3 right-3 flex flex-col gap-1 z-20" data-gesture-ignore>
				<button
					@click="zoomIn"
					class="w-8 h-8 flex items-center justify-center bg-white/90 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-700 text-lg font-bold transition-colors"
					:title="__('Zoom in')"
				>+</button>
				<button
					v-if="zoomLevel !== 1"
					@click="zoomReset"
					class="w-8 h-8 flex items-center justify-center bg-white/90 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-500 text-[10px] font-medium transition-colors"
					:title="__('Reset zoom')"
				>{{ Math.round(zoomLevel * 100) }}%</button>
				<button
					@click="zoomOut"
					class="w-8 h-8 flex items-center justify-center bg-white/90 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-700 text-lg font-bold transition-colors"
					:title="__('Zoom out')"
				>&minus;</button>
			</div>
			<!-- Empty state -->
			<div v-if="filteredTables.length === 0 && !isEditMode" class="flex flex-col items-center justify-center h-full text-gray-400">
				<svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
				</svg>
				<p class="text-lg font-medium">{{ __("No tables in this area") }}</p>
				<p class="text-sm">{{ __("Switch to Edit mode to add tables") }}</p>
			</div>

			<!-- Floor plan walls/doors/windows (OUTSIDE zoom container for full canvas coverage) -->
			<FloorPlanWalls
				ref="wallsRef"
				:walls="localWalls"
				:doors="localDoors"
				:windows="localWindows"
				:is-edit-mode="isEditMode"
				:active-tool="wallTool"
				:zoom-level="zoomLevel"
				:pan-x="panX"
				:pan-y="panY"
				:wall-opacity="wallOpacity"
				@update:walls="localWalls = $event"
				@update:doors="localDoors = $event"
				@update:windows="localWindows = $event"
				@add-wall="onAddWall"
				@add-door="onAddDoor"
				@add-window="onAddWindow"
			/>

			<!-- Zoomable container -->
			<div :style="gestureTransformStyle" class="w-full h-full relative">

			<!-- Background image -->
			<img v-if="floorPlanBgUrl && showFloorBg"
				:src="floorPlanBgUrl"
				class="absolute top-0 left-0 pointer-events-none select-none"
				style="opacity: 0.2; max-width: none;"
			/>

			<!-- SVG Delivery Arrows (rendered FIRST = behind tables/stations) -->
			<svg v-if="showDeliveryArrows && deliveryArrows.length > 0"
				class="absolute inset-0 pointer-events-none overflow-visible"
				width="100%" height="100%">

				<g v-for="arrow in deliveryArrows" :key="'arrow-' + arrow.key">
					<!-- Subtle guide line -->
					<line :x1="arrow.x1" :y1="arrow.y1" :x2="arrow.x2" :y2="arrow.y2"
						:stroke="arrow.color" stroke-width="1" stroke-opacity="0.08" />

					<!-- Invisible path for animateMotion -->
					<path :id="'dpath-' + arrow.key"
						:d="`M${arrow.x1},${arrow.y1} L${arrow.x2},${arrow.y2}`"
						fill="none" stroke="none" />

					<!-- Flowing chevrons along the path (8 evenly spaced, slow) -->
					<polygon v-for="i in 8" :key="'chev-' + arrow.key + '-' + i"
						points="0,-2.5 4,0 0,2.5" :fill="arrow.color" :fill-opacity="0.4">
						<animateMotion
							:dur="arrow.duration || '5s'"
							repeatCount="indefinite"
							:begin="((i - 1) * parseFloat(arrow.duration || '5') / 8) + 's'"
							rotate="auto">
							<mpath :href="'#dpath-' + arrow.key" />
						</animateMotion>
					</polygon>
				</g>

				<!-- Item count badge at midpoint -->
				<g v-for="arrow in deliveryArrows.filter(a => a.itemCount > 1)" :key="'count-' + arrow.key">
					<circle :cx="(arrow.x1 + arrow.x2) / 2" :cy="(arrow.y1 + arrow.y2) / 2" r="7"
						:fill="arrow.color" fill-opacity="0.7" />
					<text :x="(arrow.x1 + arrow.x2) / 2" :y="(arrow.y1 + arrow.y2) / 2 + 3"
						fill="white" font-size="8" font-weight="bold" text-anchor="middle">
						{{ arrow.itemCount }}
					</text>
				</g>
			</svg>

			<!-- Tables -->
			<div
				v-for="table in filteredTables"
				:key="table.name"
				class="absolute flex flex-col items-center justify-center select-none transition-shadow duration-150"
				:class="[
					getTableClasses(table),
					isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:shadow-lg',
				]"
				:style="getTableStyle(table)"
				@pointerdown="onTablePointerDown($event, table)"
			>
				<!-- Seats around table -->
				<div
					v-for="(seat, si) in getSeatPositions(table)"
					:key="'seat-' + si"
					class="absolute w-3.5 h-3.5 rounded-sm border-2 pointer-events-none"
					:class="table.status === 'Occupied' ? 'bg-gray-400 border-gray-500' : 'bg-white border-gray-300'"
					:style="seat"
				/>

				<!-- Status dot -->
				<div
					class="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full z-[5]"
					:class="{
						'bg-green-500': table.status === 'Empty',
						'bg-red-500': table.status === 'Occupied',
						'bg-yellow-500': table.status === 'Reserved',
						'bg-blue-500': table.status === 'Paid',
						'bg-emerald-500': table.status === 'Cleaning',
					}"
				/>

				<!-- Edit button (edit mode only) -->
				<button
					v-if="isEditMode"
					type="button"
					@pointerdown.stop
					@click.stop="openEditTableDialog(table)"
					class="absolute top-1 left-1 w-5 h-5 flex items-center justify-center rounded bg-white/80 hover:bg-blue-100 border border-gray-300 z-[5] cursor-pointer"
					:title="__('Edit table')"
				>
					<svg class="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
					</svg>
				</button>

				<!-- Table info -->
				<span class="font-bold text-sm text-gray-900 dark:text-white leading-tight text-center">{{ table.table_name }}</span>
				<template v-if="table.order_summary && !isEditMode">
					<div class="flex items-center gap-1 mt-0.5">
						<span class="text-[9px] font-semibold bg-red-100 text-red-700 px-1 rounded">{{ table.order_summary.item_count }}</span>
						<span v-if="table.waiting_items_count > 0" class="bg-orange-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 animate-pulse" :title="__('Waiting')">{{ table.waiting_items_count }}</span>
						<span class="text-[9px] text-gray-500">{{ formatTime(table.order_summary.opened_at) }}</span>
						<span class="text-[9px] font-bold text-blue-600">{{ table.order_summary.opened_by }}</span>
					</div>
				</template>
				<span v-else-if="table.status === 'Paid' && !isEditMode" class="text-[10px] font-semibold text-blue-600 mt-0.5 flex items-center gap-0.5">
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
					{{ __('Paid') }}
				</span>
				<span v-else-if="table.status === 'Cleaning' && !isEditMode" class="text-[10px] font-semibold text-emerald-600 mt-0.5">
					{{ __('Cleaning') }}
				</span>
				<span v-else class="text-[10px] font-medium mt-0.5" :class="{
					'text-green-600': table.status === 'Empty',
					'text-red-600': table.status === 'Occupied',
					'text-yellow-600': table.status === 'Reserved',
					'text-blue-600': table.status === 'Paid',
					'text-emerald-600': table.status === 'Cleaning',
				}">{{ __(table.status) }}</span>

				<!-- Resize handles (edit mode only) -->
				<template v-if="isEditMode">
					<div
						v-for="handle in ['nw', 'ne', 'sw', 'se']"
						:key="handle"
						class="absolute w-3 h-3 bg-blue-500 border border-white rounded-sm z-10"
						:class="{
							'top-0 left-0 cursor-nw-resize -translate-x-1/2 -translate-y-1/2': handle === 'nw',
							'top-0 right-0 cursor-ne-resize translate-x-1/2 -translate-y-1/2': handle === 'ne',
							'bottom-0 left-0 cursor-sw-resize -translate-x-1/2 translate-y-1/2': handle === 'sw',
							'bottom-0 right-0 cursor-se-resize translate-x-1/2 translate-y-1/2': handle === 'se',
						}"
						@pointerdown.stop="onResizePointerDown($event, table, handle)"
					/>
				</template>
			</div>

			<!-- Stations on floor plan -->
			<div
				v-for="station in filteredStations"
				:key="'station-' + station.name"
				class="absolute flex flex-col items-center justify-center select-none transition-shadow duration-150 rounded-lg"
				:class="isEditMode ? 'cursor-grab active:cursor-grabbing border-2 border-dashed' : 'cursor-pointer hover:shadow-lg border-2'"
				:style="{
					left: (station.pos_x || 0) + 'px',
					top: (station.pos_y || 0) + 'px',
					width: (station.width || 120) + 'px',
					height: (station.height || 60) + 'px',
					backgroundColor: (station.color || '#6B7280') + '20',
					borderColor: station.color || '#6B7280',
				}"
				@pointerdown="isEditMode && !$event.target.closest('.edit-btn') ? handleDragStart($event, station) : null"
				@click="!isEditMode ? openStationKDS(station) : null"
			>
				<!-- Station icon -->
				<svg v-if="station.station_type === 'Kitchen'" class="w-5 h-5 mb-0.5" :style="{color: station.color}" fill="currentColor" viewBox="0 0 24 24">
					<path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>
				</svg>
				<svg v-else class="w-5 h-5 mb-0.5" :style="{color: station.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
				</svg>
				<span class="text-xs font-bold" :style="{color: station.color}">{{ station.station_name }}</span>

				<!-- Edit button (edit mode only) -->
				<button
					v-if="isEditMode"
					type="button"
					@pointerdown.stop
					@click.stop="openEditStationDialog(station)"
					class="edit-btn absolute top-1 left-1 w-5 h-5 flex items-center justify-center rounded bg-white/80 hover:bg-orange-100 border border-gray-300 z-[5] cursor-pointer"
					:title="__('Edit station')"
				>
					<svg class="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
					</svg>
				</button>

				<!-- Live activity badges (view mode) -->
				<div v-if="!isEditMode && (getStationPreparingCount(station.name) > 0 || getStationReadyCount(station.name) > 0)"
					class="flex gap-0.5 mt-0.5">
					<span v-if="getStationPreparingCount(station.name) > 0"
						class="text-[8px] font-bold px-1 py-0.5 rounded bg-blue-500/20 text-blue-700 dark:text-blue-300">
						{{ getStationPreparingCount(station.name) }}p
					</span>
					<span v-if="getStationReadyCount(station.name) > 0"
						class="text-[8px] font-bold px-1 py-0.5 rounded bg-green-500/25 text-green-700 dark:text-green-300 animate-pulse">
						{{ getStationReadyCount(station.name) }}✓
					</span>
				</div>

				<!-- Resize handles (edit mode) -->
				<template v-if="isEditMode">
					<div
						v-for="handle in ['nw', 'ne', 'sw', 'se']"
						:key="handle"
						class="absolute w-3 h-3 border border-white rounded-sm z-10"
						:style="{backgroundColor: station.color || '#6B7280'}"
						:class="{
							'top-0 left-0 cursor-nw-resize -translate-x-1/2 -translate-y-1/2': handle === 'nw',
							'top-0 right-0 cursor-ne-resize translate-x-1/2 -translate-y-1/2': handle === 'ne',
							'bottom-0 left-0 cursor-sw-resize -translate-x-1/2 translate-y-1/2': handle === 'sw',
							'bottom-0 right-0 cursor-se-resize translate-x-1/2 translate-y-1/2': handle === 'se',
						}"
						@pointerdown.stop="onResizePointerDown($event, station, handle)"
					/>
				</template>
			</div>

			</div><!-- /Zoomable container -->

			<!-- Delivery arrows toggle -->
			<button
				v-if="!isEditMode"
				@click="toggleDeliveryArrows"
				class="absolute bottom-3 left-3 w-8 h-8 flex items-center justify-center rounded-lg shadow-sm transition-colors z-20"
				:class="showDeliveryArrows
					? 'bg-green-500 text-white hover:bg-green-600'
					: 'bg-white/90 border border-gray-200 text-gray-500 hover:bg-gray-50'"
				:title="showDeliveryArrows ? __('Hide delivery arrows') : __('Show delivery arrows')"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
				</svg>
			</button>

			<!-- Add buttons (edit mode) -->
			<div v-if="isEditMode" class="absolute bottom-4 left-4 flex gap-2 z-20" data-gesture-ignore>
				<button
					@click="showAddStationDialog = true"
					class="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg shadow-lg hover:bg-orange-600 transition-colors"
				>
					<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
						<path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>
					</svg>
					{{ __("Add Station") }}
				</button>
				<button
					@click="showAddTableDialog = true"
					class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-colors"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					{{ __("Add Table") }}
				</button>
			</div>
		</div>

		<!-- Add Table Dialog -->
		<Dialog v-model="showAddTableDialog" :options="{ title: __('Add Table'), size: 'sm' }">
			<template #body-content>
				<div class="space-y-4 p-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Table Name") }}</label>
						<input v-model="newTable.table_name" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" :placeholder="__('e.g. Table 5')" />
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Capacity") }}</label>
						<input v-model.number="newTable.capacity" type="number" min="1" class="w-full px-3 py-2 border rounded-lg text-sm" />
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Shape") }}</label>
						<div class="flex gap-2">
							<button
								@click="newTable.shape = 'Square'"
								class="flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors"
								:class="newTable.shape === 'Square' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'"
							>{{ __("Square") }}</button>
							<button
								@click="newTable.shape = 'Round'"
								class="flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors"
								:class="newTable.shape === 'Round' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'"
							>{{ __("Round") }}</button>
						</div>
					</div>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showAddTableDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" @click="handleAddTable" :disabled="!newTable.table_name">{{ __("Add") }}</Button>
				</div>
			</template>
		</Dialog>

		<!-- Edit Table Dialog -->
		<Dialog v-model="showEditTableDialog" :options="{ title: __('Edit Table'), size: 'sm' }">
			<template #body-content>
				<div class="space-y-4 p-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Table Name") }}</label>
						<input v-model="editTable.table_name" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" />
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Capacity") }}</label>
						<input v-model.number="editTable.capacity" type="number" min="1" class="w-full px-3 py-2 border rounded-lg text-sm" />
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Shape") }}</label>
						<div class="flex gap-2">
							<button
								@click="editTable.shape = 'Square'"
								class="flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors"
								:class="editTable.shape === 'Square' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'"
							>{{ __("Square") }}</button>
							<button
								@click="editTable.shape = 'Round'"
								class="flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors"
								:class="editTable.shape === 'Round' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'"
							>{{ __("Round") }}</button>
						</div>
					</div>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showEditTableDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" @click="handleEditTable">{{ __("Save") }}</Button>
				</div>
			</template>
		</Dialog>

		<!-- Add Area Dialog -->
		<Dialog v-model="showAddAreaDialog" :options="{ title: __('Add Area'), size: 'sm' }">
			<template #body-content>
				<div class="space-y-4 p-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Area Name") }}</label>
						<input v-model="newAreaName" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" :placeholder="__('e.g. Main Hall')" />
					</div>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showAddAreaDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" @click="handleAddArea" :disabled="!newAreaName.trim()">{{ __("Add") }}</Button>
				</div>
			</template>
		</Dialog>

		<!-- Rename Area Dialog -->
		<Dialog v-model="showRenameAreaDialog" :options="{ title: __('Rename Area'), size: 'sm' }">
			<template #body-content>
				<div class="space-y-4 p-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Area Name") }}</label>
						<input v-model="editAreaName" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" />
					</div>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showRenameAreaDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" @click="handleRenameArea" :disabled="!editAreaName.trim()">{{ __("Save") }}</Button>
				</div>
			</template>
		</Dialog>

		<!-- Delete Area Dialog -->
		<Dialog v-model="showDeleteAreaDialog" :options="{ title: __('Delete Area'), size: 'sm' }">
			<template #body-content>
				<div class="space-y-4 p-4">
					<p class="text-gray-700">{{ __("Are you sure you want to delete this area?") }}</p>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showDeleteAreaDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" theme="red" @click="handleDeleteArea">{{ __("Delete") }}</Button>
				</div>
			</template>
		</Dialog>

		<!-- Add Station Dialog -->
		<Dialog v-model="showAddStationDialog" :options="{ title: __('Add Station'), size: 'sm' }">
			<template #body-content>
				<div class="space-y-4 p-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Station Name") }}</label>
						<input v-model="newStation.station_name" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" :placeholder="__('e.g. Kitchen, Bar')" />
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Type") }}</label>
						<div class="flex gap-2">
							<button v-for="t in ['Kitchen', 'Bar', 'Other']" :key="t"
								@click="newStation.station_type = t"
								class="flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors"
								:class="newStation.station_type === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'"
							>{{ __(t) }}</button>
						</div>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Color") }}</label>
						<input v-model="newStation.color" type="color" class="w-full h-10 rounded-lg border cursor-pointer" />
					</div>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showAddStationDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" @click="handleAddStation" :disabled="!newStation.station_name">{{ __("Add") }}</Button>
				</div>
			</template>
		</Dialog>

		<!-- Edit Station Dialog -->
		<Dialog v-model="showEditStationDialog" :options="{ title: __('Edit Station'), size: 'xl' }">
			<template #body-content>
				<div class="space-y-5 p-4 max-h-[70vh] overflow-y-auto">
					<!-- Basic Settings -->
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Station Name") }}</label>
							<input v-model="editStation.station_name" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" />
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Type") }}</label>
							<div class="flex gap-2">
								<button v-for="t in ['Kitchen', 'Bar', 'Other']" :key="t"
									@click="editStation.station_type = t"
									class="flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors"
									:class="editStation.station_type === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'"
								>{{ __(t) }}</button>
							</div>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Color") }}</label>
							<input v-model="editStation.color" type="color" class="w-full h-10 rounded-lg border cursor-pointer" />
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Workflow") }}</label>
							<select v-model="editStation.workflow" class="w-full px-3 py-2 border rounded-lg text-sm">
								<option value="">{{ __("Default") }}</option>
								<option v-for="wf in availableWorkflows" :key="wf.name" :value="wf.name">{{ wf.workflow_name }}</option>
							</select>
						</div>
					</div>

					<!-- Toggles -->
					<div class="flex items-center gap-6 py-2">
						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" v-model="editStation.is_active" :true-value="1" :false-value="0"
								class="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
							<span class="text-sm font-medium text-gray-700">{{ __("Active") }}</span>
						</label>
						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" v-model="editStation.use_runner" :true-value="1" :false-value="0"
								class="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
							<span class="text-sm font-medium text-gray-700">{{ __("Use Runner") }}</span>
						</label>
					</div>

					<!-- Items Section -->
					<div class="border-t pt-4">
						<label class="block text-sm font-semibold text-gray-800 mb-2">{{ __("Items") }}</label>
						<div class="relative mb-2">
							<input
								v-model="itemSearchInput"
								@input="searchItems"
								type="text"
								class="w-full px-3 py-2 border rounded-lg text-sm"
								:placeholder="__('Search items...')"
							/>
							<!-- Search results dropdown -->
							<div v-if="itemSearchResults.length > 0" class="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
								<button
									v-for="result in itemSearchResults"
									:key="result.name"
									@click="addItem(result)"
									class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex justify-between"
								>
									<span>{{ result.item_name || result.name }}</span>
									<span class="text-xs text-gray-400">{{ result.item_group }}</span>
								</button>
							</div>
						</div>
						<!-- Items table -->
						<div v-if="editStation.items.length > 0" class="border rounded-lg overflow-hidden">
							<table class="w-full text-sm">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-3 py-2 text-left font-medium text-gray-600">{{ __("Item") }}</th>
										<th class="px-3 py-2 text-center font-medium text-gray-600 w-24">{{ __("Prep (min)") }}</th>
										<th class="px-3 py-2 text-center font-medium text-gray-600 w-28">{{ __("Priority") }}</th>
										<th class="w-10"></th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="(item, idx) in editStation.items" :key="idx" class="border-t">
										<td class="px-3 py-2 text-gray-800">{{ item.item_name || item.item }}</td>
										<td class="px-3 py-1 text-center">
											<input v-model.number="item.prep_time" type="number" min="0"
												class="w-16 px-2 py-1 border rounded text-sm text-center" />
										</td>
										<td class="px-3 py-1 text-center">
											<select v-model="item.priority" class="px-2 py-1 border rounded text-sm">
												<option value="Normal">Normal</option>
												<option value="Urgent">Urgent</option>
											</select>
										</td>
										<td class="px-1 py-1 text-center">
											<button @click="removeItem(idx)" class="text-red-400 hover:text-red-600 p-1">
												<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
												</svg>
											</button>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
						<p v-else class="text-xs text-gray-400 italic">{{ __("No items assigned") }}</p>
					</div>

					<!-- Item Groups Section -->
					<div class="border-t pt-4">
						<label class="block text-sm font-semibold text-gray-800 mb-2">{{ __("Item Groups") }}</label>
						<p class="text-xs text-gray-500 mb-2">{{ __("All items in these groups will be routed to this station (unless individually assigned to another).") }}</p>
						<div class="relative mb-2">
							<input
								v-model="groupSearchInput"
								@input="searchItemGroups"
								type="text"
								class="w-full px-3 py-2 border rounded-lg text-sm"
								:placeholder="__('Search item groups...')"
							/>
							<!-- Search results dropdown -->
							<div v-if="groupSearchResults.length > 0" class="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
								<button
									v-for="result in groupSearchResults"
									:key="result.name"
									@click="addItemGroup(result)"
									class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
								>
									{{ result.name }}
								</button>
							</div>
						</div>
						<!-- Item groups table -->
						<div v-if="editStation.item_groups.length > 0" class="border rounded-lg overflow-hidden">
							<table class="w-full text-sm">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-3 py-2 text-left font-medium text-gray-600">{{ __("Item Group") }}</th>
										<th class="px-3 py-2 text-center font-medium text-gray-600 w-24">{{ __("Prep (min)") }}</th>
										<th class="px-3 py-2 text-center font-medium text-gray-600 w-28">{{ __("Priority") }}</th>
										<th class="w-10"></th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="(group, idx) in editStation.item_groups" :key="idx" class="border-t">
										<td class="px-3 py-2 text-gray-800">{{ group.item_group }}</td>
										<td class="px-3 py-1 text-center">
											<input v-model.number="group.prep_time" type="number" min="0"
												class="w-16 px-2 py-1 border rounded text-sm text-center" />
										</td>
										<td class="px-3 py-1 text-center">
											<select v-model="group.priority" class="px-2 py-1 border rounded text-sm">
												<option value="Normal">Normal</option>
												<option value="Urgent">Urgent</option>
											</select>
										</td>
										<td class="px-1 py-1 text-center">
											<button @click="removeItemGroup(idx)" class="text-red-400 hover:text-red-600 p-1">
												<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
												</svg>
											</button>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
						<p v-else class="text-xs text-gray-400 italic">{{ __("No item groups assigned") }}</p>
					</div>

					<!-- Delete -->
					<div class="pt-2 border-t">
						<button @click="handleDeleteStation" class="text-sm text-red-600 hover:text-red-800 font-medium">
							{{ __("Delete this station") }}
						</button>
					</div>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showEditStationDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" @click="handleSaveStation" :disabled="!editStation.station_name">{{ __("Save") }}</Button>
				</div>
			</template>
		</Dialog>
	</div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from "vue"
import { useRestaurantStore } from "@/stores/restaurant"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSDraftsStore } from "@/stores/posDrafts"
import { usePOSShiftStore } from "@/stores/posShift"
import { useDraggable } from "@/composables/useDraggable"
import { useCanvasGestures } from "@/composables/useCanvasGestures"
import { useToast } from "@/composables/useToast"
import { call } from "@/utils/apiWrapper"
import { initSocket } from "@/socket"
import { Button, Dialog } from "frappe-ui"
import FloorPlanWalls from "@/components/pos/FloorPlanWalls.vue"

const emit = defineEmits([
	"table-selected",
	"load-table-draft",
	"load-server-draft",
	"start-takeaway",
	"cleaning-table-clicked",
])

const restaurantStore = useRestaurantStore()
const cartStore = usePOSCartStore()
const draftsStore = usePOSDraftsStore()
const shiftStore = usePOSShiftStore()
let floorSocket = null
const { showSuccess, showError } = useToast()

const canvasRef = ref(null)
const isEditMode = ref(false)
const ZOOM_STORAGE_KEY = "pos_next_floor_zoom"
const savedZoom = Number.parseFloat(localStorage.getItem(ZOOM_STORAGE_KEY)) || 1

// Pan is blocked only when a drawing tool is active (wall/door/window)
const blockPan = computed(() => isEditMode.value && wallTool.value !== "select")

const {
	zoomLevel,
	panX,
	panY,
	transformStyle: gestureTransformStyle,
	zoomIn,
	zoomOut,
	zoomReset,
	resetPan,
	cleanup: cleanupGestures,
} = useCanvasGestures({
	containerRef: canvasRef,
	initialZoom: savedZoom,
	zoomMin: 0.4,
	zoomMax: 2,
	isEditMode: blockPan,
	onZoomChange(newZoom) {
		localStorage.setItem(ZOOM_STORAGE_KEY, newZoom.toString())
	},
	onViewChange(px, py, zoom) {
		if (selectedArea.value) {
			localStorage.setItem("pos_floor_pan_" + selectedArea.value, JSON.stringify({ x: px, y: py }))
			localStorage.setItem("pos_floor_zoom_" + selectedArea.value, zoom.toString())
		}
	},
})

const canvasBackgroundStyle = computed(() => {
	const gridSize = isEditMode.value ? 20 : 25
	const dotColor = isEditMode.value ? "#d1d5db" : "#cbd5e1"
	const dotSize = isEditMode.value ? "1px" : "1px"
	const bg = isEditMode.value ? "#f9fafb" : "#f8fafc"
	return {
		backgroundColor: bg,
		backgroundImage: `radial-gradient(circle, ${dotColor} ${dotSize}, transparent ${dotSize})`,
		backgroundSize: `${gridSize}px ${gridSize}px`,
	}
})
const selectedArea = ref(null)
const showAddTableDialog = ref(false)
const newTable = ref({ table_name: "", capacity: 4, shape: "Square" })
const showAddStationDialog = ref(false)
const newStation = ref({
	station_name: "",
	station_type: "Kitchen",
	color: "#F97316",
})
// Floor plan walls/doors/windows
const wallTool = ref("select") // 'select' | 'wall' | 'door' | 'window'
const wallOpacity = ref(1)
const localWalls = ref([])
const localDoors = ref([])
const localWindows = ref([])
const floorPlanBgUrl = ref("")
const showFloorBg = ref(true)
const wallsRef = ref(null)

const showEditStationDialog = ref(false)
const editStation = ref({
	name: "",
	station_name: "",
	station_type: "Kitchen",
	color: "#F97316",
	workflow: "",
	is_active: 1,
	use_runner: 1,
	items: [],
	item_groups: [],
})
const availableWorkflows = ref([])
const itemSearchInput = ref("")
const itemSearchResults = ref([])
const groupSearchInput = ref("")
const groupSearchResults = ref([])
let itemSearchTimeout = null
let groupSearchTimeout = null
const showEditTableDialog = ref(false)
const editTable = ref({
	name: "",
	table_name: "",
	capacity: 4,
	shape: "Square",
})
const showAddAreaDialog = ref(false)
const showRenameAreaDialog = ref(false)
const showDeleteAreaDialog = ref(false)
const newAreaName = ref("")
const editAreaName = ref("")
const areaToRename = ref(null)
const areaToDelete = ref(null)
const draggedArea = ref(null)

const areas = computed(() => restaurantStore.areas)

// Local reactive copy of tables for rendering — mutations here trigger re-render
const localTables = ref([])

function syncLocalTables() {
	localTables.value = restaurantStore.tables.map((t) => ({ ...t }))
}

function syncLocalWalls() {
	if (!selectedArea.value) return
	const data = restaurantStore.getFloorPlanWalls(selectedArea.value)
	localWalls.value = (data.walls || []).map((w) => ({ ...w }))
	localDoors.value = (data.doors || []).map((d) => ({ ...d }))
	localWindows.value = (data.windows || []).map((w) => ({ ...w }))
	floorPlanBgUrl.value = restaurantStore.getFloorPlanBg(selectedArea.value)
	wallOpacity.value = parseFloat(localStorage.getItem(`pos_wall_opacity_${selectedArea.value}`)) || 1
}

// Local reactive copy of stations for rendering
const localStations = ref([])

function syncLocalStations() {
	localStations.value = (restaurantStore.floorStations || []).map((s) => ({
		...s,
	}))
}

// Keep local copies in sync when store data changes
watch(() => restaurantStore.tables, syncLocalTables, { deep: true })
watch(() => restaurantStore.floorStations, syncLocalStations, { deep: true })

const filteredTables = computed(() => {
	if (!selectedArea.value) return localTables.value
	return localTables.value.filter((t) => t.area === selectedArea.value)
})

const filteredStations = computed(() => {
	if (!selectedArea.value) return localStations.value
	return localStations.value.filter((s) => s.area === selectedArea.value)
})

function occupiedCount(areaName) {
	return restaurantStore.occupiedCountByArea[areaName] || 0
}

// ─── Delivery Arrows ─────────────────────────────────────────────────────────
const ARROWS_STORAGE_KEY = "pos_show_delivery_arrows"
const showDeliveryArrows = ref(
	localStorage.getItem(ARROWS_STORAGE_KEY) !== "false",
)
const runnerOrders = ref([])

function toggleDeliveryArrows() {
	showDeliveryArrows.value = !showDeliveryArrows.value
	localStorage.setItem(ARROWS_STORAGE_KEY, showDeliveryArrows.value.toString())
	if (showDeliveryArrows.value) loadRunnerOrders()
}

async function loadRunnerOrders() {
	// Always load — needed for station bar counters and runner button, not just arrows
	try {
		const res = await call("pos_next.api.restaurant.get_runner_orders", {
			_: Date.now(),
		})
		if (res) runnerOrders.value = res
	} catch {
		// Silent fail — arrows are optional
	}
}

// ─── KDS Orders for station activity counters ────────────────────────────────
const kdsOrders = ref([])

async function loadKdsOrders() {
	if (isEditMode.value) return
	try {
		const res = await call("pos_next.api.restaurant.get_kds_orders", {
			_: Date.now(),
		})
		if (res) kdsOrders.value = res
	} catch {
		/* silent */
	}
}

// All stations sorted: current area first, then others
const allStations = computed(() => {
	const current = localStations.value.filter(
		(s) => s.area === selectedArea.value,
	)
	const others = localStations.value.filter(
		(s) => s.area !== selectedArea.value,
	)
	return [...current, ...others]
})

function getAreaName(areaId) {
	const area = areas.value.find((a) => a.name === areaId)
	return area?.area_name || areaId || ""
}

function getStationPreparingCount(stationName) {
	let count = 0
	for (const order of kdsOrders.value) {
		for (const item of order.items || []) {
			if (
				item.preparation_station === stationName &&
				item.kds_status &&
				!["Delivered", "Waiting"].includes(item.kds_status)
			) {
				count++
			}
		}
	}
	// Items that are "ready" are already counted in kdsOrders but should show as ready not preparing
	return Math.max(0, count - getStationReadyCount(stationName))
}

function getStationReadyCount(stationName) {
	let count = 0
	for (const order of runnerOrders.value) {
		for (const item of order.items || []) {
			if (item.preparation_station === stationName) count++
		}
	}
	return count
}

const totalReadyCount = computed(() => {
	let count = 0
	for (const order of runnerOrders.value) {
		count += (order.items || []).length
	}
	return count
})

const deliveryArrows = computed(() => {
	if (!showDeliveryArrows.value || !runnerOrders.value.length) return []

	const arrows = []
	const seen = new Set()
	let ghostIndex = 0

	for (const order of runnerOrders.value) {
		const table = filteredTables.value.find(
			(t) => t.name === order.restaurant_table,
		)
		if (!table) continue // Table not in current area view

		for (const item of order.items || []) {
			const stationId = item.preparation_station
			if (!stationId) continue

			const pairKey = `${stationId}-${order.restaurant_table}`
			if (seen.has(pairKey)) continue
			seen.add(pairKey)

			const station = localStations.value.find((s) => s.name === stationId)
			const itemCount = (order.items || []).filter(
				(i) => i.preparation_station === stationId,
			).length

			if (station && station.area === selectedArea.value) {
				// Same area: arrow from station EDGE to table EDGE
				const sc = {
					x: (station.pos_x || 0) + (station.width || 120) / 2,
					y: (station.pos_y || 0) + (station.height || 60) / 2,
				}
				const tc = {
					x: (table.pos_x || 0) + (table.width || 100) / 2,
					y: (table.pos_y || 0) + (table.height || 100) / 2,
				}
				const edge1 = edgePoint(
					sc,
					station.width || 120,
					station.height || 60,
					tc,
				)
				const edge2 = edgePoint(tc, table.width || 100, table.height || 100, sc)
				const dist = Math.sqrt(
					(edge2.x - edge1.x) ** 2 + (edge2.y - edge1.y) ** 2,
				)
				arrows.push({
					key: pairKey,
					x1: edge1.x,
					y1: edge1.y,
					x2: edge2.x,
					y2: edge2.y,
					color: station.color || "#22C55E",
					stationName: station.station_name,
					isGhost: false,
					itemCount,
					duration: Math.max(3, dist / 60) + "s",
				})
			} else if (station) {
				// Cross-area: arrow starts from top of canvas (below station bar tab)
				// Calculate x position based on station's index in allStations
				const stationIdx = allStations.value.findIndex(
					(s) => s.name === stationId,
				)
				const tabX = 16 + (stationIdx >= 0 ? stationIdx : ghostIndex) * 130 + 65
				ghostIndex++
				const te = edgePoint(
					{
						x: (table.pos_x || 0) + (table.width || 100) / 2,
						y: (table.pos_y || 0) + (table.height || 100) / 2,
					},
					table.width || 100,
					table.height || 100,
					{ x: tabX / zoomLevel.value, y: 0 },
				)
				const startX = tabX / zoomLevel.value
				const dist = Math.sqrt((te.x - startX) ** 2 + te.y ** 2)
				arrows.push({
					key: pairKey,
					x1: startX,
					y1: 0,
					x2: te.x,
					y2: te.y,
					color: station.color || "#22C55E",
					stationName: station.station_name,
					isGhost: true,
					itemCount,
					duration: Math.max(3, dist / 60) + "s",
				})
			}
		}
	}
	return arrows
})

// Compute the point on the edge of a rectangle (center, w, h) facing toward target
function edgePoint(center, w, h, target) {
	const dx = target.x - center.x
	const dy = target.y - center.y
	if (dx === 0 && dy === 0) return { x: center.x, y: center.y }
	const hw = w / 2 + 4 // 4px margin outside the element
	const hh = h / 2 + 4
	const absDx = Math.abs(dx)
	const absDy = Math.abs(dy)
	// Find which edge the line intersects
	const scaleX = absDx > 0 ? hw / absDx : Number.POSITIVE_INFINITY
	const scaleY = absDy > 0 ? hh / absDy : Number.POSITIVE_INFINITY
	const scale = Math.min(scaleX, scaleY)
	return { x: center.x + dx * scale, y: center.y + dy * scale }
}

// Draggable composable
const { handleDragStart, handleResizeStart, destroy } = useDraggable({
	canvasRef,
	zoomLevel,
	onDragEnd: (obj) => {
		// Check if this is a station or table
		if (obj.station_name) {
			const storeStation = restaurantStore.floorStations.find(
				(s) => s.name === obj.name,
			)
			if (storeStation)
				Object.assign(storeStation, { pos_x: obj.pos_x, pos_y: obj.pos_y })
			restaurantStore.updateStationPosition(
				obj.name,
				obj.pos_x,
				obj.pos_y,
				obj.width,
				obj.height,
			)
		} else {
			const storeTable = restaurantStore.tables.find((t) => t.name === obj.name)
			if (storeTable)
				Object.assign(storeTable, { pos_x: obj.pos_x, pos_y: obj.pos_y })
			restaurantStore.updateTablePosition(
				obj.name,
				obj.pos_x,
				obj.pos_y,
				obj.width,
				obj.height,
			)
		}
	},
	onResizeEnd: (obj) => {
		// Check if this is a station or table
		if (obj.station_name) {
			const storeStation = restaurantStore.floorStations.find(
				(s) => s.name === obj.name,
			)
			if (storeStation)
				Object.assign(storeStation, {
					pos_x: obj.pos_x,
					pos_y: obj.pos_y,
					width: obj.width,
					height: obj.height,
				})
			restaurantStore.updateStationPosition(
				obj.name,
				obj.pos_x,
				obj.pos_y,
				obj.width,
				obj.height,
			)
		} else {
			const storeTable = restaurantStore.tables.find((t) => t.name === obj.name)
			if (storeTable)
				Object.assign(storeTable, {
					pos_x: obj.pos_x,
					pos_y: obj.pos_y,
					width: obj.width,
					height: obj.height,
				})
			restaurantStore.updateTablePosition(
				obj.name,
				obj.pos_x,
				obj.pos_y,
				obj.width,
				obj.height,
			)
		}
	},
})

/**
 * Calculate seat positions around a table.
 * For round tables: seats are distributed in a circle.
 * For square tables: seats are distributed along the 4 sides.
 */
function getSeatPositions(table) {
	const count = table.capacity || 4
	const w = table.width || 100
	const h = table.height || 100
	const seatSize = 14 // 3.5 tailwind = 14px
	// Border width of the table element (border-2 = 2px)
	// Absolute children are positioned relative to the padding box,
	// so we need to offset by -border to reach the visual outer edge
	const b = 2

	if (table.shape === "Round") {
		const seats = []
		const cx = (w - 2 * b) / 2
		const cy = (h - 2 * b) / 2
		const rx = w / 2
		const ry = h / 2
		for (let i = 0; i < count; i++) {
			const angle = (2 * Math.PI * i) / count - Math.PI / 2
			seats.push({
				left: `${cx + rx * Math.cos(angle)}px`,
				top: `${cy + ry * Math.sin(angle)}px`,
				transform: "translate(-50%, -50%)",
			})
		}
		return seats
	}

	// Square table: distribute seats along sides
	const seats = []
	// Split seats across 4 sides: top, right, bottom, left
	const sides = [[], [], [], []] // top, right, bottom, left
	for (let i = 0; i < count; i++) {
		sides[i % 4].push(i)
	}

	// All seats use transform to center on the visual outer edge
	// Absolute children are positioned from the padding box, so we offset by -b to reach the border edge
	const t = "translate(-50%, -50%)"
	const innerW = w - 2 * b // padding box width
	const innerH = h - 2 * b // padding box height

	// Top side — visual outer edge is at top: -b
	sides[0].forEach((_, idx) => {
		const x = (innerW / (sides[0].length + 1)) * (idx + 1)
		seats.push({ left: `${x}px`, top: `${-b}px`, transform: t })
	})
	// Bottom side — visual outer edge is at top: innerH + b
	sides[2].forEach((_, idx) => {
		const x = (innerW / (sides[2].length + 1)) * (idx + 1)
		seats.push({ left: `${x}px`, top: `${innerH + b}px`, transform: t })
	})
	// Left side — visual outer edge is at left: -b
	sides[3].forEach((_, idx) => {
		const y = (innerH / (sides[3].length + 1)) * (idx + 1)
		seats.push({ left: `${-b}px`, top: `${y}px`, transform: t })
	})
	// Right side — visual outer edge is at left: innerW + b
	sides[1].forEach((_, idx) => {
		const y = (innerH / (sides[1].length + 1)) * (idx + 1)
		seats.push({ left: `${innerW + b}px`, top: `${y}px`, transform: t })
	})

	return seats
}

function getTableStyle(table) {
	const style = {
		left: `${table.pos_x || 0}px`,
		top: `${table.pos_y || 0}px`,
		width: `${table.width || 100}px`,
		height: `${table.height || 100}px`,
	}
	if (table.shape === "Round") {
		style.borderRadius = "50%"
	} else {
		style.borderRadius = "0.75rem"
	}
	return style
}

function formatTime(dateStr) {
	if (!dateStr) return ""
	try {
		const d = new Date(dateStr)
		return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
	} catch {
		return ""
	}
}

function getTableClasses(table) {
	if (isEditMode.value) {
		return "border-2 border-dashed border-blue-400 bg-white/90 dark:bg-gray-800/90 shadow-md"
	}
	const statusClasses = {
		Empty:
			"border-2 border-green-200 bg-green-50 hover:border-green-400 dark:bg-green-900/20 dark:border-green-800",
		Occupied:
			"border-2 border-red-200 bg-red-50 hover:border-red-400 dark:bg-red-900/20 dark:border-red-800",
		Reserved:
			"border-2 border-yellow-200 bg-yellow-50 hover:border-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-800",
		Paid:
			"border-2 border-blue-300 bg-blue-50 hover:border-blue-400 dark:bg-blue-900/20 dark:border-blue-800",
		Cleaning:
			"border-2 border-emerald-300 bg-emerald-50 hover:border-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800",
	}
	return statusClasses[table.status] || statusClasses.Empty
}

function onTablePointerDown(event, table) {
	// Always stop propagation to prevent useCanvasGestures from starting a pan
	event.stopPropagation()
	if (isEditMode.value) {
		handleDragStart(event, table)
	} else {
		selectTable(table)
	}
}

function onResizePointerDown(event, table, handle) {
	handleResizeStart(event, table, handle)
}

// Wall drawing event handlers
function onAddWall(wall) {
	localWalls.value = [...localWalls.value, wall]
}
function onAddDoor(door) {
	localDoors.value = [...localDoors.value, door]
}
function onAddWindow(win) {
	localWindows.value = [...localWindows.value, win]
}
async function onBgImageUpload(event) {
	const file = event.target.files?.[0]
	if (!file || !selectedArea.value) return
	try {
		const formData = new FormData()
		formData.append("file", file)
		formData.append("doctype", "Restaurant Area")
		formData.append("docname", selectedArea.value)
		formData.append("fieldname", "floor_plan_bg")
		formData.append("is_private", "0")
		const res = await fetch("/api/method/upload_file", {
			method: "POST",
			body: formData,
			headers: { "X-Frappe-CSRF-Token": window.csrf_token || "" },
		})
		const data = await res.json()
		if (data.message?.file_url) {
			floorPlanBgUrl.value = data.message.file_url
			showFloorBg.value = true
			await restaurantStore.saveFloorPlanBg(selectedArea.value, data.message.file_url)
			showSuccess(__("Background image uploaded"))
		}
	} catch (e) {
		showError(__("Failed to upload image"))
	}
	event.target.value = ""
}

function onWallKeyDown(event) {
	if (!isEditMode.value) return
	if (event.key === "Delete" || event.key === "Backspace") {
		wallsRef.value?.deleteSelected()
	}
	if (event.key === "Escape") {
		wallsRef.value?.cancelDraw()
		wallsRef.value?.clearSelection()
		wallTool.value = "select"
	}
}

function openStationKDS(station) {
	// Open KDS page filtered by this station in a new tab
	const url = `/pos/kds?station=${encodeURIComponent(station.name)}`
	window.open(url, "_blank")
}

function openRunnerTab() {
	window.open("/pos/runner", "_blank")
}

// Takeaway
const takeawayTotalCount = computed(() => restaurantStore.takeawayOrders.length)
const takeawayReadyCount = computed(
	() =>
		restaurantStore.takeawayOrders.filter((o) => o.kds_status === "Ready")
			.length,
)
function openTakeawayTab() {
	window.open("/pos/takeaway", "_blank")
}
function startNewTakeaway() {
	emit("start-takeaway")
}

async function selectTable(table) {
	// Paid/Cleaning tables get special handling — no draft loading
	if (table.status === "Paid" || table.status === "Cleaning") {
		emit("cleaning-table-clicked", table)
		return
	}

	// Clear cart before loading table
	await cartStore.clearCart()
	cartStore.setRestaurantTable(table)

	try {
		// Open table: returns existing draft or empty result for new table
		const res = await call("pos_next.api.restaurant.open_table", {
			table_name: table.name,
			pos_profile: shiftStore.profileName,
		})

		if (res && res.name) {
			// Existing draft found — load items into cart
			if (res.items && res.items.length > 0) {
				for (const item of res.items) {
					// Calculate modifier price adjustment from saved JSON
					// so _modifiers_applied is correctly initialized
					let modifierPriceAdjustment = 0
					if (item.posa_item_modifiers) {
						try {
							const mods = JSON.parse(item.posa_item_modifiers)
							for (const mod of mods) {
								for (const opt of mod.options || []) {
									modifierPriceAdjustment +=
										opt.price_adjustment || opt.price || 0
								}
							}
						} catch {
							/* ignore parse errors */
						}
					}

					cartStore.addItem(
						{
							item_code: item.item_code,
							item_name: item.item_name,
							rate: item.rate,
							uom: item.uom,
							image: item.image,
							preparation_station: item.preparation_station,
							posa_special_instructions: item.posa_special_instructions,
							posa_item_modifiers: item.posa_item_modifiers,
							kds_status: item.kds_status || "Pending",
							_modifiers_applied: modifierPriceAdjustment || 0,
						},
						item.qty || 1,
					)
				}
			}

			cartStore.$patch({
				currentDraftId: res.name,
				kdsStatus: res.kds_status || "Pending",
				hasUnsentChanges: false,
				guestPaidAmount: res.paid_amount || 0,
			})
			if (res.customer) cartStore.setCustomer(res.customer)
		}
		// If res.name is null = new table, no draft yet (created at first Valider)
	} catch (e) {
		console.error("[FloorPlan] Failed to open table:", e)
	}

	emit("table-selected", table)
}

async function cancelEditMode() {
	// Reload from server without saving
	await restaurantStore.fetchFromNetwork()
	syncLocalTables()
	syncLocalStations()
	syncLocalWalls()
	isEditMode.value = false
	wallTool.value = "select"
}

async function toggleEditMode() {
	if (isEditMode.value) {
		// Save positions and exit edit mode
		try {
			await restaurantStore.saveAllPositions()
			if (restaurantStore.floorStations.length > 0) {
				await restaurantStore.saveStationPositions()
			}
			// Save walls/doors/windows
			if (selectedArea.value) {
				await restaurantStore.saveFloorPlanWalls(selectedArea.value, {
					walls: localWalls.value,
					doors: localDoors.value,
					windows: localWindows.value,
				})
			}
			// Save current zoom and pan as default for this area
			if (selectedArea.value) {
				localStorage.setItem(`pos_floor_zoom_${selectedArea.value}`, zoomLevel.value.toString())
				localStorage.setItem(`pos_floor_pan_${selectedArea.value}`, JSON.stringify({ x: panX.value, y: panY.value }))
			}
			showSuccess(__("Floor plan saved"))
		} catch (e) {
			showError(__("Failed to save floor plan"))
		}
		isEditMode.value = false
		wallTool.value = "select"
	} else {
		syncLocalWalls()
		isEditMode.value = true
	}
}

function onAreaDragStart(event, area) {
	if (!isEditMode.value) return
	draggedArea.value = area.name
	event.dataTransfer.effectAllowed = "move"
}

function onAreaDragOver(event, area) {
	if (!isEditMode.value || !draggedArea.value) return
	event.dataTransfer.dropEffect = "move"
}

async function onAreaDrop(event, targetArea) {
	if (
		!isEditMode.value ||
		!draggedArea.value ||
		draggedArea.value === targetArea.name
	) {
		draggedArea.value = null
		return
	}

	const names = areas.value.map((a) => a.name)
	const fromIdx = names.indexOf(draggedArea.value)
	const toIdx = names.indexOf(targetArea.name)
	if (fromIdx === -1 || toIdx === -1) return

	names.splice(fromIdx, 1)
	names.splice(toIdx, 0, draggedArea.value)

	await restaurantStore.reorderAreas(names)
	draggedArea.value = null
}

async function handleAddTable() {
	if (!newTable.value.table_name) return
	try {
		// Calculate position: center of visible canvas area (accounting for pan/zoom)
		const canvas = canvasRef.value
		const pos_x = canvas ? Math.round((canvas.clientWidth / 2 - panX.value) / zoomLevel.value - 50) : 200
		const pos_y = canvas ? Math.round((canvas.clientHeight / 2 - panY.value) / zoomLevel.value - 50) : 200

		await restaurantStore.addTable({
			table_name: newTable.value.table_name,
			area: selectedArea.value,
			capacity: newTable.value.capacity || 4,
			shape: newTable.value.shape || "Square",
			pos_x,
			pos_y,
		})
		showAddTableDialog.value = false
		newTable.value = { table_name: "", capacity: 4, shape: "Square" }
		syncLocalTables()
		showSuccess(__("Table added"))
	} catch (error) {
		showError(__("Failed to add table"))
	}
}

async function openEditStationDialog(station) {
	// Load full station details from server
	try {
		const details = await call("pos_next.api.restaurant.get_station_details", {
			name: station.name,
		})
		editStation.value = {
			name: details.name,
			station_name: details.station_name,
			station_type: details.station_type || "Kitchen",
			color: details.color || "#F97316",
			workflow: details.workflow || "",
			is_active: details.is_active ?? 1,
			use_runner: details.use_runner ?? 1,
			items: details.items || [],
			item_groups: details.item_groups || [],
		}
	} catch {
		// Fallback to basic floor plan data
		editStation.value = {
			name: station.name,
			station_name: station.station_name,
			station_type: station.station_type || "Kitchen",
			color: station.color || "#F97316",
			workflow: station.workflow || "",
			is_active: 1,
			use_runner: 1,
			items: [],
			item_groups: [],
		}
	}
	// Reset search state
	itemSearchInput.value = ""
	itemSearchResults.value = []
	groupSearchInput.value = ""
	groupSearchResults.value = []
	// Load available workflows
	try {
		const res = await call("pos_next.api.restaurant.get_preparation_workflows")
		availableWorkflows.value = res || []
	} catch {
		availableWorkflows.value = []
	}
	showEditStationDialog.value = true
}

async function handleSaveStation() {
	try {
		await call("pos_next.api.restaurant.update_station", {
			name: editStation.value.name,
			station_name: editStation.value.station_name,
			station_type: editStation.value.station_type,
			color: editStation.value.color,
			workflow: editStation.value.workflow,
			is_active: editStation.value.is_active,
			use_runner: editStation.value.use_runner,
			items: JSON.stringify(editStation.value.items),
			item_groups: JSON.stringify(editStation.value.item_groups),
		})
		showEditStationDialog.value = false
		await restaurantStore.fetchFromNetwork()
		await restaurantStore.fetchStationItemsMap()
		syncLocalStations()
		showSuccess(__("Station updated"))
	} catch (error) {
		showError(__("Failed to update station"))
	}
}

function searchItems() {
	clearTimeout(itemSearchTimeout)
	const query = itemSearchInput.value.trim()
	if (!query || query.length < 2) {
		itemSearchResults.value = []
		return
	}
	itemSearchTimeout = setTimeout(async () => {
		try {
			const res = await call("frappe.client.get_list", {
				doctype: "Item",
				filters: [["item_name", "like", `%${query}%`]],
				fields: ["name", "item_name", "item_group"],
				limit_page_length: 10,
			})
			// Exclude already added items
			const existingItems = editStation.value.items.map((i) => i.item)
			itemSearchResults.value = (res || []).filter(
				(i) => !existingItems.includes(i.name),
			)
		} catch {
			itemSearchResults.value = []
		}
	}, 300)
}

function addItem(item) {
	editStation.value.items.push({
		item: item.name,
		item_name: item.item_name,
		prep_time: 0,
		priority: "Normal",
	})
	itemSearchInput.value = ""
	itemSearchResults.value = []
}

function removeItem(idx) {
	editStation.value.items.splice(idx, 1)
}

function searchItemGroups() {
	clearTimeout(groupSearchTimeout)
	const query = groupSearchInput.value.trim()
	if (!query || query.length < 2) {
		groupSearchResults.value = []
		return
	}
	groupSearchTimeout = setTimeout(async () => {
		try {
			const res = await call("frappe.client.get_list", {
				doctype: "Item Group",
				filters: [["name", "like", `%${query}%`]],
				fields: ["name"],
				limit_page_length: 10,
			})
			// Exclude already added groups
			const existingGroups = editStation.value.item_groups.map(
				(g) => g.item_group,
			)
			groupSearchResults.value = (res || []).filter(
				(g) => !existingGroups.includes(g.name),
			)
		} catch {
			groupSearchResults.value = []
		}
	}, 300)
}

function addItemGroup(group) {
	editStation.value.item_groups.push({
		item_group: group.name,
		prep_time: 0,
		priority: "Normal",
	})
	groupSearchInput.value = ""
	groupSearchResults.value = []
}

function removeItemGroup(idx) {
	editStation.value.item_groups.splice(idx, 1)
}

async function handleDeleteStation() {
	try {
		await call("pos_next.api.restaurant.delete_station", {
			name: editStation.value.name,
		})
		showEditStationDialog.value = false
		await restaurantStore.fetchFromNetwork()
		syncLocalStations()
		showSuccess(__("Station deleted"))
	} catch (error) {
		showError(__("Failed to delete station"))
	}
}

async function handleAddStation() {
	if (!newStation.value.station_name) return
	try {
		const canvas = canvasRef.value
		const pos_x = canvas ? Math.round(canvas.clientWidth / 2 - 60) : 200
		const pos_y = canvas ? Math.round(canvas.clientHeight / 2 - 30) : 200

		await call("pos_next.api.restaurant.create_station", {
			station_name: newStation.value.station_name,
			station_type: newStation.value.station_type || "Kitchen",
			color: newStation.value.color || "#F97316",
			area: selectedArea.value,
			pos_x,
			pos_y,
		})
		showAddStationDialog.value = false
		newStation.value = {
			station_name: "",
			station_type: "Kitchen",
			color: "#F97316",
		}
		await restaurantStore.fetchFromNetwork()
		syncLocalStations()
		showSuccess(__("Station added"))
	} catch (error) {
		showError(__("Failed to add station"))
	}
}

function openEditTableDialog(table) {
	editTable.value = {
		name: table.name,
		table_name: table.table_name,
		capacity: table.capacity || 4,
		shape: table.shape || "Square",
	}
	showEditTableDialog.value = true
}

async function handleEditTable() {
	if (!editTable.value.name) return
	try {
		await call("pos_next.api.restaurant.create_table", {
			table_name: editTable.value.table_name,
			area: selectedArea.value,
			capacity: editTable.value.capacity,
			shape: editTable.value.shape,
		})
		showEditTableDialog.value = false
		await restaurantStore.fetchFromNetwork()
		syncLocalTables()
		showSuccess(__("Table updated"))
	} catch (error) {
		showError(__("Failed to update table"))
	}
}

async function handleAddArea() {
	if (!newAreaName.value.trim()) return

	try {
		await restaurantStore.createArea(newAreaName.value.trim())
		syncLocalTables()
		syncLocalStations()
		showSuccess(__("Area created"))
		showAddAreaDialog.value = false
		newAreaName.value = ""
	} catch (e) {
		showError(__("Failed to create area"))
	}
}

function openRenameAreaDialog(area) {
	areaToRename.value = area
	editAreaName.value = area.area_name
	showRenameAreaDialog.value = true
}

async function handleRenameArea() {
	if (!editAreaName.value.trim() || !areaToRename.value) return

	try {
		await restaurantStore.renameArea(
			areaToRename.value.name,
			editAreaName.value.trim(),
		)
		syncLocalTables()
		syncLocalStations()
		showSuccess(__("Area renamed"))
		showRenameAreaDialog.value = false
		areaToRename.value = null
		editAreaName.value = ""
	} catch (e) {
		showError(__("Failed to rename area"))
	}
}

function openDeleteAreaDialog(area) {
	areaToDelete.value = area
	showDeleteAreaDialog.value = true
}

async function handleDeleteArea() {
	if (!areaToDelete.value) return

	try {
		await restaurantStore.deleteArea(areaToDelete.value.name)
		syncLocalTables()
		syncLocalStations()
		if (
			selectedArea.value === areaToDelete.value.name &&
			areas.value.length > 0
		) {
			selectedArea.value = areas.value[0].name
		}
		showSuccess(__("Area deleted"))
		showDeleteAreaDialog.value = false
		areaToDelete.value = null
	} catch (e) {
		showError(__("Failed to delete area"))
	}
}

/**
 * Auto-layout tables in a grid when they have no positions set (all at 0,0).
 * Adds margin between each element until the user manually arranges them.
 */
function autoLayoutTables() {
	const tbls = filteredTables.value
	if (tbls.length < 2) return

	// Check if all tables are stacked at origin (no layout done yet)
	const allAtOrigin = tbls.every((t) => !t.pos_x && !t.pos_y)
	if (!allAtOrigin) return

	const tableW = 110
	const tableH = 110
	const margin = 20
	const canvasW = canvasRef.value?.offsetWidth || 800
	const cols = Math.max(1, Math.floor(canvasW / (tableW + margin)))

	for (let i = 0; i < tbls.length; i++) {
		const col = i % cols
		const row = Math.floor(i / cols)
		tbls[i].pos_x = margin + col * (tableW + margin)
		tbls[i].pos_y = margin + row * (tableH + margin)
		if (!tbls[i].width) tbls[i].width = 100
		if (!tbls[i].height) tbls[i].height = 100
	}

	// Force Vue to re-render by reassigning localTables
	localTables.value = [...localTables.value]
}

onMounted(async () => {
	// Always fetch from network to get latest position fields
	await restaurantStore.fetchFromNetwork()

	// Create local reactive copies
	syncLocalTables()
	syncLocalStations()

	// Restore last selected area, or default
	const savedArea = localStorage.getItem("pos_selected_area")
	if (savedArea && areas.value.find((a) => a.name === savedArea)) {
		selectedArea.value = savedArea
	} else if (
		restaurantStore.defaultArea &&
		areas.value.find((a) => a.name === restaurantStore.defaultArea)
	) {
		selectedArea.value = restaurantStore.defaultArea
	} else if (areas.value.length > 0) {
		selectedArea.value = areas.value[0].name
	}

	// Load walls for initial area
	syncLocalWalls()

	// Restore per-area pan
	if (selectedArea.value) {
		try {
			const savedPan = JSON.parse(localStorage.getItem(`pos_floor_pan_${selectedArea.value}`))
			if (savedPan) { panX.value = savedPan.x || 0; panY.value = savedPan.y || 0 }
		} catch { /* ignore */ }
	}

	// Auto-layout tables that have no positions yet
	await nextTick()
	autoLayoutTables()

	// Keyboard events for wall deletion
	document.addEventListener("keydown", onWallKeyDown)

	// Start restaurant status polling for card warnings
	restaurantStore.startStatusPolling()

	// Load runner + KDS + takeaway orders
	loadRunnerOrders()
	loadKdsOrders()
	if (restaurantStore.takeawayEnabled) restaurantStore.fetchTakeawayOrders()

	// Listen for realtime table updates via frappe.realtime socket
	floorSocket = window.frappe?.realtime || initSocket()
	if (floorSocket) {
		if (floorSocket.disconnected) floorSocket.connect()
		floorSocket.on("table_update", () => {
			restaurantStore.fetchFromNetwork()
		})
		floorSocket.on("kds_update", () => {
			loadRunnerOrders()
			loadKdsOrders()
			if (restaurantStore.takeawayEnabled) restaurantStore.fetchTakeawayOrders()
		})
		floorSocket.on("takeaway_update", () => {
			if (restaurantStore.takeawayEnabled) restaurantStore.fetchTakeawayOrders()
		})
	}
})

// Re-layout when switching areas
watch(wallOpacity, (val) => {
	if (selectedArea.value) {
		localStorage.setItem("pos_wall_opacity_" + selectedArea.value, val.toString())
	}
})

watch(selectedArea, async (newArea, oldArea) => {
	// Save pan/zoom of previous area
	if (oldArea) {
		localStorage.setItem(`pos_floor_pan_${oldArea}`, JSON.stringify({ x: panX.value, y: panY.value }))
	}
	// Save selected area for "back" navigation
	localStorage.setItem("pos_selected_area", newArea)
	// Restore per-area zoom
	const areaZoom = parseFloat(localStorage.getItem(`pos_floor_zoom_${newArea}`))
	if (areaZoom && areaZoom >= 0.4 && areaZoom <= 2) {
		zoomLevel.value = areaZoom
	}
	// Restore per-area pan
	try {
		const savedPan = JSON.parse(localStorage.getItem(`pos_floor_pan_${newArea}`))
		if (savedPan) {
			panX.value = savedPan.x || 0
			panY.value = savedPan.y || 0
		} else {
			resetPan()
		}
	} catch { resetPan() }
	syncLocalWalls()
	await nextTick()
	autoLayoutTables()
})

onUnmounted(() => {
	if (floorSocket) {
		floorSocket.off("table_update")
		floorSocket.off("kds_update")
	}
	destroy()
	cleanupGestures()
	document.removeEventListener("keydown", onWallKeyDown)
	restaurantStore.stopStatusPolling()
})
</script>

