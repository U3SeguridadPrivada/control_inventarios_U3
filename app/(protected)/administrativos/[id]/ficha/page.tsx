'use client';
import { use } from 'react';
import MachoteFichaAdministrativo from '@/src/components/machotes/MachoteFichaAdministrativo';

export default function AdministrativoFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const adminId = Number(id);

  return (
    <div className="max-w-[1400px] mx-auto p-3 sm:p-6 space-y-6">
      <MachoteFichaAdministrativo
        initialAdministrativoId={adminId}
        pageMode={true}
        volverUrl={`/administrativos/${adminId}`}
      />
    </div>
  );
}
