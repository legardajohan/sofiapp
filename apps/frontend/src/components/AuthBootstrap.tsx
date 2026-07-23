import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { fetchMe } from '../features/auth/api.js';
import { Loading } from './Loading.js';

export function AuthBootstrap(): React.ReactElement {
  const status = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);
  const setStatus = useAuthStore((s) => s.setStatus);

  useEffect(() => {
    if (status !== 'idle') return;
    setStatus('loading');
    fetchMe()
      .then((session) =>
        setUser({ sub: session.sub, rol: session.rol, subrol: session.subrol, nombre: session.nombre }),
      )
      .catch(() => setStatus('unauthenticated'));
  }, [status, setStatus, setUser]);

  if (status === 'idle' || status === 'loading') return <Loading />;
  return <Outlet />;
}
