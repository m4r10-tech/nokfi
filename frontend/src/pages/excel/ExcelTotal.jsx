import ExcelSubModule from '../../components/ExcelSubModule';

export default function ExcelTotal() {
  return (
    <ExcelSubModule
      moduleId="total"
      chartType="bar"
      promptBase="Eres un consultor financiero para pymes españolas. Analiza el balance de ingresos vs gastos vs impuestos para determinar el profit neto real y dónde se puede mejorar el margen."
    />
  );
}
