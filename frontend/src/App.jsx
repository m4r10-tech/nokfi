import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LangProvider } from './context/LangContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';

import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Recuperar from './pages/Recuperar';
import Reveal from './pages/Reveal';
import Pricing from './pages/Pricing';
import Landing from './pages/Landing';
import Home from './pages/Home';
import Cuestionario from './pages/Cuestionario';
import ExcelHub from './pages/ExcelHub';
import ExcelStockAlmacen from './pages/excel/ExcelStockAlmacen';
import ExcelSalidaVentas from './pages/excel/ExcelSalidaVentas';
import ExcelSalidaServicios from './pages/excel/ExcelSalidaServicios';
import ExcelEntradaProductos from './pages/excel/ExcelEntradaProductos';
import ExcelCaja from './pages/excel/ExcelCaja';
import ExcelTotal from './pages/excel/ExcelTotal';
import Historial from './pages/Historial';
import Calculadoras from './pages/Calculadoras';
import Informes from './pages/Informes';
import Configuracion from './pages/Configuracion';
import Privacidad from './pages/Privacidad';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/recuperar" element={<Recuperar />} />
            <Route path="/reveal" element={<Reveal />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/privacidad" element={<Privacidad />} />

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
              <Route path="historial" element={<Historial />} />
              <Route path="calculadoras" element={<Calculadoras />} />
              <Route path="informes" element={<Informes />} />
              <Route path="configuracion" element={<Configuracion />} />
            </Route>

            {/* 404 real (antes redirigía a /login = soft 404 para crawlers) */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
