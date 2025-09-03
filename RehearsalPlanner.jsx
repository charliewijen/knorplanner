// RehearsalPlanner.jsx
// Agenda met multi-select afwezigen, soepele comments-editing en weekdag-weergave (NL)

(function () {
  const { useEffect, useMemo, useRef, useState } = React;

  const fmtWeekdayNL = (dateStr) => {
    try {
      if (!dateStr) return "—";
      // T12:00 om timezone-shift te vermijden
      const d = new Date(`${dateStr}T12:00:00`);
      return new Intl.DateTimeFormat("nl-NL", { weekday: "long" }).format(d);
    } catch {
      return "—";
    }
  };

  const fullName = (p) => {
    if (!p) return "";
    const fn = (p.firstName || "").trim();
    const ln = (p.lastName || p.name || "").trim();
    return [fn, ln].filter(Boolean).join(" ") || (p.name || "");
  };

  function RehearsalPlanner({
    rehearsals = [],
    people = [],
    onAdd,
    onUpdate,
    onRemove,
    readOnly: readOnlyProp,
  }) {
    // In de share-modus willen we inputs standaard uitschakelen
    const readOnly = readOnlyProp ?? (typeof location !== "undefined" && (location.hash || "").includes("share="));

    // Drafts per rehearsal-id om focusverlies te voorkomen tijdens typen
    const [drafts, setDrafts] = useState(() => {
      const o = {};
      (rehearsals || []).forEach((r) => (o[r.id] = { ...r }));
      return o;
    });

    // Zorg dat nieuwe/ontbrekende items in drafts komen (zonder lopende edits te slopen)
    useEffect(() => {
      setDrafts((prev) => {
        const next = { ...prev };
        const ids = new Set(rehearsals.map((r) => r.id));
        // voeg nieuwe in
        rehearsals.forEach((r) => {
          if (!next[r.id]) next[r.id] = { ...r };
        });
        // verwijder verdwenen
        Object.keys(next).forEach((id) => {
          if (!ids.has(id)) delete next[id];
        });
        return next;
      });
    }, [rehearsals]);

    // Debounce timers per row
    const timersRef = useRef({});

    const commit = (id) => {
      if (readOnly || !onUpdate) return;
      const d = drafts[id];
      if (!d) return;
      // Patch alle velden van het draft terug
      onUpdate(id, {
        date: d.date || "",
        time: d.time || "",
        location: d.location || "",
        comments: d.comments || "",
        absentees: Array.isArray(d.absentees) ? d.absentees : [],
        type: d.type || "",
      });
    };

    const scheduleCommit = (id, delay = 400) => {
      clearTimeout(timersRef.current[id]);
      timersRef.current[id] = setTimeout(() => commit(id), delay);
    };

    const setField = (id, field, value, instant = false) => {
      setDrafts((prev) => {
        const base = prev[id] ?? rehearsals.find((r) => r.id === id) ?? {};
        const d = { ...base, [field]: value };
        return { ...prev, [id]: d };
      });
      if (!readOnly) {
        if (instant) commit(id);
        else scheduleCommit(id);
      }
    };

    const toggleAbsentee = (id, personId) => {
      const cur = drafts[id]?.absentees || [];
      const has = cur.includes(personId);
      const next = has ? cur.filter((x) => x !== personId) : [...cur, personId];
      setField(id, "absentees", next); // debounced commit
    };

    const clearAbsentees = (id) => setField(id, "absentees", [], true); // direct commit

    const sorted = useMemo(() => {
      // toon alvast in een logische volgorde (YYYY-MM-DD + time)
      const arr = [...(rehearsals || [])];
      arr.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));
      return arr;
    }, [rehearsals]);

    return (
      <div className="space-y-3">
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border px-3 py-1 text-sm bg-black text-white"
              onClick={() => onAdd && onAdd()}
            >
              + Repetitie toevoegen
            </button>
            <span className="text-xs text-gray-500">Klik op velden om ze te bewerken. Opslaan gebeurt automatisch.</span>
          </div>
        )}

        {sorted.length === 0 && (
          <div className="rounded-xl border p-3 text-sm text-gray-600">Nog geen repetities.</div>
        )}

        <div className="grid gap-3">
          {sorted.map((r) => {
            const d = drafts[r.id] || r;
            const weekday = fmtWeekdayNL(d.date);
            return (
              <div key={r.id} className="rounded-xl border p-3 bg-white/60">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="grid md:grid-cols-5 gap-3 w-full">
                    {/* Datum */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Datum</label>
                      <input
                        type="date"
                        className="w-full rounded border px-2 py-1"
                        value={d.date || ""}
                        onChange={(e) => setField(r.id, "date", e.target.value)}
                        onBlur={() => commit(r.id)}
                        disabled={readOnly}
                      />
                      <div className="text-xs text-gray-500 mt-1 capitalize">{weekday}</div>
                    </div>

                    {/* Tijd */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Tijd</label>
                      <input
                        type="time"
                        className="w-full rounded border px-2 py-1"
                        value={d.time || ""}
                        onChange={(e) => setField(r.id, "time", e.target.value)}
                        onBlur={() => commit(r.id)}
                        disabled={readOnly}
                      />
                    </div>

                    {/* Locatie */}
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-600 mb-1">Locatie</label>
                      <input
                        type="text"
                        className="w-full rounded border px-2 py-1"
                        placeholder="Bijv. Grote zaal – Buurthuis"
                        value={d.location || ""}
                        onChange={(e) => setField(r.id, "location", e.target.value)}
                        onBlur={() => commit(r.id)}
                        disabled={readOnly}
                      />
                    </div>

                    {/* Type */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Type</label>
                      <select
                        className="w-full rounded border px-2 py-1"
                        value={d.type || "Reguliere Repetitie"}
                        onChange={(e) => setField(r.id, "type", e.target.value)}
                        onBlur={() => commit(r.id)}
                        disabled={readOnly}
                      >
                        <option>Reguliere Repetitie</option>
                        <option>Doorloop</option>
                        <option>Techniek</option>
                        <option>Try-out</option>
                        <option>Overig</option>
                      </select>
                    </div>
                  </div>

                    {/* Afwezigen */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Afwezig</label>
                        {!readOnly && (
                          <button
                            className="text-xs underline text-gray-600"
                            onClick={() => clearAbsentees(r.id)}
                          >
                            alles leegmaken
                          </button>
                        )}
                      </div>
                      <div className={`mt-2 grid gap-2 ${people.length > 8 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1"}`}>
                        {people.map((p) => {
                          const checked = (d.absentees || []).includes(p.id);
                          return (
                            <label key={p.id} className={`inline-flex items-center gap-2 text-sm ${checked ? "" : ""}`}>
                              <input
                                type="checkbox"
                                className="rounded border"
                                checked={checked}
                                onChange={() => toggleAbsentee(r.id, p.id)}
                                disabled={readOnly}
                              />
                              <span>{fullName(p)}</span>
                            </label>
                          );
                        })}
                        {people.length === 0 && (
                          <div className="text-xs text-gray-500">Nog geen spelers voor deze show.</div>
                        )}
                      </div>
                      {(d.absentees || []).length > 0 && (
                        <div className="text-xs text-gray-600 mt-2">
                          Gekozen:{" "}
                          {(d.absentees || [])
                            .map((id) => people.find((x) => x.id === id))
                            .filter(Boolean)
                            .map(fullName)
                            .join(", ")}
                        </div>
                      )}
                    </div>

                    {/* Notities / Comments */}
                    <div className="mt-3">
                      <label className="block text-sm font-medium mb-1">Notities</label>
                      <textarea
                        className="w-full rounded border px-2 py-2 min-h-[70px]"
                        placeholder="Bijv. focus op scène 3, neem sportkleding mee, enz."
                        value={d.comments || ""}
                        onChange={(e) => setField(r.id, "comments", e.target.value)}
                        onBlur={() => commit(r.id)}
                        disabled={readOnly}
                      />
                    </div>
                </div>

                {!readOnly && (
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      Laatst bewerkt: automatisch bij wijzigingen
                    </div>
                    <button
                      className="rounded-full px-3 py-1 text-sm border border-red-600 bg-red-600 text-white hover:bg-red-700"
                      onClick={() => onRemove && onRemove(r.id)}
                    >
                      Verwijder
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Export naar window voor gebruik in BackstagePlannerApp.jsx
  window.RehearsalPlanner = RehearsalPlanner;
})();