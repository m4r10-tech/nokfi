import { Link } from 'react-router-dom';
import { Package, ShoppingCart, Wrench, TruckIcon, Wallet, PieChart } from 'lucide-react';

const MODULES = [
  { to: '/app/excel/excel-stock-almacen', icon: Package, title: 'Stock / Almacén', desc: 'Inventario actual del almacén' },
  { to: '/app/excel/excel-salida-ventas', icon: ShoppingCart, title: 'Salida — Ventas', desc: 'Almacén destinado a ventas' },
  { to: '/app/excel/excel-salida-servicios', icon: Wrench, title: 'Salida — Servicios', desc: 'Almacén destinado a servicios' },
  { to: '/app/excel/excel-entrada-productos', icon: TruckIcon, title: 'Entrada de productos', desc: 'Pedidos realizados' },
  { to: '/app/excel/excel-caja', icon: Wallet, title: 'Caja', desc: 'Dinero en caja y cambio' },
  { to: '/app/excel/excel-total', icon: PieChart, title: 'Total (Profit)', desc: 'Profit total tras impuestos y gastos' }
];

export default function ExcelHub() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Análisis Excel</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Elige el tipo de datos que quieres analizar</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} to={to} className="rounded-xl p-5 transition-colors"
            style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
            <Icon size={22} style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-medium mt-3" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
