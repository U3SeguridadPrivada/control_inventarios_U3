import DocumentoProtocoloApp from '@/src/components/apps/DocumentoProtocoloApp';
import DocumentoReglamentoApp from '@/src/components/apps/DocumentoReglamentoApp';
import { db } from '@/src/db';
import { protocolos } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  const prot = db.select().from(protocolos).where(eq(protocolos.id, numId)).get();

  if (prot && (prot.categoria === 'Reglamento' || prot.titulo?.toLowerCase().includes('reglamento'))) {
    const ambito = (prot.contenido as any)?.ambito === 'guardias' ? 'guardias' : 'oficinas';
    return <DocumentoReglamentoApp ambitoInicial={ambito} />;
  }

  return <DocumentoProtocoloApp protocoloId={numId} />;
}
