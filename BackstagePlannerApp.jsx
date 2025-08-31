// GEEN: const { useEffect, useMemo, useState } = React;

const {
  uid,
  buildRunSheet,
  detectMicConflicts,
  detectCastConflicts,
  RunSheetView,
  PeopleAndResources,
  parseTimeToMin
} = window;

// ---------- Storage via Supabase (met lokale fallback) ----------
const TABLE = "planner_data";
const ROW_ID = 1;

const loadState = async () => {
  try {
    const { data, error } = await window.SUPA
      .from(TABLE)
      .select("data")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (error) throw error;
    return data?.data || null;
  } catch {
    try {
      const raw = localStorage.getItem("sll-backstage-v2");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
};

const saveStateRemote = async (state) => {
  try {
    await window.SUPA.from(TABLE).upsert({ id: ROW_ID, data: state });
  } catch {}
  try {
    localStorage.setItem("sll-backstage-v2", JSON.stringify(state));
  } catch {}
};

// ---- Helpers ----
const todayStr = () => new Date().toISOString().slice(0, 10);
const newEmptyShow = () => ({ id: uid(), name: "Nieuwe show", date: todayStr(), startTime: "19:30" });

// SHA-256 hash (voor wachtwoord)
async function hashText(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

function withDefaults(s = {}) {
  // Vast wachtwoord = "Appelsap123!"
  const FIXED_PW_HASH = "7aa45aa3ebf56136fbb2064bb0756d0cb29a472a7ab06c62f5ab8249c28749b5";
  return {
    people: Array.isArray(s.people) ? s.people : [],
    mics: Array.isArray(s.mics) ? s.mics : [],
    shows: Array.isArray(s.shows) && s.shows.length ? s.shows : [newEmptyShow()],
    sketches: Array.isArray(s.sketches) ? s.sketches : [],
    rehearsals: Array.isArray(s.rehearsals) ? s.rehearsals : [],
    prKit: Array.isArray(s.prKit) ? s.prKit : [],               // <<<<< NIEUW
    // app-instellingen
    settings: {
      ...(s.settings || {}),
      requirePassword: !!(s.settings?.requirePassword),
      appPasswordHash: s.settings?.appPasswordHash || FIXED_PW_HASH,
    },
  };
}


// ---------- ErrorBoundary voor tabs ----------
class TabErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={hasError:false, err:null}; }
  static getDerivedStateFromError(err){ return {hasError:true, err}; }
  componentDidCatch(err, info){ console.error("Tab crash:", err, info); }
  render(){
    if(this.state.hasError){
      return (
        <div className="rounded-xl border p-3 bg-red-50 text-red-700 text-sm">
          Deze pagina kon niet laden. Open de console voor details. Probeer te verversen.
        </div>
      );
    }
    return this.props.children;
  }
}

// ===== Password Gate (overlay) =====
function PasswordGate({ onUnlock }) {
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState("");

  const tryUnlock = async () => {
    setErr("");
    try {
      const h = await hashText(pw || "");
      const ok = await onUnlock(h);
      if (!ok) setErr("Onjuist wachtwoord.");
    } catch (e) {
      setErr("Er ging iets mis.");
    }
  };

  const onKey = (e) => { if (e.key === "Enter") tryUnlock(); };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
      <div className="w-[min(92vw,380px)] rounded-2xl border p-6 shadow-xl">
        <h1 className="text-xl font-bold mb-2">KnorPlanner</h1>
        <p className="text-sm text-gray-600 mb-4">Voer het wachtwoord in om de planner te openen.</p>
        <input
          type="password"
          className="w-full rounded border px-3 py-2 mb-2"
          placeholder="Wachtwoord"
          value={pw}
          onChange={(e)=>setPw(e.target.value)}
          onKeyDown={onKey}
        />
        {err && <div className="text-sm text-red-600 mb-2">{err}</div>}
        <button className="w-full rounded-md bg-black text-white px-3 py-2" onClick={tryUnlock}>Ontgrendel</button>
        <div className="mt-3 text-xs text-gray-500">
          Tip: Deel-links (bijv. repetitieschema) werken zonder wachtwoord.
        </div>
      </div>
    </div>
  );
}

// ---------- Root Component ----------
function App() {
  const boot = React.useMemo(() => withDefaults(), []);
  const [state, setState] = React.useState(boot);
  const [activeShowId, setActiveShowId] = React.useState(boot.shows[0]?.id || null);
  const [tab, setTab] = React.useState("planner");
  const [syncStatus, setSyncStatus] = React.useState("Nog niet gesynced");

  // ---- History (undo/redo) ----
  const [past, setPast] = React.useState([]);
  const [future, setFuture] = React.useState([]);
  const pushHistory = (prev) => setPast((p) => [...p.slice(-49), prev]);
  const applyState = (next) => { setState(next); setFuture([]); };
  const undo = () => { if (!past.length) return; const prev = past[past.length-1]; setPast(past.slice(0,-1)); setFuture((f)=>[state, ...f]); setState(prev); };
  const redo = () => { if (!future.length) return; const nxt = future[0]; setFuture(future.slice(1)); setPast((p)=>[...p, state]); setState(nxt); };

  // ---- Named versions ----
  const [versions, setVersions] = React.useState(() => { try { return JSON.parse(localStorage.getItem(`sll-backstage-v2:versions`)||"[]"); } catch { return []; } });
  const saveVersion = (name) => { const v = { id: uid(), name: name||`Versie ${new Date().toLocaleString()}`, ts: Date.now(), data: state }; const next = [...versions, v]; setVersions(next); localStorage.setItem(`sll-backstage-v2:versions`, JSON.stringify(next)); };
  const restoreVersion = (id) => { const v = versions.find((x)=>x.id===id); if (!v) return; pushHistory(state); applyState(v.data); };
  const deleteVersion = (id) => { const next = versions.filter((v)=>v.id!==id); setVersions(next); localStorage.setItem(`sll-backstage-v2:versions`, JSON.stringify(next)); };

  // Bij eerste keer laden
  React.useEffect(() => {
    (async () => {
      const remote = await loadState();
      const merged = withDefaults(remote || {});
      const firstShowId = merged.shows[0]?.id;

      const fix = (arr=[]) => arr.map(x => x && (x.showId ? x : { ...x, showId: firstShowId }));
      const migrated = {
        ...merged,
        sketches: fix(merged.sketches),
        people: fix(merged.people),
        mics: fix(merged.mics),
        rehearsals: fix(merged.rehearsals),
        prKit: fix(merged.prKit),               // <<<<< NIEUW
      };

      setState(migrated);
      setActiveShowId((prev) => {
        if (prev && migrated.shows.some(s => s.id === prev)) return prev;
        return migrated.shows[0]?.id || null;
      });
    })();
  }, []);

  // Opslaan bij elke wijziging
  React.useEffect(() => {
    const t = setTimeout(async () => {
      try {
        await saveStateRemote(state);
        setSyncStatus("✅ Gesynced om " + new Date().toLocaleTimeString());
      } catch {
        setSyncStatus("⚠️ Opslaan mislukt");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [state]);

  // ---- View link per tab ----
  React.useEffect(()=>{ const fromHash = new URLSearchParams((location.hash||'').replace('#','')).get('tab'); if (fromHash) setTab(fromHash); },[]);
  React.useEffect(()=>{ const sp = new URLSearchParams((location.hash||'').replace('#','')); sp.set('tab', tab); history.replaceState(null, '', `#${sp.toString()}`); },[tab]);

  // ====== SHARE PARAMS ======
  const shareTab = React.useMemo(() => {
    const p = new URLSearchParams((location.hash || "").replace("#",""));
    return p.get("share") || null;
  }, [location.hash]);

  // show-id uit de hash (= pinnen naar juiste show)
  const shareShowId = React.useMemo(() => {
    const p = new URLSearchParams((location.hash || "").replace("#",""));
    return p.get("show") || null;
  }, [location.hash]);

  const activeShow = React.useMemo(() => {
    const arr = state.shows || [];
    if (!arr.length) return null;
    // in share-modus: prefer show-id uit link; anders de lokale selectie
    const preferId = (shareTab && shareShowId) ? shareShowId : activeShowId;
    const found = preferId ? arr.find(s => s.id === preferId) : null;
    return found || arr[0] || null;
  }, [state.shows, activeShowId, shareTab, shareShowId]);

  // Filter per showId
  const showSketches = React.useMemo(() => {
    if (!activeShow) return [];
    const all = Array.isArray(state.sketches) ? state.sketches : [];
    return all.filter(sk => sk.showId === activeShow.id).sort((a,b)=>(a.order||0)-(b.order||0));
  }, [state.sketches, activeShow]);

  const showPeople = React.useMemo(() => {
    if (!activeShow) return [];
    return (state.people || []).filter(p => p.showId === activeShow.id);
  }, [state.people, activeShow]);

  const showMics = React.useMemo(() => {
    if (!activeShow) return [];
    return (state.mics || []).filter(m => m.showId === activeShow.id);
  }, [state.mics, activeShow]);

  const showRehearsals = React.useMemo(() => {
    if (!activeShow) return [];
    return (state.rehearsals || []).filter(r => r.showId === activeShow.id)
      .sort((a,b)=> String(a.date).localeCompare(String(b.date)));
  }, [state.rehearsals, activeShow]);

  const showPRKit = React.useMemo(() => {
    if (!activeShow) return [];
    return (state.prKit || [])
      .filter(i => i.showId === activeShow.id)
      .sort((a,b)=> String(a.dateStart || "").localeCompare(String(b.dateStart || "")));
  }, [state.prKit, activeShow]);
  
  const micById = Object.fromEntries(showMics.map((m) => [m.id, m]));
  const personById = Object.fromEntries(showPeople.map((p) => [p.id, p]));
  const runSheet = React.useMemo(() => activeShow ? buildRunSheet(activeShow, showSketches) : {items:[],totalMin:0}, [activeShow, showSketches]);
  const micWarnings = React.useMemo(() => detectMicConflicts(showSketches), [showSketches]);
  const castWarnings = React.useMemo(() => detectCastConflicts(showSketches), [showSketches]);

  // ---------- Rehearsal handlers ----------
  const addRehearsal = () => {
    if (!activeShow) return;
    pushHistory(state);
    setState((prev) => ({
      ...prev,
      rehearsals: [
        ...(prev.rehearsals || []),
        { id: uid(), showId: activeShow.id, date: todayStr(), location: "", comments: "", absentees: [], type: "Repetitie" }
      ]
    }));
  };
  const updateRehearsal = (id, updates) => {
    pushHistory(state);
    setState((prev) => ({
      ...prev,
      rehearsals: prev.rehearsals.map((r) => (r.id === id ? { ...r, ...updates } : r))
    }));
  };
  const removeRehearsal = (id) => {
    pushHistory(state);
    setState((prev) => ({
      ...prev,
      rehearsals: prev.rehearsals.filter((r) => r.id !== id)
    }));
  };

  // ---------- Sketch handlers ----------
  const updateSketch = (id, updates) => {
    pushHistory(state);
    setState((prev) => ({
      ...prev,
      sketches: prev.sketches.map((s) => (s.id === id ? { ...s, ...updates } : s))
    }));
  };

  // ---------- Show mutatie ----------
  const updateActiveShow = (patch) => {
    if (!activeShow) return;
    setState((prev) => ({
      ...prev,
      shows: (prev.shows || []).map((s) =>
        s.id === activeShow.id ? { ...s, ...patch } : s
      ),
    }));
  };

  // ---------- Show dupliceren (incl. alles onder die show) ----------
  const duplicateCurrentShow = () => {
    if (!activeShow) { alert("Geen actieve show om te dupliceren."); return; }

    if (!confirm(`Wil je “${activeShow.name}” dupliceren?\nAlles (spelers, sketches, repetities) wordt gekopieerd naar een nieuwe show.`)) {
      return;
    }

    const srcShowId = activeShow.id;
    const newShowId = uid();
    const newShow = {
      ...activeShow,
      id: newShowId,
      name: `${activeShow.name} (kopie)`,
    };

    pushHistory(state);
    setState((prev) => {
      // Spelers kopiëren
      const srcPeople = (prev.people || []).filter(p => p.showId === srcShowId);
      const idMap = {}; // oudPersoonId -> nieuwPersoonId
      const copiedPeople = srcPeople.map(p => {
        const npid = uid();
        idMap[p.id] = npid;
        return { ...p, id: npid, showId: newShowId };
      });

      // Sketches kopiëren
      const srcSketches = (prev.sketches || []).filter(sk => sk.showId === srcShowId);
      const copiedSketches = srcSketches.map(sk => {
        const newRoles = (sk.roles || []).map(r => ({
          ...r,
          personId: r.personId ? (idMap[r.personId] || "") : "",
        }));
        const newMicAssignments = {};
        const srcMA = sk.micAssignments || {};
        Object.keys(srcMA).forEach(ch => {
          const pid = srcMA[ch];
          newMicAssignments[ch] = pid ? (idMap[pid] || "") : "";
        });

        return {
          ...sk,
          id: uid(),
          showId: newShowId,
          roles: newRoles,
          micAssignments: newMicAssignments,
        };
      });

      // Repetities kopiëren
      const srcRehearsals = (prev.rehearsals || []).filter(r => r.showId === srcShowId);
      const copiedRehearsals = srcRehearsals.map(r => ({
        ...r,
        id: uid(),
        showId: newShowId,
      }));

      return {
        ...prev,
        shows: [...(prev.shows || []), newShow],
        people: [...(prev.people || []), ...copiedPeople],
        sketches: [...(prev.sketches || []), ...copiedSketches],
        rehearsals: [...(prev.rehearsals || []), ...copiedRehearsals],
      };
    });

    setActiveShowId(newShowId);
    alert("Show gedupliceerd. Je kijkt nu naar de kopie.");
  };

  // ====== PASSWORD LOCK (alleen voor hoofd-app, niet voor share) ======
  const [locked, setLocked] = React.useState(false);

  React.useEffect(() => {
    if (shareTab) { setLocked(false); return; } // share is altijd open
    const req = !!(state.settings?.requirePassword);
    if (!req) { setLocked(false); return; }
    const token = localStorage.getItem("knor:auth") || "";
    const ok = !!(token && state.settings?.appPasswordHash && token === state.settings.appPasswordHash);
    setLocked(!ok);
  }, [shareTab, state.settings]);

  const handleUnlock = async (hash) => {
    if (!state.settings?.appPasswordHash) return false;
    const ok = (hash === state.settings.appPasswordHash);
    if (ok) {
      localStorage.setItem("knor:auth", hash);
      setLocked(false);
    }
    return ok;
  };

  // VASTE LOCK-ACTIES: geen eigen wachtwoord kiezen; altijd "Appelsap123!"
  const lockNow = async () => {
    const FIXED_PW_HASH = "7aa45aa3ebf56136fbb2064bb0756d0cb29a472a7ab06c62f5ab8249c28749b5"; // "Appelsap123!"
    try { await saveStateRemote(state); } catch {}
    setState(prev => ({
      ...prev,
      settings: { ...(prev.settings||{}), requirePassword: true, appPasswordHash: FIXED_PW_HASH }
    }));
    localStorage.removeItem("knor:auth");
    setLocked(true);
    alert("Vergrendeld.");
  };

  const unlockThisDevice = () => {
    const h = state.settings?.appPasswordHash;
    if (!h) { alert("Er is nog geen wachtwoord ingesteld."); return; }
    localStorage.setItem("knor:auth", h);
    setLocked(false);
    alert("Dit apparaat is ontgrendeld.");
  };

  // Auto-lock na 10 minuten inactiviteit (niet op share-pagina's)
  React.useEffect(() => {
    if (shareTab) return;
    const RESET_MS = 10 * 60 * 1000; // 10 minuten
    let timer;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await lockNow(); // lockNow slaat eerst op
      }, RESET_MS);
    };

    const onEv = () => {
      if (!document.hidden) reset();
    };

    const events = ["mousemove","keydown","mousedown","touchstart","visibilitychange"];
    events.forEach(ev => window.addEventListener(ev, onEv, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach(ev => window.removeEventListener(ev, onEv));
    };
  }, [shareTab, state.settings?.appPasswordHash]); // lockNow is stabiel genoeg in deze context

  // ====== SHARE ROUTES ======

  // Agenda (read-only)
  if (shareTab === "rehearsals") {
    return (
      <div className="mx-auto max-w-6xl p-4 share-only">
        <h1 className="text-2xl font-bold mb-4">Repetitieschema (live)</h1>
        <RehearsalPlanner
          rehearsals={showRehearsals}
          people={showPeople}
          onAdd={()=>{}}
          onUpdate={()=>{}}
          onRemove={()=>{}}
        />
        <div className="text-sm text-gray-500 mt-6">
          Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.
        </div>
      </div>
    );
  }

  // Rolverdeling (read-only)
  if (shareTab === "rolverdeling") {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <h1 className="text-2xl font-bold mb-4">Rolverdeling (live)</h1>
        <RoleDistributionView
          currentShowId={activeShow?.id}
          sketches={showSketches}
          people={showPeople}
          setState={()=>{}}
        />
        <div className="text-sm text-gray-500 mt-6">
          Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.
        </div>
      </div>
    );
  }

  // PR-Kit (read-only)
  if (shareTab === "prkit") {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <h1 className="text-2xl font-bold mb-4">PR-Kit (live)</h1>
        <PRKitView
          items={showPRKit}
          showId={activeShow?.id}
          readOnly={true}
          onChange={()=>{}}
        />
        <div className="text-sm text-gray-500 mt-6">
          Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.
        </div>
      </div>
    );
  }

  // Programma (read-only)
  if (shareTab === "runsheet") {
    return (
      <div className="mx-auto max-w-6xl p-4 share-only">
        <h1 className="text-2xl font-bold mb-4">Programma (live)</h1>
        <RunSheetView runSheet={runSheet} show={activeShow} />
        <div className="text-sm text-gray-500 mt-6">
          Dit is een gedeelde link, alleen-lezen.
        </div>
      </div>
    );
  }

  // Microfoons (read-only)
  if (shareTab === "mics") {
    return (
      <div className="mx-auto max-w-6xl p-4 share-only">
        <h1 className="text-2xl font-bold mb-4">Microfoons (live)</h1>

        {/* forceer read-only gedrag binnen deze wrapper */}
        <style>{`
          .share-only select,
          .share-only input,
          .share-only button {
            pointer-events: none !important;
          }
        `}</style>

        <MicMatrixView
          currentShowId={activeShow?.id}
          sketches={showSketches}
          people={showPeople}
          shows={state.shows}
          setState={() => { /* no-op in share */ }}
        />
        <div className="text-sm text-gray-500 mt-6">
          Dit is een gedeelde link, alleen-lezen.
        </div>
      </div>
    );
  }

  // Sketches (read-only, alles onder elkaar) – zodat de link hieronder werkt
  if (shareTab === "scripts") {
    const nameFor = (pid) => {
      const p = personById[pid];
      if (!p) return "";
      const fn = (p.firstName || "").trim();
      const ln = (p.lastName || p.name || "").trim();
      return [fn, ln].filter(Boolean).join(" ");
    };

    const onlySketches = (showSketches || [])
      .filter(s => (s?.kind || "sketch") === "sketch")
      .sort((a,b) => (a.order||0) - (b.order||0));

    return (
      <div className="mx-auto max-w-6xl p-4 share-only">
        <h1 className="text-2xl font-bold mb-4">Sketches (live)</h1>

        <div className="space-y-8">
          {onlySketches.map((sk, i) => {
            const roles  = Array.isArray(sk.roles) ? sk.roles : [];
            const links  = (sk.links && typeof sk.links === "object") ? sk.links : {};
            const sounds = Array.isArray(sk.sounds) ? sk.sounds : [];
            const place  = sk.stagePlace === "voor" ? "Voor de gordijn" : "Podium";

            return (
              <section key={sk.id || i} className="rounded-xl border p-4">
                <h2 className="text-lg font-semibold">
                  {sk.title || "(zonder titel)"}{" "}
                  <span className="text-gray-500 font-normal">• {sk.durationMin || 0} min</span>
                </h2>

                <div className="mt-2 text-sm">
                  <div className="mb-2"><strong>Plek:</strong> {place}</div>

                  <div className="mb-3">
                    <strong>Rollen</strong>
                    {roles.length ? (
                      <table className="w-full border-collapse text-sm mt-1">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border px-2 py-1 text-left">Rolnaam</th>
                            <th className="border px-2 py-1 text-left">Cast</th>
                            <th className="border px-2 py-1 text-left">Mic?</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roles.map((r, idx) => (
                            <tr key={idx} className="odd:bg-gray-50">
                              <td className="border px-2 py-1">{r?.name || ""}</td>
                              <td className="border px-2 py-1">{nameFor(r?.personId)}</td>
                              <td className="border px-2 py-1">{r?.needsMic ? "Ja" : "Nee"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-gray-500">— Geen rollen —</div>
                    )}
                  </div>

                  <div className="mb-3">
                    <strong>Links</strong>
                    <div className="text-gray-700">
                      Tekst: {links?.text ? (
                        <a className="underline" href={links.text} target="_blank" rel="noopener noreferrer">{links.text}</a>
                      ) : <em className="text-gray-500">—</em>}
                    </div>
                    <div className="text-gray-700">
                      Licht/geluid: {links?.tech ? (
                        <a className="underline" href={links.tech} target="_blank" rel="noopener noreferrer">{links.tech}</a>
                      ) : <em className="text-gray-500">—</em>}
                    </div>
                  </div>

                  <div className="mb-3">
                    <strong>Geluiden & muziek</strong>
                    {sounds.length ? (
                      <table className="w-full border-collapse text-sm mt-1">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border px-2 py-1 text-left">Omschrijving</th>
                            <th className="border px-2 py-1 text-left">Link</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sounds.map((x, j) => (
                            <tr key={x.id || j} className="odd:bg-gray-50">
                              <td className="border px-2 py-1">{x.label || ""}</td>
                              <td className="border px-2 py-1">
                                {x.url ? (
                                  <a className="underline" href={x.url} target="_blank" rel="noopener noreferrer">{x.url}</a>
                                ) : <span className="text-gray-500">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-gray-500">—</div>
                    )}
                  </div>

                  <div>
                    <strong>Decor</strong>
                    <div>{sk.decor ? sk.decor : <span className="text-gray-500">—</span>}</div>
                  </div>
                </div>
              </section>
            );
          })}

          {!onlySketches.length && (
            <div className="text-sm text-gray-500">Geen sketches voor deze show.</div>
          )}
        </div>

        <div className="text-sm text-gray-500 mt-6">
          Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.
        </div>
      </div>
    );
  }

  // >>> NIEUW: DRAAIBOEK – publieke overzichtspagina met ALLE deel-links voor deze show
  if (shareTab === "draaiboek") {
    const base = `${location.origin}${location.pathname}`;
    const sid = activeShow?.id || "";
    const mk = (k) => `${base}#share=${k}&show=${sid}`;
    const showTitle = activeShow?.name || "Onbekende show";
    const pig = "https://cdn-icons-png.flaticon.com/512/616/616584.png";

    const links = [
      { key: "runsheet",     label: "Programma (live)" },
      { key: "mics",         label: "Microfoons (live)" },
      { key: "rehearsals",   label: "Agenda (live)" },
      { key: "rolverdeling", label: "Rolverdeling (live)" },
      { key: "scripts",      label: "Sketches (live)" },
      { key: "prkit",        label: "PR-Kit (live)" },
    ];

    return (
      <div className="mx-auto max-w-3xl md:max-w-5xl p-4">
        <div className="flex items-center gap-3 mb-2">
          <img src={pig} alt="" className="w-7 h-7 md:w-9 md:h-9" aria-hidden="true" />
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Draaiboek: {showTitle}
          </h1>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Beste artiesten en medewerkers,<br />
          hieronder vind je alle links die nodig zijn voor deze show.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          {links.map(({key,label}) => (
            <a
              key={key}
              href={mk(key)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border p-3 hover:shadow transition"
              title={`${label} openen in nieuw tabblad`}
            >
              <img src={pig} alt="" className="w-5 h-5 opacity-70 group-hover:opacity-100" aria-hidden="true" />
              <div className="font-medium">{label}</div>
              <span className="ml-auto text-xs text-gray-500 group-hover:underline">open</span>
            </a>
          ))}
        </div>

        <div className="text-xs text-gray-500 mt-6">
          Deze pagina is openbaar en alleen-lezen. Elk item opent in een nieuw tabblad.
        </div>
      </div>
    );
  }

  // Toon wachtwoord-poort als vergrendeld
  if (locked) {
    return <PasswordGate onUnlock={handleUnlock} />;
  }

  // ====== NORMALE APP ======
  return (
    <div className="mx-auto max-w-7xl p-4">
      {/* Topbar (sticky) */}
     <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur brand-header">
  <div className="mx-auto max-w-7xl px-4">
    <div className="h-14 flex items-center gap-3">
      {/* BRAND: logo + titel (neemt alleen eigen breedte) */}
      <div className="brand flex items-center gap-2 flex-none">
        <img
          src="https://cdn-icons-png.flaticon.com/512/616/616584.png"
          alt=""
          className="brand-logo w-7 h-7 md:w-8 md:h-8"
          aria-hidden="true"
        />
        <div className="brand-title font-extrabold tracking-wide">KnorPlanner</div>
      </div>

      {/* MENU: krijgt ALLE resterende ruimte */}
      <nav className="flex gap-2 overflow-x-auto flex-1">
        {[
          { key: "planner",       label: "Voorstellingen" },
          { key: "runsheet",      label: "Programma" },
          { key: "cast",          label: "Biggenconvent" },
          { key: "mics",          label: "Microfoons" },
          { key: "rolverdeling",  label: "Rolverdeling" },
          { key: "scripts",       label: "Sketches" },
          { key: "rehearsals",    label: "Agenda" },
          { key: "prkit",         label: "PR-Kit" },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`rounded-full px-4 py-2 text-sm transition ${
              tab === key ? "bg-black text-white shadow" : "bg-gray-100 hover:bg-gray-200"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Extra: subtiel logo rechts (alleen op md+) */}
      <div className="hidden md:flex items-center gap-2 flex-none">
        <img
          src="https://cdn-icons-png.flaticon.com/512/616/616584.png"
          alt=""
          className="w-6 h-6 opacity-70"
          aria-hidden="true"
        />
      </div>
    </div>
  </div>
</header>


      {/* Sync status */}
      <div className="text-xs text-gray-500 mt-1">{syncStatus}</div>

      <main className="mt-6">
        {tab === "runsheet" && (
          <div className="grid gap-4">
            {/* Begintijd instellen */}
            <div className="rounded-2xl border p-3 flex items-center gap-3">
              <label className="text-sm text-gray-700">Begintijd</label>
              <input
                type="time"
                className="rounded border px-2 py-1"
                value={activeShow?.startTime || "19:30"}
                onChange={(e) => updateActiveShow({ startTime: e.target.value })}
              />
              <span className="text-xs text-gray-500">
                Wordt gebruikt om tijden in de runsheet te berekenen.
              </span>
            </div>

            {(micWarnings?.length>0 || castWarnings?.length>0) && (
              <div className="rounded-xl border p-3">
                <div className="font-semibold mb-2">Waarschuwingen</div>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {micWarnings.map((w,i)=> <li key={`mw-${i}`}>Mic conflict: kanaal <b>{w.channelId}</b> van “{w.from}” naar “{w.to}”.</li>)}
                  {castWarnings.map((w,i)=> <li key={`cw-${i}`}>Snel wisselen voor speler <b>{personById[w.personId]?.name||w.personId}</b> van “{w.from}” naar “{w.to}”.</li>)}
                </ul>
              </div>
            )}

            <RunSheetView runSheet={runSheet} show={activeShow} />
          </div>
        )}

        {tab === "cast" && (
          <TabErrorBoundary>
            <CastMatrixView
              sketches={showSketches}
              people={showPeople}
              currentShowId={activeShow?.id}
              setState={(fn) => { pushHistory(state); setState(fn(state)); }}
            />
          </TabErrorBoundary>
        )}

        {tab === "mics" && (
          <TabErrorBoundary>
            <MicMatrixView
              currentShowId={activeShow?.id}
              sketches={showSketches}
              people={showPeople}
              shows={state.shows}
              setState={(fn) => { pushHistory(state); setState(fn(state)); }}
            />
          </TabErrorBoundary>
        )}

        {tab === "rolverdeling" && (
          <TabErrorBoundary>
            <RoleDistributionView
              currentShowId={activeShow?.id}
              sketches={showSketches}
              people={showPeople}
              setState={(fn) => { pushHistory(state); setState(fn(state)); }}
            />
          </TabErrorBoundary>
        )}

        {tab === "rehearsals" && (
          <RehearsalPlanner
            rehearsals={showRehearsals}
            people={showPeople}
            onAdd={addRehearsal}
            onUpdate={updateRehearsal}
            onRemove={removeRehearsal}
          />
        )}

        {tab === "scripts" && (
          <TabErrorBoundary>
            <ScriptsView
              sketches={showSketches}
              people={showPeople}
              onUpdate={updateSketch}
            />
          </TabErrorBoundary>
        )}

        {tab === "planner" && (
          <PlannerMinimal
            state={state}
            setState={(fn)=>{ pushHistory(state); setState(fn(state)); }}
            activeShowId={activeShowId}
            setActiveShowId={setActiveShowId}
            onDuplicateShow={duplicateCurrentShow}
          />
        )}

        {tab === "prkit" && (
          <TabErrorBoundary>
            <PRKitView
              items={showPRKit}
              showId={activeShow?.id}
              onChange={(itemsForShow) => {
                pushHistory(state);
                setState((prev) => {
                  const currentShowId = activeShow?.id;
                  if (!currentShowId) return prev;
                  const others = (prev.prKit || []).filter(x => x.showId !== currentShowId);
                  const normalized = (itemsForShow || []).map(x => ({ ...x, showId: currentShowId }));
                  return { ...prev, prKit: [...others, ...normalized] };
                });
              }}
            />
          </TabErrorBoundary>
        )}
      </main>

      {/* Floating tools bottom-left */}
      <div className="fixed left-4 bottom-4 z-50">
        <details className="group w-[min(92vw,380px)]">
          <summary className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-black text-white px-4 py-2 shadow-lg select-none">
            <img src="https://cdn-icons-png.flaticon.com/512/616/616584.png" alt="" className="w-4 h-4" aria-hidden="true" />
            Hulpmiddelen
            <span className="text-xs opacity-80">{syncStatus}</span>
          </summary>

          <div className="mt-2 rounded-xl border bg-white/95 backdrop-blur p-3 shadow-xl space-y-3">
            <div className="flex gap-2 flex-wrap">
              <button className="rounded-full border px-3 py-1 text-sm" onClick={undo}>Undo</button>
              <button className="rounded-full border px-3 py-1 text-sm" onClick={redo}>Redo</button>
              <button
                className="rounded-full border px-3 py-1 text-sm"
                onClick={()=>{ const n = prompt('Naam voor versie:','Snapshot'); if(n!==null) saveVersion(n); }}
              >
                Save version
              </button>
              <button
                className="rounded-full border px-3 py-1 text-sm"
                onClick={()=>{ navigator.clipboard?.writeText(location.href); }}
              >
                Kopieer link
              </button>
            </div>

            <div className="text-xs text-gray-600">
              Sync: <span className="font-medium">{syncStatus}</span>
            </div>

            <div className="rounded-lg border p-2">
              <div className="font-semibold text-sm mb-1">Versies</div>
              <ul className="space-y-1 text-sm max-h-48 overflow-auto pr-1">
                {versions.map(v=> (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {v.name} <span className="text-gray-500">({new Date(v.ts).toLocaleString()})</span>
                    </span>
                    <span className="flex gap-2 shrink-0">
                      <button className="rounded-full border px-2 py-0.5" onClick={()=>restoreVersion(v.id)}>Herstel</button>
                      <button className="rounded-full border px-2 py-0.5" onClick={()=>deleteVersion(v.id)}>Del</button>
                    </span>
                  </li>
                ))}
                {versions.length===0 && <li className="text-gray-500">Nog geen versies.</li>}
              </ul>
            </div>

            {/* Deel-links */}
            <div className="rounded-lg border p-2 space-y-2">
              <div className="font-semibold text-sm">Deel links (alleen-lezen)</div>

              {/* >>> Opvallende 'deel alles' knop */}
              <button
                className="inline-flex items-center gap-2 rounded-full bg-black text-white px-4 py-1.5 text-sm shadow hover:opacity-90"
                onClick={()=>{
                  const url = `${location.origin}${location.pathname}#share=draaiboek&show=${activeShow?.id || ""}`;
                  navigator.clipboard?.writeText(url);
                  alert("Gekopieerd:\n" + url);
                }}
                title="Draaiboek (alle links) kopiëren"
              >
                <img src="https://cdn-icons-png.flaticon.com/512/616/616584.png" alt="" className="w-4 h-4" aria-hidden="true" />
                Draaiboek (alle links)
              </button>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  className="rounded-full border px-3 py-1 text-sm"
                  onClick={()=>{
                    const url = `${location.origin}${location.pathname}#share=runsheet&show=${activeShow?.id || ""}`;
                    navigator.clipboard?.writeText(url);
                    alert("Gekopieerd:\n" + url);
                  }}
                >
                  Programma
                </button>

                <button
                  className="rounded-full border px-3 py-1 text-sm"
                  onClick={()=>{
                    const url = `${location.origin}${location.pathname}#share=mics&show=${activeShow?.id || ""}`;
                    navigator.clipboard?.writeText(url);
                    alert("Gekopieerd:\n" + url);
                  }}
                >
                  Microfoons
                </button>

                <button
                  className="rounded-full border px-3 py-1 text-sm"
                  onClick={()=>{
                    const url = `${location.origin}${location.pathname}#share=rehearsals&show=${activeShow?.id || ""}`;
                    navigator.clipboard?.writeText(url);
                    alert("Gekopieerd:\n" + url);
                  }}
                >
                  Agenda
                </button>

                <button
                  className="rounded-full border px-3 py-1 text-sm"
                  onClick={()=>{
                    const url = `${location.origin}${location.pathname}#share=rolverdeling&show=${activeShow?.id || ""}`;
                    navigator.clipboard?.writeText(url);
                    alert("Gekopieerd:\n" + url);
                  }}
                >
                  Rolverdeling
                </button>

                <button
                  className="rounded-full border px-3 py-1 text-sm"
                  onClick={()=>{
                    const url = `${location.origin}${location.pathname}#share=prkit&show=${activeShow?.id || ""}`;
                    navigator.clipboard?.writeText(url);
                    alert("Gekopieerd:\n" + url);
                  }}
                >
                  PR-Kit
                </button>

                <button
                  className="rounded-full border px-3 py-1 text-sm"
                  onClick={()=>{
                    const url = `${location.origin}${location.pathname}#share=scripts&show=${activeShow?.id || ""}`;
                    navigator.clipboard?.writeText(url);
                    alert("Gekopieerd:\n" + url);
                  }}
                >
                  Sketches
                </button>
              </div>
            </div>

            {/* Beveiliging */}
            <div className="rounded-lg border p-2 space-y-2">
              <div className="font-semibold text-sm">Beveiliging</div>
              <div className="text-xs text-gray-600">
                Status: {state.settings?.requirePassword ? "Aan" : "Uit"} • Wachtwoord: <b>Appelsap123!</b>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full border px-3 py-1 text-sm" onClick={lockNow}>
                  Vergrendel nu
                </button>
                <button className="rounded-full border px-3 py-1 text-sm" onClick={unlockThisDevice}>
                  Ontgrendel dit apparaat
                </button>
              </div>
              <div className="text-[11px] text-gray-500">
                Deel-links blijven werken zonder wachtwoord. Na 10 minuten inactiviteit wordt de app automatisch vergrendeld (we slaan eerst op).
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

// expose naar window zodat index.html kan mounten
window.BackstagePlannerApp = App;
