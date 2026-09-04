<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// cash in/out from POS using Journal Entry Templates — 6c59863 + 34ee11a (+1 more)
  //// cash withdrawal at shift closing with suggested opening balance — 5783eb2
  //// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a + 5783eb2
-->
<template>
  <Dialog v-model="open" :options="{ title: __('Close POS Shift'), size: '4xl' }">
    <template #body-content>
      <!-- //// Neoffice — upstream sizes this dialog for a desktop till. Our clients close the -->
      <!-- //// shift on a 10-inch tablet, so the whole dialog was made mobile-first: every gap -->
      <!-- //// and padding shrinks behind md: breakpoints, so the summary, the ticket list and -->
      <!-- //// the reconciliation fit on one screen (7d2771d4 + ede9beb4, 2026-07-09 "compact -->
      <!-- //// shift-closing dialog" / "live amount input, collapsed invoices"). -->
      <div class="flex flex-col gap-2 md:gap-4">
        <div v-if="closingDataResource.loading" class="text-center py-8 md:py-12">
          <div class="inline-block animate-spin rounded-full h-12 w-12 md:h-16 md:w-16 border-b-4 border-blue-600"></div>
          <p class="mt-3 md:mt-4 text-base md:text-lg font-medium text-gray-600">{{ __('Loading shift data...') }}</p>
          <p class="text-xs md:text-sm text-gray-500">{{ __('Calculating totals and reconciliation...') }}</p>
        </div>

        <!-- //// Neoffice — same compaction: gap-3 md:gap-6 becomes gap-2 md:gap-4 (7d2771d4). -->
        <div v-else-if="closingData" class="flex flex-col gap-2 md:gap-4">
          <!-- Idle Warning -->
          <div v-if="showIdleWarning" class="rounded-lg bg-amber-50 border border-amber-300 p-3 flex items-center gap-2">
            <FeatherIcon name="alert-triangle" class="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p class="text-xs md:text-sm text-amber-800 font-medium">{{ __('This dialog has been open for over a minute. Please close the shift or close this dialog to resume the shift timer.') }}</p>
          </div>

          <!-- Shift Summary Header (hidden in entry mode when hideExpectedAmount is enabled) -->
          <!-- //// Neoffice — summary header tightened (p-3 md:p-6 to md:p-4, mb-3 md:mb-6 to mb-2 -->
          <!-- //// md:mb-3), same tablet compaction (7d2771d4, 2026-07-09). -->
          <div v-if="shouldShowSummary" class="bg-white border border-gray-200 rounded-lg p-3 md:p-4 shadow-sm">
            <div class="flex flex-col sm:flex-row justify-start items-start gap-3 mb-2 md:mb-3">
              <div class="flex-1">
                <h3 class="text-start text-sm md:text-base font-medium text-gray-900">{{ closingData.pos_profile }}</h3>
                <p class="text-start text-xs md:text-sm text-gray-500 mt-1">{{ formatDateTime(closingData.period_start_date) }}</p>
              </div>
              <div class="text-start sm:text-end">
                <div class="text-start text-xs text-gray-500 uppercase">{{ __('Duration') }}</div>
                <div class="text-base md:text-lg font-semibold text-gray-900">{{ getShiftDuration() }}</div>
              </div>
            </div>

            <!-- Key Metrics Grid -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
              <!-- Gross Sales (before returns) -->
              <!-- //// Neoffice — the four metric cards were shrunk (padding md:p-4 to md:p-3, figure -->
              <!-- //// text-lg md:text-2xl to text-base md:text-xl) so they stay on one row and do not -->
              <!-- //// push the reconciliation below the fold (7d2771d4, 2026-07-09). -->
              <div class="text-start bg-blue-50 border border-blue-200 rounded-lg p-2.5 md:p-3">
                <div class="text-blue-600 text-xs uppercase font-medium mb-1">{{ __('Gross Sales') }}</div>
                <div class="text-base md:text-xl font-bold text-blue-900 mb-0.5 md:mb-1 truncate">{{ formatCurrency(grossSales) }}</div>
                <div class="text-blue-600 text-xs">{{ __('{0} invoices', [closingData.sales_count || salesInvoiceCount]) }}</div>
              </div>

              <!-- Returns -->
              <!-- //// Neoffice — same card compaction as Gross Sales above (7d2771d4). -->
              <div v-if="hasReturns" class="text-start bg-red-50 border border-red-200 rounded-lg p-2.5 md:p-3">
                <div class="text-red-600 text-xs uppercase font-medium mb-1">{{ __('Returns') }}</div>
                <div class="text-base md:text-xl font-bold text-red-700 mb-0.5 md:mb-1 truncate">-{{ formatCurrency(closingData.returns_total) }}</div>
                <div class="text-red-600 text-xs">{{ __('{0} returns', [closingData.returns_count]) }}</div>
              </div>

              <!-- Net Sales (after returns) -->
              <!-- //// Neoffice — same card compaction as Gross Sales above (7d2771d4). -->
              <div class="text-start bg-green-50 border border-green-200 rounded-lg p-2.5 md:p-3">
                <div class="text-green-600 text-xs uppercase font-medium mb-1">{{ __('Net Sales') }}</div>
                <div class="text-base md:text-xl font-bold text-green-900 mb-0.5 md:mb-1 truncate">{{ formatCurrency(closingData.grand_total) }}</div>
                <div class="text-green-600 text-xs">{{ __('After returns') }}</div>
              </div>

              <!-- Tax Collected -->
              <!-- //// Neoffice — same card compaction as Gross Sales above (7d2771d4). -->
              <div class="text-start bg-gray-50 border border-gray-200 rounded-lg p-2.5 md:p-3">
                <div class="text-gray-600 text-xs uppercase font-medium mb-1">{{ __('Tax Collected') }}</div>
                <div class="text-base md:text-xl font-bold text-gray-900 mb-0.5 md:mb-1 truncate">{{ formatCurrency(totalTax) }}</div>
                <div class="text-gray-600 text-xs">{{ __('Net tax') }}</div>
              </div>
            </div>
          </div>

          <!-- No Sales Warning (hidden in entry mode when hideExpectedAmount is enabled) -->
          <div v-if="shouldShowSummary && invoiceCount === 0" class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 md:p-4">
            <div class="flex items-start gap-2 md:gap-3">
              <div class="flex-shrink-0">
                <svg class="h-4 w-4 md:h-5 md:w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 class="text-xs md:text-sm font-medium text-yellow-900">{{ __('No Sales During This Shift') }}</h3>
                <p class="text-xs md:text-sm text-yellow-700 mt-1 md:mt-2">
                  {{ __('No invoices were created. Closing amounts should match opening amounts.') }}
                </p>
              </div>
            </div>
          </div>

          <!-- Invoice Details (Collapsible) (hidden in entry mode when hideExpectedAmount is enabled) -->
          <!-- //// Neoffice — two changes in the toggle below. (1) The aria-label was a JS template -->
          <!-- //// literal, which the PO extractor cannot see, so a French till spoke English to the -->
          <!-- //// screen reader; it is now two plain __() strings. (2) Header padding compacted for -->
          <!-- //// the tablet (7d2771d4, 2026-07-09 "compact shift-closing dialog, auto-fill zero -->
          <!-- //// methods, i18n"). -->
          <div v-if="shouldShowSummary && invoiceCount > 0" class="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <button
              @click="showInvoiceDetails = !showInvoiceDetails"
              :aria-label="showInvoiceDetails ? __('Hide invoice details') : __('Show invoice details')"
              :aria-expanded="showInvoiceDetails"
              class="w-full px-3 py-2.5 md:px-5 md:py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div class="text-start">
                <h3 class="text-sm md:text-lg font-medium text-gray-900">{{ __('Invoice Details') }}</h3>
                <p class="text-xs md:text-sm text-gray-500">{{ __('{0} transactions • {1}', [
                  invoiceCount,
                  formatCurrency(closingData.grand_total)
                ]) }}</p>
              </div>
              <svg
                :class="['h-4 w-4 md:h-5 md:w-5 text-gray-400 transition-transform', showInvoiceDetails ? 'transform rotate-180' : '']"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div v-show="showInvoiceDetails" class="border-t border-gray-200">
              <!-- //// Neoffice ▼▼▼ — the ticket list below is upstream's markup, re-sized for a 10-inch -->
              <!-- //// till: mobile cards and desktop table each get a capped height with their own -->
              <!-- //// scrollbar (a busy shift used to stretch the dialog until the Close button left the -->
              <!-- //// screen), the table head and the net-total row are sticky, and every cell padding -->
              <!-- //// px-6 py-3/py-4 becomes px-4 py-2.5. Layout only, no data change (7d2771d4, -->
              <!-- //// 2026-07-09 "compact shift-closing dialog, auto-fill zero methods, i18n"). -->
              <!-- Mobile Card View -->
              <div class="md:hidden divide-y divide-gray-200 max-h-56 overflow-y-auto">
                <div v-for="(invoice, idx) in closingData.pos_transactions" :key="idx"
                     :class="['p-3', invoice.is_return ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50']">
                  <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                      <span :class="['text-xs font-medium', invoice.is_return ? 'text-red-700' : 'text-gray-900']">
                        {{ invoice.pos_invoice || invoice.sales_invoice || __('N/A') }}
                      </span>
                      <span v-if="invoice.is_return" class="px-1.5 py-0.5 text-xs font-medium bg-red-200 text-red-800 rounded">
                        {{ __('Return') }}
                      </span>
                    </div>
                    <span :class="['text-sm font-semibold', invoice.is_return ? 'text-red-700' : 'text-gray-900']">
                      {{ formatCurrency(invoice.grand_total) }}
                    </span>
                  </div>
                  <div class="flex justify-between items-center text-xs text-gray-600">
                    <span>{{ invoice.customer }}</span>
                    <span class="text-gray-500">{{ formatTime(invoice.posting_date) }}</span>
                  </div>
                </div>
                <div class="bg-gray-50 p-3">
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-semibold text-gray-700">{{ __('Net Total:') }}</span>
                    <span class="text-sm font-bold text-gray-900">
                      {{ formatCurrency(closingData.grand_total) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Desktop Table View -->
              <!-- //// Neoffice — capped height with its own scrollbar, see the note above (7d2771d4). -->
              <div class="hidden md:block overflow-auto max-h-72">
                <table class="min-w-full divide-y divide-gray-200">
                  <!-- //// Neoffice — sticky head so the column titles survive scrolling (7d2771d4). -->
                  <thead class="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <!-- //// Neoffice — header cells px-6 py-3 become px-4 py-2.5 (7d2771d4). -->
                      <th class="px-4 py-2.5 text-start text-xs font-medium text-gray-500 uppercase">{{ __('Invoice') }}</th>
                      <th class="px-4 py-2.5 text-start text-xs font-medium text-gray-500 uppercase">{{ __('Type') }}</th>
                      <th class="px-4 py-2.5 text-start text-xs font-medium text-gray-500 uppercase">{{ __('Customer') }}</th>
                      <th class="px-4 py-2.5 text-start text-xs font-medium text-gray-500 uppercase">{{ __('Time') }}</th>
                      <th class="px-4 py-2.5 text-start text-xs font-medium text-gray-500 uppercase">{{ __('Amount') }}</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-for="(invoice, idx) in closingData.pos_transactions" :key="idx"
                        :class="invoice.is_return ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'">
                      <!-- //// Neoffice — cell padding px-6 py-4 becomes px-4 py-2.5, tablet compaction (7d2771d4). -->
                      <td class="text-start px-4 py-2.5 whitespace-nowrap">
                        <span :class="['text-sm font-medium', invoice.is_return ? 'text-red-700' : 'text-gray-900']">
                          {{ invoice.pos_invoice || invoice.sales_invoice || __('N/A') }}
                        </span>
                      </td>
                      <!-- //// Neoffice — cell padding px-6 py-4 becomes px-4 py-2.5, tablet compaction (7d2771d4). -->
                      <td class="text-start px-4 py-2.5 whitespace-nowrap">
                        <span v-if="invoice.is_return" class="px-2 py-1 text-xs font-medium bg-red-200 text-red-800 rounded">
                          {{ __('Return') }}
                        </span>
                        <span v-else class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                          {{ __('Sale') }}
                        </span>
                      </td>
                      <!-- //// Neoffice — cell padding px-6 py-4 becomes px-4 py-2.5, tablet compaction (7d2771d4). -->
                      <td class="text-start px-4 py-2.5 whitespace-nowrap text-sm text-gray-600">
                        {{ invoice.customer }}
                      </td>
                      <!-- //// Neoffice — cell padding px-6 py-4 becomes px-4 py-2.5, tablet compaction (7d2771d4). -->
                      <td class="text-start px-4 py-2.5 whitespace-nowrap text-sm text-gray-500">
                        {{ formatTime(invoice.posting_date) }}
                      </td>
                      <!-- //// Neoffice — cell padding px-6 py-4 becomes px-4 py-2.5, tablet compaction (7d2771d4). -->
                      <td class="text-start px-4 py-2.5 whitespace-nowrap">
                        <span :class="['text-sm font-semibold', invoice.is_return ? 'text-red-700' : 'text-gray-900']">
                          {{ formatCurrency(invoice.grand_total) }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                  <!-- //// Neoffice — sticky foot so the net total stays visible while scrolling (7d2771d4). -->
                  <tfoot class="bg-gray-50 sticky bottom-0 z-10">
                    <tr>
                      <!-- //// Neoffice — cell padding px-6 py-4 becomes px-4 py-2.5, tablet compaction (7d2771d4). -->
                      <td colspan="4" class="px-4 py-2.5 text-start text-sm font-semibold text-gray-700">
                        {{ __('Net Total:') }}
                      </td>
                      <!-- //// Neoffice — cell padding px-6 py-4 becomes px-4 py-2.5, tablet compaction (7d2771d4). -->
                      <td class="px-4 py-2.5 whitespace-nowrap text-start">
                        <span class="text-base font-bold text-gray-900">
                          {{ formatCurrency(closingData.grand_total) }}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            <!-- //// ▲▲▲ Neoffice — end of the re-sized ticket list. -->
            </div>
          </div>

          <!-- //// Neoffice ▼▼▼ — three sections with no upstream equivalent. -->
          <!-- //// · Sales by Payment Method — the cashier needs the split per method before counting -->
          <!-- ////   the drawer; upstream shows only a grand total. -->
          <!-- //// · External Payments — money taken at this till on an invoice created in the back -->
          <!-- ////   office. It never becomes a POS Invoice, so without this it was cash in the drawer -->
          <!-- ////   that the reconciliation could not explain (34ee11a8, 2026-03-25). -->
          <!-- //// · Cash In/Out — float top-ups and pay-outs, posted as Journal Entries from a -->
          <!-- ////   Journal Entry Template (erpnextswiss structure) and listed here because they move -->
          <!-- ////   the expected cash (6c598630, 2026-03-28 "cash in/out from POS using Journal Entry -->
          <!-- ////   Templates"). -->
          <!-- Sales by Payment Method -->
          <div v-if="shouldShowSummary && closingData.sales_by_payment && closingData.sales_by_payment.length > 0"
            class="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <div class="px-3 py-2.5 md:px-5 md:py-3 bg-gray-50 border-b border-gray-200">
              <h3 class="text-sm md:text-lg font-medium text-gray-900">{{ __('Sales by Payment Method') }}</h3>
            </div>
            <div class="p-3 md:p-4">
              <div class="flex flex-col gap-2 md:gap-3">
                <div v-for="(sp, idx) in closingData.sales_by_payment" :key="idx"
                  class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div class="flex items-center gap-2 md:gap-3">
                    <div :class="['rounded-lg p-1.5 md:p-2', getPaymentIcon(sp.mode_of_payment).color]">
                      <span class="text-base md:text-lg">{{ getPaymentIcon(sp.mode_of_payment).icon }}</span>
                    </div>
                    <p class="text-sm md:text-base font-medium text-gray-900">{{ sp.mode_of_payment }}</p>
                  </div>
                  <p class="text-sm md:text-base font-semibold text-gray-900">{{ formatCurrency(sp.amount) }}</p>
                </div>
              </div>
              <div class="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-gray-200">
                <div class="flex items-center justify-between">
                  <span class="text-xs md:text-sm font-medium text-gray-700">{{ __('Total Sales') }}</span>
                  <span class="text-base md:text-lg font-bold text-gray-900">
                    {{ formatCurrency(closingData.sales_by_payment.reduce((s, p) => s + p.amount, 0)) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- External Payments (invoices paid via POS but created outside) -->
          <div v-if="closingData.external_payments && closingData.external_payments.length > 0"
            class="bg-white border border-blue-200 rounded-lg overflow-hidden shadow-sm">
            <div class="px-3 py-2.5 md:px-5 md:py-3 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-sm md:text-base font-semibold text-blue-800">{{ __('External Payments') }}</h3>
                  <p class="text-xs text-blue-600 mt-0.5">{{ __('{0} payments', [closingData.external_payments.length]) }}</p>
                </div>
                <div class="text-lg font-bold text-blue-800">
                  {{ formatCurrency(closingData.external_payments.reduce((s, p) => s + p.amount, 0)) }}
                </div>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{{ __('Invoice') }}</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{{ __('Customer') }}</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{{ __('Payment') }}</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">{{ __('Amount') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="(ep, idx) in closingData.external_payments" :key="idx">
                    <td class="px-4 py-2 text-sm text-gray-800">{{ ep.invoice }}</td>
                    <td class="px-4 py-2 text-sm text-gray-600">{{ ep.customer }}</td>
                    <td class="px-4 py-2 text-sm text-gray-500">{{ ep.mode_of_payment }}</td>
                    <td class="px-4 py-2 text-sm font-semibold text-right text-blue-700">{{ formatCurrency(ep.amount) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Cash In/Out Entries -->
          <div v-if="closingData.cash_entries && closingData.cash_entries.length > 0"
            class="bg-white border border-orange-200 rounded-lg overflow-hidden shadow-sm">
            <div class="px-3 py-2.5 md:px-5 md:py-3 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-sm md:text-base font-semibold text-orange-800">{{ __('Cash In/Out') }}</h3>
                  <p class="text-xs text-orange-600 mt-0.5">{{ __('{0} entries', [closingData.cash_entries.length]) }}</p>
                </div>
                <div class="flex gap-4 items-center">
                  <div v-if="closingData.cash_in_total" class="text-sm font-semibold text-green-700">
                    +{{ formatCurrency(closingData.cash_in_total) }}
                  </div>
                  <div v-if="closingData.cash_out_total" class="text-sm font-semibold text-red-700">
                    -{{ formatCurrency(closingData.cash_out_total) }}
                  </div>
                </div>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{{ __('Template') }}</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{{ __('Direction') }}</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{{ __('Note') }}</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">{{ __('Amount') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="(ce, idx) in closingData.cash_entries" :key="idx">
                    <td class="px-4 py-2 text-sm text-gray-800">{{ ce.template }}</td>
                    <td class="px-4 py-2 text-sm">
                      <span v-if="ce.direction === 'in'" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {{ __('Cash In') }}
                      </span>
                      <span v-else class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        {{ __('Cash Out') }}
                      </span>
                    </td>
                    <td class="px-4 py-2 text-sm text-gray-500">{{ ce.note || '—' }}</td>
                    <td class="px-4 py-2 text-sm font-semibold text-right"
                      :class="ce.direction === 'out' ? 'text-red-700' : 'text-green-700'">
                      {{ ce.direction === 'out' ? '-' : '+' }}{{ formatCurrency(ce.amount) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- //// ▲▲▲ Neoffice — end of the sections added to the closing report. -->
          <!-- Payment Reconciliation -->
          <div class="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <!-- //// Neoffice — reconciliation header padding md:px-6 md:py-4 becomes md:px-5 md:py-3, -->
            <!-- //// tablet compaction (7d2771d4, 2026-07-09). -->
            <div :class="[
              'px-3 py-2.5 md:px-5 md:py-3 border-b border-gray-200',
              hideExpectedAmount && showSuccessReport ? 'bg-green-50 border-green-200' : 'bg-gray-50'
            ]">
              <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <div class="text-start flex items-center gap-2">
                    <h3 class="text-sm md:text-lg font-semibold text-gray-900">{{ __('Payment Reconciliation') }}</h3>
                    <span v-if="hideExpectedAmount && showSuccessReport" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {{ __('✓ Shift Closed') }}
                    </span>
                  </div>
                  <p class="text-xs md:text-sm text-gray-600">
                    {{ reconciliationMessage }}
                  </p>
                </div>
                <div v-if="shouldShowSummary && getTotalDifference !== 0" class="text-start sm:text-end">
                  <div class="text-xs mb-1 text-gray-500 uppercase">{{ __('Total Variance') }}</div>
                  <div :class="[
                    'text-lg md:text-xl font-bold',
                    getTotalDifference > 0 ? 'text-blue-600' : 'text-red-600'
                  ]">
                    {{ getTotalDifference > 0 ? '+' : '' }}{{ formatCurrency(Math.abs(getTotalDifference)) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- //// Neoffice ▼▼▼ — the payment reconciliation below is ours, not upstream's. Upstream -->
            <!-- //// drew one tall card per method: icon, name, a three-box grid for opening / expected / -->
            <!-- //// actual, and a difference alert underneath. With five methods the cashier had to -->
            <!-- //// scroll to reach the Close button. We draw one compact row per method — icon, name, -->
            <!-- //// 'Opening x · Expected y', the amount field, and the balanced / over / short status -->
            <!-- //// inline (ede9beb4, 2026-07-09 "compact closing dialog, live amount input, collapsed -->
            <!-- //// invoices"). The field is a native input with @input instead of a frappe-ui Input -->
            <!-- //// with @update:modelValue, so the variance follows every keystroke instead of waiting -->
            <!-- //// for a blur, and @focus selects its content so a pre-filled 0 is typed over -->
            <!-- //// (2afb9f4c + 3cc8535f, 2026-07-09). The 'Expected:' hint used to be a TranslatedHTML -->
            <!-- //// whose entity-encoded msgid never resolved and stayed English; it is now a plain -->
            <!-- //// __('Expected') label (82ccf62b, 2026-07-09). -->
            <div class="p-3 md:p-4">
              <!-- ENTRY MODE: Simple blind input list (when hideExpectedAmount is enabled and not showing report) -->
              <div v-if="isInEntryMode" class="flex flex-col gap-2 md:gap-2.5">
                <div
                  v-for="(payment, idx) in closingData.payment_reconciliation"
                  :key="idx"
                  class="border border-gray-200 rounded-lg px-2.5 py-2 md:px-3 md:py-2.5 bg-white hover:border-gray-300 transition-colors"
                >
                  <div class="flex items-center justify-between gap-3">
                    <!-- Payment Method Name with Icon -->
                    <!-- //// Neoffice — min-w-0 so a long method name truncates instead of pushing the amount -->
                    <!-- //// field off the row (ede9beb4, 2026-07-09). -->
                    <div class="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      <div :class="['rounded-lg p-1.5 flex-shrink-0', getPaymentIcon(payment.mode_of_payment).color]">
                        <span class="text-base md:text-lg">{{ getPaymentIcon(payment.mode_of_payment).icon }}</span>
                      </div>
                      <!-- //// Neoffice — truncate, for the same reason as min-w-0 above (ede9beb4). -->
                      <label :for="`payment-${idx}`" class="text-start text-sm md:text-base font-semibold text-gray-900 cursor-pointer truncate">
                        {{ payment.mode_of_payment }}
                      </label>
                    </div>

                    <!-- Live native input (updates on each keystroke, no blur needed) -->
                    <!-- //// select-all on focus so a pre-filled 0 is typed over, not appended -->
                    <input
                      :id="`payment-${idx}`"
                      :value="payment.closing_amount"
                      @input="(e) => updateClosingAmount(payment, e.target.value)"
                      @focus="selectAmountField"
                      type="number"
                      step="10"
                      min="0"
                      inputmode="decimal"
                      placeholder="0.00"
                      :disabled="submitResource.loading"
                      :aria-label="__('Enter actual amount for {0}', [payment.mode_of_payment])"
                      class="w-32 md:w-40 px-2.5 py-1.5 text-base md:text-lg text-center font-semibold text-gray-900 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>
                </div>
              </div>

              <!-- REVIEW MODE: compact one-row cards (when not in entry mode) -->
              <!-- //// compact single-row reconciliation + live native input (no blur needed) -->
              <div v-else class="flex flex-col gap-2 md:gap-2.5">
                <div
                  v-for="(payment, idx) in closingData.payment_reconciliation"
                  :key="idx"
                  :class="[
                    'border rounded-lg px-2.5 py-2 md:px-3 md:py-2.5 transition-all',
                    payment.difference === 0 ? 'border-green-200 bg-green-50' :
                    payment.difference > 0 ? 'border-blue-200 bg-blue-50' :
                    'border-red-200 bg-red-50'
                  ]"
                >
                  <!-- //// Neoffice — one compact row per method instead of upstream's tall card; see the note -->
                  <!-- //// above the section (ede9beb4, 2026-07-09). -->
                  <div class="flex items-center justify-between gap-2 md:gap-3">
                    <!-- Left: icon + name + opening/expected -->
                    <div class="flex items-center gap-2 md:gap-3 min-w-0">
                      <div :class="['rounded-lg p-1.5 flex-shrink-0', getPaymentIcon(payment.mode_of_payment).color]">
                        <span class="text-base md:text-lg">{{ getPaymentIcon(payment.mode_of_payment).icon }}</span>
                      </div>
                      <!-- //// Neoffice — opening and expected now sit inline under the name, replacing upstream's -->
                      <!-- //// three-box grid (ede9beb4, 2026-07-09). -->
                      <div class="min-w-0">
                        <h4 class="text-start text-sm md:text-base font-semibold text-gray-900 truncate">{{ payment.mode_of_payment }}</h4>
                        <p class="text-start text-xs text-gray-500 truncate">
                          {{ __('Opening') }} {{ formatCurrency(payment.opening_amount) }} · {{ __('Expected') }}
                          <span class="font-medium text-gray-700">{{ formatCurrency(payment.expected_amount) }}</span>
                        </p>
                      </div>
                    </div>

                    <!-- //// Neoffice — amount field and status share the row; upstream put the status in a badge -->
                    <!-- //// above the card and the difference in an alert below it (ede9beb4, 2026-07-09). -->
                    <!-- Right: live input + inline status -->
                    <div class="flex items-center gap-2 md:gap-3 flex-shrink-0">
                      <input
                        :value="payment.closing_amount"
                        @input="(e) => updateClosingAmount(payment, e.target.value)"
                        @focus="selectAmountField"
                        type="number"
                        step="0.01"
                        min="0"
                        inputmode="decimal"
                        placeholder="0.00"
                        :disabled="showSuccessReport || submitResource.loading"
                        :aria-label="__('Enter actual amount for {0}', [payment.mode_of_payment])"
                        class="w-24 md:w-32 px-2.5 py-1.5 text-sm md:text-base text-end font-semibold text-gray-900 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      />
                      <!-- //// Neoffice — inline balanced / over / short instead of upstream's difference alert. The -->
                      <!-- //// empty-string test comes with the 'not counted yet' default: a method that expects -->
                      <!-- //// money starts blank, so no status shows before the cashier counts (c91af424, ede9beb4). -->
                      <div v-if="payment.closing_amount !== null && payment.closing_amount !== undefined && payment.closing_amount !== ''"
                        class="w-16 md:w-24 text-end">
                        <span v-if="payment.difference === 0" class="text-xs md:text-sm font-semibold text-green-700 whitespace-nowrap">{{ __('✓ Balanced') }}</span>
                        <span v-else-if="payment.difference > 0" class="text-xs md:text-sm font-semibold text-blue-700 whitespace-nowrap">+{{ formatCurrency(payment.difference) }}</span>
                        <span v-else class="text-xs md:text-sm font-semibold text-red-700 whitespace-nowrap">-{{ formatCurrency(Math.abs(payment.difference)) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- //// ▲▲▲ Neoffice — end of the reworked payment reconciliation. -->
            <!-- Reconciliation Summary (hidden in entry mode when hideExpectedAmount is enabled) -->
            <!-- //// Neoffice — summary strip padding md:px-6 md:py-4 becomes md:px-5 md:py-3 (7d2771d4). -->
            <div v-if="shouldShowSummary" class="text-start bg-gray-50 px-3 py-2.5 md:px-5 md:py-3 border-t border-gray-200">
              <div class="grid grid-cols-3 gap-2 md:gap-4">
                <div>
                  <p class="text-xs md:text-sm text-gray-600">{{ __('Total Expected') }}</p>
                  <p class="text-base md:text-xl font-semibold text-gray-900">{{ formatCurrency(getTotalExpected) }}</p>
                </div>
                <div>
                  <p class="text-xs md:text-sm text-gray-600">{{ __('Total Actual') }}</p>
                  <p class="text-base md:text-xl font-semibold text-gray-900">{{ formatCurrency(getTotalActual) }}</p>
                </div>
                <div>
                  <p class="text-xs md:text-sm text-gray-600">{{ __('Net Variance') }}</p>
                  <p :class="[
                    'text-base md:text-xl font-bold',
                    getTotalDifference === 0 ? 'text-green-600' :
                    getTotalDifference > 0 ? 'text-blue-600' : 'text-red-600'
                  ]">
                    {{ getTotalDifference === 0 ? '✓ ' : getTotalDifference > 0 ? '+' : '' }}{{ formatCurrency(Math.abs(getTotalDifference)) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Tax Summary (hidden in entry mode when hideExpectedAmount is enabled) -->
          <div v-if="shouldShowSummary && closingData.taxes && closingData.taxes.length > 0" class="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <!-- //// Neoffice — tax summary header padding md:px-6 md:py-4 becomes md:px-5 md:py-3 -->
            <!-- //// (7d2771d4, 2026-07-09). -->
            <div class="px-3 py-2.5 md:px-5 md:py-3 bg-gray-50 border-b border-gray-200">
              <h3 class="text-sm md:text-lg font-medium text-gray-900">{{ __('Tax Summary') }}</h3>
            </div>
            <!-- //// Neoffice — tax summary body padding md:p-6 becomes md:p-4, same compaction (7d2771d4). -->
            <div class="p-3 md:p-4">
              <div class="flex flex-col gap-2 md:gap-3">
                <div v-for="(tax, idx) in closingData.taxes" :key="idx" class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p class="text-xs md:text-sm font-medium text-gray-900">{{ tax.account_head }}</p>
                    <p class="text-xs text-gray-500">{{ formatQuantity(tax.rate) }}%</p>
                  </div>
                  <div class="text-end">
                    <p class="text-sm md:text-base font-semibold text-gray-900">{{ formatCurrency(tax.amount) }}</p>
                  </div>
                </div>
              </div>
              <div class="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-gray-200">
                <div class="flex items-center justify-between">
                  <span class="text-xs md:text-sm font-medium text-gray-700">{{ __('Total Tax Collected') }}</span>
                  <span class="text-base md:text-lg font-bold text-gray-900">{{ formatCurrency(totalTax) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- //// Neoffice ▼▼▼ — cash withdrawal at closing; no upstream equivalent. A Swiss shop -->
          <!-- //// takes the day's takings out of the drawer and leaves a float behind. The cashier -->
          <!-- //// types what they remove and sees what stays; on submit the server posts a Journal -->
          <!-- //// Entry from POS Settings.closing_withdrawal_template (cash to transit account) and -->
          <!-- //// stores the remainder on POS Closing Shift, which the next opening dialog offers as -->
          <!-- //// opening balance. Only rendered when that template is configured (5783eb27, -->
          <!-- //// 2026-03-28 "cash withdrawal at shift closing with suggested opening balance"). -->
          <!-- Cash Withdrawal Section -->
          <div v-if="closingData.closing_withdrawal_template && !showSuccessReport" class="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <div class="px-3 py-2.5 md:px-5 md:py-3 bg-amber-50 border-b border-amber-200">
              <h3 class="text-sm md:text-lg font-medium text-amber-900">{{ __('Cash Withdrawal') }}</h3>
              <p class="text-xs text-amber-700 mt-1">{{ __('Withdraw cash from the register. The remaining amount will be suggested as opening balance for the next shift.') }}</p>
            </div>
            <div class="p-3 md:p-4">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                <!-- Cash Counted -->
                <div class="text-start bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <label class="block text-xs font-medium text-gray-500 uppercase mb-1">{{ __('Cash Counted') }}</label>
                  <div class="text-lg md:text-xl font-bold text-gray-900">{{ formatCurrency(cashClosingAmount) }}</div>
                  <div class="text-xs text-gray-500 mt-1">{{ __('From reconciliation') }}</div>
                </div>

                <!-- Withdrawal Amount -->
                <div class="text-start bg-white rounded-lg p-3 border border-amber-300">
                  <label class="block text-xs font-medium text-amber-700 uppercase mb-1">{{ __('Withdraw') }}</label>
                  <Input
                    :modelValue="cashWithdrawalAmount"
                    @update:modelValue="updateWithdrawalAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    :max="cashClosingAmount"
                    placeholder="0.00"
                    :disabled="submitResource.loading"
                    class="text-lg"
                  />
                  <div class="text-xs text-amber-600 mt-1">{{ __('Amount to take out') }}</div>
                </div>

                <!-- Remaining -->
                <div class="text-start rounded-lg p-3 border" :class="cashRemainingBalance > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'">
                  <label class="block text-xs font-medium uppercase mb-1" :class="cashRemainingBalance > 0 ? 'text-green-600' : 'text-gray-500'">{{ __('Remaining') }}</label>
                  <div class="text-lg md:text-xl font-bold" :class="cashRemainingBalance > 0 ? 'text-green-700' : 'text-gray-900'">{{ formatCurrency(cashRemainingBalance) }}</div>
                  <div class="text-xs mt-1" :class="cashRemainingBalance > 0 ? 'text-green-600' : 'text-gray-500'">{{ __('Next opening balance') }}</div>
                </div>
              </div>

              <!-- Warning if withdrawal exceeds cash -->
              <div v-if="withdrawalExceedsCash" class="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p class="text-xs md:text-sm text-red-700 font-medium">{{ __('Withdrawal amount cannot exceed the counted cash amount.') }}</p>
              </div>
            </div>
          </div>

          <!-- Cash Withdrawal Summary (in success report) -->
          <div v-if="closingData.closing_withdrawal_template && showSuccessReport && cashWithdrawalAmount > 0" class="bg-amber-50 border border-amber-200 rounded-lg p-3 md:p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-amber-900">{{ __('Cash Withdrawn') }}</p>
                <p class="text-xs text-amber-700 mt-1">{{ __('Remaining balance for next shift: {0}', [formatCurrency(cashRemainingBalance)]) }}</p>
              </div>
              <div class="text-lg md:text-xl font-bold text-amber-900">{{ formatCurrency(cashWithdrawalAmount) }}</div>
            </div>
          </div>

          <!-- //// ▲▲▲ Neoffice — end of the cash-withdrawal block. -->
          <!-- Error Display -->
          <div v-if="submitResource.error || (errorMessage && !closingDataResource.error)" class="rounded-lg bg-red-50 border border-red-200 p-3 md:p-4">
            <div class="flex gap-2 md:gap-3">
              <svg class="h-4 w-4 md:h-5 md:w-5 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
              <div class="flex-1">
                <h4 class="text-xs md:text-sm font-medium text-red-800">{{ __('Error Closing Shift') }}</h4>
                <p class="text-xs md:text-sm text-red-700 mt-1">{{ errorMessage || submitResource.error }}</p>
                <button
                  v-if="errorMessage"
                  @click="errorMessage = ''"
                  class="mt-2 text-xs text-red-600 hover:text-red-800 underline"
                >
                  {{ __('Dismiss') }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="closingDataResource.error || errorMessage" class="rounded-lg bg-red-50 border border-red-200 p-3 md:p-4">
          <div class="flex gap-2 md:gap-3">
            <svg class="h-4 w-4 md:h-5 md:w-5 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
            <div>
              <h3 class="text-xs md:text-sm font-medium text-red-800">{{ __('Failed to Load Shift Data') }}</h3>
              <p class="text-xs md:text-sm text-red-700 mt-1">{{ errorMessage || closingDataResource.error }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #actions>
      <div class="flex flex-col sm:flex-row justify-between w-full items-stretch sm:items-center gap-2 sm:gap-0">
        <!-- Left side - Cancel/Close button -->
        <Button
          variant="subtle"
          @click="closeDialog"
          :disabled="submitResource.loading"
          class="order-2 sm:order-1"
        >
          {{ showSuccessReport ? __('Close') : __('Cancel') }}
        </Button>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 order-1 sm:order-2">
          <!-- Validation Warning (only in entry mode) -->
          <div v-if="!canSubmit && closingData && !showSuccessReport" class="text-xs md:text-sm text-yellow-600 font-medium text-center sm:text-end">
            {{ __('Please enter all closing amounts') }}
          </div>

          <!-- Success message (shown in report view) -->
          <div v-if="showSuccessReport" class="text-xs md:text-sm text-green-600 font-medium text-center sm:text-end">
            {{ __('✓ Shift closed successfully') }}
          </div>

          <!-- Submit/Close button (only shown in entry mode) -->
          <Button
            v-if="!showSuccessReport"
            variant="solid"
            theme="blue"
            @click="submitClosing"
            :loading="submitResource.loading"
            :disabled="!canSubmit"
          >
            {{ submitResource.loading ? __('Closing Shift...') : __('Close Shift') }}
          </Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { Button, Dialog, FeatherIcon, Input } from "frappe-ui"
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue"
import { storeToRefs } from "pinia"
import { useShift, shiftState } from "../composables/useShift"
import { useFormatters } from "../composables/useFormatters"
import { usePOSSettingsStore } from "../stores/posSettings"
//// Neoffice — the TranslatedHTML import that stood here is gone. Its only user was the
//// per-method "Expected:" hint, whose msgid was HTML-entity-encoded and never resolved,
//// so the label stayed English on a French till; it is a plain __('Expected') label now
//// (82ccf62b, 2026-07-09 "translate the 'Expected:' label in closing reconciliation").
import { usePOSShiftStore } from "../stores/posShift"

const props = defineProps({
	modelValue: {
		type: Boolean,
		required: true,
	},
	openingShift: {
		type: String,
		required: true,
		validator: (value) => value && value.length > 0,
	},
})

const emit = defineEmits(["update:modelValue", "shift-closed"])

const open = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
})

const { getClosingShiftData, submitClosingShift } = useShift()
//// Neoffice — Biome formatter pass only, no behaviour change (458d81a9, 2026-03-20
//// "remove BrainWise branding, add restaurant mode, and code formatting").
const { formatCurrency, formatQuantity, formatDateTime, formatTime } =
	useFormatters()
const posSettingsStore = usePOSSettingsStore()
const { hideExpectedAmount } = storeToRefs(posSettingsStore)

const shiftStore = usePOSShiftStore()

const closingData = ref(null)
const closingDataResource = getClosingShiftData
const submitResource = submitClosingShift
const showInvoiceDetails = ref(false)
const showSuccessReport = ref(false) // Track if shift is closed and showing report
//// Neoffice — Biome turned '' into "" here (458d81a9); the ref two lines below is ours:
//// how much cash the cashier takes out of the drawer at closing (5783eb27, 2026-03-28).
const errorMessage = ref("") // User-friendly error message
const showIdleWarning = ref(false)
const cashWithdrawalAmount = ref(0)
let _idleWarningTimer = null

// Watch dialog open state
watch(open, async (isOpen) => {
	if (isOpen && props.openingShift) {
		// Pause the shift duration counter in the header
		shiftStore.shiftTimerPaused = true
		showIdleWarning.value = false

		// Warn user if dialog stays open for more than 1 minute
		_idleWarningTimer = setTimeout(() => {
			showIdleWarning.value = true
		}, 60_000)

		// Refresh POS settings to get latest hideExpectedAmount value
		await posSettingsStore.reloadSettings()
		loadClosingData()
	} else {
		// Resume the shift duration counter
		shiftStore.shiftTimerPaused = false
		showIdleWarning.value = false
		if (_idleWarningTimer) {
			clearTimeout(_idleWarningTimer)
			_idleWarningTimer = null
		}
	}
})

onBeforeUnmount(() => {
	shiftStore.shiftTimerPaused = false
	if (_idleWarningTimer) {
		clearTimeout(_idleWarningTimer)
		_idleWarningTimer = null
	}
})

async function loadClosingData() {
	try {
		//// Neoffice — Biome pass: single to double quotes (458d81a9, 2026-03-20).
		errorMessage.value = "" // Clear any previous errors

		const data = await closingDataResource.submit({
			opening_shift: props.openingShift,
		})

		// Make payment_reconciliation reactive
		if (data.payment_reconciliation) {
			data.payment_reconciliation = data.payment_reconciliation.map((payment) => {
				//// zero-activity methods (nothing expected) need no manual count:
				// pre-fill 0 and mark touched so they never block the close. Methods
				// that DO expect money start empty (the backend's default 0 is treated
				// as "not counted yet") so the cashier gets a blank field, not a
				// premature deficit.
				const expected = Number.parseFloat(payment.expected_amount) || 0
				const autoZero = expected === 0
				const savedAmount = Number.parseFloat(payment.closing_amount) || null
				//// Neoffice — closing_amount and _touched below carry the autoZero rule explained just
				//// above (7d2771d4 + c91af424, 2026-07-09).
				return reactive({
					...payment,
					closing_amount: autoZero ? 0 : savedAmount,
					difference: 0,
					_touched: autoZero,
				})
			})

			// Calculate initial differences
			data.payment_reconciliation.forEach((payment) => {
				calculateDifference(payment)
			})
		}

		closingData.value = data

		//// keep the invoice list collapsed by default (less scrolling)
		// The cashier can expand it via the chevron when they need the detail.
		showInvoiceDetails.value = false
	} catch (error) {
		console.error("Error loading closing data:", error)
		//// Neoffice — upstream left this message a bare English literal, so a load failure spoke
		//// English on a French till. Wrapped in __() and translated in fr.po (7d2771d4,
		//// 2026-07-09 "compact shift-closing dialog, auto-fill zero methods, i18n").
		errorMessage.value = __(
			"Unable to load shift data. Please check your connection and try again.",
		)
	}
}

//// round to cents & kill -0 so float residue isn't a phantom deficit
// e.g. 86.05 - 86.05 === -1.4e-14 which rendered as a red "Short 0.00" and
// blocked a clean balance. Snap the difference to the nearest cent instead.
function roundCents(value) {
	const rounded = Math.round((Number.parseFloat(value) || 0) * 100) / 100
	return rounded === 0 ? 0 : rounded
}

function calculateDifference(payment) {
	const closing = Number.parseFloat(payment.closing_amount) || 0
	const expected = Number.parseFloat(payment.expected_amount) || 0
	//// Neoffice — snapped to the cent by roundCents above: the raw float subtraction left
	//// 86.05 - 86.05 === -1.4e-14, rendered as a red deficit no count could clear (4ce4bed2,
	//// 2026-07-09 "snap closing reconciliation difference to the cent").
	payment.difference = roundCents(closing - expected)
}

// New function to handle closing amount updates with proper reactivity
function updateClosingAmount(payment, value) {
	payment.closing_amount = value
	payment._touched = true
	calculateDifference(payment)
}

//// select the field content on focus so a pre-filled 0 is typed over.
// Deferred to the next tick: on a mouse click the caret is placed on mouseup
// (after focus), which would clear a synchronous select() — the timeout runs
// after that, so the selection sticks for both click and keyboard focus.
function selectAmountField(event) {
	const el = event.target
	setTimeout(() => {
		try {
			el.select()
		} catch {
			// some inputs don't support select(); ignore
		}
	}, 0)
}

const canSubmit = computed(() => {
	if (!closingData.value || !closingData.value.payment_reconciliation)
		return false

	// Check if all closing amounts have been manually entered
	//// Neoffice — the "every method counted" test moved into allFilled so the withdrawal
	//// guard below can veto the close as well (5783eb27, 2026-03-28).
	const allFilled = closingData.value.payment_reconciliation.every(
		(payment) =>
			payment._touched &&
			payment.closing_amount !== null &&
			payment.closing_amount !== undefined &&
			payment.closing_amount !== "",
	)

	//// Neoffice — a cashier cannot take out more cash than was counted in the drawer;
	//// refusing here keeps the withdrawal Journal Entry from ever going negative (5783eb27).
	// Block if withdrawal exceeds cash
	if (withdrawalExceedsCash.value) return false

	return allFilled
})

async function submitClosing() {
	if (!closingData.value) return

	try {
		//// Neoffice — Biome pass: single to double quotes (458d81a9, 2026-03-20).
		errorMessage.value = "" // Clear any previous errors

		// Ensure all differences are calculated
		if (closingData.value.payment_reconciliation) {
			closingData.value.payment_reconciliation.forEach((payment) => {
				calculateDifference(payment)
			})
		}

		//// Neoffice — the withdrawal rides on the closing payload; the server creates the
		//// Journal Entry and stores the remaining balance for the next shift (5783eb27).
		// Inject cash withdrawal data
		const withdrawal = Number.parseFloat(cashWithdrawalAmount.value || 0)
		closingData.value.cash_withdrawal_amount = withdrawal
		closingData.value.cash_remaining_balance = cashRemainingBalance.value

		// Submit to server
		await submitResource.submit({ closing_shift: closingData.value })

		// If hideExpectedAmount is enabled, show success report before closing
		if (hideExpectedAmount.value) {
			showSuccessReport.value = true
			//// Neoffice — upstream auto-expanded the invoice list in the success report, which
			//// filled the screen after a busy shift. It stays collapsed; the cashier opens it on
			//// demand (ede9beb4, 2026-07-09 "collapsed invoices").
			// Invoice list stays collapsed in the report too — expand on demand.
		} else {
			// Normal mode: close immediately
			emit("shift-closed")
			closeDialog()
		}
	} catch (error) {
		console.error("Error submitting closing shift:", error)
		//// Neoffice — bare English literal upstream; wrapped in __() for the French till
		//// (7d2771d4, 2026-07-09).
		errorMessage.value = __(
			"Failed to close shift. Please verify all amounts and try again.",
		)
	}
}

function closeDialog() {
	// Emit shift-closed event if we're closing from success report
	if (showSuccessReport.value) {
		emit("shift-closed")
	}

	open.value = false
	closingData.value = null
	showInvoiceDetails.value = false
	showSuccessReport.value = false // Reset report view
	//// Neoffice — Biome quote pass (458d81a9); the reset below clears the withdrawal field
	//// so a re-opened dialog never carries the previous amount (5783eb27, 2026-03-28).
	errorMessage.value = "" // Clear error messages
	cashWithdrawalAmount.value = 0
}

// UI State Computed Properties
//// Neoffice — Biome reflow of the arrow body, no behaviour change (458d81a9).
const shouldShowSummary = computed(
	() => !hideExpectedAmount.value || showSuccessReport.value,
)

//// Neoffice — Biome reflow of the arrow body, no behaviour change (458d81a9).
const isInEntryMode = computed(
	() => hideExpectedAmount.value && !showSuccessReport.value,
)

//// Neoffice — the three hints below were bare English literals, so the French till gave
//// English guidance while counting. Wrapped in __() and translated in fr.po (7d2771d4,
//// 2026-07-09 "compact shift-closing dialog, auto-fill zero methods, i18n").
const reconciliationMessage = computed(() => {
	if (isInEntryMode.value) {
		return __("Enter the actual counted amounts for each payment method")
	}
	if (showSuccessReport.value && hideExpectedAmount.value) {
		//// Neoffice — same __() wrap as above (7d2771d4, 2026-07-09).
		return __("Shift closed successfully - Review the final reconciliation below")
	}
	return __("Count your cash and enter actual amounts below")
})

// Computed properties for real-time recalculation
const invoiceCount = computed(() => {
	if (!closingData.value) return 0
	const transactions = closingData.value.pos_transactions || []
	return transactions.length
})

// Check if there are any return invoices
const hasReturns = computed(() => {
	if (!closingData.value) return false
	return (closingData.value.returns_count || 0) > 0
})

// Count of sales invoices (non-returns)
const salesInvoiceCount = computed(() => {
	if (!closingData.value) return 0
	const transactions = closingData.value.pos_transactions || []
	//// Neoffice — Biome added the arrow parens; no behaviour change (458d81a9).
	return transactions.filter((t) => !t.is_return).length
})

const totalTax = computed(() => {
	if (!closingData.value || !closingData.value.taxes) return 0
	return closingData.value.taxes.reduce(
		(sum, tax) => sum + Number.parseFloat(tax.amount || 0),
		0,
	)
})

const grossSales = computed(() => {
	if (!closingData.value) return 0
	return closingData.value.sales_total ?? closingData.value.grand_total ?? 0
})
const getTotalExpected = computed(() => {
	if (!closingData.value || !closingData.value.payment_reconciliation) return 0
	return closingData.value.payment_reconciliation.reduce(
		(sum, payment) => sum + Number.parseFloat(payment.expected_amount || 0),
		0,
	)
})

const getTotalActual = computed(() => {
	if (!closingData.value || !closingData.value.payment_reconciliation) return 0
	return closingData.value.payment_reconciliation.reduce(
		(sum, payment) => sum + Number.parseFloat(payment.closing_amount || 0),
		0,
	)
})

const getTotalDifference = computed(() => {
	//// Neoffice — same cent snap as per method: a float residue used to show as a permanent
	//// red Net Variance that no count could clear (4ce4bed2, 2026-07-09).
	return roundCents(getTotalActual.value - getTotalExpected.value)
})

//// Neoffice ▼▼▼ — everything down to updateWithdrawalAmount serves the cash withdrawal:
//// what was actually counted (the reconciliation row of the profile's cash Mode of
//// Payment), what is left after the withdrawal — the amount proposed as the next shift's
//// opening balance — and the guard that refuses to take out more than was counted
//// (5783eb27, 2026-03-28 "cash withdrawal at shift closing with suggested opening
//// balance").
// Cash withdrawal computed properties
const cashClosingAmount = computed(() => {
	if (!closingData.value || !closingData.value.payment_reconciliation) return 0
	const cashMode = closingData.value.cash_mode_of_payment
	if (!cashMode) return 0
	const cashPayment = closingData.value.payment_reconciliation.find(
		(p) => p.mode_of_payment === cashMode,
	)
	return Number.parseFloat(cashPayment?.closing_amount || 0)
})

const cashRemainingBalance = computed(() => {
	const remaining =
		cashClosingAmount.value - Number.parseFloat(cashWithdrawalAmount.value || 0)
	return Math.max(0, remaining)
})

const withdrawalExceedsCash = computed(() => {
	return (
		Number.parseFloat(cashWithdrawalAmount.value || 0) >
			cashClosingAmount.value && cashClosingAmount.value > 0
	)
})

function updateWithdrawalAmount(value) {
	cashWithdrawalAmount.value = value
}

//// ▲▲▲ Neoffice — end of the cash-withdrawal helpers.
function getSalesForPayment(payment) {
	return (
		Number.parseFloat(payment.expected_amount || 0) -
		Number.parseFloat(payment.opening_amount || 0)
	)
}

//// Neoffice — Biome reflow only, no behaviour change (458d81a9, 2026-03-20).
function getShiftDuration() {
	if (!closingData.value || !closingData.value.period_start_date)
		return __("N/A")

	// Use the same timezone-safe approach as the header timer
	const { _initialElapsedMs, _receivedAt } = shiftState.value
	const diff = _initialElapsedMs + (Date.now() - (_receivedAt || Date.now()))
	if (diff < 0) return __("N/A")

	const days = Math.floor(diff / (1000 * 60 * 60 * 24))
	const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

	if (days > 0) {
		//// Neoffice — Biome reflow only, no behaviour change (458d81a9, 2026-03-20).
		const dayLabel = days === 1 ? __("Day") : __("Days")
		return __("{0} {1} {2}h {3}m", [days, dayLabel, hours, minutes])
	}
	if (hours > 0) {
		//// Neoffice — Biome reflow only, no behaviour change (458d81a9, 2026-03-20).
		return __("{0}h {1}m", [hours, minutes])
	}
	return __("{0}m", [minutes])
}

function getPaymentIcon(method) {
	const methodLower = method.toLowerCase()

	if (methodLower.includes("cash")) {
		return { icon: "💵", color: "bg-green-500" }
	} else if (
		methodLower.includes("card") ||
		methodLower.includes("credit") ||
		methodLower.includes("debit")
	) {
		return { icon: "💳", color: "bg-blue-500" }
	} else if (
		methodLower.includes("mobile") ||
		methodLower.includes("wallet") ||
		methodLower.includes("upi") ||
		methodLower.includes("phone")
	) {
		return { icon: "📱", color: "bg-purple-500" }
	} else if (methodLower.includes("bank") || methodLower.includes("transfer")) {
		return { icon: "🏦", color: "bg-indigo-500" }
	} else if (methodLower.includes("cheque") || methodLower.includes("check")) {
		return { icon: "📝", color: "bg-yellow-500" }
	} else {
		return { icon: "💰", color: "bg-gray-500" }
	}
}
</script>
