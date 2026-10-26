import { SBU_OPTIONS, useSbuSubSectorMap } from '../hooks/useClientDirectory'
import { Select, TextInput } from './ui'

/**
 * Client name + SBU + a Sub Sector list that depends on the SBU.
 * Shared by "Request New Client" and the admin's client form.
 *
 * `value` is { name, sbu, sub_sector }; `onChange` receives the patched object.
 */
export default function ClientIdentityFields({ value, onChange, autoFocus = false }) {
  const map = useSbuSubSectorMap()
  const set = (patch) => onChange({ ...value, ...patch })

  // Keep the current sub sector selectable even if it is not in the derived map.
  const base = value.sbu ? map[value.sbu] || [] : []
  const subSectors =
    value.sub_sector && !base.includes(value.sub_sector) ? [...base, value.sub_sector].sort() : base

  return (
    <>
      <TextInput
        label="Client name"
        required
        span
        autoFocus={autoFocus}
        value={value.name || ''}
        onChange={(e) => set({ name: e.target.value })}
        placeholder="Company name as it should appear on reports"
      />
      <Select
        label="SBU"
        required
        placeholder="Select SBU…"
        value={value.sbu || ''}
        onChange={(e) => set({ sbu: e.target.value, sub_sector: '' })}
        options={SBU_OPTIONS.map((o) => ({ value: o, label: o }))}
      />
      <Select
        label="Sub sector"
        placeholder={value.sbu ? 'Select sub sector…' : 'Select an SBU first'}
        disabled={!value.sbu}
        value={value.sub_sector || ''}
        onChange={(e) => set({ sub_sector: e.target.value })}
        options={subSectors.map((o) => ({ value: o, label: o }))}
      />
    </>
  )
}
