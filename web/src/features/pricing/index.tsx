/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import { ArrowRight, Layers3, Search, Sparkles, Store } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'

import {
  LoadingSkeleton,
  EmptyState,
  SearchBar,
  PricingTable,
  PricingSidebar,
  PricingToolbar,
  ModelCardGrid,
  ModelDetailsDrawer,
} from './components'
import { EXCLUDED_GROUPS, VIEW_MODES } from './constants'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'

export function Pricing() {
  const { t } = useTranslation()
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )

  const {
    models,
    vendors,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sortBy,
    vendorFilter,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    tagFilter,
    tokenUnit,
    viewMode,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    setVendorFilter,
    setGroupFilter,
    setQuotaTypeFilter,
    setEndpointTypeFilter,
    setTagFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    availableTags,
    clearFilters,
    clearSearch,
  } = useFilters(models || [])

  const handleModelClick = useCallback((modelName: string) => {
    setSelectedModelName(modelName)
  }, [])

  const selectedModel = useMemo(
    () =>
      selectedModelName
        ? (models || []).find(
            (model) => model.model_name === selectedModelName
          ) || null
        : null,
    [models, selectedModelName]
  )

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {}).filter(
        (g) => !EXCLUDED_GROUPS.includes(g)
      ),
    [usableGroup]
  )

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
  }, [clearFilters, clearSearch])

  const renderPricingContent = () => {
    if (filteredModels.length === 0) {
      return (
        <EmptyState
          searchQuery={searchInput}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
        />
      )
    }

    if (viewMode === VIEW_MODES.CARD) {
      return (
        <ModelCardGrid
          models={filteredModels}
          onModelClick={handleModelClick}
          priceRate={priceRate}
          usdExchangeRate={usdExchangeRate}
          tokenUnit={tokenUnit}
          showRechargePrice={showRechargePrice}
          selectedGroup={groupFilter}
        />
      )
    }

    return (
      <PricingTable
        models={filteredModels}
        priceRate={priceRate}
        usdExchangeRate={usdExchangeRate}
        tokenUnit={tokenUnit}
        showRechargePrice={showRechargePrice}
        selectedGroup={groupFilter}
        onModelClick={handleModelClick}
      />
    )
  }

  if (isLoading) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto w-full max-w-[1800px] px-3 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 xl:px-8'>
          <LoadingSkeleton viewMode={viewMode} />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='relative'>
        <PageTransition className='pricing-page-shell relative mx-auto w-full max-w-[1800px] px-3 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 xl:px-8'>
          <header className='pricing-hero relative mx-auto mb-5 overflow-hidden rounded-3xl border p-5 sm:mb-8 sm:p-8 lg:p-10'>
            <div className='pricing-hero-grid' aria-hidden='true' />
            <div className='pricing-hero-layout relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.64fr)] lg:items-stretch'>
              <div className='pricing-hero-copy flex min-w-0 flex-col justify-between'>
                <div>
                  <div className='text-primary mb-4 flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] uppercase'>
                    <span className='pricing-live-dot' />
                    {t('Live model catalog')}
                  </div>
                  <h1 className='pricing-hero-title text-3xl leading-[1.05] font-semibold tracking-[-0.05em] sm:text-5xl lg:text-6xl'>
                    {t('Model Square')}
                  </h1>
                  <p className='text-muted-foreground mt-3 max-w-xl text-sm leading-6'>
                    {t('Compare models, pricing, and endpoints in one place.')}
                  </p>
                </div>
                <SearchBar
                  value={searchInput}
                  onChange={setSearchInput}
                  onClear={clearSearch}
                  placeholder={t(
                    'Search model name, provider, endpoint, or tag...'
                  )}
                  className='pricing-search mt-6 max-w-2xl sm:mt-8'
                />
              </div>

              <div className='pricing-hero-console'>
                <div className='pricing-hero-radar' aria-hidden='true'>
                  <span className='pricing-hero-radar-ring pricing-hero-radar-ring-large' />
                  <span className='pricing-hero-radar-ring pricing-hero-radar-ring-medium' />
                  <span className='pricing-hero-radar-ring pricing-hero-radar-ring-small' />
                  <span className='pricing-hero-radar-core'>
                    <Sparkles className='size-4' />
                  </span>
                </div>
                <div className='pricing-hero-console-copy'>
                  <span className='text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase'>
                    {t('Catalog signal')}
                  </span>
                  <strong>{filteredModels.length}</strong>
                  <span className='text-muted-foreground text-xs'>
                    {t('models ready to compare')}
                  </span>
                </div>
                <div className='pricing-hero-console-metrics grid grid-cols-3 gap-2'>
                  <div className='pricing-hero-console-metric'>
                    <Store className='text-primary size-3.5' />
                    <span>{models?.length || 0}</span>
                    <small>{t('Models')}</small>
                  </div>
                  <div className='pricing-hero-console-metric'>
                    <Layers3 className='text-primary size-3.5' />
                    <span>{vendors?.length || 0}</span>
                    <small>{t('Providers')}</small>
                  </div>
                  <div className='pricing-hero-console-metric'>
                    <Search className='text-primary size-3.5' />
                    <span>{activeFilterCount}</span>
                    <small>{t('Filters')}</small>
                  </div>
                </div>
              </div>
            </div>
            <div className='border-border/60 relative mt-6 flex flex-wrap items-center gap-3 border-t pt-4'>
              <span className='text-muted-foreground text-xs'>
                {t('Choose a model, then test it in your own flow.')}
              </span>
              <Link
                to='/playground'
                className='text-primary inline-flex items-center gap-1 text-xs font-semibold transition-transform hover:translate-x-0.5 hover:underline'
              >
                {t('Open Playground')}
                <ArrowRight className='size-3.5' />
              </Link>
            </div>
          </header>

          <div className='grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]'>
            <PricingSidebar
              quotaTypeFilter={quotaTypeFilter}
              endpointTypeFilter={endpointTypeFilter}
              vendorFilter={vendorFilter}
              groupFilter={groupFilter}
              tagFilter={tagFilter}
              onQuotaTypeChange={setQuotaTypeFilter}
              onEndpointTypeChange={setEndpointTypeFilter}
              onVendorChange={setVendorFilter}
              onGroupChange={setGroupFilter}
              onTagChange={setTagFilter}
              vendors={vendors || []}
              groups={availableGroups}
              groupRatios={groupRatio}
              tags={availableTags}
              models={models || []}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
              className='hover-scrollbar sticky top-4 hidden max-h-[calc(100dvh-2rem)] self-start overflow-y-auto xl:block'
            />

            <main className='min-w-0 space-y-4'>
              <PricingToolbar
                filteredCount={filteredModels.length}
                totalCount={models?.length}
                sortBy={sortBy}
                onSortChange={setSortBy}
                tokenUnit={tokenUnit}
                onTokenUnitChange={setTokenUnit}
                showRechargePrice={showRechargePrice}
                onRechargePriceChange={setShowRechargePrice}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                quotaTypeFilter={quotaTypeFilter}
                endpointTypeFilter={endpointTypeFilter}
                vendorFilter={vendorFilter}
                groupFilter={groupFilter}
                tagFilter={tagFilter}
                onQuotaTypeChange={setQuotaTypeFilter}
                onEndpointTypeChange={setEndpointTypeFilter}
                onVendorChange={setVendorFilter}
                onGroupChange={setGroupFilter}
                onTagChange={setTagFilter}
                vendors={vendors || []}
                groups={availableGroups}
                groupRatios={groupRatio}
                tags={availableTags}
                models={models || []}
                hasActiveFilters={hasActiveFilters}
                activeFilterCount={activeFilterCount}
                onClearFilters={clearFilters}
              />

              {renderPricingContent()}
            </main>
          </div>

          {selectedModel && (
            <ModelDetailsDrawer
              open={Boolean(selectedModel)}
              onOpenChange={(open) => {
                if (!open) setSelectedModelName(null)
              }}
              model={selectedModel}
              groupRatio={groupRatio || {}}
              usableGroup={usableGroup || {}}
              endpointMap={
                (endpointMap as Record<
                  string,
                  { path?: string; method?: string }
                >) || {}
              }
              autoGroups={autoGroups || []}
              priceRate={priceRate ?? 1}
              usdExchangeRate={usdExchangeRate ?? 1}
              tokenUnit={tokenUnit}
              showRechargePrice={showRechargePrice}
            />
          )}
        </PageTransition>
      </div>
    </PublicLayout>
  )
}
