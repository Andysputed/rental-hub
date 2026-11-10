import React, { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Home, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../services/api';

export const PasswordResetPage: React.FC = () => {
  const location = useLocation();
  const [params] = useSearchParams();
  const uid = params.get('uid') || '';
  const token = params.get('token') || '';
  const confirmMode = location.pathname.endsWith('/confirm');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = confirmMode
        ? await apiFetch('/auth/password-reset/confirm/', {
            method: 'POST',
            body: JSON.stringify({ uid, token, newPassword: password }),
          })
        : await apiFetch('/auth/password-reset/', {
            method: 'POST',
            body: JSON.stringify({ email }),
          });
      const data = await response.json();
      if (!response.ok) {
        const first = Object.values(data as Record<string, unknown>)[0];
        const detail = Array.isArray(first) ? first[0] : first;
        throw new Error(typeof detail === 'string' ? detail : 'Could not complete the request.');
      }
      setMessage(confirmMode ? 'Your password has been updated. You can sign in now.' : data.detail);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the request.');
    } finally {
      setBusy(false);
    }
  };

  const invalidLink = confirmMode && (!uid || !token);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-brand-700 flex items-center justify-center mx-auto shadow-md">
            <Home size={24} strokeWidth={2.2} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">RentalHub</h1>
        </div>
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {confirmMode ? 'Choose a new password' : 'Reset your password'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {confirmMode ? 'Use at least 12 characters.' : 'If your account is eligible, we will email you a one-time reset link.'}
            </p>
          </div>
          {error && <div role="alert" className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700"><AlertCircle size={15} />{error}</div>}
          {message && <div role="status" className="flex gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800"><CheckCircle2 size={15} />{message}</div>}
          {invalidLink ? <p role="alert" className="text-sm text-red-700">This reset link is incomplete or invalid.</p> : (
            <form onSubmit={submit} className="space-y-4">
              {confirmMode ? <>
                <label className="block text-xs font-semibold text-gray-700">New password
                  <input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm" />
                </label>
                <label className="block text-xs font-semibold text-gray-700">Confirm new password
                  <input type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm" />
                </label>
              </> : <label className="block text-xs font-semibold text-gray-700">Account email
                <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm" />
              </label>}
              {confirmMode && password !== confirmPassword && confirmPassword && <p className="text-xs text-red-600">Passwords do not match.</p>}
              <button disabled={busy || (confirmMode && password !== confirmPassword)} className="w-full py-3 px-4 rounded-xl bg-brand-700 text-white font-semibold text-sm disabled:opacity-60">
                {busy ? 'Please wait…' : confirmMode ? 'Update password' : 'Send reset link'}
              </button>
            </form>
          )}
          <div className="text-center"><Link to="/login" className="text-xs font-semibold text-brand-700 hover:underline">Return to sign in</Link></div>
        </div>
      </div>
    </div>
  );
};
