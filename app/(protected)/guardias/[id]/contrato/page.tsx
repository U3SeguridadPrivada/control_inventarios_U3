'use client';
import { use } from 'react';
import DocumentoReglamentoApp from '@/src/components/apps/DocumentoReglamentoApp';

export default function GuardiaContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const guardiaId = Number(id);

  return (
    <div className="max-w-[1400px] mx-auto p-3 sm:p-6 space-y-6">
      <DocumentoReglamentoApp
        guardiaId={guardiaId}
        volverUrl={`/guardias/${guardiaId}`}
      />
    </div>
  );
}
