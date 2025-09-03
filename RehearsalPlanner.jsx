// RehearsalPlanner.jsx — compacte layout
// - Multi-select AFWEZIG (met inklapbaar paneel)
// - Soepele comments (draft + debounce, geen focusverlies)
// - Weekdag (nl-NL) onder datum
// - Houdt rekening met readOnly (share) en bestaande data

(function () {
  const { useEffect, useMemo, useRef, useState } = React;

  const fmtWeekdayNL = (dateStr) => {
    try {
      if (!dateStr) return "—";
      // T12:00 tegen TZ-shifts
      const d = new Date(`${dateStr}T12:00:00`);
      return new Intl.DateTimeFormat("nl-NL", { weekday: "long" }).format(d);
    } catch { return "—"; }
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
    readOnly: roProp,
  }) {
    // Share-views zijn readonly
    const readOnly = roProp ?? (typeof location !== "undefined" && (location.hash || "").includes("share="));

    // Compacter kaartje → wat utility CSS
    const tightCss = `
      .rp-card{padding:10px;border-radius:12px}
      .rp-grid{display:grid;gap:8px}
      .rp-label{font-size:11px;color:#6b7280;margin-bottom:2px}
      .rp-ctrl{padding:.35rem .5rem}
      .rp-small{font-size:12px;color:#6b7280}
      .rp-actions{margin-top:6px}
      .rp-chip{display:inline-flex;align-items:center;font-size:12px;border:1px solid #e5e7eb;border-radius:9999px;padding:2px 8px;margin:2px;background:#f9fafb}
      .rp-row{margin-top:6px}
      @media(min-width:768px){.rp-top{grid-template-columns:140px 110px 1fr 150px auto}}
      @media(max-width:767px){.rp-top{grid-template-columns:1fr 1fr}}
    `;

    // Drafts per id → voorkomt blur/focusverlies
    const [drafts, setDrafts] = useState(() => {
      const o = {};
      (rehearsals || []).forEach((r) => (o[r.id] = { ...r }));
      return o;
    });
    // Sync drafts bij externe wijzigingen (zonder typwerk te slopen)
    useEffect(() => {
      setDrafts((prev) => {
        const next = { ...prev };
        const ids = new Set(rehearsals.map((r) => r.id));
        rehearsals.forEach((r) => { if (!next[r.id]) next[r.id] = { ...r }; });
        Object.keys(next).forEach((id) => { if (!ids.has(id)) delete next[id]; });
        return next;
      });
    }, [rehearsals]);

    // Debounce per item
    const timersRef = useRef({});
    const commit = (id) => {
      if (readOnly || !onUpdate) return;
      const d = drafts[id]; if (!d) return;
      onUpdate(id, {
        date: d.date || "",
        time: d.time || "",
        location: d.location || "",
        comments: d.comments || "",
        absentees: Array.isArray(d.absentees) ? d.absentees : [],
        type: d.type || "",
      });
    };
    const scheduleCommit = (id, ms = 350) => {
      clearTimeout(timersRef.current[id]);
      timersRef.current[id] = setTimeout(() => commit(id), ms);
    };
    const setField = (id, field, value, instant = false) => {
      setDrafts((prev) => {
        const base = prev[id] ?? rehearsals.find((r) => r.id === id) ?? {};
        return { ...prev, [id]: { ...base, [field]: value } };
      });
      if (!readOnly) instant ? commit(id) : scheduleCommit(id);
    };

    // Afwezig toggle (met inklapbaar paneel)
    const [openAbsId, setOpenAbsId] = useState(null);
    const toggleAbsentee = (id, personId) => {
      const cur = drafts[id]?.absentees || [];
      const has = cur.includes(personId);
      const next = has ? cur.filter((x) => x !== personId) : [...cur, personId];
      setField(id, "absentees", next); // debounced
    };
    const clearAbsentees = (id) => setField(id, "absentees", [], true); // direct

    const sorted = useMemo(() => {
      const arr = [...(rehearsals || [])];
      arr.sort((a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        String(a.time).localeCompare(String(b.time))
      );
      return arr;
    }, [rehearsals]);

    return (
      <div className="space-y-2">
        <style>{tightCss}</style>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <button
              className="rounded-full border px-3 py-1 text-sm bg-black text-white"
              onClick={() => onAdd && onAdd()}
            >
              + Repetitie toevoegen
            </button>
            <span className="text-xs text-gray-500">Compacte weergave • opslaan gebeurt automatisch</span>
          </div>
        )}

        {sorted.length === 0 && (
          <div className="rounded-xl border p-3 text-sm text-gray-600">Nog geen repetities.</div>
        )}

        <div className="grid gap-2">
          {sorted.map((r) => {
            const d = drafts[r.id] || r;
            const weekday = fmtWeekdayNL(d.date);
            const absNames = (d.absentees || [])
              .map((id) => people.find((x) => x.id === id))
              .filter(Boolean)
              .map(fullName);
            const absSummary =
              absNames.length === 0 ? "—"
              : absNames.join(", ").length > 80
                ? absNames.join(", ").slice(0, 77) + "…"
                : absNames.join(", ");

            return (
              <div key={r.id} className="rp-card border bg-white/70">
                {/* Bovenste, super-compacte rij */}
                <div className="rp-grid rp-top items-end">
                  {/* Datum + weekdag */}
                  <div>
                    <div className="rp-label">Datum</div>
                    <input
                      type="date"
                      className="w-full rounded border rp-ctrl"
                      value={d.date || ""}
                      onChange={(e) => setField(r.id, "date", e.target.value)}
                      onBlur={() => commit(r.id)}
                      disabled={readOnly}
                    />
                    <div className="rp-small capitalize mt-1">{weekday}</div>
                  </div>

                  {/* Tijd */}
                  <div>
                    <div className="rp-label">Tijd</div>
                    <input
                      type="time"
                      className="w-full rounded border rp-ctrl"
                      value={d.time || ""}
                      onChange={(e) => setField(r.id, "time", e.target.value)}
                      onBlur={() => commit(r.id)}
                      disabled={readOnly}
                    />
                  </div>

                  {/* Locatie (brede kolom) */}
                  <div>
                    <div className="rp-label">Locatie</div>
                    <input
                      type="text"
                      className="w-full rounded border rp-ctrl"
                      placeholder="Bijv. Grote zaal – Buurthuis"
                      value={d.location || ""}
                      onChange={(e) => setField(r.id, "location", e.target.value)}
                      onBlur={() => commit(r.id)}
                      disabled={readOnly}
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <div className="rp-label">Type</div>
                    <select
                      className="w-full rounded border rp-ctrl"
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

                  {/* Acties rechtsboven */}
                  {!readOnly && (
                    <div className="justify-self-end">
                      <button
                        className="rounded-full px-3 py-1 text-sm border border-red-600 bg-red-600 text-white hover:bg-red-700"
                        onClick={() => onRemove && onRemove(r.id)}
                      >
                        Verwijder
                      </button>
                    </div>
                  )}
                </div>

                {/* Rij 2: korte notities + afwezig samenvatting */}
                <div className="rp-grid rp-row" style={{ gridTemplateColumns: readOnly ? "1fr 1fr" : "1fr 1fr auto" }}>
                  {/* Notities */}
                  <div>
                    <div className="rp-label">Notities</div>
                    <textarea
                      rows={2}
                      className="w-full rounded border px-2 py-1"
                      placeholder="Korte notitie…"
                      value={d.comments || ""}
                      onChange={(e) => setField(r.id, "comments", e.target.value)}
                      onBlur={() => commit(r.id)}
                      disabled={readOnly}
                    />
                  </div>

                  {/* Afwezig (samenvatting) */}
                  <div>
                    <div className="rp-label">Afwezig</div>
                    <div className="truncate">
                      {absNames.length === 0 ? (
                        <span className="rp-chip">—</span>
                      ) : (
                        absNames.map((n, i) => <span key={i} className="rp-chip">{n}</span>)
                      )}
                    </div>
                  </div>

                  {/* Toggle knop */}
                  {!readOnly && (
                    <div className="self-end justify-self-end">
                      <button
                        className="rounded-full border px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200"
                        onClick={() => setOpenAbsId((cur) => (cur === r.id ? null : r.id))}
                        title="Afwezig bewerken"
                      >
                        {openAbsId === r.id ? "Sluiten" : "Bewerk afwezig"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Inklapbaar paneel met checkboxen (alleen indien geopend of in share readonly tonen we geen editor) */}
                {!readOnly && openAbsId === r.id && (
                  <div className="rp-row">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-medium">Selecteer afwezigen</div>
                      <button className="text-xs underline text-gray-600" onClick={() => clearAbsentees(r.id)}>
                        alles leegmaken
                      </button>
                    </div>
                    <div
                      className={`grid gap-2 ${people.length > 18 ? "md:grid-cols-3" : people.length > 8 ? "md:grid-cols-2" : "grid-cols-1"}`}
                    >
                      {people.length === 0 && (
                        <div className="text-xs text-gray-500">Nog geen spelers voor deze show.</div>
                      )}
                      {people.map((p) => {
                        const checked = (d.absentees || []).includes(p.id);
                        return (
                          <label key={p.id} className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="rounded border"
                              checked={checked}
                              onChange={() => toggleAbsentee(r.id, p.id)}
                            />
                            <span>{fullName(p)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  window.RehearsalPlanner = RehearsalPlanner;
})();