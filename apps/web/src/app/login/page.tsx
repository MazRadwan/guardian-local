'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { login as apiLogin, AuthAPIError } from '@/lib/api/auth';
import { DevModeButton } from '@/components/auth/DevModeButton';
import { DNAHelixBackground } from '@/components/auth/DNAHelixBackground';
import {
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiLogin({ email, password });
      login(response.token, response.user);
      router.push('/chat');
    } catch (err) {
      if (err instanceof AuthAPIError) {
        if (err.statusCode === 401) {
          setError('Invalid email or password');
        } else if (err.statusCode === 400) {
          setError('Please enter valid credentials');
        } else {
          setError(err.message);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden font-['Atkinson_Hyperlegible']">
      {/* Base gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-sky-50/30 to-slate-50" />

      {/* DNA Helix canvas animation */}
      <DNAHelixBackground />

      {/* Content - sits above canvas */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-8">
        {/* Logo Section */}
        <div className="flex flex-col items-center">
          <div className="relative">
            {/* Pulse ring */}
            <div className="absolute inset-0 w-16 h-16 bg-sky-200 rounded-full animate-pulse-ring" />
            {/* Shield icon container with float animation */}
            <div className="relative w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center animate-float">
              <ShieldCheck className="h-8 w-8 text-sky-500" />
            </div>
          </div>
          <h1 className="mt-6 text-3xl font-bold text-slate-800">Guardian</h1>
          <p className="mt-2 text-sm text-slate-500">AI Governance & Risk Assessment</p>
        </div>

        {/* Card */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl shadow-slate-200/50 p-8">
          <h2 className="text-xl font-semibold text-slate-500 text-center mb-6">
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5" aria-label="Sign in form">
            {/* Error message */}
            {error && (
              <div
                className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm animate-fadeIn"
                role="alert"
              >
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {/* Email input with icon */}
            <div>
              <label htmlFor="email" className="sr-only">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className={`w-full pl-10 pr-4 py-3 bg-slate-50/50 border rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-sky-400 focus:ring-4 focus:ring-sky-50 focus:outline-none transition-colors disabled:opacity-50 ${
                    error ? 'border-red-300' : 'border-slate-200'
                  }`}
                />
              </div>
            </div>

            {/* Password input with icon and toggle */}
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className={`w-full pl-10 pr-12 py-3 bg-slate-50/50 border rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-sky-400 focus:ring-4 focus:ring-sky-50 focus:outline-none transition-colors disabled:opacity-50 ${
                    error ? 'border-red-300' : 'border-slate-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none focus:text-sky-500"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Forgot password link */}
            <div className="text-right">
              <Link
                href="#"
                className="text-sm text-sky-600 hover:text-sky-700 hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit button - soft muted style */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-sky-100 text-sky-700 font-medium rounded-xl hover:bg-sky-200 focus:outline-none focus:ring-4 focus:ring-sky-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign in</span>
              )}
            </button>

            {/* Create account link */}
            <p className="text-center text-sm text-slate-500">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-sky-600 hover:text-sky-700 hover:underline font-medium">
                Create an account
              </Link>
            </p>

            {/* Dev Mode Section */}
            {process.env.NEXT_PUBLIC_ENABLE_DEV_MODE === 'true' && (
              <DevModeButton onLogin={(token, user) => {
                login(token, user);
                router.push('/chat');
              }} />
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 space-x-4">
          <Link href="#" className="hover:text-slate-600 transition-colors">Privacy Policy</Link>
          <span>·</span>
          <Link href="#" className="hover:text-slate-600 transition-colors">Terms of Service</Link>
          <span>·</span>
          <Link href="#" className="hover:text-slate-600 transition-colors">Support</Link>
        </div>
        </div>
      </div>
    </div>
  );
}
