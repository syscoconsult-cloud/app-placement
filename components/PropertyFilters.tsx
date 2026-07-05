'use client';

import { useState } from 'react';

export interface FilterOptions {
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minScore?: number;
  propertyType?: string;
  minRentalYield?: number;
}

interface PropertyFiltersProps {
  onFilterChange: (filters: FilterOptions) => void;
  cities: string[];
}

export default function PropertyFilters({ onFilterChange, cities }: PropertyFiltersProps) {
  const [filters, setFilters] = useState<FilterOptions>({});

  const handleChange = (key: keyof FilterOptions, value: any) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 font-semibold text-gray-900">Filters</h3>

      <div className="space-y-4">
        {/* City */}
        <div>
          <label className="block text-sm font-medium text-gray-700">City</label>
          <select
            value={filters.city || ''}
            onChange={(e) => handleChange('city', e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">All cities</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>

        {/* Price Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Price Range (€)</label>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              placeholder="Min"
              value={filters.minPrice || ''}
              onChange={(e) => handleChange('minPrice', e.target.value ? parseInt(e.target.value) : undefined)}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              type="number"
              placeholder="Max"
              value={filters.maxPrice || ''}
              onChange={(e) => handleChange('maxPrice', e.target.value ? parseInt(e.target.value) : undefined)}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Deal Score */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Min Deal Score: {filters.minScore || '0'}
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={filters.minScore || 0}
            onChange={(e) => handleChange('minScore', parseInt(e.target.value) || undefined)}
            className="mt-1 w-full"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>Poor (0)</span>
            <span>Excellent (100)</span>
          </div>
        </div>

        {/* Property Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Property Type</label>
          <select
            value={filters.propertyType || ''}
            onChange={(e) => handleChange('propertyType', e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">All types</option>
            <option value="apartment">Apartment</option>
            <option value="house">House</option>
            <option value="land">Land</option>
          </select>
        </div>

        {/* Rental Yield */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Min Rental Yield: {filters.minRentalYield || '0'}%
          </label>
          <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={filters.minRentalYield || 0}
            onChange={(e) => handleChange('minRentalYield', parseFloat(e.target.value) || undefined)}
            className="mt-1 w-full"
          />
        </div>

        {/* Reset Button */}
        {Object.keys(filters).length > 0 && (
          <button
            onClick={() => {
              setFilters({});
              onFilterChange({});
            }}
            className="w-full rounded bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
          >
            Reset Filters
          </button>
        )}
      </div>
    </div>
  );
}
