'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [status, setStatus] = useState<string>('Initializing...');

  useEffect(() => {
    setStatus('Real Estate Sourcing App — Ready for development');
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full text-center">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
          🏠 Real Estate Sourcing
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
          Personal investment opportunity analyzer
        </p>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <p className="text-gray-700 dark:text-gray-300 mb-6">{status}</p>
          <div className="space-y-3">
            <div className="text-left">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
                📊 Current Phase
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                DVF Import Module (Phase 1)
              </p>
            </div>
            <div className="text-left">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
                🎯 Next Steps
              </h2>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>✓ Initialize project structure</li>
                <li>→ Set up Supabase schema</li>
                <li>→ Implement DVF import script</li>
                <li>→ Calculate zone statistics</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
