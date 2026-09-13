import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { ConciliacaoBancaria } from './features/conciliacao-bancaria/ConciliacaoBancaria';
import { SitefPage } from './features/sitef/SitefPage';
import { UsersPage } from './features/admin/UsersPage';
import { RolesPage } from './features/admin/RolesPage';
import { MenuConfigPage } from './features/admin/MenuConfigPage';
import { TaxasPage }       from './features/taxas/TaxasPage';
import { ContratoPage }    from './features/taxas/ContratoPage';
import { AdquirentePage }  from './features/adquirente/AdquirentePage';
import { GetnetSandboxPage } from './features/adquirente/GetnetSandboxPage';
import { OfxPadroesPage }  from './features/ofx-padroes/OfxPadroesPage';
import { ConcOFXPage }     from './features/conc-ofx/ConcOFXPage';
import { EmpresaConfigPage } from './features/admin/EmpresaConfigPage';
import { SftpConfigPage } from './features/admin/SftpConfigPage';
import { DashboardPage } from './features/dashboard/DashboardPage';

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/conciliacao-bancaria', element: <ConciliacaoBancaria /> },
          { path: '/sitef', element: <SitefPage /> },
          { path: '/taxas', element: <TaxasPage /> },
          { path: '/taxas/:id', element: <ContratoPage /> },
          { path: '/adquirente', element: <AdquirentePage /> },
          { path: '/adquirente/sandbox-getnet', element: <GetnetSandboxPage /> },
          { path: '/ofx-padroes', element: <OfxPadroesPage /> },
          { path: '/conc-ofx',   element: <ConcOFXPage /> },
          {
            element: <ProtectedRoute requireAdmin />,
            children: [
              { path: '/admin/empresa',  element: <EmpresaConfigPage /> },
              { path: '/admin/sftp',     element: <SftpConfigPage /> },
              { path: '/admin/usuarios', element: <UsersPage /> },
              { path: '/admin/papeis',   element: <RolesPage /> },
              { path: '/admin/menu',     element: <MenuConfigPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
