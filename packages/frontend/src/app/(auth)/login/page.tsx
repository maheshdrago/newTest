'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/stores/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setIsLoading(true);
    try { await login(email, password); router.push('/projects'); }
    catch (err: any) { setError(err.message || 'Login failed'); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl gradient-brand mb-4 text-white font-bold">B</div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-surface-500 mt-1">Sign in to your BuildCraft account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-white dark:bg-surface-900 rounded-xl p-6 shadow-sm border dark:border-surface-800">
          {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{error}</div>}
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
          <Button type="submit" className="w-full" isLoading={isLoading}>Sign In</Button>
        </form>
        <p className="text-center text-sm text-surface-500 mt-4">No account? <Link href="/register" className="text-brand-600 hover:underline">Sign up</Link></p>
      </div>
    </div>
  );
}
