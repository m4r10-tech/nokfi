import ExcelSubModule from '../../components/ExcelSubModule';

export default function ExcelEntradaProductos() {
  return (
    <ExcelSubModule
      moduleId="entradas"
      chartType="bar"
      promptBase="Eres un consultor de compras y aprovisionamiento para pymes españolas. Analiza los pedidos/entradas de producto: volumen, frecuencia y coste por proveedor si está disponible."
    />
  );
}
