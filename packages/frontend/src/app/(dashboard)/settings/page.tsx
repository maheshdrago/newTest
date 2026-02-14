'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/stores/auth-store';

export default function SettingsPage() {
  const { user } = useAuthStore();
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <section className="bg-white dark:bg-surface-900 rounded-xl border dark:border-surface-800 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">AI Configuration</h2>
        <div className="space-y-4">
          <Input label="OpenAI API Key" type="password" placeholder="sk-..." />
          <Input label="Anthropic API Key" type="password" placeholder="sk-ant-..." />
          <div className="space-y-1.5"><label className="block text-sm font-medium">Default Model</label><select className="w-full rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900 px-3 py-2 text-sm"><option value="gpt-4">GPT-4</option><option value="gpt-4-turbo">GPT-4 Turbo</option><option value="claude-3-opus">Claude 3 Opus</option><option value="claude-3-sonnet">Claude 3 Sonnet</option></select></div>
          <Button>Save Configuration</Button>
        </div>
      </section>
      <section className="bg-white dark:bg-surface-900 rounded-xl border dark:border-surface-800 p-6">
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">Subscription</h2><Badge variant="info">{user?.plan || 'free'} plan</Badge></div>
        <p className="text-surface-500 text-sm mb-4">Upgrade for more projects and AI requests.</p>
        <Button variant="outline">Upgrade Plan</Button>
      </section>
    </div>
  );
}
