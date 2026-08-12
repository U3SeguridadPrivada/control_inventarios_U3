import DocumentoProtocoloApp from '@/src/components/apps/DocumentoProtocoloApp';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentoProtocoloApp protocoloId={Number(id)} />;
}
