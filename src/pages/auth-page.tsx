import { AxiosError } from 'axios';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '@services/auth';
import Logo from '../assets/logo.svg';

import type { SubmitEvent } from 'react';

export function AuthPage() {
  const navigate = useNavigate();
  const [loginKey, setLoginKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await authService.signIn({ loginKey });
      navigate('/chat', { replace: true });
    } catch (error: unknown) {
      if (!(error instanceof AxiosError)) {
        console.error(error);
        return;
      }

      setError('Clave de acceso inválida');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className='grid min-h-screen place-items-center bg-bg-chat px-4 py-8 text-text-primary'>
      <section className='w-full max-w-sm rounded-lg bg-bg-app p-6 shadow-lg'>
        <div className='mb-6 text-center'>
          <div className='mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent text-lg font-semibold text-white'>
            <img src={Logo} alt='Logo' className='h-full w-full rounded-full' />
          </div>
          <p className='mt-2 text-sm text-text-secondary'>Usa tu clave de acceso para chatear.</p>
        </div>

        <form className='space-y-4' onSubmit={handleSubmit}>
          <label className='block'>
            <span className='mb-2 block text-sm font-medium text-text-primary'>
              Clave de accesso
            </span>
            <input
              className='h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20'
              value={loginKey}
              onChange={(event) => setLoginKey(event.target.value)}
              placeholder='AABBCCDD'
              required
            />
          </label>

          {error ? <p className='text-sm text-red-500'>{error}</p> : null}

          <button
            className='h-11 w-full rounded-lg bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50 cursor-pointer'
            type='submit'
            disabled={submitting}
          >
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
