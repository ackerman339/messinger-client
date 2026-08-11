import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUserContext } from '../context/user-context';
import Logo from '../assets/logo.svg';

import type { SubmitEvent } from 'react';

type AuthMode = 'login' | 'signup';

export function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn, signUp } = useUserContext();
  const [loginKey, setLoginKey] = useState('');
  const [username, setUsername] = useState('');
  const [createdLoginKey, setCreatedLoginKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const mode: AuthMode = useMemo(
    () => (location.pathname === '/signup' ? 'signup' : 'login'),
    [location.pathname],
  );

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setCreatedLoginKey('');
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await signIn({ loginKey });
        navigate('/chat', { replace: true });
        return;
      }

      const response = await signUp({ username });
      setCreatedLoginKey(response.loginKey);
    } catch (error: unknown) {
      console.log(error);
      setError(mode === 'login' ? 'Invalid login key' : 'Could not create user');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className='grid min-h-screen place-items-center bg-bg-chat px-4 py-8 text-text-primary'>
      <section className='w-full max-w-sm rounded-lg bg-bg-app p-6 shadow-lg'>
        <div className='mb-6 text-center'>
          <div className='mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent text-lg font-semibold text-white'>
            <img src={Logo} alt='App logo' className='h-full w-full rounded-full' />
          </div>
          <h1 className='text-2xl font-semibold'>{mode === 'login' ? 'Sign in' : 'Sign up'}</h1>
          <p className='mt-2 text-sm text-text-secondary'>
            {mode === 'login'
              ? 'Use your login key to enter the chat.'
              : 'Create a username and save your login key.'}
          </p>
        </div>

        <div className='mb-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium'>
          <Link
            className={[
              'rounded-md px-3 py-2 text-center transition',
              mode === 'login'
                ? 'bg-white text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
            to='/login'
          >
            Sign in
          </Link>
          <Link
            className={[
              'rounded-md px-3 py-2 text-center transition',
              mode === 'signup'
                ? 'bg-white text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
            to='/signup'
          >
            Sign up
          </Link>
        </div>

        <form className='space-y-4' onSubmit={handleSubmit}>
          {mode === 'login' ? (
            <label className='block'>
              <span className='mb-2 block text-sm font-medium text-text-primary'>Login key</span>
              <input
                className='h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20'
                value={loginKey}
                onChange={(event) => setLoginKey(event.target.value)}
                placeholder='Paste your login key'
                required
              />
            </label>
          ) : (
            <label className='block'>
              <span className='mb-2 block text-sm font-medium text-text-primary'>Username</span>
              <input
                className='h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20'
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder='Choose a username'
                required
              />
            </label>
          )}

          {createdLoginKey ? (
            <div className='rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm'>
              <p className='font-medium text-text-primary'>Your login key</p>
              <p className='mt-1 break-all font-mono text-accent'>{createdLoginKey}</p>
            </div>
          ) : null}

          {error ? <p className='text-sm text-red-500'>{error}</p> : null}

          <button
            className='h-11 w-full rounded-lg bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50 cursor-pointer'
            type='submit'
            disabled={submitting}
          >
            {submitting
              ? mode === 'login'
                ? 'Signing in...'
                : 'Creating account...'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>
      </section>
    </main>
  );
}
