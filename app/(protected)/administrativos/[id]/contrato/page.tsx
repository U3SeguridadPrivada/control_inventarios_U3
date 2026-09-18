'use client';
import { use } from 'react';
import DocumentoReglamentoApp from '@/src/components/apps/DocumentoReglamentoApp';

export default function AdministrativoContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const adminId = Number(id);

  return (
    <div className="max-w-[1400px] mx-auto p-3 sm:p-6 space-y-6">
      <DocumentoReglamentoApp
        administrativoId={adminId}
        volverUrl={`/administrativos/${adminId}`}
      />
    </div>
  );
}
