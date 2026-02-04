import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';

export default function SignupPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) router.replace('/');
  }, [session, router]);

  async function handleSignup() {
    setError('');
    setMessage('');
    if (!email || !password) {
      setError('Completa correo y contraseña.');
      return;
    }
    setLoading(true);
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password
    });
    setLoading(false);
    if (signupError) {
      setError(signupError.message || 'No se pudo crear la cuenta.');
      return;
    }
    if (data?.session) {
      router.replace('/');
      return;
    }
    setMessage('Cuenta creada. Revisa tu correo para confirmar.');
  }

  return (
    <>
      <Head>
        <title>Divide — Crear cuenta</title>
        <meta name="description" content="Crea una cuenta en Divide" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <main className="auth-layout">
        <section className="card card-accent auth-card">
          <img className="auth-logo" src="/logo.svg" alt="Divide" />
          <h2>Crear cuenta</h2>
          <p className="section-desc">Crea tu cuenta para guardar tus viajes.</p>
          <div className="auth-form">
            <input
              type="email"
              placeholder="Correo"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Contraseña"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
            />
            <div className="auth-actions">
              <button type="button" className="btn btn-primary" onClick={handleSignup} disabled={loading}>
                Crear cuenta
              </button>
            </div>
          </div>
          <p className="auth-footer">
            ¿Ya tienes cuenta? <a href="/auth/login">Inicia sesión</a>
          </p>
          {error ? <p className="auth-message is-error">{error}</p> : null}
          {message ? <p className="auth-message">{message}</p> : null}
        </section>
      </main>
    </>
  );
}

export const getServerSideProps = async (ctx) => {
  const supabase = createPagesServerClient(ctx);
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (session) {
    return {
      redirect: {
        destination: '/',
        permanent: false
      }
    };
  }

  return {
    props: {}
  };
};
