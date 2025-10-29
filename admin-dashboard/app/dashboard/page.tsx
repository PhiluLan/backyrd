// admin-dashboard/app/dashboard/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<{ users: number; spots: number; reviews: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userCount } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
      const { data: spotCount } = await supabase.from('spots').select('id', { count: 'exact', head: true });
      const { data: reviewCount } = await supabase.from('reviews').select('id', { count: 'exact', head: true });
      setStats({
        users: userCount?.length ?? 0,
        spots: spotCount?.length ?? 0,
        reviews: reviewCount?.length ?? 0,
      });
    })();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="flex justify-between mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace('/');
          }}
          className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
        >
          Logout
        </button>
      </div>

      {stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatBox label="Nutzer" value={stats.users} />
          <StatBox label="Spots" value={stats.spots} />
          <StatBox label="Reviews" value={stats.reviews} />
        </div>
      ) : (
        <p>Lade Daten…</p>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-neutral-900 p-6 rounded-xl text-center">
      <p className="text-gray-400">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}
