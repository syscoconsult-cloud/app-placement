'use client';

import { useEffect, useMemo, useState } from 'react';
import PropertyCard from '@/components/PropertyCard';
import PropertyFilters from '@/components/PropertyFilters';
import DashboardStats from '@/components/DashboardStats';
import type { PropertyWithScore } from '@/components/PropertyCard';
import type { DashboardStatsData } from '@/components/DashboardStats';
import type { FilterOptions } from '@/components/PropertyFilters';

export default function DashboardPage() {
  const [properties, setProperties] = useState<PropertyWithScore[]>([]);
  const [stats, setStats] = useState<DashboardStatsData | null>(null);
  const [filters, setFilters] = useState<FilterOptions>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch properties and stats on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch properties
        const propsUrl = new URL('/api/properties', window.location.origin);
        if (filters.city) propsUrl.searchParams.set('city', filters.city);
        if (filters.minPrice) propsUrl.searchParams.set('minPrice', filters.minPrice.toString());
        if (filters.maxPrice) propsUrl.searchParams.set('maxPrice', filters.maxPrice.toString());
        if (filters.minScore) propsUrl.searchParams.set('minScore', filters.minScore.toString());
        if (filters.propertyType) propsUrl.searchParams.set('propertyType', filters.propertyType);
        if (filters.minRentalYield) propsUrl.searchParams.set('minYield', filters.minRentalYield.toString());

        const propsRes = await fetch(propsUrl.toString());
        if (!propsRes.ok) throw new Error('Failed to fetch properties');
        const propsData = await propsRes.json();
        setProperties(propsData.data || []);

        // Fetch stats
        const statsRes = await fetch('/api/stats');
        if (!statsRes.ok) throw new Error('Failed to fetch stats');
        const statsData = await statsRes.json();
        setStats(statsData);
      } catch (err) {
        console.error('Error loading data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [filters]);

  // Extract unique cities for filter dropdown
  const cities = useMemo(() => {
    const uniqueCities = new Set<string>();
    properties.forEach((p) => {
      if (p.city) uniqueCities.add(p.city);
    });
    return Array.from(uniqueCities).sort();
  }, [properties]);

  // Sort properties by score descending
  const sortedProperties = useMemo(() => {
    return [...properties].sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
  }, [properties]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              🏠 Real Estate Investment Dashboard
            </h1>
            <p className="mt-1 text-gray-600 dark:text-gray-300">
              AI-powered property deal analysis with official market data
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Row */}
        {stats && !loading && (
          <div className="mb-8">
            <DashboardStats data={stats} loading={loading} />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-8 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-red-700">
            <p className="font-semibold">Error loading data</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Content Grid */}
        <div className="grid gap-8 lg:grid-cols-4">
          {/* Sidebar: Filters */}
          <aside>
            <PropertyFilters cities={cities} onFilterChange={setFilters} />
          </aside>

          {/* Main Content: Properties */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="animate-pulse rounded-lg bg-gray-200 h-64" />
                ))}
              </div>
            ) : sortedProperties.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center">
                <div className="text-4xl mb-4">🔍</div>
                <p className="text-lg font-semibold text-gray-900">No properties found</p>
                <p className="mt-2 text-gray-600">
                  {properties.length === 0
                    ? 'Run npm run scrape-pap to import listings'
                    : 'Try adjusting your filters'}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-600">
                    Showing {sortedProperties.length} properties
                  </p>
                  <p className="text-xs text-gray-500">
                    Sorted by deal score (highest first)
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {sortedProperties.map((property) => (
                    <PropertyCard key={property.id} property={property} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 bg-white py-8 dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Data Sources</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>✅ DVF (Government)</li>
                <li>✅ PERVAL (Notaire)</li>
                <li>✅ INSEE (Demographics)</li>
                <li>✅ ANIL (Rental)</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Scoring Components</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>40% Discount vs Market</li>
                <li>25% Rental Yield</li>
                <li>20% Zone Dynamics</li>
                <li>15% Location Quality</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Next Steps</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>📊 Run npm run compute-scores</li>
                <li>🔄 Daily npm run scrape-pap</li>
                <li>📧 Phase 4: Alert system</li>
                <li>🗺️ Phase 5: Map view</li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
