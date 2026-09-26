import { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LangProvider } from './context/LangContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import UpdatePrompt from './components/UpdatePrompt';
import lazyWithReload from './utils/lazyWithReload';

// La home pública y el login van en el bundle inicial (primera visita).
import Landing from './pages/Landing';
import Login from './pages/Login';

// C7 (sesión 4): el resto se carga por partes. La landing ya no arrastra
// xlsx, pdfjs, recharts ni jspdf.
const lazy = lazyWithReload;
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Recuperar = lazy(() => import('./pages/Recuperar'));
const Reveal = lazy(() => import('./pages/Reveal'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Privacidad = lazy(() => import('./pages/Privacidad'));
const ApiDocs = lazy(() => import('./pages/ApiDocs'));
const NotFound = lazy(() => import('./pages/NotFound'));
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'));
const Home = lazy(() => import('./pages/Home'));
const Cuestionario = lazy(() => import('./pages/Cuestionario'));
const ExcelHub = lazy(() => import('./pages/ExcelHub'));
const ExcelStockAlmacen = lazy(() => import('./pages/excel/ExcelStockAlmacen'));
const ExcelSalidaVentas = lazy(() => import('./pages/excel/ExcelSalidaVentas'));
const ExcelSalidaServicios = lazy(() => import('./pages/excel/ExcelSalidaServicios'));
const ExcelEntradaProductos = lazy(() => import('./pages/excel/ExcelEntradaProductos'));
const ExcelCaja = lazy(() => import('./pages/excel/ExcelCaja'));
const ExcelTotal = lazy(() => import('./pages/excel/ExcelTotal'));
const FolderAnalysis = lazy(() => import('./pages/FolderAnalysis'));
const Historial = lazy(() => import('./pages/Historial'));
const HistorialDetalle = lazy(() => import('./pages/HistorialDetalle'));
const Calculadoras = lazy(() => import('./pages/Calculadoras'));
const Configuracion = lazy(() => import('./pages/Configuracion'));
const Ayuda = lazy(() => import('./pages/Ayuda'));
const FinanceLayout = lazy(() => import('./pages/finance/FinanceLayout'));
const Ledger = lazy(() => import('./pages/finance/Ledger'));
const Taxes = lazy(() => import('./pages/finance/Taxes'));
const Receivables = lazy(() => import('./pages/finance/Receivables'));
const Leaks = lazy(() => import('./pages/finance/Leaks'));
const Forecast = lazy(() => import('./pages/finance/Forecast'));
const FiscalCalendar = lazy(() => import('./pages/finance/FiscalCalendar'));
const Benchmark = lazy(() => import('./pages/finance/Benchmark'));

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <ToastProvider>
        <AuthProvider>
          <ErrorBoundary>
          <UpdatePrompt />
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Sesión 3 (Tanda H): la home pública vive en /home; "/" redirige
                CONSERVANDO query y hash (Stripe vuelve a /?cancelled=true). */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="/home" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/recuperar" element={<Recuperar />} />
            <Route path="/reveal" element={<Reveal />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/privacidad" element={<Privacidad />} />
            <Route path="/api-docs" element={<ApiDocs />} />

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="home" element={<Home />} />
              <Route path="cuestionario" element={<Cuestionario />} />
              <Route path="excel" element={<ExcelHub />} />
              <Route path="excel/excel-stock-almacen" element={<ExcelStockAlmacen />} />
              <Route path="excel/excel-salida-ventas" element={<ExcelSalidaVentas />} />
              <Route path="excel/excel-salida-servicios" element={<ExcelSalidaServicios />} />
              <Route path="excel/excel-entrada-productos" element={<ExcelEntradaProductos />} />
              <Route path="excel/excel-caja" element={<ExcelCaja />} />
              <Route path="excel/excel-total" element={<ExcelTotal />} />
              <Route path="excel/carpeta" element={<FolderAnalysis />} />
              <Route path="finanzas" element={<FinanceLayout />}>
                <Route index element={<Navigate to="libro" replace />} />
                <Route path="libro" element={<Ledger />} />
                <Route path="impuestos" element={<Taxes />} />
                <Route path="cobros" element={<Receivables />} />
                <Route path="fugas" element={<Leaks />} />
                <Route path="prevision" element={<Forecast />} />
                <Route path="calendario" element={<FiscalCalendar />} />
                <Route path="sector" element={<Benchmark />} />
              </Route>
              <Route path="historial" element={<Historial />} />
              <Route path="historial/:id" element={<HistorialDetalle />} />
              <Route path="calculadoras" element={<Calculadoras />} />
              {/* Sesión 3: Informes se fusionó con Historial (eran la misma pantalla) */}
              <Route path="informes" element={<Navigate to="/app/historial" replace />} />
              <Route path="configuracion" element={<Configuracion />} />
              <Route path="ayuda" element={<Ayuda />} />
            </Route>

            {/* 404 real (antes redirigía a /login = soft 404 para crawlers) */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </AuthProvider>
        </ToastProvider>
      </LangProvider>
    </ThemeProvider>
  );
}

function RootRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`/home${search}${hash}`} replace />;
}

function RouteFallback() {
  return (
    <div className="min-h-[50vh] grid place-items-center" aria-busy="true">
      <span className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--accent)' }} />
    </div>
  );
}
