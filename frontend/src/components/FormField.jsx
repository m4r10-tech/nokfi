import { forwardRef } from 'react';

/**
 * Campo de formulario con label visible, icono opcional, elemento a la
 * derecha (p.ej. mostrar contraseña) y estado de error (aria-invalid → borde
 * rojo, ver .input en index.css). `hint` va a la derecha del label (p.ej.
 * "¿La olvidaste?").
 */
const FormField = forwardRef(function FormField(
  { id, label, hint, icon: Icon, trailing, invalid, className = '', inputClassName = '', ...inputProps }, ref
) {
  return (
    <div className={className}>
      {(label || hint) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && <label htmlFor={id} className="field-label">{label}</label>}
          {hint}
        </div>
      )}
      <div className="relative">
        {Icon && <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />}
        <input ref={ref} id={id} aria-invalid={invalid || undefined}
          className={`input ${Icon ? '!pl-9' : ''} ${trailing ? '!pr-11' : ''} ${inputClassName}`} {...inputProps} />
        {trailing}
      </div>
    </div>
  );
});

export default FormField;
