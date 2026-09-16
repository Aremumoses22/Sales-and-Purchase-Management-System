'use client';

import { redirect } from 'next/navigation';
import { useCan } from '@/lib/session';

export default function SettingsIndexPage() {
  const can = useCan();
  redirect(can('settings:view') ? '/settings/organization' : '/settings/profile');
}
