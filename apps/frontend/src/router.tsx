import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage.js';
import { LoginView } from './features/auth/index.js';
import { RequireRole } from './components/RequireRole.js';
import { RequireAuth } from './components/RequireAuth.js';
import { AuthBootstrap } from './components/AuthBootstrap.js';
import { PublicOnly } from './components/PublicOnly.js';
import { Loading } from './components/Loading.js';
import { AppLayout } from './components/layout/AppLayout.js';

const ChannelConfigPage = lazy(() =>
  import('./features/channels/index.js').then((m) => ({ default: m.ChannelConfigPage })),
);

const KnowledgeBasePage = lazy(() =>
  import('./features/knowledge-base/index.js').then((m) => ({ default: m.KnowledgeBasePage })),
);

const KnowledgeFaqsPage = lazy(() =>
  import('./features/knowledge-base/index.js').then((m) => ({ default: m.KnowledgeFaqsPage })),
);

const TemplatesPage = lazy(() =>
  import('./features/whatsapp-templates/index.js').then((m) => ({ default: m.TemplatesPage })),
);

const AiContextPage = lazy(() =>
  import('./features/ai-context/index.js').then((m) => ({ default: m.AiContextPage })),
);

const AssistantConfigPage = lazy(() =>
  import('./features/ai-assistant/index.js').then((m) => ({ default: m.AssistantConfigPage })),
);
const HandoffSettingsPage = lazy(() =>
  import('./features/handoff/index.js').then((m) => ({ default: m.HandoffSettingsPage })),
);

const InboxPage = lazy(() =>
  import('./features/inbox/index.js').then((m) => ({ default: m.InboxPage })),
);

const LeadsPage = lazy(() =>
  import('./features/leads/index.js').then((m) => ({ default: m.LeadsPage })),
);

const TagsPage = lazy(() =>
  import('./features/tags/index.js').then((m) => ({ default: m.TagsPage })),
);

const EstadosPage = lazy(() =>
  import('./features/estados/index.js').then((m) => ({ default: m.EstadosPage })),
);

const FlowsPage = lazy(() =>
  import('./features/flows/index.js').then((m) => ({ default: m.FlowsPage })),
);

const FlowEditorPage = lazy(() =>
  import('./features/flows/index.js').then((m) => ({ default: m.FlowEditorPage })),
);

const AdminRoutes = lazy(() =>
  import('./routes/AdminRoutes.js').then((m) => ({ default: m.default })),
);

export const router = createBrowserRouter([
  {
    element: (
      <>
        <LoginView />
        <AuthBootstrap />
      </>
    ),
    children: [
      {
        path: '/login',
        element: (
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        ),
      },
      {
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          {
            path: '/settings/channels/whatsapp',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <ChannelConfigPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/settings/knowledge',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <KnowledgeBasePage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/settings/knowledge/faqs',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <KnowledgeFaqsPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/settings/templates',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <TemplatesPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/settings/knowledge/context',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <AiContextPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/settings/assistant',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <AssistantConfigPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/settings/assistant/handoff',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <HandoffSettingsPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/inbox',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <InboxPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/leads',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <LeadsPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/etapas',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <EstadosPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/etiquetas',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <TagsPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/flows',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <FlowsPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/flows/:id',
            element: (
              <RequireRole roles={['admin']}>
                <Suspense fallback={<Loading />}>
                  <FlowEditorPage />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: '/admin/*',
            element: (
              <Suspense fallback={<Loading />}>
                <AdminRoutes />
              </Suspense>
            ),
          },
          {
            path: '*',
            element: <div className="p-8 text-sm text-gray-500">Página no encontrada</div>,
          },
        ],
      },
    ],
  },
]);
