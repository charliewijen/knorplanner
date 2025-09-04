// PrintUtils.jsx
(function () {
  // Globale print-functie
  window.KP = window.KP || {};
  window.KP.printSection = function printSectionById(targetId, titleText) {
    const src = document.getElementById(targetId);
    if (!src) { alert(`Printdoel niet gevonden: #${targetId}`); return; }

    const wrap = document.createElement("div");
    wrap.id = "kp-print-container";

    // CSS die ALLES verbergt behalve onze clone, en overflow opheft
    wrap.innerHTML = `
      <style>
        @media print {
          body * { visibility: hidden !important; }
          #kp-print-container, #kp-print-container * { visibility: visible !important; }
          #kp-print-container { position: absolute; inset: 0 auto auto 0; width: 100%; }

          /* maak alle scrollers openklappen in print */
          .overflow-auto, .overflow-x-auto, .overflow-y-auto { overflow: visible !important; }
          table { display: table !important; width: 100% !important; table-layout: auto !important; }
          .no-truncate, .break-anywhere { overflow: visible !important; white-space: normal !important; word-break: normal !important; }
        }
      </style>
    `;

    // Clone de doel-node
    wrap.appendChild(src.cloneNode(true));
    document.body.appendChild(wrap);

    // Print
    const oldTitle = document.title;
    if (titleText) document.title = `${titleText} — ${oldTitle}`;
    window.print();

    // Opruimen
    setTimeout(() => {
      document.title = oldTitle;
      wrap.remove();
    }, 0);
  };

  // Eenvoudige knop
  window.PrintButton = function PrintButton({ targetId, label = "Print" }) {
    return (
      <button
        className="rounded-full border px-3 py-1 text-sm"
        onClick={() => window.KP.printSection(targetId, label)}
        title="Print deze pagina"
      >
        🖨️ {label}
      </button>
    );
  };
})();
