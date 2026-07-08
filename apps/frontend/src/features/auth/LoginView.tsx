import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import { SofiAppWelcomeLoader } from './components/SofiAppWelcomeLoader.js';

const WELCOME_DURATION_MS = 2200;

/**
 * Gate montado como hermano de AuthBootstrap en la raíz del router (no envuelve
 * LoginPage): LoginPage navega de inmediato en su onSuccess, así que un wrapper
 * en el subárbol de la ruta /login se desmontaría junto con ella sin ventana de
 * tiempo para mostrar el overlay. Aquí, fuera de ese subárbol, sobrevive a la
 * navegación y puede superponerse mientras el destino carga detrás.
 */
export function LoginView(): React.ReactElement | null {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  const prevStatusRef = useRef(status);
  const wasOnLoginRef = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (location.pathname === '/login') wasOnLoginRef.current = true;
  }, [location.pathname]);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prevStatus !== 'authenticated' && status === 'authenticated' && wasOnLoginRef.current) {
      wasOnLoginRef.current = false;
      setVisible(true);
    }
  }, [status]);

  if (!visible) return null;

  return <SofiAppWelcomeLoader durationMs={WELCOME_DURATION_MS} onComplete={() => setVisible(false)} />;
}
