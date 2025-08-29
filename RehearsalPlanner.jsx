
const RehearsalPlanner = ({ rehearsals = [], people = [], onAdd, onUpdate, onRemove }) => {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex justify-between mb-3">
        <h2 className="text-lg font-semibold">Repetities</h2>
        <button className="rounded-xl border px-3 py-2" onClick={onAdd}>+ Repetitie</button>
      </div>
      <table className="min-w-full border-separate border-spacing-y-2">
        <thead>
          <tr className="text-left text-sm text-gray-600">
            <th className="px-3">Datum</th>
            <th className="px-3">Locatie</th>
            <th className="px-3">Afwezig</th>
            <th className="px-3">Opmerkingen</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rehearsals.map((r) => {
            const past = r.date < today;
            return (
              <tr key={r.id} className={`rounded-xl ${past ? "bg-gray-100 text-gray-400" : "bg-gray-50"}`}>
                <td className="px-3 py-2"><input type="date" value={r.date} onChange={(e) => onUpdate(r.id, { date: e.target.value })} /></td>
                <td className="px-3 py-2"><input className="rounded border px-2 py-1" value={r.location} onChange={(e) => onUpdate(r.id, { location: e.target.value })} placeholder="Locatie" /></td>
                <td className="px-3 py-2">
                  <select className="rounded border px-2 py-1" multiple value={r.absentees} onChange={(e) => onUpdate(r.id, { absentees: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
                    {people.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                </td>
                <td className="px-3 py-2"><input className="rounded border px-2 py-1 w-full" value={r.comments} onChange={(e) => onUpdate(r.id, { comments: e.target.value })} placeholder="Comment" /></td>
                <td className="px-3 py-2"><button className="rounded-full border px-3 py-1" onClick={() => onRemove(r.id)}>x</button></td>
              </tr>
            );
          })}
          {rehearsals.length===0 && (
            <tr className="rounded-xl bg-gray-50"><td className="px-3 py-2 text-sm text-gray-500" colSpan={5}>Nog geen repetities.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
