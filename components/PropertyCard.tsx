'use client';

import { useMemo } from 'react';

export interface PropertyWithScore {
  id: string;
  title: string;
  price: number;
  surface_m2?: number;
  price_per_m2?: number;
  city?: string;
  postal_code?: string;
  property_type?: string;
  dpe_class?: string;
  source_url?: string;
  // Scores
  total_score?: number;
  discount_score?: number;
  yield_score?: number;
  zone_score?: number;
  other_score?: number;
  // Zone data
  zone_avg_price_per_m2?: number;
  zone_median_price_per_m2?: number;
  price_trend?: number;
  avg_rental_per_m2?: number;
  estimated_yield?: number;
}

export default function PropertyCard({ property }: { property: PropertyWithScore }) {
  const scoreColor = useMemo(() => {
    const score = property.total_score || 0;
    if (score >= 70) return 'bg-green-50 border-green-200';
    if (score >= 60) return 'bg-yellow-50 border-yellow-200';
    if (score >= 50) return 'bg-gray-50 border-gray-200';
    return 'bg-red-50 border-red-200';
  }, [property.total_score]);

  const scoreBadgeColor = useMemo(() => {
    const score = property.total_score || 0;
    if (score >= 70) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    if (score >= 50) return 'bg-gray-100 text-gray-800';
    return 'bg-red-100 text-red-800';
  }, [property.total_score]);

  const dpeColor: Record<string, string> = {
    'A': 'bg-green-100 text-green-800',
    'B': 'bg-green-50 text-green-700',
    'C': 'bg-yellow-100 text-yellow-800',
    'D': 'bg-orange-100 text-orange-800',
    'E': 'bg-red-100 text-red-800',
    'F': 'bg-red-200 text-red-900',
    'G': 'bg-red-300 text-red-900',
  };

  const discount = property.zone_median_price_per_m2 && property.price_per_m2
    ? (((property.zone_median_price_per_m2 - property.price_per_m2) / property.zone_median_price_per_m2) * 100).toFixed(1)
    : null;

  return (
    <div className={`rounded-lg border-2 p-4 shadow-sm transition-all hover:shadow-md ${scoreColor}`}>
      {/* Header: Title + Score */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex-1">
          <a
            href={property.source_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-semibold text-gray-900 hover:text-blue-600"
          >
            {property.title}
          </a>
          <p className="text-sm text-gray-600">
            {property.city} {property.postal_code && `(${property.postal_code})`}
          </p>
        </div>
        {property.total_score !== undefined && (
          <div className={`rounded-lg px-3 py-1 text-center font-bold ${scoreBadgeColor}`}>
            <div className="text-xl">{property.total_score.toFixed(1)}</div>
            <div className="text-xs">Score</div>
          </div>
        )}
      </div>

      {/* Price Info */}
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg bg-white/50 p-2 text-sm">
        <div>
          <div className="font-bold text-gray-900">€{(property.price / 1000).toFixed(0)}k</div>
          <div className="text-xs text-gray-600">Price</div>
        </div>
        <div>
          <div className="font-bold text-gray-900">
            {property.surface_m2 ? `${property.surface_m2}m²` : '–'}
          </div>
          <div className="text-xs text-gray-600">Size</div>
        </div>
        <div>
          <div className="font-bold text-gray-900">
            €{property.price_per_m2 ? property.price_per_m2.toFixed(0) : '–'}/m²
          </div>
          <div className="text-xs text-gray-600">Price/m²</div>
        </div>
      </div>

      {/* Zone Data */}
      {property.zone_avg_price_per_m2 && (
        <div className="mb-3 space-y-1 border-t border-gray-200 pt-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Zone Average:</span>
            <span className="font-semibold">€{property.zone_avg_price_per_m2.toFixed(0)}/m²</span>
          </div>
          {discount && (
            <div className="flex justify-between">
              <span className="text-gray-600">Discount:</span>
              <span className={`font-semibold ${parseFloat(discount) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {discount}%
              </span>
            </div>
          )}
          {property.price_trend !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-600">3-Year Trend:</span>
              <span className={`font-semibold ${property.price_trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {property.price_trend > 0 ? '+' : ''}{property.price_trend.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Scores Breakdown */}
      {property.total_score !== undefined && (
        <div className="mb-3 space-y-1 border-t border-gray-200 pt-2">
          <div className="text-xs font-semibold text-gray-600 uppercase">Score Breakdown</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {property.discount_score !== undefined && (
              <div className="flex justify-between rounded bg-white/60 px-2 py-1">
                <span>Discount:</span>
                <span className="font-bold">{property.discount_score.toFixed(0)}</span>
              </div>
            )}
            {property.yield_score !== undefined && (
              <div className="flex justify-between rounded bg-white/60 px-2 py-1">
                <span>Yield:</span>
                <span className="font-bold">{property.yield_score.toFixed(0)}</span>
              </div>
            )}
            {property.zone_score !== undefined && (
              <div className="flex justify-between rounded bg-white/60 px-2 py-1">
                <span>Zone:</span>
                <span className="font-bold">{property.zone_score.toFixed(0)}</span>
              </div>
            )}
            {property.other_score !== undefined && (
              <div className="flex justify-between rounded bg-white/60 px-2 py-1">
                <span>Quality:</span>
                <span className="font-bold">{property.other_score.toFixed(0)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rental Yield */}
      {property.avg_rental_per_m2 && (
        <div className="mb-3 border-t border-gray-200 pt-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Est. Rental Yield:</span>
            <span className="font-semibold text-blue-600">{property.estimated_yield?.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        {property.property_type && (
          <span className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
            {property.property_type}
          </span>
        )}
        {property.dpe_class && (
          <span className={`rounded px-2 py-1 text-xs font-semibold ${dpeColor[property.dpe_class] || 'bg-gray-100'}`}>
            DPE {property.dpe_class}
          </span>
        )}
      </div>
    </div>
  );
}
