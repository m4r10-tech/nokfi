import ExcelSubModule from '../../components/ExcelSubModule';

export default function ExcelTotal() {
  return (
    <ExcelSubModule
      title="Total (Profit)"
      description="Sube los datos de ingresos y gastos para calcular el profit total tras impuestos."
      chartType="bar"
      promptBase="Eres un consultor financiero para pymes españolas. Analiza el balance de ingresos vs gastos vs impuestos para determinar el profit neto real y dónde se puede mejorar el margen."
    />
  );
}
