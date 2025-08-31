function RehearsalPlanner({
  rehearsals = [],
  people = [],
  onAdd = () => {},
  onUpdate = () => {},
  onRemove = () => {},
}) {
  const fullName = (p) => {
    if (!p) return "";
    const fn = (p.firstName || "").trim();
    const ln = (p.lastName || p.name || "").trim();
    return [fn, ln].filter(Boolean).join(" ");
  };

  // Sorteer op datum + tijd (leeg tijdveld sorteert als '00:00')
  const safeTime = (t) => (typeof t === "string" && t.match(/^\d{2}:\d{2}$/)) ? t : "00:00";
  const sorted = [...(Array.isArray(rehearsals) ? rehearsals : [])].sort((a,b) => {
    const da = String(a.date || "");
    const db = String(b.date || "");
    if (da !== db) return da.localeCompare(db);
    return safeTime(a.time).localeCompare(safeTime(b.time));
  });

  const handleAbsenteesChange = (id, evt) => {
    const opts = Array.from(evt.target.selectedOptions || []);
    const ids = opts.map(o => o.value);
    onUpdate(id, { absentees: ids });
  };

  return (
    <section className="rounded-2xl border p-3 bg-white">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Agenda</h2>
          <div className="text-xs text-gray-600">Beheer repetities en afspraken. Tijd is nu beschikbaar.</div>
        </div>
        <button
          className="rounded-full border px-3 py-1 text-sm"
          onClick={onAdd}
        >
          + Repetitie
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left w-[10rem]">Datum</th>
              <th className="border px-2 py-1 text-left w-[6.5rem]">Tijd</th>
              <th className="border px-2 py-1 text-left w-[10rem]">Type</th>
              <th className="border px-2 py-1 text-left">Locatie</th>
              <th className="border px-2 py-1 text-left w-[14rem]">Afwezigen</th>
              <th className="border px-2 py-1 text-left">Notities</th>
              <th className="border px-2 py-1 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="odd:bg-gray-50 align-top">
                {/* Datum */}
                <td className="border px-2 py-1">
                  <input
                    type="date"
                    className="rounded border px-2 py-1 w-[10rem]"
                    value={r.date || ""}
                    onChange={(e)=>onUpdate(r.id, { date: e.target.value })}
                  />
                </td>

                {/* Tijd */}
                <td className="border px-2 py-1">
                  <input
                    type="time"
                    className="rounded border px-2 py-1 w-[6.5rem]"
                    value={(typeof r.time === "string" ? r.time : "")}
                    onChange={(e)=>onUpdate(r.id, { time: e.target.value })}
                  />
                </td>

                {/* Type */}
                <td className="border px-2 py-1">
                  <select
                    className="rounded border px-2 py-1 w-full"
                    value={r.type || "Repetitie"}
                    onChange={(e)=>onUpdate(r.id, { type: e.target.value })}
                  >
                    <option>Repetitie</option>
                    <option>Doorloop</option>
                    <option>Techniek</option>
                    <option>Showdag</option>
                    <option>Overig</option>
                  </select>
                </td>

                {/* Locatie */}
                <td className="border px-2 py-1">
                  <input
                    className="rounded border px-2 py-1 w-full"
                    placeholder="Locatie"
                    value={r.location || ""}
                    onChange={(e)=>onUpdate(r.id, { location: e.target.value })}
                  />
                </td>

                {/* Afwezigen */}
                <td className="border px-2 py-1">
                  <select
                    multiple
                    className="rounded border p-1 w-full h-[80px]"
                    value={Array.isArray(r.absentees) ? r.absentees : []}
                    onChange={(e)=>handleAbsenteesChange(r.id, e)}
                  >
                    {(people || []).map(p => (
                      <option key={p.id} value={p.id}>{fullName(p)}</option>
                    ))}
                  </select>
                  <div className="text-[11px] text-gray-500 mt-1">
                    {Array.isArray(r.absentees) && r.absentees.length
                      ? `${r.absentees.length} geselecteerd`
                      : "Geen afwezigen"}
                  </div>
                </td>

                {/* Notities */}
                <td className="border px-2 py-1">
                  <textarea
                    className="rounded border p-2 w-full h-[80px]"
                    placeholder="Notities"
                    value={r.comments || ""}
                    onChange={(e)=>onUpdate(r.id, { comments: e.target.value })}
                  />
                </td>

                {/* Acties */}
                <td className="border px-2 py-1">
                  <button
                    className="rounded-full border px-2 py-1"
                    onClick={()=>onRemove(r.id)}
                    title="Verwijder"
                    aria-label="Verwijder"
                  >
                    x
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td className="border px-2 py-3 text-center text-gray-500" colSpan={7}>
                  Nog geen items in de agenda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// expose voor buiten
window.RehearsalPlanner = RehearsalPlanner;