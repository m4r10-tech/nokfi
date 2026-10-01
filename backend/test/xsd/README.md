# XSD oficiales para los tests (sesión 11)

Solo se usan en `test/session11.tests.js` para validar el XML que genera Nokfi
con `xmllint`. No se cargan en producción.

| Carpeta | Origen |
|---|---|
| `ubl-2.5/` | OASIS UBL 2.5 CSD01, esquemas "runtime" (`xsdrt/maindoc` y `xsdrt/common`) — docs.oasis-open.org/ubl/csd01-UBL-2.5/ |
| `facturae-3.2.2/` | Facturae 3.2.2 — facturae.gob.es. El `import` de la firma apunta a una copia local del esquema xmldsig de la W3C (la que trae UBL) para validar sin red. |
| `facturx-1.09/` | Factur-X 1.09, perfil EN 16931 (FNFE-MPE / FeRD) |
