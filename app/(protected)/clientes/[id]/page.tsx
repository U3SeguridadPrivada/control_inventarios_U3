'use client';
import { use } from 'react';
import ProspectoPerfil from '@/src/components/apps/ProspectoPerfil';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProspectoPerfil id={Number(id)} />;
}
