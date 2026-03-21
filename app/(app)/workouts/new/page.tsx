'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import WorkoutBuilder from '@/components/workouts/WorkoutBuilder';

function NewWorkoutContent() {
  const params = useSearchParams();
  const importParam = params.get('import');
  let initial = undefined;
  if (importParam) {
    try { initial = JSON.parse(decodeURIComponent(importParam)); } catch {}
  }
  return <WorkoutBuilder initial={initial} />;
}

export default function NewWorkoutPage() {
  return (
    <Suspense fallback={<div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading builder...</div>}>
      <NewWorkoutContent />
    </Suspense>
  );
}
