'use client';
import { use } from 'react';
import GuardiaPerfil from '@/src/components/apps/GuardiaPerfil';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <GuardiaPerfil id={Number(id)} />;
}
