// RehearsalPlanner.jsx — compact & strak met "vorige" lijst
// - Multi-select AFWEZIG (checkboxen)
// - Soepele comments (draft + debounce; geen focusverlies)
// - Weekdag (nl-NL) onder datum
// - Vorige repetities automatisch onderaan (inklapbaar)
// - Houdt rekening met readOnly (share) en bestaande data

(function () {
  const { useEffect, useMemo, useRef, useState } = React;

  /* ---------- helpers ---------- */
  const fmtWeekdayNL = (dateStr) => {
    try {
      if (!dateStr) return "—";
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
    // Share-views zijn readonly
    const readOnly =
      roProp ??
      (typeof location !== "undefined" && (location.hash || "").includes("share="));

    /* ---------- compacte, consistente CSS ---------- */
    const css = `
      .rp-card{padding:12px;border-radius:12px;background:rgba(255,255,255,.82)}
      .rp-top{display:grid;gap:10px;align-items:end}
      /* Mobiel: twee kolommen (datum+tijd), rest onder elkaar */
      @media(max-width:767px){
        .rp-top{grid-template-columns:1fr 1fr}
        .rp-location{grid-column:1 / -1}
        .rp-type{grid-column:1 / 2}
        .rp-actions{grid-column:2 / 3;justify-self:end}
      }
      /* Desktop: vaste kolommen die niet verspringen */
      @media(min-width:768px){
        .rp-top{grid-template-columns:140px 110px 1fr 160px auto}
        .rp-actions{justify-self:end}
      }
      .rp-label{font-size:11px;color:#6b7280;margin-bottom:2px;line-height:1}
      .rp-ctrl{padding:.40rem .55rem;line-height:1.25}
      .rp-week{font-size:11px;color:#6b7280;text-transform:capitalize;min-height:14px;margin-top:4px}
      .rp-row{margin-top:8px}
      .rp-chip{display:inline-flex;align-items:center;font-size:12px;border:1px solid #e5e7eb;border-radius:9999px;padding:2px 8px;margin:2px;background:#f9fafb}
      .rp-note{min-height:2.25rem}
      .rp-abs-grid{display:grid;gap:6px}
      @media(min-width:768px){.rp-abs-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:767px){.rp-abs-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .rp-section-title{font-weight:600;margin:6px 0}
      .rp-muted{font-size:12px;color:#6b7280}
      /* Zorg dat niets "onder" het sticky top-menu kruipt */
      .rp-wrap{position:relative;z-index:0}
    `;

    /* ---------- drafts (geen focusverlies) ---------- */
    const [drafts, setDrafts] = useState(() => {
      const o = {};
      (rehearsals || []).forEach((r) => (o[r.id] = { ...r }));
      return o;
    });
    useEffect(() => {
      setDrafts((prev) => {
        const next = { ...prev };
        const ids = new Set(rehearsals.map((r) => r.id));
        rehearsals.forEach((r) => {
          if (!next[r.id]) next[r.id] = { ...r };
        });
        Object.keys(next).forEach((id) => {
          if (!ids.has(id)) delete next[id];
        });
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

    /* ---------- afwezig bewerken ---------- */
    const [openAbsId, setOpenAbsId] = useState(null);
    const toggleAbsentee = (id, personId) => {
      const cur = drafts[id]?.absentees || [];
      const has = cur.includes(personId);
      const next = has ? cur.filter((x) => x !== personId) : [...cur, personId];
      setField(id, "absentees", next); // debounced
    };
    const clearAbsentees = (id) => setField(id, "absentees", [], true);

    /* ---------- sorteren + splitsen (komend vs. vorige) ---------- */
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

    const upcoming = useMemo(
      () => sortedAll.filter((r) => toTs(r.date, r.time) >= now),
      [sortedAll, now]
    );
    const past = useMemo(
      () => sortedAll.filter((r) => toTs(r.date, r.time) < now).reverse(),
      [sortedAll, now]
    );

    /* ---------- renderer voor één kaart ---------- */
    const Card = (r) => {
      const d = drafts[r.id] || r;
      const weekday = fmtWeekdayNL(d.date);
      const absNames = (d.absentees || [])
        .map((id) => people.find((x) => x.id === id))
        .filter(Boolean)
        .map(fullName);
      const hasAbs = absNames.length > 0;

      return (
        <div key={r.id} className="rp-card border">
          {/* Rij 1: vaste, strakke grid */}
          <div className="rp-top">
            {/* Datum */}
            <div>
              <div className="rp-label">Datum</div>
              <input
                type="date"
                className="w-full rounded border rp-ctrl box-border"
                value={d.date || ""}
                onChange={(e) => setField(r.id, "date", e.target.value)}
                onBlur={() => commit(r.id)}
                disabled={readOnly}
              />
              <div className="rp-week">{weekday}</div>
            </div>

            {/* Tijd */}
            <div>
              <div className="rp-label">Tijd</div>
              <input
                type="time"
                className="w-full rounded border rp-ctrl box-border"
                value={d.time || ""}
                onChange={(e) => setField(r.id, "time", e.target.value)}
                onBlur={() => commit(r.id)}
                disabled={readOnly}
              />
            </div>

            {/* Locatie */}
            <div className="rp-location">
              <div className="rp-label">Locatie</div>
              <input
                type="text"
                className="w-full rounded border rp-ctrl box-border"
                placeholder="Bijv. Grote zaal – Buurthuis"
                value={d.location || ""}
                onChange={(e) => setField(r.id, "location", e.target.value)}
                onBlur={() => commit(r.id)}
                disabled={readOnly}
              />
            </div>

            {/* Type */}
            <div className="rp-type">
              <div className="rp-label">Type</div>
              <select
                className="w-full rounded border rp-ctrl box-border"
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

            {/* Acties */}
            {!readOnly && (
              <div className="rp-actions">
                <button
                  className="rounded-full px-3 py-1 text-sm border border-red-600 bg-red-600 text-white hover:bg-red-700"
                  onClick={() => onRemove && onRemove(r.id)}
                >
                  Verwijder
                </button>
              </div>
            )}
          </div>

          {/* Rij 2: notities + afwezig samenvatting + knop */}
          <div
            className="rp-row"
            style={{
              display: "grid",
              gap: "10px",
              gridTemplateColumns: readOnly ? "1fr 1fr" : "1fr 1fr auto",
              alignItems: "end",
            }}
          >
            {/* Notities */}
            <div>
              <div className="rp-label">Notities</div>
              <textarea
                rows={2}
                className="w-full rounded border px-2 py-1 rp-note box-border"
                placeholder="Korte notitie…"
                value={d.comments || ""}
                onChange={(e) => setField(r.id, "comments", e.target.value)}
                onBlur={() => commit(r.id)}
                disabled={readOnly}
              />
            </div>

            {/* Afwezig (chips) */}
            <div>
              <div className="rp-label">Afwezig</div>
              <div className="truncate">
                {!hasAbs ? (
                  <span className="rp-chip">—</span>
                ) : (
                  absNames.map((n, i) => (
                    <span key={i} className="rp-chip">
                      {n}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Toggle panel */}
            {!readOnly && (
              <div className="justify-self-end">
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

          {/* Paneel met checkboxen (enkel wanneer geopend) */}
          {!readOnly && openAbsId === r.id && (
            <div className="rp-row">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium">Selecteer afwezigen</div>
                <button
                  className="text-xs underline text-gray-600"
                  onClick={() => clearAbsentees(r.id)}
                >
                  alles leegmaken
                </button>
              </div>
              <div className="rp-abs-grid">
                {people.length === 0 && (
                  <div className="rp-muted">Nog geen spelers voor deze show.</div>
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
            <span className="rp-muted">
              Compacte weergave • opslaan gebeurt automatisch
            </span>
          </div>
        )}

        {/* KOMENDE */}
        <div className="rp-section-title">Komende repetities</div>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border p-3 rp-muted">Geen komende repetities.</div>
        ) : (
          <div className="grid gap-2">{upcoming.map(Card)}</div>
        )}

        {/* VORIGE (onderaan, inklapbaar) */}
        <details className="mt-4">
          <summary className="cursor-pointer rounded-xl border px-3 py-2 bg-gray-50">
            Vorige repetities <span className="rp-muted">({past.length})</span>
          </summary>
          <div className="grid gap-2 mt-2">
            {past.length === 0 ? (
              <div className="rounded-xl border p-3 rp-muted">Geen vorige items.</div>
            ) : (
              past.map(Card)
            )}
          </div>
        </details>
      </div>
    );
  }

  window.RehearsalPlanner = RehearsalPlanner;
})();