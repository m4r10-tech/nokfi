import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LangProvider } from './context/LangContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';

import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Reveal from './pages/Reveal';
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

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/reveal" element={<Reveal />} />

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

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
