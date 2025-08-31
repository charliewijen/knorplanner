function RehearsalPlanner({
  rehearsals = [],
  people = [],
  onAdd = () => {},
  onUpdate = () => {},
  onRemove = () => {},
}) {
  // ---- helpers ----
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

  // Crew extra keuzes naast Biggenconvent
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

  // Locatieopties
  const LOCATION_OPTIONS = [
    "Grote zaal - Buurthuis",
    "Dart ruimte - Buurthuis",
    "Biljart ruimte - Buurthuis",
    "Vergaderzaal - Buurthuis",
    "Anders (zie comments)",
  ];
  const normalizeLocationValue = (val) =>
    LOCATION_OPTIONS.includes(String(val)) ? String(val) : "Anders (zie comments)";

  // Type-opties (zoals gevraagd)
  const TYPE_OPTIONS = [
    "Lees Repetitie",
    "Reguliere Repetitie",
    "Generale repetitie",
    "Voorstelling",
    "Bonte Avond Dag",
    "BBQ",
    "Anders (zie comments)",
  ];
  const normalizeTypeValue = (val) =>
    TYPE_OPTIONS.includes(String(val)) ? String(val) : "Anders (zie comments)";

  // sort helpers
  const safeTime = (t) => (typeof t === "string" && /^\d{2}:\d{2}$/.test(t)) ? t : "00:00";
  const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD
  const isPastDate = (d) => (String(d || "") < today);

  const all = Array.isArray(rehearsals) ? rehearsals : [];
  const upcoming = all
    .filter(r => !isPastDate(r.date))
    .sort((a,b) => {
      const da = String(a.date||""); const db = String(b.date||"");
      if (da !== db) return da.localeCompare(db);
      return safeTime(a.time).localeCompare(safeTime(b.time));
    });
  const past = all
    .filter(r => isPastDate(r.date))
    .sort((a,b) => { // recent verleden eerst
      const da = String(a.date||""); const db = String(b.date||"");
      if (da !== db) return db.localeCompare(da);
      return safeTime(b.time).localeCompare(safeTime(a.time));
    });

  const handleAbsenteesChange = (id, evt) => {
    const opts = Array.from(evt.target.selectedOptions || []);
    const ids = opts.map(o => o.value);
    onUpdate(id, { absentees: ids });
  };

  const Row = ({ r, faded }) => {
    const selectedIds = Array.isArray(r.absentees) ? r.absentees : [];
    const selectedNames = selectedIds.map(labelForAbsentee).filter(Boolean);

    return (
      <tr className={`align-top ${faded ? "opacity-60" : ""}`}>
        {/* Datum & tijd stacked in 1 kolom (compact) */}
        <td className="border px-2 py-1 w-[10.5rem] min-w-[10.5rem]">
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

        {/* Type volgens lijst */}
        <td className="border px-2 py-1 w-[11.5rem] min-w-[11.5rem]">
          <select
            className="rounded border px-2 py-2 w-full text-[14px]"
            value={normalizeTypeValue(r.type)}
            onChange={(e)=>onUpdate(r.id, { type: e.target.value })}
          >
            {TYPE_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </td>

        {/* Locatie: dropdown */}
        <td className="border px-2 py-1 min-w-[15rem]">
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

        {/* Afwezigen: multiselect + 1-regel chips (horizontaal scrollbaar) */}
        <td className="border px-2 py-1 min-w-[16rem]">
          <select
            multiple
            className="rounded border p-2 w-full h-[84px] text-[13px]"
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

          <div className="mt-1 flex items-center gap-1 overflow-x-auto whitespace-nowrap">
            {selectedNames.length > 0 ? (
              selectedNames.map((nm, i) => (
                <span
                  key={`${r.id}-abs-${i}`}
                  className="rounded-full border bg-gray-100 px-2 py-0.5 text-[11px] inline-block"
                >
                  {nm}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-gray-500">Geen afwezigen</span>
            )}
          </div>
        </td>

        {/* Notities: compact maar leesbaar */}
        <td className="border px-2 py-1 min-w-[14rem]">
          <textarea
            className="rounded border p-2 w-full h-[84px] text-[14px]"
            placeholder="Notities"
            value={r.comments || ""}
            onChange={(e)=>onUpdate(r.id, { comments: e.target.value })}
          />
        </td>

        <td className="border px-2 py-1 w-12">
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
  };

  return (
    <section className="rounded-2xl border p-3 bg-white">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Agenda</h2>
          <div className="text-xs text-gray-600">
            Minder scroll; verleden staat onderaan en is grijs.
          </div>
        </div>
        <button
          className="rounded-full border px-3 py-1 text-sm"
          onClick={onAdd}
        >
          + Agenda item
        </button>
      </div>

      {/* Aankomend */}
      <div className="mb-2 text-sm font-semibold text-gray-700">Aankomend</div>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm table-auto">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left w-[10.5rem]">Datum &amp; tijd</th>
              <th className="border px-2 py-1 text-left w-[11.5rem]">Type</th>
              <th className="border px-2 py-1 text-left">Locatie</th>
              <th className="border px-2 py-1 text-left">Afwezigen</th>
              <th className="border px-2 py-1 text-left">Notities</th>
              <th className="border px-2 py-1 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {upcoming.length > 0 ? (
              upcoming.map(r => <Row key={r.id} r={r} faded={false} />)
            ) : (
              <tr>
                <td className="border px-2 py-3 text-center text-gray-500" colSpan={6}>
                  Geen aankomende items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Geweest */}
      <div className="mt-6 mb-2 text-sm font-semibold text-gray-700">Geweest</div>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm table-auto">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left w-[10.5rem]">Datum &amp; tijd</th>
              <th className="border px-2 py-1 text-left w-[11.5rem]">Type</th>
              <th className="border px-2 py-1 text-left">Locatie</th>
              <th className="border px-2 py-1 text-left">Afwezigen</th>
              <th className="border px-2 py-1 text-left">Notities</th>
              <th className="border px-2 py-1 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {past.length > 0 ? (
              past.map(r => <Row key={r.id} r={r} faded={true} />)
            ) : (
              <tr>
                <td className="border px-2 py-3 text-center text-gray-500" colSpan={6}>
                  Nog niets geweest.
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