import { Field, Pill } from './ui'

/**
 * Renders one field straight from a module manifest entry.
 *
 * Manifest fields are shaped `{ key, label, kind, options_key, required, ... }`
 * and their answers are stored as `{ value, remarks }`, so the same component
 * serves the title page, the particulars table and the conclusion block.
 */
export function DynamicField({ field, value = {}, options = [], editable = true, error, onChange }) {
  const set = (patch) => onChange?.(field.key, patch)
  const current = value.value ?? field.default ?? ''

  if (!editable) {
    const selected = options.find((o) => o.value === current)
    return (
      <Field label={field.label}>
        <div className="v">
          {field.kind === 'dropdown' && selected ? (
            <Pill tone={selected.severity === 'neutral' ? 'neutral' : selected.severity}>
              {selected.label}
            </Pill>
          ) : (
            String(current || '') || <span className="muted">—</span>
          )}
        </div>
      </Field>
    )
  }

  const common = {
    value: current,
    onChange: (e) => set({ value: e.target.value }),
  }

  let control
  switch (field.kind) {
    case 'dropdown':
      control = (
        <select {...common}>
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
      break
    case 'textarea':
      control = <textarea rows={4} {...common} />
      break
    case 'number':
      control = <input type="number" {...common} />
      break
    case 'date':
      control = <input type="date" {...common} />
      break
    case 'checkbox':
      control = (
        <input
          type="checkbox"
          checked={Boolean(value.value)}
          onChange={(e) => set({ value: e.target.checked })}
        />
      )
      break
    default:
      control = <input type="text" {...common} />
  }

  return (
    <Field
      label={field.label}
      required={field.required}
      hint={field.help_text}
      error={error}
      span={field.kind === 'textarea'}
    >
      {control}
    </Field>
  )
}

/** A grid of manifest-driven fields. */
export function DynamicFieldGrid({
  fields = [],
  values = {},
  options = {},
  editable = true,
  missingKeys,
  onChange,
}) {
  if (!fields.length) return null
  return (
    <div className="field-grid">
      {fields.map((field) => (
        <DynamicField
          key={field.key}
          field={field}
          value={values[field.key] || {}}
          options={options[field.options_key]?.options || []}
          editable={editable}
          error={missingKeys?.has(field.key) ? 'Required' : undefined}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

/**
 * Applies a manifest's `default` values to a blank answer set, so a form opens
 * with the standard wording already filled in.
 */
export function seedDefaults(fields = [], existing = {}) {
  const out = { ...existing }
  fields.forEach((field) => {
    if (out[field.key] === undefined && field.default != null) {
      out[field.key] = { value: field.default }
    }
  })
  return out
}
