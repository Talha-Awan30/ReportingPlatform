/**
 * What changed between two revisions, grouped by form section.
 * `changes` is the list the revisions API returns: [{ group, field, old, new }].
 */
export default function RevisionChanges({ changes, emptyText = 'No answers changed.' }) {
  if (!changes?.length) return <p className="cell-sub">{emptyText}</p>

  const groups = []
  for (const change of changes) {
    let group = groups.find((g) => g.name === change.group)
    if (!group) {
      group = { name: change.group, rows: [] }
      groups.push(group)
    }
    group.rows.push(change)
  }

  return (
    <div className="table-container">
      <table className="admin-table revision-changes">
        <thead>
          <tr>
            <th>Field</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => [
            <tr key={`g-${group.name}`} className="revision-group">
              <td colSpan={3}>{group.name}</td>
            </tr>,
            ...group.rows.map((row, i) => (
              <tr key={`${group.name}-${row.field}-${i}`}>
                <td>{row.field}</td>
                <td className="revision-old">{row.old}</td>
                <td className="revision-new">{row.new}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  )
}
