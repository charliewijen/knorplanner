// RehearsalPlanner.jsx — compact 2-rijen layout met NL-weekdag en multi-afwezig
// Houdt jouw bestaande data intact en werkt ook in share (readOnly).

(function () {
  const { useEffect, useMemo, useRef, useState } = React;

  /* ---------- helpers ---------- */
  const fmtWeekdayNL = (dateStr) => {
    try {
      if (!dateStr) return "—";
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
  const toTs = (dateStr, timeStr) => {
    if (!dateStr) return 0;
    const t = (timeStr && /^\d{2}:\d{2}$/.test(timeStr)) ? timeStr : "23:59";
    return new Date(`${dateStr}T${t}:00`).getTime();
  };

  function RehearsalPlanner({
    rehearsals = [],
    people = [],
    onAdd,
    onUpdate,
    onRemove,
    readOnly: roProp,
  }) {
    const readOnly =
      roProp ??
      (typeof location !== "undefined" && (location.hash || "").includes("share="));

    /* ---------- compacte CSS ---------- */
    const css = `
      .rp-wrap{position:relative;z-index:0}
      .rp-card{padding:10px;border-radius:12px;background:#fff;border:1px solid #e5e7eb}
      .rp-label{font-size:11px;color:#6b7280;margin-bottom:2px;line-height:1}
      .rp-sub{font-size:11px;color:#6b7280;text-transform:capitalize;margin-top:2px;min-height:14px}
      .rp-ctrl{height:32px;padding:4px 8px;line-height:1.15;font-size:14px}
      .rp-note{min-height:32px;padding:6px 8px;font-size:14px;line-height:1.2}
      .rp-chip{display:inline-flex;align-items:center;font-size:12px;border:1px solid #e5e7eb;border-radius:9999px;padding:2px 8px;margin:2px;background:#f9fafb;white-space:nowrap}
      .rp-muted{font-size:12px;color:#6b7280}
      .rp-actions .btn-del{border:1px solid #dc2626;background:#dc2626;color:#fff;border-radius:9999px;padding:4px 10px;font-size:12px}
      .rp-actions .btn{border:1px solid #d1d5db;background:#f3f4f6;border-radius:9999px;padding:4px 10px;font-size:12px}
      /* Grid: rij 1 is alle kernvelden op 1 regel. rij 2 is notities + afwezig + knop */
      .rp-top{display:grid;gap:8px;align-items:center}
      @media(min-width:768px){
        .rp-top{grid-template-columns:140px 90px 1fr 160px auto}
      }
      @media(max-width:767px){
        .rp-top{grid-template-columns:1fr 1fr}
        .rp-location{grid-column:1 / -1}
        .rp-type{grid-column:1 / 2}
        .rp-actions{grid-column:2 / 3;justify-self:end}
      }
      .rp-row{display:grid;gap:8px;align-items:end;margin-top:8px}
      @media(min-width:768px){
        .rp-row{grid-template-columns:1fr 1fr auto}
      }
      @media(max-width:767px){
        .rp-row{grid-template-columns:1fr 1fr}
        .rp-row .rp-edit{grid-column:1 / -1;justify-self:end}
      }
      /* verklein iOS date/time velden */
      input[type="date"].rp-ctrl,
      input[type="time"].rp-ctrl{appearance:none;-webkit-appearance:none;height:32px}
      input[type="date"]::-webkit-date-and-time-value{min-height:1em}
      input[type="date"]::-webkit-datetime-edit,
      input[type="time"]::-webkit-datetime-edit{padding:0}
    `;

    /* ---------- drafts + debounce (geen focusverlies) ---------- */
    const [drafts, setDrafts] = useState(() => {
      const o = {};
      (rehearsals || []).forEach((r) => (o[r.id] = { ...r }));
      return o;
    });
    useEffect(() => {
      setDrafts((prev) => {
        const next = { ...prev };
        const ids = new Set(rehearsals.map((r) => r.id));
        rehearsals.forEach((r) => { if (!next[r.id]) next[r.id] = { ...r }; });
        Object.keys(next).forEach((id) => { if (!ids.has(id)) delete next[id]; });
        return next;
      });
    }, [rehearsals]);

    const timersRef = useRef({});
    const commit = (id) => {
      if (readOnly || !onUpdate) return;
      const d = drafts[id];
      if (!d) return;
      onUpdate(id, {
        date: d.date || "",
        time: d.time || "",
        location: d.location || "",
        comments: d.comments || "",
        absentees: Array.isArray(d.absentees) ? d.absentees : [],
        type: d.type || "",
      });
    };
    const scheduleCommit = (id, ms = 300) => {
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

    /* ---------- afwezig ---------- */
    const [openAbsId, setOpenAbsId] = useState(null);
    const toggleAbsentee = (id, personId) => {
      const cur = drafts[id]?.absentees || [];
      const has = cur.includes(personId);
      const next = has ? cur.filter((x) => x !== personId) : [...cur, personId];
      setField(id, "absentees", next); // debounced
    };
    const clearAbsentees = (id) => setField(id, "absentees", [], true);

    /* ---------- sortering & splitsing ---------- */
    const now = Date.now();
    const sortedAll = useMemo(() => {
      const arr = [...(rehearsals || [])];
      arr.sort(
        (a, b) =>
          toTs(a.date, a.time) - toTs(b.date, b.time) ||
          String(a.id).localeCompare(String(b.id))
      );
      return arr;
    }, [rehearsals]);
    const upcoming = useMemo(() => sortedAll.filter((r) => toTs(r.date, r.time) >= now), [sortedAll, now]);
    const past = useMemo(() => sortedAll.filter((r) => toTs(r.date, r.time) < now).reverse(), [sortedAll, now]);

    /* ---------- kaart ---------- */
    const Card = (r) => {
      const d = drafts[r.id] || r;
      const weekday = fmtWeekdayNL(d.date);
      const absNames = (d.absentees || [])
        .map((id) => people.find((x) => x.id === id))
        .filter(Boolean)
        .map(fullName);
      const hasAbs = absNames.length > 0;

      return (
        <div key={r.id} className="rp-card">
          {/* R1: datum, tijd, locatie, type, acties → allemaal één regel */}
          <div className="rp-top">
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
              <div className="rp-sub">{weekday}</div>
            </div>

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

            <div className="rp-location">
              <div className="rp-label">Locatie</div>
              <input
                type="text"
                className="w-full rounded border rp-ctrl"
                placeholder="Grote zaal – Buurthuis"
                value={d.location || ""}
                onChange={(e) => setField(r.id, "location", e.target.value)}
                onBlur={() => commit(r.id)}
                disabled={readOnly}
              />
            </div>

            <div className="rp-type">
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

            {!readOnly && (
              <div className="rp-actions">
                <button className="btn-del" onClick={() => onRemove && onRemove(r.id)}>
                  Verwijder
                </button>
              </div>
            )}
          </div>

          {/* R2: notities (links), afwezig chips (midden), knop bewerken (rechts) */}
          <div className="rp-row">
            <div>
              <div className="rp-label">Notities</div>
              <textarea
                rows={1}
                className="w-full rounded border rp-note"
                placeholder="Korte notitie…"
                value={d.comments || ""}
                onChange={(e) => setField(r.id, "comments", e.target.value)}
                onBlur={() => commit(r.id)}
                disabled={readOnly}
              />
            </div>

            <div>
              <div className="rp-label">Afwezig</div>
              <div className="truncate">
                {!hasAbs ? <span className="rp-chip">—</span> : absNames.map((n, i) => (
                  <span key={i} className="rp-chip">{n}</span>
                ))}
              </div>
            </div>

            {!readOnly && (
              <div className="rp-edit" style={{justifySelf:'end', alignSelf:'end'}}>
                <button
                  className="btn"
                  onClick={() => setOpenAbsId(cur => cur === r.id ? null : r.id)}
                >
                  {openAbsId === r.id ? "Sluiten" : "Bewerk afwezig"}
                </button>
              </div>
            )}
          </div>

          {/* Afwezig-panel (checkboxen) */}
          {!readOnly && openAbsId === r.id && (
            <div style={{marginTop:8}}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium">Selecteer afwezigen</div>
                <button className="rp-muted underline" onClick={() => clearAbsentees(r.id)}>
                  alles leegmaken
                </button>
              </div>
              <div
                style={{
                  display:'grid',
                  gap:'6px',
                  gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))'
                }}
              >
                {people.length === 0 && <div className="rp-muted">Geen spelers voor deze show.</div>}
                {people.map(p => {
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
    };

    return (
      <div className="rp-wrap">
        <style>{css}</style>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button
              className="rounded-full border px-3 py-1 text-sm bg-black text-white"
              onClick={() => onAdd && onAdd()}
            >
              + Repetitie toevoegen
            </button>
            <span className="rp-muted">Compacte weergave • automatisch opslaan</span>
          </div>
        )}

        <div className="text-base font-semibold mb-1">Komende repetities</div>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border p-3 rp-muted">Geen komende repetities.</div>
        ) : (
          <div className="grid gap-2">{upcoming.map(Card)}</div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer rounded-xl border px-3 py-2 bg-gray-50">
            Vorige repetities <span className="rp-muted">({past.length})</span>
          </summary>
          <div className="grid gap-2 mt-2">{past.length ? past.map(Card) : (
            <div className="rounded-xl border p-3 rp-muted">Geen vorige items.</div>
          )}</div>
        </details>
      </div>
    );
  }

  window.RehearsalPlanner = RehearsalPlanner;
})();