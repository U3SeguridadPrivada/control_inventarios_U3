'use client';
import { use } from 'react';
import MachoteFichaTecnica from '@/src/components/machotes/MachoteFichaTecnica';

export default function GuardiaFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const guardiaId = Number(id);

  return (
    <div className="max-w-[1400px] mx-auto p-3 sm:p-6 space-y-6">
      <MachoteFichaTecnica
        initialGuardiaId={guardiaId}
        pageMode={true}
        volverUrl={`/guardias/${guardiaId}`}
      />
    </div>
  );
}
