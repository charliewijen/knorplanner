// RehearsalPlanner.jsx — compact, NL-weekdag zonder verspringen,
// live updates die NIET terugstuiteren, “Vandaag” telt als komend.
(function () {
  const { useEffect, useMemo, useRef, useState } = React;

  /* -------------------- keuzelijsten -------------------- */
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

  /* -------------------- helpers -------------------- */
  const fmtWeekdayNL = (dateStr) => {
    try {
      if (!dateStr) return "—";
      const d = new Date(`${dateStr}T12:00:00`);
      return new Intl.DateTimeFormat("nl-NL", { weekday: "long" }).format(d);
    } catch { return "—"; }
  };
  const toDayTs = (dateStr) => {
    if (!dateStr) return 0;
    return new Date(`${dateStr}T00:00:00`).getTime();
  };
  const startOfToday = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  const fullName = (p) => {
    if (!p) return "";
    const fn = (p.firstName || "").trim();
    const ln = (p.lastName || p.name || "").trim();
    return [fn, ln].filter(Boolean).join(" ") || (p.name || "");
  };
  const isOneOf = (val, arr) => arr.some(o => String(o).toLowerCase() === String(val||"").toLowerCase());

  /* -------------------- component -------------------- */
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

    /* ---------- styling ---------- */
    const css = `
      .rp-wrap{position:relative}
      .rp-card{padding:10px;border-radius:12px;background:#fff;border:1px solid #e5e7eb}
      .rp-card.required{background:#fff7ed;border-color:#f59e0b;box-shadow:0 0 0 2px #fde68a inset}
      .rp-label{font-size:11px;color:#6b7280;margin-bottom:2px;line-height:1}
      .rp-sub{font-size:12px;color:#111827;font-weight:700;text-transform:capitalize}
      .rp-ctrl{height:36px;padding:6px 8px;line-height:1.15;font-size:14px}
      .rp-note{min-height:36px;padding:6px 8px;font-size:14px;line-height:1.2}
      .rp-chip{display:inline-flex;align-items:center;font-size:12px;border:1px solid #e5e7eb;border-radius:9999px;padding:2px 8px;margin:2px;background:#f9fafb;white-space:nowrap}
      .rp-chip-abs{font-size:13px;font-weight:700;color:#991b1b;background:#fee2e2;border-color:#ef4444}
      .rp-muted{font-size:12px;color:#6b7280}
      .rp-actions .btn-del{border:1px solid #dc2626;background:#dc2626;color:#fff;border-radius:9999px;padding:6px 12px;font-size:12px}
      .rp-actions .btn{border:1px solid #d1d5db;background:#f3f4f6;border-radius:9999px;padding:6px 12px;font-size:12px}
      .rp-badge-req{font-size:11px;font-weight:800;color:#7c2d12;background:#ffedd5;border:1px solid #fdba74;border-radius:9999px;padding:3px 8px;white-space:nowrap}

      /* R1: grid met 2 rijen -> weekdag in rij 2; overal een pad zodat niks 'zakt' */
      .rp-top{display:grid;gap:8px;align-items:end;
        grid-template-columns:160px 110px 1fr 220px 220px auto;
        grid-auto-rows:auto}
      .rp-week{grid-column:1/2;align-self:start;margin-top:-2px}
      .rp-pad{height:18px} /* zelfde hoogte als weekregel */
      @media(min-width:768px) and (max-width:1200px){
        .rp-top{grid-template-columns:150px 110px 1fr 200px 200px auto}
      }
      @media(max-width:767px){
        .rp-top{grid-template-columns:1fr 1fr;align-items:end}
        .rp-location{grid-column:1 / -1}
        .rp-type{grid-column:1 / 2}
        .rp-req{grid-column:2 / 3;justify-self:end}
        .rp-actions{grid-column:2 / 3;justify-self:end}
        .rp-pad{display:block}
      }

      .rp-row{display:grid;gap:8px;align-items:end;margin-top:8px}
      @media(min-width:768px){ .rp-row{grid-template-columns:1fr 1fr auto} }
      @media(max-width:767px){
        .rp-row{grid-template-columns:1fr 1fr}
        .rp-row .rp-edit{grid-column:1 / -1;justify-self:end}
      }

      input[type="date"].rp-ctrl, input[type="time"].rp-ctrl{appearance:none;-webkit-appearance:none;height:36px}
      input[type="date"]::-webkit-datetime-edit,
      input[type="time"]::-webkit-datetime-edit{padding:0}
    `;

    /* ---------- lokale drafts (overschrijven NIET elke render) ---------- */
    const [drafts, setDrafts] = useState(() => {
      const o = {};
      (rehearsals || []).forEach((r) => (o[r.id] = { ...r }));
      return o;
    });

    // Sync: voeg nieuwe/weggehaalde items bij, maar overschrijf bestaande velden NIET.
    useEffect(() => {
      setDrafts((prev) => {
        const next = { ...prev };
        const ids = new Set(rehearsals.map(r => r.id));
        // add missing
        rehearsals.forEach(r => {
          if (!next[r.id]) next[r.id] = { ...r };
        });
        // remove deleted
        Object.keys(next).forEach(id => { if (!ids.has(id)) delete next[id]; });
        return next;
      });
    }, [rehearsals]);

    // commit helpers
    const timersRef = useRef({});
    const commitNow = (id) => {
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
    const commitDebounced = (id, ms = 300) => {
      clearTimeout(timersRef.current[id]);
      timersRef.current[id] = setTimeout(() => commitNow(id), ms);
    };

    const setField = (id, field, value, immediate = false) => {
      setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
      if (!readOnly) immediate ? commitNow(id) : commitDebounced(id);
    };

    /* ---------- afwezig ---------- */
    const [openAbsId, setOpenAbsId] = useState(null);
    const toggleAbsentee = (id, personId) => {
      const cur = drafts[id]?.absentees || [];
      const has = cur.includes(personId);
      const next = has ? cur.filter((x) => x !== personId) : [...cur, personId];
      setField(id, "absentees", next, true);
    };
    const clearAbsentees = (id) => setField(id, "absentees", [], true);

    /* ---------- sortering / splitsing ---------- */
    const sortedAll = useMemo(() => {
      const arr = [...(rehearsals || [])];
      arr.sort(
        (a, b) =>
          toDayTs(a.date) - toDayTs(b.date) ||
          String(a.id).localeCompare(String(b.id))
      );
      return arr;
    }, [rehearsals]);
    const upcoming = useMemo(() => sortedAll.filter((r) => toDayTs(r.date) >= startOfToday), [sortedAll]);
    const past     = useMemo(() => sortedAll.filter((r) => toDayTs(r.date) <  startOfToday).reverse(), [sortedAll]);

    /* ---------- kaart ---------- */
    const Card = (r) => {
      const d = drafts[r.id] || r;
      const weekday = fmtWeekdayNL(d.date);

      const locValue  = isOneOf(d.location, LOCATION_OPTIONS) ? d.location : "__other__";
      const typeValue = isOneOf(d.type, TYPE_OPTIONS)         ? d.type     : "__otherType__";

      return (
        <div key={r.id} className={`rp-card ${d.requiredPresent ? "required" : ""}`}>
          {/* R1 (inputs) + R2 (weekdag + pads) */}
          <div className="rp-top">
            <div className="rp-date">
              <div className="rp-label">Datum</div>
              <input
                type="date"
                className="w-full rounded border rp-ctrl"
                value={d.date || ""}
                onChange={(e) => setField(r.id, "date", e.target.value, true)}
                disabled={readOnly}
              />
            </div>

            <div>
              <div className="rp-label">Tijd</div>
              <input
                type="time"
                className="w-full rounded border rp-ctrl"
                value={d.time || ""}
                onChange={(e) => setField(r.id, "time", e.target.value, true)}
                disabled={readOnly}
              />
            </div>

            <div className="rp-location">
              <div className="rp-label">Locatie</div>
              <select
                className="w-full rounded border rp-ctrl"
                value={locValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__other__") {
                    if (isOneOf(d.location, LOCATION_OPTIONS))
                      setField(r.id, "location", "Anders: Zie comments", true);
                  } else {
                    setField(r.id, "location", v, true);
                  }
                }}
                disabled={readOnly}
              >
                {LOCATION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                <option value="__other__">Anders (vrije tekst)</option>
              </select>
            </div>

            <div className="rp-type">
              <div className="rp-label">Type</div>
              <select
                className="w-full rounded border rp-ctrl"
                value={typeValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__otherType__") {
                    if (isOneOf(d.type, TYPE_OPTIONS))
                      setField(r.id, "type", "Anders: zie comments", true);
                  } else {
                    setField(r.id, "type", v, true);
                  }
                }}
                disabled={readOnly}
              >
                {TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                <option value="__otherType__">Anders (vrije tekst)</option>
              </select>
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
              {d.requiredPresent && <span className="rp-badge-req">Aanwezigheid vereist!</span>}
            </div>

            {!readOnly && (
              <div className="rp-actions" style={{justifySelf:'end'}}>
                <button className="btn-del" onClick={() => onRemove && onRemove(r.id)}>
                  Verwijder
                </button>
              </div>
            )}

            {/* Rij 2: weekdag + pads zodat niets verspringt */}
            <div className="rp-week rp-sub">{weekday}</div>
            <div className="rp-pad"></div>
            <div className="rp-pad"></div>
            <div className="rp-pad"></div>
            <div className="rp-pad"></div>
            <div className="rp-pad"></div>
          </div>

          {/* R3: notities + afwezig */}
          <div className="rp-row">
            <div>
              <div className="rp-label">Notities</div>
              <textarea
                rows={1}
                className="w-full rounded border rp-note"
                placeholder="Korte notitie…"
                value={d.comments || ""}
                onChange={(e) => setField(r.id, "comments", e.target.value, false)}
                onBlur={() => commitNow(r.id)}
                disabled={readOnly}
              />
            </div>

            <div>
              <div className="rp-label">Afwezig</div>
              <div className="truncate">
                {!(d.absentees||[]).length ? <span className="rp-chip">—</span> :
                  (d.absentees||[]).map(pid => {
                    const p = people.find(x => x.id === pid);
                    if (!p) return null;
                    return <span key={pid} className="rp-chip rp-chip-abs">{fullName(p)}</span>;
                  })
                }
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
                  const checked = (drafts[r.id]?.absentees || []).includes(p.id);
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
        {upcoming.length === 0 ? (
          <div className="rounded-xl border p-3 rp-muted">Geen komende repetities.</div>
        ) : (
          <div className="grid gap-2">{upcoming.map(Card)}</div>
        )}

        <details className="mt-3" open>
          <summary className="cursor-pointer rounded-xl border px-3 py-2 bg-gray-50">
            Vorige repetities <span className="rp-muted">({past.length})</span>
          </summary>
          <div className="grid gap-2 mt-2">
            {past.length ? past.map(Card) : <div className="rounded-xl border p-3 rp-muted">Geen vorige items.</div>}
          </div>
        </details>
      </div>
    );
  }

  window.RehearsalPlanner = RehearsalPlanner;
})();
