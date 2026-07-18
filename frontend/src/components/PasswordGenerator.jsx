import { useState } from 'react';
import { Wand2, Check } from 'lucide-react';

/**
 * Botón "Generador de contraseñas" que crea una contraseña fuerte con
 * crypto.getRandomValues (16 caracteres, mezcla de clases garantizada) y la
 * rellena vía `onGenerate(password)`. Reutilizable en activar y cambiar
 * contraseña — NO se incluye en el reset por email (sección C4=b del plan).
 *
 * El callback recibe la contraseña en texto plano; quien lo usa decide
 * rellenar solo el campo password o también el de confirmación.
 */
const LENGTH = 16;
const CLASSES = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%^&*-_=+'];

function generateStrongPassword() {
  const out = [];
  // Al menos uno de cada clase, posición aleatoria
  for (const set of CLASSES) {
    out.push(set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length]);
  }
  // Rellenar el resto mezclando todas las clases
  const all = CLASSES.join('');
  const buf = crypto.getRandomValues(new Uint32Array(LENGTH - CLASSES.length));
  for (let i = 0; i < buf.length; i++) out.push(all[buf[i] % all.length]);
  // Mezclar (Fisher-Yates con bytes criptográficos)
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

export default function PasswordGenerator({ onGenerate, label = 'Generar contraseña' }) {
  const [justGenerated, setJustGenerated] = useState(false);

  const handleClick = () => {
    const pwd = generateStrongPassword();
    onGenerate(pwd);
    setJustGenerated(true);
    setTimeout(() => setJustGenerated(false), 1500);
  };

  return (
    <button type="button" onClick={handleClick}
      className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors"
      style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '0.5px solid var(--border-strong)' }}>
      {justGenerated ? <Check size={15} style={{ color: 'var(--positive)' }} /> : <Wand2 size={15} />}
      {label}
    </button>
  );
}
