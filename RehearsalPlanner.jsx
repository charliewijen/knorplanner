// RehearsalPlanner.jsx — compact, NL-weekdag, presets voor locatie/type,
// "VERPLICHT AANWEZIG", en rood/large afwezig-chips. Werkt ook readOnly (share).
(function () {
  const { useEffect, useMemo, useRef, useState } = React;

  /* ---------- constanten ---------- */
  const LOCATION_OPTIONS = [
    "Grote zaal - Buurthuis",
    "Biljartruimte - Buurthuis",
    "Dartruimte - Buurthuis",
    "Vergaderzaal - Buurthuis",
    "Anders: Zie comments",
  ];
  const TYPE_OPTIONS = [
    "Lees Repetitie",
    "Reguliere Repetitie",
    "Generale Repetitie",
    "Voorstelling",
    "Artiestendag",
    "Bonte Avond Dag",
    "BBQ",
    "Anders: zie comments",
  ];

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
  const isOneOf = (val, arr) => arr.some(o => String(o).toLowerCase() === String(val||"").toLowerCase());

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

    /* ---------- compacte CSS & accenten ---------- */
    const css = `
      .rp-wrap{position:relative;z-index:0}
      .rp-card{padding:10px;border-radius:12px;background:#fff;border:1px solid #e5e7eb}
      .rp-card.required{background:#fff7ed;border-color:#f59e0b;box-shadow:0 0 0 2px #fde68a inset}
      .rp-label{font-size:11px;color:#6b7280;margin-bottom:2px;line-height:1}
      .rp-sub{font-size:12px;color:#111827;font-weight:600;text-transform:capitalize;margin-top:4px;min-height:16px}
      .rp-ctrl{height:36px;padding:6px 8px;line-height:1.15;font-size:14px}
      .rp-note{min-height:36px;padding:6px 8px;font-size:14px;line-height:1.2}
      .rp-chip{display:inline-flex;align-items:center;font-size:12px;border:1px solid #e5e7eb;border-radius:9999px;padding:2px 8px;margin:2px;background:#f9fafb;white-space:nowrap}
      .rp-chip-abs{font-size:13px;font-weight:700;color:#991b1b;background:#fee2e2;border-color:#ef4444}
      .rp-muted{font-size:12px;color:#6b7280}
      .rp-actions .btn-del{border:1px solid #dc2626;background:#dc2626;color:#fff;border-radius:9999px;padding:6px 12px;font-size:12px}
      .rp-actions .btn{border:1px solid #d1d5db;background:#f3f4f6;border-radius:9999px;padding:6px 12px;font-size:12px}
      .rp-badge-req{font-size:11px;font-weight:800;color:#7c2d12;background:#ffedd5;border:1px solid #fdba74;border-radius:9999px;padding:3px 8px;white-space:nowrap}

      /* Grid: rij 1 onderkanten uitlijnen om verspringen te voorkomen */
      .rp-top{display:grid;gap:8px;align-items:end}
      @media(min-width:1024px){
        .rp-top{grid-template-columns:160px 110px 1fr 200px 170px auto}
      }
      @media(min-width:768px) and (max-width:1023px){
        .rp-top{grid-template-columns:150px 110px 1fr 200px 170px}
      }
      @media(max-width:767px){
        .rp-top{grid-template-columns:1fr 1fr}
        .rp-location{grid-column:1 / -1}
        .rp-type{grid-column:1 / 2}
        .rp-req{grid-column:2 / 3;justify-self:end}
      }

      .rp-row{display:grid;gap:8px;align-items:end;margin-top:8px}
      @media(min-width:768px){
        .rp-row{grid-template-columns:1fr 1fr auto}
      }
      @media(max-width:767px){
        .rp-row{grid-template-columns:1fr 1fr}
        .rp-row .rp-edit{grid-column:1 / -1;justify-self:end}
      }

      /* iOS date/time kleiner houden */
      input[type="date"].rp-ctrl, input[type="time"].rp-ctrl{appearance:none;-webkit-appearance:none;height:36px}
      input[type="date"]::-webkit-datetime-edit,
      input[type="time"]::-webkit-datetime-edit{padding:0}
    `;

    /* ---------- drafts + debounce (smooth, geen focusverlies) ---------- */
    const [drafts, setDrafts] = useState(() => {
      const o = {};
      (rehearsals || []).forEach((r) => (o[r.id] = { requiredPresent:false, ...r }));
      return o;
    });
    useEffect(() => {
      setDrafts((prev) => {
        const next = { ...prev };
        const ids = new Set(rehearsals.map((r) => r.id));
        rehearsals.forEach((r) => {
          next[r.id] = { requiredPresent:false, ...next[r.id], ...r };
        });
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
        requiredPresent: !!d.requiredPresent,
      });
    };
    const scheduleCommit = (id, ms = 250) => {
      clearTimeout(timersRef.current[id]);
      timersRef.current[id] = setTimeout(() => commit(id), ms);
    };
    const setField = (id, field, value, instant = false) => {
      setDrafts((prev) => {
        const base = prev[id] ?? rehearsals.find((r) => r.id === id) ?? {};
        return { ...prev, [id]: { requiredPresent:false, ...base, [field]: value } };
      });
      if (!readOnly) instant ? commit(id) : scheduleCommit(id);
    };

    /* ---------- afwezig ---------- */
    const [openAbsId, setOpenAbsId] = useState(null);
    const toggleAbsentee = (id, personId) => {
      const cur = drafts[id]?.absentees || [];
      const has = cur.includes(personId);
      const next = has ? cur.filter((x) => x !== personId) : [...cur, personId];
      setField(id, "absentees", next);
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

      // Locatie: kies preset als exact match, anders "__other__"
      const locValue = isOneOf(d.location, LOCATION_OPTIONS) ? d.location : "__other__";
      const onLocChange = (val) => {
        if (val === "__other__") {
          // Als het voorheen een preset was, zet expliciet op "Anders: Zie comments"
          if (isOneOf(d.location, LOCATION_OPTIONS)) {
            setField(r.id, "location", "Anders: Zie comments", true);
          } // anders behouden we de vrije tekst die er al stond
        } else {
          setField(r.id, "location", val);
        }
      };

      // Type
      const typeValue = isOneOf(d.type, TYPE_OPTIONS) ? d.type : "__otherType__";
      const onTypeChange = (val) => {
        if (val === "__otherType__") {
          if (isOneOf(d.type, TYPE_OPTIONS)) setField(r.id, "type", "Anders: zie comments", true);
        } else {
          setField(r.id, "type", val);
        }
      };

      const absNames = (d.absentees || [])
        .map((id) => people.find((x) => x.id === id))
        .filter(Boolean)
        .map(fullName);
      const hasAbs = absNames.length > 0;

      return (
        <div key={r.id} className={`rp-card ${d.requiredPresent ? "required" : ""}`}>
          {/* R1 */}
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
              <select
                className="w-full rounded border rp-ctrl"
                value={locValue}
                onChange={(e) => onLocChange(e.target.value)}
                onBlur={() => commit(r.id)}
                disabled={readOnly}
              >
                {LOCATION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                <option value="__other__">Anders (vrije tekst)</option>
              </select>
              {locValue === "__other__" && d.location && !isOneOf(d.location, LOCATION_OPTIONS) && (
                <div className="rp-muted" style={{marginTop:4}}>
                  Vrije tekst: <span style={{fontWeight:600}}>{d.location}</span>
                </div>
              )}
            </div>

            <div className="rp-type">
              <div className="rp-label">Type</div>
              <select
                className="w-full rounded border rp-ctrl"
                value={typeValue}
                onChange={(e) => onTypeChange(e.target.value)}
                onBlur={() => commit(r.id)}
                disabled={readOnly}
              >
                {TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                <option value="__otherType__">Anders (vrije tekst)</option>
              </select>
              {typeValue === "__otherType__" && d.type && !isOneOf(d.type, TYPE_OPTIONS) && (
                <div className="rp-muted" style={{marginTop:4}}>
                  Vrije tekst type: <span style={{fontWeight:600}}>{d.type}</span>
                </div>
              )}
            </div>

            <div className="rp-req" style={{display:'flex',gap:8,alignItems:'center',justifySelf:'start'}}>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border"
                  checked={!!d.requiredPresent}
                  onChange={(e)=> setField(r.id, "requiredPresent", !!e.target.checked, true)}
                  disabled={readOnly}
                />
                <span style={{fontSize:12,fontWeight:700}}>VERPLICHT AANWEZIG</span>
              </label>
              {d.requiredPresent && <span className="rp-badge-req">Let op: aanwezigheid vereist</span>}
            </div>

            {!readOnly && (
              <div className="rp-actions" style={{justifySelf:'end'}}>
                <button className="btn-del" onClick={() => onRemove && onRemove(r.id)}>
                  Verwijder
                </button>
              </div>
            )}
          </div>

          {/* R2 */}
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
                  <span key={i} className="rp-chip rp-chip-abs">{n}</span>
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

          {/* Afwezig-panel */}
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
            <span className="rp-muted">Compact • automatische opslag • NL-weekdag</span>
          </div>
        )}

        <div className="text-base font-semibold mb-1">Komende repetities</div>
        {useMemo(()=>upcoming, [upcoming]).length === 0 ? (
          <div className="rounded-xl border p-3 rp-muted">Geen komende repetities.</div>
        ) : (
          <div className="grid gap-2">{upcoming.map(Card)}</div>
        )}

        <details className="mt-3" open>
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
