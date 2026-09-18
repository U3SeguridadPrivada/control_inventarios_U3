'use client';
import { use } from 'react';
import AdministrativoPerfil from '@/src/components/apps/AdministrativoPerfil';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdministrativoPerfil id={Number(id)} />;
}
