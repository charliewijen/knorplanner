function PlannerMinimal({ state, setState, activeShowId, setActiveShowId, onDuplicateShow }) {
  const activeShow = state.shows.find((s) => s.id === activeShowId) || state.shows[0];

  // Alle items (sketches + pauzes + waerse) voor deze show
  const showItems = (state.sketches || [])
    .filter((s) => s.showId === activeShow?.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const nextOrder = () => (showItems.length || 0) + 1;

  // --- Helpers: renummeren zodat order altijd 1..N is ---
  const renumber = (items) => items.map((it, idx) => ({ ...it, order: idx + 1 }));

  // ---------- Tijd-helpers (voor blokken) ----------
  const parseStartToMin = () => {
    const t = String(activeShow?.startTime || "19:30");
    const [hh, mm] = t.split(":").map((x) => parseInt(x, 10));
    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm;
    return 19 * 60 + 30;
  };
  const mmToHHMM = (m) => {
    let hh = Math.floor((m % (24 * 60)) / 60);
    if (hh < 0) hh += 24;
    let mm = Math.floor(Math.abs(m) % 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  // Segments bouwen: blokken (non-break aaneengesloten) + losse pauzes als aparte segmenten
  const startMin = parseStartToMin();
  const totalMin = showItems.reduce((acc, it) => acc + (parseInt(it.durationMin || 0, 10) || 0), 0);

  const segments = (() => {
    const segs = [];
    let currentBlock = [];

    const flushBlock = () => {
      if (currentBlock.length === 0) return;
      const duration = currentBlock.reduce((sum, it) => sum + (parseInt(it.durationMin || 0, 10) || 0), 0);
      segs.push({ type: "block", items: currentBlock.slice(), count: currentBlock.length, durationMin: duration });
      currentBlock = [];
    };

    for (const it of showItems) {
      const kind = String(it?.kind || "sketch").toLowerCase();
      const isBreak = kind === "break";
      if (isBreak) {
        // Sluit blok af, voeg pauze-segment toe
        flushBlock();
        segs.push({
          type: "pause",
          title: "Pauze",
          item: it,
          durationMin: parseInt(it.durationMin || 0, 10) || 0,
        });
      } else {
        // Sketch of waerse telt mee in het blok
        currentBlock.push(it);
      }
    }
    // Laatste blok flushen
    flushBlock();
    return segs;
  })();

  // Start/End tijden op de time-line projecteren
  let cursor = startMin;
  const timedSegments = segments.map((seg, i) => {
    const start = cursor;
    const end = cursor + (seg.durationMin || 0);
    cursor = end;
    if (seg.type === "block") {
      return {
        ...seg,
        label: `Blok ${i + 1 - segments.slice(0, i).filter(s => s.type === "pause").length}`,
        startMin: start,
        endMin: end,
        startStr: mmToHHMM(start),
        endStr: mmToHHMM(end),
      };
    }
    // pause
    return {
      ...seg,
      label: seg.title || "Pauze",
      startMin: start,
      endMin: end,
      startStr: mmToHHMM(start),
      endStr: mmToHHMM(end),
    };
  });

  // ---------- Items toevoegen ----------
  const addSketch = () => {
    if (!activeShow) return;
    setState((prev) => {
      const newItem = {
        id: uid(),
        showId: activeShow.id,
        kind: "sketch",
        title: "Nieuwe sketch",
        order: nextOrder(),
        durationMin: 5,
        script: "",
        performers: [],
        mics: [],
        roles: [],
        props: [],
        costumes: [],
        attachments: [],
      };
      const combined = [...(prev.sketches || []), newItem]
        .filter((x) => x.showId === activeShow.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      const merged = [
        ...((prev.sketches || []).filter((x) => x.showId !== activeShow.id)),
        ...renumber(combined),
      ];
      return { ...prev, sketches: merged };
    });
  };

  const addPause = () => {
    if (!activeShow) return;
    setState((prev) => {
      const newItem = {
        id: uid(),
        showId: activeShow.id,
        kind: "break",
        title: "PAUZE",
        order: nextOrder(),
        durationMin: 10,
        performers: [],
        mics: [],
      };
      const combined = [...(prev.sketches || []), newItem]
        .filter((x) => x.showId === activeShow.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      const merged = [
        ...((prev.sketches || []).filter((x) => x.showId !== activeShow.id)),
        ...renumber(combined),
      ];
      return { ...prev, sketches: merged };
    });
  };

  // NIEUW: "De Waerse Ku-j"
  const addWaerse = () => {
    if (!activeShow) return;
    setState((prev) => {
      const newItem = {
        id: uid(),
        showId: activeShow.id,
        kind: "waerse",
        title: "De Waerse Ku-j",
        order: nextOrder(),
        durationMin: 5,
        performers: [],
        mics: [],
      };
      const combined = [...(prev.sketches || []), newItem]
        .filter((x) => x.showId === activeShow.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      const merged = [
        ...((prev.sketches || []).filter((x) => x.showId !== activeShow.id)),
        ...renumber(combined),
      ];
      return { ...prev, sketches: merged };
    });
  };

  // ---------- Item wijzigen/verwijderen ----------
  const updateItem = (id, patch) =>
    setState((prev) => {
      // patch kan order wijzigen; daarna altijd renumber op de subset van deze show
      let nextAll = (prev.sketches || []).map((sk) => (sk.id === id ? { ...sk, ...patch } : sk));
      const currentShowSet = nextAll
        .filter((x) => x.showId === activeShow.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      // Als order direct met nummer is aangepast: clamp en herordenen
      if (patch && typeof patch.order === "number") {
        const target = currentShowSet.find((x) => x.id === id);
        if (target) {
          const max = currentShowSet.length;
          let desired = Math.max(1, Math.min(max, patch.order | 0));
          // haal item eruit en steek 'm op gewenste plek
          const without = currentShowSet.filter((x) => x.id !== id);
          const before = without.slice(0, desired - 1);
          const after = without.slice(desired - 1);
          const reordered = renumber([...before, target, ...after]);
          // vervang de subset in het geheel
          nextAll = [
            ...nextAll.filter((x) => x.showId !== activeShow.id),
            ...reordered,
          ];
          return { ...prev, sketches: nextAll };
        }
      }

      // Geen expliciete orderwijziging: toch renumber om 1..N te houden
      const merged = [
        ...nextAll.filter((x) => x.showId !== activeShow.id),
        ...renumber(
          nextAll
            .filter((x) => x.showId === activeShow.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
        ),
      ];
      return { ...prev, sketches: merged };
    });

  const removeItem = (id) =>
    setState((prev) => {
      const nextAll = (prev.sketches || []).filter((sk) => sk.id !== id);
      const merged = [
        ...nextAll.filter((x) => x.showId !== activeShow.id),
        ...renumber(
          nextAll
            .filter((x) => x.showId === activeShow.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
        ),
      ];
      return { ...prev, sketches: merged };
    });

  // ---------- Drag & Drop (HTML5) ----------
  const [dragId, setDragId] = React.useState(null);

  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDrop = (e, overId) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;

    setState((prev) => {
      const list = (prev.sketches || [])
        .filter((x) => x.showId === activeShow.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      const dragIdx = list.findIndex((x) => x.id === dragId);
      const overIdx = list.findIndex((x) => x.id === overId);
      if (dragIdx < 0 || overIdx < 0) return prev;

      const item = list[dragIdx];
      const without = list.filter((x) => x.id !== dragId);
      const before = without.slice(0, overIdx);
      const after = without.slice(overIdx);
      const reordered = renumber([...before, item, ...after]);

      const merged = [
        ...((prev.sketches || []).filter((x) => x.showId !== activeShow.id)),
        ...reordered,
      ];
      return { ...prev, sketches: merged };
    });

    setDragId(null);
  };

  // ---------- Shows (naam/edit/delete) ----------
  const addShow = () => {
    const newId = uid();
    const newShow = {
      id: newId,
      name: "Nieuwe show",
    };
    setState((prev) => ({
      ...prev,
      shows: [...prev.shows, newShow],
    }));
    setActiveShowId(newId);
  };

  const updateShow = (patch) =>
    setState((prev) => ({
      ...prev,
      shows: prev.shows.map((s) => (s.id === activeShow.id ? { ...s, ...patch } : s)),
    }));

  const removeShow = () => {
    if (!activeShow) return;
    if (state.shows.length <= 1) return; // minimaal 1 show houden
    const ok = confirm(
      `Weet je zeker dat je de show “${activeShow.name || "zonder naam"}” wilt verwijderen?\n` +
      `Alle bijbehorende data (sketches/cast/mics/repetities) wordt ook verwijderd.`
    );
    if (!ok) return;

    setState((prev) => {
      const restShows = prev.shows.filter((s) => s.id !== activeShow.id);
      const keepByShow = (arr = []) => arr.filter((x) => x.showId !== activeShow.id);
      const next = {
        ...prev,
        shows: restShows,
        sketches: keepByShow(prev.sketches),
        people: keepByShow(prev.people),
        mics: keepByShow(prev.mics),
        rehearsals: keepByShow(prev.rehearsals),
      };
      const newActive = restShows[0]?.id || null;
      setActiveShowId(newActive);
      return next;
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Show selector + beheer */}
      <section className="rounded-2xl border p-4">
        <h3 className="mb-2 font-semibold">Voorstelling</h3>

        <div className="flex items-center gap-2">
          <select
            className="rounded border px-3 py-2 w-full"
            value={activeShow?.id}
            onChange={(e) => setActiveShowId(e.target.value)}
          >
            {state.shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || "Zonder naam"}
              </option>
            ))}
          </select>

          {/* NIEUW: Dupliceer show-knop naast de select */}
          <button
            className="rounded-xl border px-3 py-2"
            onClick={() => onDuplicateShow && onDuplicateShow()}
            title="Maak een kopie van de huidige show (incl. spelers, sketches & repetities)"
          >
            Dupliceer show
          </button>
        </div>

        {activeShow && (
          <div className="mt-3 space-y-2">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Naam</label>
              <input
                className="w-full rounded border px-2 py-1"
                value={activeShow.name || ""}
                onChange={(e) => updateShow({ name: e.target.value })}
                placeholder="Naam van de show"
              />
            </div>
          </div>
        )}
      </section>

      {/* Items (sketches + pauzes + waerse) */}
      <section className="md:col-span-2 rounded-2xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Programma</h3>
          <div className="flex gap-2">
            <button className="rounded-xl border px-3 py-2" onClick={addSketch} disabled={!activeShow}>
              + Sketch
            </button>
            <button className="rounded-xl border px-3 py-2" onClick={addPause} disabled={!activeShow}>
              + Pauze
            </button>
            <button className="rounded-xl border px-3 py-2" onClick={addWaerse} disabled={!activeShow}>
              + De Waerse Ku-j
            </button>
          </div>
        </div>

        {/* Tijdsoverzicht: Start • Totale tijd • Blokken + Pauzes met tijden */}
        <div className="mb-3 rounded-xl border p-3 bg-white/60">
          <div className="text-sm text-gray-700">
            <b>Start:</b> {mmToHHMM(startMin)} • <b>Totale tijd:</b> {totalMin} min
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {timedSegments.map((seg, i) => (
              <span
                key={i}
                className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
                  seg.type === "pause"
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-gray-50"
                }`}
                title={
                  seg.type === "pause"
                    ? `Pauze • ${seg.durationMin} min • ${seg.startStr}–${seg.endStr}`
                    : `${seg.label} • ${seg.count} items • ${seg.durationMin} min • ${seg.startStr}–${seg.endStr}`
                }
              >
                {seg.type === "pause" ? (
                  <>Pauze: {seg.durationMin} min • {seg.startStr}–{seg.endStr}</>
                ) : (
                  <>
                    {seg.label}: {seg.count} {seg.count === 1 ? "item" : "items"} • {seg.durationMin} min • {seg.startStr}–{seg.endStr}
                  </>
                )}
              </span>
            ))}
            {timedSegments.length === 0 && (
              <span className="text-xs text-gray-500">Nog geen blokken.</span>
            )}
          </div>
        </div>

        <ul className="space-y-2">
          {showItems.map((it) => {
            const isBreak = it.kind === "break";
            const isWaerse = it.kind === "waerse";
            const fixedTitle = isBreak ? "PAUZE" : isWaerse ? "De Waerse Ku-j" : null;

            return (
              <li
                key={it.id}
                className="rounded-xl bg-gray-50 p-3 flex items-center gap-2"
                draggable
                onDragStart={(e) => onDragStart(e, it.id)}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, it.id)}
                title="Sleep om te herordenen"
              >
                {/* Volgorde (1..N) */}
                <input
                  className="w-16 rounded border px-2 py-1"
                  type="number"
                  value={it.order || 1}
                  onChange={(e) =>
                    updateItem(it.id, { order: parseInt(e.target.value || 1, 10) })
                  }
                  title="Volgorde (1..N)"
                />

                {/* Titel: alleen editbaar voor sketches; pauze/waerse vaste naam */}
                {fixedTitle ? (
                  <span className={`px-2 py-1 rounded font-semibold ${
                    isBreak ? "bg-yellow-100 text-yellow-800" : "bg-pink-100 text-pink-800"
                  }`}>
                    {fixedTitle}
                  </span>
                ) : (
                  <input
                    className="flex-1 rounded border px-2 py-1"
                    value={it.title || ""}
                    onChange={(e) => updateItem(it.id, { title: e.target.value })}
                    placeholder="Titel van sketch"
                  />
                )}

                {/* Duur in minuten */}
                <input
                  className="w-24 rounded border px-2 py-1"
                  type="number"
                  value={it.durationMin || 0}
                  onChange={(e) =>
                    updateItem(it.id, {
                      durationMin: parseInt(e.target.value || 0, 10),
                    })
                  }
                  title="Duur (min)"
                />

                {/* Verwijder */}
                <button className="rounded-full border px-3 py-1" onClick={() => removeItem(it.id)}>
                  x
                </button>
              </li>
            );
          })}
          {showItems.length === 0 && (
            <li className="text-sm text-gray-500">Nog geen items.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
