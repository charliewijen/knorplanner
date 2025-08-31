function RehearsalPlanner({
  rehearsals = [],
  people = [],
  onAdd = () => {},
  onUpdate = () => {},
  onRemove = () => {},
}) {
  // --- helpers ---
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

  // Locatieopties (dropdown)
  const LOCATION_OPTIONS = [
    "Grote zaal - Buurthuis",
    "Dart ruimte - Buurthuis",
    "Biljart ruimte - Buurthuis",
    "Vergaderzaal - Buurthuis",
    "Anders (zie comments)",
  ];
  const normalizeLocationValue = (val) =>
    LOCATION_OPTIONS.includes(String(val)) ? String(val) : "Anders (zie comments)";

  // Extra opties (crew) naast Biggenconvent
  const STAFF_OPTIONS = [
    { id: "__staff:regie",  name: "Regie"  },
    { id: "__staff:licht",  name: "Licht"  },
    { id: "__staff:geluid", name: "Geluid" },
  ];
  const labelForAbsentee = (id) => {
    const p = personById[id];
    if (p) return fullName(p);
    const s = STAFF_OPTIONS.find(x => x.id === id);
    return s ? s.name : "";
  };

  // sorteer op datum + tijd (leeg = 00:00)
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

  // --- render ---
  return (
    <section className="rounded-2xl border p-3 bg-white">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Agenda</h2>
          <div className="text-xs text-gray-600">
            Datum & tijd, type, locatie, afwezigen en notities.
          </div>
        </div>
        <button
          className="rounded-full border px-3 py-1 text-sm"
          onClick={onAdd}
        >
          + Repetitie
        </button>
      </div>

      {/* --- MOBILE (cards) --- */}
      <div className="space-y-3 md:hidden">
        {sorted.map((r) => {
          const selectedIds = Array.isArray(r.absentees) ? r.absentees : [];
          const selectedNames = selectedIds.map(labelForAbsentee).filter(Boolean);

          return (
            <div key={r.id} className="rounded-xl border p-3">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-gray-600">Datum & tijd</label>
                  <div className="mt-1 flex flex-col gap-2">
                    <input
                      type="date"
                      className="rounded border px-2 py-2 text-[14px]"
                      value={r.date || ""}
                      onChange={(e)=>onUpdate(r.id, { date: e.target.value })}
                    />
                    <input
                      type="time"
                      className="rounded border px-2 py-2 text-[14px]"
                      value={(typeof r.time === "string" ? r.time : "")}
                      onChange={(e)=>onUpdate(r.id, { time: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Type</label>
                  <select
                    className="mt-1 rounded border px-2 py-2 w-full text-[14px]"
                    value={r.type || "Repetitie"}
                    onChange={(e)=>onUpdate(r.id, { type: e.target.value })}
                  >
                    <option>Repetitie</option>
                    <option>Doorloop</option>
                    <option>Techniek</option>
                    <option>Showdag</option>
                    <option>Overig</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Locatie</label>
                  <select
                    className="mt-1 rounded border px-2 py-2 w-full text-[14px]"
                    value={normalizeLocationValue(r.location)}
                    onChange={(e)=>onUpdate(r.id, { location: e.target.value })}
                  >
                    {LOCATION_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Afwezigen</label>
                  <select
                    multiple
                    className="mt-1 rounded border p-2 w-full h-[110px] text-[14px]"
                    value={selectedIds}
                    onChange={(e)=>handleAbsenteesChange(r.id, e)}
                  >
                    <optgroup label="Biggenconvent">
                      {(people || []).map(p => (
                        <option key={p.id} value={p.id}>{fullName(p)}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Crew">
                      {STAFF_OPTIONS.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </optgroup>
                  </select>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedNames.length > 0 ? (
                      selectedNames.map((nm, i) => (
                        <span
                          key={`${r.id}-abs-${i}`}
                          className="rounded-full border bg-gray-100 px-2 py-0.5 text-[12px]"
                        >
                          {nm}
                        </span>
                      ))
                    ) : (
                      <span className="text-[12px] text-gray-500">Geen afwezigen</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Notities</label>
                  <textarea
                    className="mt-1 rounded border p-2 w-full h-[110px] text-[14px]"
                    placeholder="Notities"
                    value={r.comments || ""}
                    onChange={(e)=>onUpdate(r.id, { comments: e.target.value })}
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    className="rounded-full border px-3 py-1"
                    onClick={()=>onRemove(r.id)}
                  >
                    Verwijder
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="rounded-xl border p-4 text-center text-gray-500">
            Nog geen items in de agenda.
          </div>
        )}
      </div>

      {/* --- DESKTOP (table) --- */}
      <div className="overflow-x-auto hidden md:block">
        <table className="min-w-full border text-sm table-auto">
          <thead>
            <tr className="bg-gray-100">
              {/* samengevoegd: datum & tijd (stacked) */}
              <th className="border px-2 py-1 text-left min-w-[12.5rem] w-[12.5rem]">
                Datum &amp; tijd
              </th>
              {/* type ruimer + leesbaarder */}
              <th className="border px-2 py-1 text-left w-[11rem]">Type</th>
              {/* locatie breed */}
              <th className="border px-2 py-1 text-left min-w-[18rem]">Locatie</th>
              {/* afwezigen breed */}
              <th className="border px-2 py-1 text-left min-w-[18rem]">Afwezigen</th>
              {/* notities breed */}
              <th className="border px-2 py-1 text-left min-w-[18rem]">Notities</th>
              <th className="border px-2 py-1 w-12"></th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((r) => {
              const selectedIds = Array.isArray(r.absentees) ? r.absentees : [];
              const selectedNames = selectedIds.map(labelForAbsentee).filter(Boolean);

              return (
                <tr key={r.id} className="odd:bg-gray-50 align-top">
                  {/* Datum & tijd stacked */}
                  <td className="border px-2 py-1">
                    <div className="flex flex-col gap-1">
                      <input
                        type="date"
                        className="rounded border px-2 py-1 w-full text-[13px]"
                        value={r.date || ""}
                        onChange={(e)=>onUpdate(r.id, { date: e.target.value })}
                      />
                      <input
                        type="time"
                        className="rounded border px-2 py-1 w-full text-[13px]"
                        value={(typeof r.time === "string" ? r.time : "")}
                        onChange={(e)=>onUpdate(r.id, { time: e.target.value })}
                      />
                    </div>
                  </td>

                  {/* Type (ruim + groter font) */}
                  <td className="border px-2 py-1">
                    <select
                      className="rounded border px-2 py-2 w-full text-[14px]"
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

                  {/* Locatie (dropdown) */}
                  <td className="border px-2 py-1">
                    <select
                      className="rounded border px-2 py-2 w-full text-[14px]"
                      value={normalizeLocationValue(r.location)}
                      onChange={(e)=>onUpdate(r.id, { location: e.target.value })}
                    >
                      {LOCATION_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </td>

                  {/* Afwezigen */}
                  <td className="border px-2 py-1">
                    <select
                      multiple
                      className="rounded border p-2 w-full h-[96px] text-[13px]"
                      value={selectedIds}
                      onChange={(e)=>handleAbsenteesChange(r.id, e)}
                    >
                      <optgroup label="Biggenconvent">
                        {(people || []).map(p => (
                          <option key={p.id} value={p.id}>{fullName(p)}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Crew">
                        {STAFF_OPTIONS.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </optgroup>
                    </select>

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
                      className="rounded border p-2 w-full h-[110px] text-[14px]"
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
                <td className="border px-2 py-3 text-center text-gray-500" colSpan={6}>
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

window.RehearsalPlanner = RehearsalPlanner;