'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { devLogin as apiDevLogin } from '@/lib/api/auth';
import { User } from '@/hooks/useAuth';
import { Zap } from 'lucide-react';

interface DevModeButtonProps {
  onLogin: (token: string, user: User) => void;
}

export function DevModeButton({ onLogin }: DevModeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDevLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiDevLogin();
      onLogin(response.token, response.user);
    } catch (err) {
      setError('Dev login failed. Make sure backend is running in development mode.');
      console.error('[DevModeButton] Login failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border-t pt-6">
      <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
        <Zap className="h-3 w-3" />
        <span>Development Mode</span>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleDevLogin}
        disabled={isLoading}
      >
        {isLoading ? 'Logging in...' : 'Quick Login (test@guardian.com)'}
      </Button>
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
