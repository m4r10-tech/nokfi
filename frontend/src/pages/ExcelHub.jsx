import { Link } from 'react-router-dom';
import { Package, ShoppingCart, Wrench, TruckIcon, Wallet, PieChart, ArrowRight } from 'lucide-react';
import { useLang } from '../context/LangContext';
import PageHeader from '../components/PageHeader';

const MODULES = [
  { to: '/app/excel/excel-stock-almacen', icon: Package, id: 'stock' },
  { to: '/app/excel/excel-salida-ventas', icon: ShoppingCart, id: 'ventas' },
  { to: '/app/excel/excel-salida-servicios', icon: Wrench, id: 'servicios' },
  { to: '/app/excel/excel-entrada-productos', icon: TruckIcon, id: 'entradas' },
  { to: '/app/excel/excel-caja', icon: Wallet, id: 'caja' },
  { to: '/app/excel/excel-total', icon: PieChart, id: 'total' }
];

export default function ExcelHub() {
  const { t } = useLang();
  return (
    <div>
      <PageHeader title={t('excel.hubTitle')} description={t('excel.hubDesc')} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {MODULES.map(({ to, icon: Icon, id }, i) => (
          <Link key={to} to={to} className="group card card-interactive anim-enter p-4 md:p-5 flex sm:flex-col items-center sm:items-start gap-3.5 sm:gap-0"
            style={{ '--i': i }}>
            <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
              <Icon size={20} />
            </span>
            <div className="flex-1 min-w-0 sm:mt-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t(`excelModules.${id}.title`)}</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{t(`excelModules.${id}.desc`)}</p>
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
