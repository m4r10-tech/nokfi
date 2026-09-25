import { Link } from 'react-router-dom';
import { Package, ShoppingCart, Wrench, TruckIcon, Wallet, PieChart, ArrowRight } from 'lucide-react';
import { useLang } from '../context/LangContext';
import PageHeader from '../components/PageHeader';

const MODULES = [
  { to: '/app/excel/excel-stock-almacen', icon: Package, title: 'Stock / Almacén', desc: 'Inventario actual del almacén' },
  { to: '/app/excel/excel-salida-ventas', icon: ShoppingCart, title: 'Salida — Ventas', desc: 'Almacén destinado a ventas' },
  { to: '/app/excel/excel-salida-servicios', icon: Wrench, title: 'Salida — Servicios', desc: 'Almacén destinado a servicios' },
  { to: '/app/excel/excel-entrada-productos', icon: TruckIcon, title: 'Entrada de productos', desc: 'Pedidos realizados' },
  { to: '/app/excel/excel-caja', icon: Wallet, title: 'Caja', desc: 'Dinero en caja y cambio' },
  { to: '/app/excel/excel-total', icon: PieChart, title: 'Total (Profit)', desc: 'Profit total tras impuestos y gastos' }
];

export default function ExcelHub() {
  const { t } = useLang();
  return (
    <div>
      <PageHeader title={t('excel.hubTitle')} description={t('excel.hubDesc')} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {MODULES.map(({ to, icon: Icon, title, desc }, i) => (
          <Link key={to} to={to} className="group card card-interactive anim-enter p-4 md:p-5 flex sm:flex-col items-center sm:items-start gap-3.5 sm:gap-0"
            style={{ '--i': i }}>
            <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
              <Icon size={20} />
            </span>
            <div className="flex-1 min-w-0 sm:mt-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
            </div>
            <ArrowRight size={16} className="shrink-0 sm:hidden" style={{ color: 'var(--text-muted)' }} />
            <span className="hidden sm:flex items-center gap-1 mt-4 text-xs font-medium opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
              style={{ color: 'var(--accent-text)' }}>
              {t('common.open')} <ArrowRight size={13} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
