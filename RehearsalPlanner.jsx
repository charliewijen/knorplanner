function RehearsalPlanner({
  rehearsals = [],
  people = [],
  onAdd = () => {},
  onUpdate = () => {},
  onRemove = () => {},
}) {
  const personById = React.useMemo(
    () => Object.fromEntries((people || []).map(p => [p.id, p])),
    [people]
  );

  const fullName = (p) => {
    if (!p) return "";
    const fn = (p.firstName || "").trim();
    const ln = (p.lastName || p.name || "").trim();
    return [fn, ln].filter(Boolean).join(" ");
  };

  // Sorteer op datum + tijd (leeg tijdveld => "00:00")
  const safeTime = (t) => (typeof t === "string" && /^\d{2}:\d{2}$/.test(t)) ? t : "00:00";
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
          <div className="text-xs text-gray-600">Datum, tijd, locatie, afwezigen en notities.</div>
        </div>
        <button
          className="rounded-full border px-3 py-1 text-sm"
          onClick={onAdd}
        >
          + Repetitie
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm table-auto">
          <thead>
            <tr className="bg-gray-100">
              {/* compacter: datum/tijd smaller */}
              <th className="border px-2 py-1 text-left w-[8.5rem] sm:w-[9.5rem] md:w-[10rem]">Datum</th>
              <th className="border px-2 py-1 text-left w-[5.25rem] sm:w-[5.75rem] md:w-[6rem]">Tijd</th>
              <th className="border px-2 py-1 text-left w-[9rem]">Type</th>
              {/* locatie krijgt extra minimum-breedte en mag niet “afgekapt” voelen */}
              <th className="border px-2 py-1 text-left min-w-[12rem] sm:min-w-[16rem] md:min-w-[20rem]">Locatie</th>
              <th className="border px-2 py-1 text-left min-w-[14rem]">Afwezigen</th>
              <th className="border px-2 py-1 text-left">Notities</th>
              <th className="border px-2 py-1 w-12"></th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((r) => {
              const selectedNames = Array.isArray(r.absentees)
                ? r.absentees
                    .map(id => fullName(personById[id]))
                    .filter(Boolean)
                : [];

              return (
                <tr key={r.id} className="odd:bg-gray-50 align-top">
                  {/* Datum */}
                  <td className="border px-2 py-1">
                    <input
                      type="date"
                      className="rounded border px-2 py-1 w-[8.5rem] sm:w-[9.5rem] md:w-[10rem]"
                      value={r.date || ""}
                      onChange={(e)=>onUpdate(r.id, { date: e.target.value })}
                    />
                  </td>

                  {/* Tijd */}
                  <td className="border px-2 py-1">
                    <input
                      type="time"
                      className="rounded border px-2 py-1 w-[5.25rem] sm:w-[5.75rem] md:w-[6rem]"
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

                  {/* Locatie: meer ruimte + geen “afknippen” gevoel + tooltip met volledige tekst */}
                  <td className="border px-2 py-1">
                    <input
                      className="rounded border px-2 py-1 w-full min-w-[12rem] sm:min-w-[16rem] md:min-w-[20rem] text-[13px]"
                      placeholder="Locatie"
                      value={r.location || ""}
                      title={r.location || ""}
                      onChange={(e)=>onUpdate(r.id, { location: e.target.value })}
                    />
                  </td>

                  {/* Afwezigen: multiselect + zichtbare namen als chips (i.p.v. “3 geselecteerd”) */}
                  <td className="border px-2 py-1">
                    <select
                      multiple
                      className="rounded border p-1 w-full h-[88px]"
                      value={Array.isArray(r.absentees) ? r.absentees : []}
                      onChange={(e)=>handleAbsenteesChange(r.id, e)}
                    >
                      {(people || []).map(p => (
                        <option key={p.id} value={p.id}>{fullName(p)}</option>
                      ))}
                    </select>

                    {/* Namen zichtbaar */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selectedNames.length > 0 ? (
                        selectedNames.map((nm, i) => (
                          <span
                            key={`${r.id}-abs-${i}`}
                            className="rounded-full border bg-gray-100 px-2 py-0.5 text-[11px]"
                          >
                            {nm}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-gray-500">Geen afwezigen</span>
                      )}
                    </div>
                  </td>

                  {/* Notities */}
                  <td className="border px-2 py-1">
                    <textarea
                      className="rounded border p-2 w-full h-[88px]"
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
              );
            })}

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