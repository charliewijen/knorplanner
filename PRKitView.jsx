// PRKitView.jsx  — no imports/exports; globaal registreren op window

// ---- Vaste preview-afbeeldingen per type ----
const PR_IMG_PLACEHOLDER =
  "https://media.istockphoto.com/id/1147544807/vector/thumbnail-image-vector-graphic.jpg?s=612x612&w=0&k=20&c=rnCKVbdxqkjlcs3xH87-9gocETqpspHFXu5dIGB4wuM=";
const PR_VIDEO_THUMB =
  "https://knetic.org.uk/wp-content/uploads/2020/07/Video-Placeholder.png";
const PR_ARTICLE_THUMB =
  "https://nbhc.ca/sites/default/files/styles/article/public/default_images/news-default-image%402x_0.png?itok=B4jML1jF";

// ---- Utils ----
const prIsHttpUrl = (v) => /^https?:\/\//i.test((v || "").trim());
const prIsImgUrl  = (v) => /\.(png|jpe?g|gif|webp|svg)$/i.test((v || "").trim());
const prGenId     = () => (window.uid ? window.uid() : Math.random().toString(36).slice(2,10));

function prPreviewSrc(item) {
  if (item.type === "video")   return PR_VIDEO_THUMB;    // altijd vast
  if (item.type === "article") return PR_ARTICLE_THUMB;  // altijd vast
  // afbeelding/poster
  if (prIsImgUrl(item.link))   return item.link;
  return PR_IMG_PLACEHOLDER;
}

function prLabelDate({ dateStart, dateEnd }) {
  if (!dateStart && !dateEnd) return "—";
  if (dateStart && !dateEnd)   return dateStart;
  if (!dateStart && dateEnd)   return dateEnd;
  return `${dateStart} – ${dateEnd}`;
}

function PRKitView({ items = [], onChange = () => {}, showId }) {
  const addItem = (type) => {
    const blank = {
      id: prGenId(),
      type,               // "image" | "article" | "video"
      name: "",
      link: "",
      textLink: "",       // alleen voor article
      photosLink: "",     // alleen voor article
      dateStart: "",
      dateEnd: "",
      isRange: false,     // << nieuw: standaard "Enkele dag"
      showId: showId || null
    };
    onChange([blank, ...(items || [])]);
  };

  const patchItem  = (id, p) => onChange((items || []).map(it => it.id === id ? { ...it, ...p } : it));
  const removeItem = (id)     => onChange((items || []).filter(it => it.id !== id));

  // sorteer op startdatum (leeg = onderaan)
  const sorted = [...(items || [])].sort((a,b) =>
    String(a?.dateStart || "9999-12-31").localeCompare(String(b?.dateStart || "9999-12-31"))
  );

  return (
    <section className="rounded-2xl border p-4 bg-white">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">PR-Kit</h2>
          <div className="text-xs text-gray-600">Voeg posters/afbeeldingen, interviews/artikelen of video’s toe voor het PR-team.</div>
        </div>
        <div className="flex gap-2">
          <button className="rounded-full border px-3 py-2" onClick={() => addItem("image")}>+ Afbeelding/Poster</button>
          <button className="rounded-full border px-3 py-2" onClick={() => addItem("article")}>+ Interview/Artikel</button>
          <button className="rounded-full border px-3 py-2" onClick={() => addItem("video")}>+ Video</button>
        </div>
      </div>

      <div className="grid gap-3">
        {sorted.map((it) => (
          <div
            key={it.id}
            className={`pr-card rounded-2xl border p-3 grid gap-3 items-start
                        md:grid-cols-[160px,1fr,minmax(260px,1fr)] ${it.type}`}
          >
            {/* Preview */}
            <div className="rounded-xl overflow-hidden bg-gray-100 border">
              <img
                src={prPreviewSrc(it)}
                alt="preview"
                className="block w-full h-[120px] object-cover"
                onError={(e)=>{ e.currentTarget.src = PR_IMG_PLACEHOLDER; }}
              />
            </div>

            {/* Meta + datum */}
            <div className="space-y-3 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium tag-${it.type}`}>
                  {it.type === "image" ? "Afbeelding/Poster" : it.type === "article" ? "Interview/Artikel" : "Video"}
                </span>
                <input
                  className="flex-1 min-w-0 rounded border px-2 py-1"
                  placeholder="Naam"
                  value={it.name || ""}
                  onChange={(e)=>patchItem(it.id, { name: e.target.value })}
                />
                <button className="flex-none rounded border px-2 py-1 text-sm" onClick={()=>removeItem(it.id)}>x</button>
              </div>

              {/* Datumkeuze: elegant toggle */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`prdate-${it.id}`}
                    checked={!it.isRange}
                    onChange={()=>{
                      const ds = it.dateStart || "";
                      patchItem(it.id, { isRange: false, dateEnd: ds });
                    }}
                  />
                  Enkele dag
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`prdate-${it.id}`}
                    checked={!!it.isRange}
                    onChange={()=>{
                      const ds = it.dateStart || "";
                      patchItem(it.id, { isRange: true, dateEnd: it.dateEnd || ds });
                    }}
                  />
                  Periode
                </label>
              </div>

              {/* Datums */}
              {!it.isRange ? (
                // Enkele dag: alleen start, we spiegelen end = start
                <div className="flex items-center gap-2">
                  <span className="w-28 text-sm text-gray-700">Datum</span>
                  <input
                    type="date"
                    className="flex-1 rounded border px-2 py-1"
                    value={it.dateStart || ""}
                    onChange={(e)=>{
                      const ds = e.target.value;
                      patchItem(it.id, { dateStart: ds, dateEnd: ds });
                    }}
                  />
                </div>
              ) : (
                // Periode: start + end
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-sm text-gray-700">Startdatum</span>
                    <input
                      type="date"
                      className="flex-1 rounded border px-2 py-1"
                      value={it.dateStart || ""}
                      onChange={(e)=>patchItem(it.id, { dateStart: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-sm text-gray-700">Einddatum</span>
                    <input
                      type="date"
                      className="flex-1 rounded border px-2 py-1"
                      value={it.dateEnd || ""}
                      onChange={(e)=>patchItem(it.id, { dateEnd: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-500">
                Planning: <span className="font-medium">{prLabelDate(it)}</span> {it.isRange ? "(periode)" : it.dateStart ? "(dag)" : ""}
              </div>
            </div>

            {/* Rechterkolom: Links per type — uitlijning fixed */}
            <div className="grid gap-2 min-w-0">
              {it.type === "image" && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-36 text-sm flex-none">Bestandslink</span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      className="flex-1 min-w-0 rounded border px-2 py-1"
                      placeholder="https://..."
                      value={it.link || ""}
                      onChange={(e)=>patchItem(it.id, { link: e.target.value })}
                    />
                    {prIsHttpUrl(it.link) && (
                      <a
                        href={it.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-none whitespace-nowrap rounded border px-3 py-1 text-sm hover:bg-gray-50"
                      >
                        Open
                      </a>
                    )}
                  </div>
                </div>
              )}

              {it.type === "article" && (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-36 text-sm flex-none">Link naar tekst</span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        className="flex-1 min-w-0 rounded border px-2 py-1"
                        placeholder="https://..."
                        value={it.textLink || ""}
                        onChange={(e)=>patchItem(it.id, { textLink: e.target.value })}
                      />
                      {prIsHttpUrl(it.textLink) && (
                        <a
                          href={it.textLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-none whitespace-nowrap rounded border px-3 py-1 text-sm hover:bg-gray-50"
                        >
                          Open
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-36 text-sm flex-none">Link naar foto's</span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        className="flex-1 min-w-0 rounded border px-2 py-1"
                        placeholder="https://..."
                        value={it.photosLink || ""}
                        onChange={(e)=>patchItem(it.id, { photosLink: e.target.value })}
                      />
                      {prIsHttpUrl(it.photosLink) && (
                        <a
                          href={it.photosLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-none whitespace-nowrap rounded border px-3 py-1 text-sm hover:bg-gray-50"
                        >
                          Open
                        </a>
                      )}
                    </div>
                  </div>
                </>
              )}

              {it.type === "video" && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-36 text-sm flex-none">Videolink</span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      className="flex-1 min-w-0 rounded border px-2 py-1"
                      placeholder="https://..."
                      value={it.link || ""}
                      onChange={(e)=>patchItem(it.id, { link: e.target.value })}
                    />
                    {prIsHttpUrl(it.link) && (
                      <a
                        href={it.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-none whitespace-nowrap rounded border px-3 py-1 text-sm hover:bg-gray-50"
                      >
                        Open
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="text-sm text-gray-500">Nog geen PR-items toegevoegd.</div>
        )}
      </div>
    </section>
  );
}

// globaal beschikbaar maken (zoals je andere views)
window.PRKitView = PRKitView;
