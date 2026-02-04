import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';

export default function LoginPage() {
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

  async function handleLogin() {
    setError('');
    setMessage('');
    if (!email || !password) {
      setError('Completa correo y contraseña.');
      return;
    }
    setLoading(true);
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    setLoading(false);
    if (loginError) {
      setError(loginError.message || 'No se pudo iniciar sesión.');
      return;
    }
    router.replace('/');
  }

  return (
    <>
      <Head>
        <title>Divide — Iniciar sesión</title>
        <meta name="description" content="Inicia sesión en Divide" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <main className="auth-layout">
        <section className="card card-accent auth-card">
          <img className="auth-logo" src="/logo.svg" alt="Divide" />
          <h2>Bienvenido de nuevo</h2>
          <p className="section-desc">Inicia sesión para continuar con tus viajes.</p>
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <div className="auth-actions">
              <button type="button" className="btn btn-primary" onClick={handleLogin} disabled={loading}>
                Iniciar sesión
              </button>
            </div>
          </div>
          <p className="auth-footer">
            ¿No tienes cuenta? <a href="/auth/signup">Crear cuenta</a>
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
