/**
 * Datos del titular de Nokfi (LSSI-CE art. 10: identidad, NIF y domicilio
 * deben ser accesibles de forma permanente). Rellenar ANTES de vender.
 * Mientras estén vacíos, las páginas legales muestran solo el email.
 */
export const OWNER = {
  name: '',     // p. ej. «Nombre Apellido Apellido» (autónomo) o «Empresa S.L.»
  nif: '',      // NIF / CIF
  address: '',  // domicilio completo
  email: 'info@nokfi.app',
  support: 'soporte@nokfi.app'
};

/** Proveedor del servidor (VPS) donde vive la base de datos: subencargado del DPA. */
export const HOSTING = {
  name: '',      // p. ej. «Hetzner Online GmbH»
  location: ''   // p. ej. «Alemania (UE)»
};

export const ownerLine = (lang) => {
  const parts = [OWNER.name, OWNER.nif && `${lang === 'es' ? 'NIF' : 'Tax ID'} ${OWNER.nif}`, OWNER.address].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} · ${OWNER.email}` : `Nokfi (nokfi.app) · ${OWNER.email}`;
};
