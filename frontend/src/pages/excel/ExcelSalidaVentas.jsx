import ExcelSubModule from '../../components/ExcelSubModule';

export default function ExcelSalidaVentas() {
  return (
    <ExcelSubModule
      title="Salida — Ventas"
      description="Sube los datos de productos destinados a ventas para analizar qué se vende más y menos."
      chartType="bar"
      promptBase="Eres un consultor de ventas para pymes españolas. Analiza qué productos han salido del almacén destinados a ventas: identifica los más y menos vendidos, tendencias y oportunidades."
    />
  );
}
