'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/stores/auth-store';

export default function ProfilePage() {
  const { user } = useAuthStore();
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>
      <section className="bg-white dark:bg-surface-900 rounded-xl border dark:border-surface-800 p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full gradient-brand flex items-center justify-center text-white text-2xl font-bold">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</div>
          <div><h2 className="text-lg font-semibold">{user?.name || 'User'}</h2><p className="text-surface-500 text-sm">{user?.email}</p></div>
        </div>
        <div className="space-y-4"><Input label="Display Name" defaultValue={user?.name || ''} /><Input label="Email" type="email" defaultValue={user?.email || ''} disabled /><Button>Update Profile</Button></div>
      </section>
      <section className="bg-white dark:bg-surface-900 rounded-xl border dark:border-surface-800 p-6">
        <h2 className="text-lg font-semibold mb-4">Security</h2>
        <div className="space-y-4"><Input label="Current Password" type="password" /><Input label="New Password" type="password" /><Input label="Confirm Password" type="password" /><Button>Change Password</Button></div>
      </section>
    </div>
  );
}
