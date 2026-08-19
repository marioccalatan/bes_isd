import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Info, Loader2, UserPlus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Input, Label, FieldError, Checkbox } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SignupDialog } from '@/components/auth/SignupDialog';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import loginBackground from '@/assets/brand/login-background.jpg';
import benecoLogo from '@/assets/brand/beneco-logo.png';

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string; form?: string }>({});
  const [signupOpen, setSignupOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [notice, setNotice] = useState('');

  if (isAuthenticated) return <Navigate to="/home" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!username.trim()) nextErrors.username = 'Username is required.';
    if (!password) nextErrors.password = 'Password is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    const result = await login(username, password, rememberMe);
    setLoading(false);
    if (result.ok) {
      navigate('/home', { replace: true });
    } else {
      setErrors({ form: result.error });
    }
  }

  return (
    <div className="fixed inset-0 overflow-y-auto">
      {/* Fixed photo background — only a light neutral scrim, no color tint,
          so the original photo colors show through. */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${loginBackground})` }} />
        <div className="absolute inset-0 bg-white/10" />
        <div className="absolute inset-0 bg-black/15" />
      </div>

      <div className="flex min-h-svh flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center">
              <img src={benecoLogo} alt="BENECO" className="h-full w-full object-contain drop-shadow-lg" />
            </div>
            <h1 className="login-title-bevel text-2xl font-bold">BENECO Enterprise System</h1>
            <p className="text-sm font-medium text-ondark drop-shadow-sm">BES — Centralized Employee Portal</p>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/8 p-6 shadow-2xl sm:p-8">
            <h2 className="mb-1 text-lg font-semibold text-white drop-shadow-sm">Sign in to your account</h2>
            <p className="mb-5 text-sm text-white/70">Use your BES credentials to continue.</p>

            {notice && <div className="mb-4 rounded-md border border-green-300/40 bg-green-500/20 px-3 py-2.5 text-sm text-green-100">{notice}</div>}

            {errors.form && (
              <div role="alert" className="mb-4 rounded-md border border-red-400/40 bg-red-500/20 px-3 py-2.5 text-sm text-[#fecaca]">
                {errors.form}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <Label htmlFor="username" required className="text-white/90">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  invalid={!!errors.username}
                  placeholder="e.g. admin"
                  aria-describedby={errors.username ? 'username-error' : undefined}
                  className="border-white/30 bg-white/85 text-onlight placeholder:text-slate-500 focus:bg-white"
                />
                {errors.username && <p id="username-error"><FieldError>{errors.username}</FieldError></p>}
              </div>

              <div>
                <Label htmlFor="password" required className="text-white/90">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    invalid={!!errors.password}
                    placeholder="Enter your password"
                    className="border-white/30 bg-white/85 pr-10 text-onlight placeholder:text-slate-500 focus:bg-white"
                    aria-describedby={errors.password ? 'password-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#334155]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p id="password-error"><FieldError>{errors.password}</FieldError></p>}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <Checkbox checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  Remember me
                </label>
                <button type="button" onClick={() => setForgotOpen(true)} className="text-sm font-medium text-[#86efac] hover:underline">
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#0f8b4c] to-[#22c55e] shadow-[0_14px_28px_-8px_rgba(15,139,76,0.55)] hover:from-[#0b6b3a] hover:to-[#16a34a]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="mt-4 rounded-lg border border-white/70 bg-white/90 px-4 py-3 text-center shadow-sm">
              <p className="text-xs font-medium text-[#334155]">New to BES?</p>
              <button
                type="button"
                onClick={() => setSignupOpen(true)}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0f8b4c] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b6b3a] focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:ring-offset-2 focus:ring-offset-white"
              >
                <UserPlus className="h-4 w-4" /> Create an account
              </button>
            </div>
          </div>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-ondark drop-shadow-sm">
            <Info className="h-3.5 w-3.5 shrink-0" />
            BENECO employee access portal
          </p>
        </div>
      </div>

      <SignupDialog open={signupOpen} onClose={() => setSignupOpen(false)} onCreated={(createdUsername) => { setUsername(createdUsername); setSignupOpen(false); setNotice('Account created. Sign in with your new credentials.'); }} />
      <ForgotPasswordDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </div>
  );
}
