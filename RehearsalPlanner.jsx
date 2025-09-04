// RehearsalPlanner.jsx — compact, NL-weekdag, stabiele sortering, 
// correcte opslag (geen “laatste wijziging mist”), en modaal voor nieuw item.
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
  const toISO = (dateStr) => {
    const s = String(dateStr || "").trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;               // YYYY-MM-DD
    const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);             // DD-MM-YYYY
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    const m2 = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);          // YYYY/MM/DD
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    try {
      const d = new Date(s);
      if (!isNaN(d)) {
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${mm}-${dd}`;
      }
    } catch {}
    return s;
  };

  // Converteer allerlei invoer naar "HH:MM" (24h). Laat lege waarden leeg.
  const normTime = (str) => {
    let s = (str === null || str === undefined ? "" : str).toString().trim();
    if (!s) return "";
    s = s.replace(/[.,;]/g, ":");           // 20.30 → 20:30, 20;30 → 20:30

    if (s.includes(":")) {
      const [hRaw, mRaw = "0"] = s.split(":");
      let h = parseInt(hRaw, 10);
      let m = parseInt(mRaw, 10);
      if (!Number.isFinite(h)) h = 0;
      if (!Number.isFinite(m)) m = 0;
      h = Math.min(23, Math.max(0, h));
      m = Math.min(59, Math.max(0, m));
      return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    }

    // Alleen cijfers? Neem laatste 2 als minuten (2035 → 20:35, 8 → 08:00)
    const digits = s.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length <= 2) {
      let h = parseInt(digits, 10);
      if (!Number.isFinite(h)) h = 0;
      h = Math.min(23, Math.max(0, h));
      return `${String(h).padStart(2,"0")}:00`;
    }
    let h = parseInt(digits.slice(0, -2), 10);
    let m = parseInt(digits.slice(-2), 10);
    if (!Number.isFinite(h)) h = 0;
    if (!Number.isFinite(m)) m = 0;
    h = Math.min(23, Math.max(0, h));
    m = Math.min(59, Math.max(0, m));
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  };

  const fmtWeekdayNL = (dateStr) => {
    try {
      const iso = toISO(dateStr);
      if (!iso) return "—";
      const d = new Date(`${iso}T12:00:00`);
      return new Intl.DateTimeFormat("nl-NL", { weekday: "long" }).format(d);
    } catch { return "—"; }
  };

  const toDayTs = (dateStr) => {
    const iso = toISO(dateStr);
    if (!iso) return 0;
    return new Date(`${iso}T00:00:00`).getTime();
  };

  const timeToMin = (timeStr) => {
    const s = normTime(timeStr);
    if (!s) return 24 * 60 + 59;
    const [h, m] = s.split(":").map((n) => parseInt(n, 10));
    return h * 60 + m;
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
      (typeof roProp !== "undefined" && roProp !== null)
        ? roProp
        : (typeof location !== "undefined" && (location.hash || "").includes("share="));

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

      /* R1: grid met 2 rijen -> weekdag in rij 2; pads voorkomen verspringen */
      .rp-top{display:grid;gap:8px;align-items:end;
        grid-template-columns:160px 110px 1fr 220px 220px auto;
        grid-auto-rows:auto}
      .rp-week{grid-column:1/2;align-self:start;margin-top:-2px}
      .rp-pad{height:18px}
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

      /* Modal */
      .rp-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;z-index:10000}
      .rp-modal{width:min(92vw,720px);background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.15)}
      .rp-modal-h{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #eee}
      .rp-modal-b{padding:12px 14px}
      .rp-modal-f{display:flex;gap:8px;justify-content:flex-end;padding:12px 14px;border-top:1px solid #eee}
      .btn{border:1px solid #d1d5db;background:#f3f4f6;border-radius:9999px;padding:6px 12px;font-size:14px}
      .btn-primary{background:#111827;color:#fff;border-color:#111827}
    `;

    /* ---------- lokale drafts ---------- */
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
        rehearsals.forEach(r => { if (!next[r.id]) next[r.id] = { ...r }; });
        Object.keys(next).forEach(id => { if (!ids.has(id)) delete next[id]; });
        return next;
      });
    }, [rehearsals]);

    /* ---------- commit helpers (nooit met “oude” state committen) ---------- */
    const timersRef = useRef({});

    const baseOf = (raw) => ({
      date: toISO(raw.date) || "",
      time: normTime(raw.time) || "",
      location: raw.location || "",
      comments: raw.comments || "",
      absentees: Array.isArray(raw.absentees) ? raw.absentees : [],
      type: raw.type || "",
      requiredPresent: !!raw.requiredPresent,
    });

    const commitFrom = (id, obj) => {
      if (readOnly || !onUpdate) return;
      onUpdate(id, baseOf(obj));
    };

    const commitDebounced = (id, obj, ms = 300) => {
      clearTimeout(timersRef.current[id]);
      timersRef.current[id] = setTimeout(() => commitFrom(id, obj), ms);
    };

    // Altijd commiten met de NIEUWE draft (die we in dezelfde setState berekenen)
    const setField = (id, field, value, immediate = false) => {
      setDrafts(prev => {
        const cur = prev[id] || {};
        const next = { ...cur, [field]: value };
        const all = { ...prev, [id]: next };

        if (!readOnly) {
          // tijd niet debounced opslaan tijdens typen
          if (field === "time" && !immediate) {
            // alleen lokaal bufferen; commit volgt op blur
          } else {
            (immediate ? commitFrom : commitDebounced)(id, next);
          }
        }
        return all;
      });
    };

    /* ---------- afwezig ---------- */
    const [openAbsId, setOpenAbsId] = useState(null);
    const toggleAbsentee = (id, personId) => {
      setDrafts(prev => {
        const cur = prev[id] || {};
        const list = Array.isArray(cur.absentees) ? cur.absentees : [];
        const nextAbs = list.includes(personId) ? list.filter(x => x !== personId) : [...list, personId];
        const next = { ...cur, absentees: nextAbs };
        const all = { ...prev, [id]: next };
        commitFrom(id, next);  // direct en juist
        return all;
      });
    };
    const clearAbsentees = (id) => {
      setDrafts(prev => {
        const cur = prev[id] || {};
        const next = { ...cur, absentees: [] };
        const all = { ...prev, [id]: next };
        commitFrom(id, next);
        return all;
      });
    };

    /* ---------- sortering / splitsing ---------- */
    const sortedAll = useMemo(() => {
      const arr = [...(rehearsals || [])];
      arr.sort((a, b) => {
        const da = toDayTs(a.date), db = toDayTs(b.date);
        if (da !== db) return da - db;             // eerst dag
        const ta = timeToMin(a.time), tb = timeToMin(b.time);
        if (ta !== tb) return ta - tb;             // dan tijd
        return String(a.id).localeCompare(String(b.id));
      });
      return arr;
    }, [rehearsals]);

    const upcoming = useMemo(() => sortedAll.filter(r => toDayTs(r.date) >= startOfToday), [sortedAll]);
    const past     = useMemo(() => sortedAll.filter(r => toDayTs(r.date) <  startOfToday).reverse(), [sortedAll]);

    /* ---------- Nieuw item pop-up ---------- */
    const [addOpen, setAddOpen] = useState(false);
    const [newDraft, setNewDraft] = useState(() => {
      const todayISO = new Date().toISOString().slice(0, 10);
      return {
        date: todayISO,
        time: "19:00",
        location: LOCATION_OPTIONS[0],
        type: "Reguliere Repetitie",
        comments: "",
        requiredPresent: false,
      };
    });

    const pendingCreateRef = useRef(null);

    // Als onAdd géén ID teruggeeft: detecteer het nieuw aangemaakte item
    useEffect(() => {
      const pending = pendingCreateRef.current;
      if (!pending) return;
      const nowIds = new Set(rehearsals.map(r => r.id));
      const newId = [...nowIds].find(id => !pending.prevIds.has(id));
      if (newId) {
        onUpdate && onUpdate(newId, { ...baseOf(pending.payload), absentees: [] });
        setDrafts(prev => ({ ...prev, [newId]: { ...(prev[newId] || {}), ...baseOf(pending.payload), absentees: [] } }));
        pendingCreateRef.current = null;
      }
    }, [rehearsals, onUpdate]);

    const openAdd = () => {
      setNewDraft(d => ({ ...d, date: new Date().toISOString().slice(0,10) }));
      setAddOpen(true);
    };

    const createFromModal = () => {
      const payload = baseOf(newDraft);
      if (!onAdd) { setAddOpen(false); return; }

      const prevIds = new Set(rehearsals.map(r => r.id));
      let returnedId = null;
      try { returnedId = onAdd(payload); } catch {}

      if (typeof returnedId === "string" && returnedId) {
        onUpdate && onUpdate(returnedId, { ...payload, absentees: [] });
        setDrafts(prev => ({ ...prev, [returnedId]: { ...(prev[returnedId] || {}), ...payload, absentees: [] } }));
      } else {
        pendingCreateRef.current = { prevIds, payload };
      }
      setAddOpen(false);
    };

    /* ---------- kaart ---------- */
    const Card = (r) => {
      const d = drafts[r.id] || r;
      const weekday = fmtWeekdayNL(d.date);

      const locationInList = isOneOf(d.location, LOCATION_OPTIONS);
      const typeInList     = isOneOf(d.type, TYPE_OPTIONS);

      return (
        <div key={r.id} className={`rp-card ${d.requiredPresent ? "required" : ""}`}>
          {/* R1 (inputs) + R2 (weekdag + pads) */}
          <div className="rp-top">
            <div className="rp-date">
              <div className="rp-label">Datum</div>
              <input
                type="date"
                className="w-full rounded border rp-ctrl"
                value={toISO(d.date) || ""}
                onChange={(e) => setField(r.id, "date", toISO(e.target.value), true)}
                disabled={readOnly}
              />
            </div>

            <div>
              <div className="rp-label">Tijd</div>
              <input
                type="time"
                className="w-full rounded border rp-ctrl"
                value={d.time || ""}
                onChange={(e) => setField(r.id, "time", e.target.value, false)}          // lokaal bufferen
                onBlur={(e) => setField(r.id, "time", normTime(e.target.value), true)}   // normaliseren + committen
                disabled={readOnly}
              />
            </div>

            <div className="rp-location">
              <div className="rp-label">Locatie</div>
              {locationInList ? (
                <select
                  className="w-full rounded border rp-ctrl"
                  value={d.location || LOCATION_OPTIONS[0]}
                  onChange={(e) => setField(r.id, "location", e.target.value, true)}
                  disabled={readOnly}
                >
                  {LOCATION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  className="w-full rounded border rp-ctrl"
                  placeholder="Locatie (vrije tekst)…"
                  value={d.location || ""}
                  onChange={(e) => setField(r.id, "location", e.target.value, false)}
                  onBlur={(e) => setField(r.id, "location", (e.target.value || ""), true)}
                  disabled={readOnly}
                />
              )}
            </div>

            <div className="rp-type">
              <div className="rp-label">Type</div>
              {typeInList ? (
                <select
                  className="w-full rounded border rp-ctrl"
                  value={d.type || TYPE_OPTIONS[1]}
                  onChange={(e) => setField(r.id, "type", e.target.value, true)}
                  disabled={readOnly}
                >
                  {TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  className="w-full rounded border rp-ctrl"
                  placeholder="Type (vrije tekst)…"
                  value={d.type || ""}
                  onChange={(e) => setField(r.id, "type", e.target.value, false)}
                  onBlur={(e) => setField(r.id, "type", (e.target.value || ""), true)}
                  disabled={readOnly}
                />
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
              {d.requiredPresent && <span className="rp-badge-req">Aanwezigheid<br/>vereist!</span>}
            </div>

            {!readOnly && (
              <div className="rp-actions" style={{justifySelf:'end'}}>
                <button className="btn-del" onClick={() => onRemove && onRemove(r.id)}>Verwijder</button>
              </div>
            )}

            {/* Rij 2: weekdag + pads zodat niets verspringt */}
            <div className="rp-week rp-sub">{weekday}</div>
            <div className="rp-pad"></div><div className="rp-pad"></div><div className="rp-pad"></div><div className="rp-pad"></div><div className="rp-pad"></div>
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
                onBlur={(e) => setField(r.id, "comments", (e.target.value || ""), true)}
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
                <button className="btn" onClick={() => setOpenAbsId(cur => cur === r.id ? null : r.id)}>
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
                <button className="rp-muted underline" onClick={() => clearAbsentees(r.id)}>alles leegmaken</button>
              </div>
              <div style={{display:'grid',gap:'6px',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))'}}>
                {people.length === 0 && <div className="rp-muted">Geen spelers voor deze show.</div>}
                {people.map(p => {
                  const checked = (drafts[r.id]?.absentees || []).includes(p.id);
                  return (
                    <label key={p.id} className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" className="rounded border" checked={checked} onChange={() => toggleAbsentee(r.id, p.id)} />
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
            <button className="rounded-full border px-3 py-1 text-sm bg-black text-white" onClick={openAdd}>
              + Repetitie toevoegen
            </button>
            <span className="rp-muted">Compact • automatische opslag • NL-weekdag</span>
          </div>
        )}

        {/* Nieuw item modal */}
        {addOpen && !readOnly && (
          <div className="rp-modal-back" onClick={(e)=>{ if(e.target===e.currentTarget) setAddOpen(false); }}>
            <div className="rp-modal" role="dialog" aria-modal="true">
              <div className="rp-modal-h">
                <div className="font-semibold">Nieuwe repetitie</div>
                <button className="btn" onClick={()=>setAddOpen(false)}>Sluiten</button>
              </div>
              <div className="rp-modal-b">
                <div className="rp-top" style={{gridTemplateColumns:"160px 110px 1fr 220px auto"}}>
                  <div>
                    <div className="rp-label">Datum</div>
                    <input type="date" className="w-full rounded border rp-ctrl"
                      value={toISO(newDraft.date)}
                      onChange={(e)=> setNewDraft(d=>({...d, date: toISO(e.target.value)}))} />
                  </div>
                  <div>
                    <div className="rp-label">Tijd</div>
                    <input type="time" className="w-full rounded border rp-ctrl"
                      value={newDraft.time}
                      onChange={(e)=> setNewDraft(d=>({...d, time: e.target.value}))}
                      onBlur={(e)=> setNewDraft(d=>({...d, time: normTime(e.target.value)}))} />
                  </div>
                  <div className="rp-location">
                    <div className="rp-label">Locatie</div>
                    <select className="w-full rounded border rp-ctrl"
                      value={isOneOf(newDraft.location, LOCATION_OPTIONS) ? newDraft.location : LOCATION_OPTIONS[0]}
                      onChange={(e)=> setNewDraft(d=>({...d, location: e.target.value}))}>
                      {LOCATION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div className="rp-type">
                    <div className="rp-label">Type</div>
                    <select className="w-full rounded border rp-ctrl"
                      value={isOneOf(newDraft.type, TYPE_OPTIONS) ? newDraft.type : "Reguliere Repetitie"}
                      onChange={(e)=> setNewDraft(d=>({...d, type: e.target.value}))}>
                      {TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div className="rp-req" style={{display:'flex',alignItems:'center',gap:8}}>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" className="rounded border"
                        checked={!!newDraft.requiredPresent}
                        onChange={(e)=> setNewDraft(d=>({...d, requiredPresent: !!e.target.checked}))} />
                      <span style={{fontSize:12,fontWeight:700}}>VERPLICHT AANWEZIG</span>
                    </label>
                  </div>

                  <div className="rp-week rp-sub">{fmtWeekdayNL(newDraft.date)}</div>
                  <div className="rp-pad"></div><div className="rp-pad"></div><div className="rp-pad"></div><div className="rp-pad"></div>
                </div>

                <div className="rp-row" style={{gridTemplateColumns:"1fr"}}>
                  <div>
                    <div className="rp-label">Notities</div>
                    <textarea rows={2} className="w-full rounded border rp-note" placeholder="Korte notitie…"
                      value={newDraft.comments}
                      onChange={(e)=> setNewDraft(d=>({...d, comments: e.target.value}))} />
                  </div>
                </div>
              </div>
              <div className="rp-modal-f">
                <button className="btn" onClick={()=>setAddOpen(false)}>Annuleren</button>
                <button className="btn btn-primary" onClick={createFromModal}>Klaar</button>
              </div>
            </div>
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

  // Zorg dat BackstagePlannerApp.jsx je component vindt
  window.RehearsalPlanner = RehearsalPlanner;
})();
