'use client';

export interface DashboardStatsData {
  totalProperties: number;
  averagePrice: number;
  averageScore: number;
  excellentDeals: number; // score >= 70
  avgPricePerM2: number;
  avgRentalYield: number;
}

interface DashboardStatsProps {
  data: DashboardStatsData;
  loading?: boolean;
}

export default function DashboardStats({ data, loading }: DashboardStatsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg bg-gray-200 px-4 py-3 h-16" />
        ))}
      </div>
    );
  }

  const stats = [
    {
      label: 'Total Properties',
      value: data.totalProperties,
      icon: '🏠',
      color: 'bg-blue-50 border-blue-200',
    },
    {
      label: 'Avg Price',
      value: `€${(data.averagePrice / 1000).toFixed(0)}k`,
      icon: '💰',
      color: 'bg-green-50 border-green-200',
    },
    {
      label: 'Avg Score',
      value: data.averageScore.toFixed(1),
      icon: '📊',
      color: 'bg-yellow-50 border-yellow-200',
    },
    {
      label: 'Excellent Deals',
      value: data.excellentDeals,
      icon: '⭐',
      color: 'bg-purple-50 border-purple-200',
    },
    {
      label: 'Avg Price/m²',
      value: `€${data.avgPricePerM2.toFixed(0)}`,
      icon: '📐',
      color: 'bg-orange-50 border-orange-200',
    },
    {
      label: 'Avg Rental Yield',
      value: `${data.avgRentalYield.toFixed(2)}%`,
      icon: '🏘️',
      color: 'bg-red-50 border-red-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className={`rounded-lg border-2 px-4 py-3 ${stat.color}`}>
          <div className="text-2xl mb-1">{stat.icon}</div>
          <div className="text-xs font-semibold text-gray-600">{stat.label}</div>
          <div className="text-xl font-bold text-gray-900">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}
