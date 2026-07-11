import ExcelSubModule from '../../components/ExcelSubModule';

export default function ExcelStockAlmacen() {
  return (
    <ExcelSubModule
      title="Stock / Almacén"
      description="Sube tu inventario actual para analizar existencias, mínimos de seguridad y rotación."
      chartType="bar"
      promptBase="Eres un consultor de gestión de inventario para pymes españolas. Analiza los datos de stock/almacén que se han subido: cantidades por producto, posibles excesos o roturas de stock, y rotación."
    />
  );
}
