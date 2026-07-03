import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
<<<<<<< HEAD
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
=======
import { RouterProvider } from 'react-router-dom';
import { router } from './router.js';
>>>>>>> develop
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
<<<<<<< HEAD
    queries: { retry: 1, staleTime: 30_000 },
=======
    queries: { retry: 1, staleTime: 1000 * 60 },
>>>>>>> develop
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
<<<<<<< HEAD
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
=======
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
>>>>>>> develop
);
