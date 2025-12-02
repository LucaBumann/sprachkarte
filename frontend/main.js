  const map = L.map('map').setView([20, 0], 2);

  // Grundkarte
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 14
  }).addTo(map);

  // -----------------------------
  // 🔹 Schraffur-Patterns für linguistische Zonen
  // -----------------------------
  patternHoechst = new L.StripePattern({
    weight: 8,         // breite Streifen
    spaceWeight: 4,    // schmalere Lücken
    color: "#000000",
    opacity: 0.45,     // Strichdeckkraft
    spaceOpacity: 0.0, // Hintergrund bleibt transparent
    angle: 135         // diagonale Schraffur
  }).addTo(map);

  patternHoch = new L.StripePattern({
    weight: 6,
    spaceWeight: 6,
    color: "#000000",
    opacity: 0.40,
    spaceOpacity: 0.0,
    angle: 135
  }).addTo(map);

  patternMittel = new L.StripePattern({
    weight: 4,
    spaceWeight: 8,
    color: "#000000",
    opacity: 0.35,
    spaceOpacity: 0.0,
    angle: 135
  }).addTo(map);

  patternNieder = new L.StripePattern({
    weight: 3,
    spaceWeight: 10,
    color: "#000000",
    opacity: 0.30,
    spaceOpacity: 0.0,
    angle: 135
  }).addTo(map);

  let sprachenLayer;
  let dialekteLayer;
  let patternHoechst, patternHoch, patternMittel, patternNieder;
  let sprachLabels = [];
  let dialektLabels = [];
  let audioMarkers = [];

  // Hilfsfunktion für Zufallsfarbe
  function randomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 60%, 55%)`;
  }
  // Hilfsfunktion: deterministische Pastellfarbe pro Dialekt
  function dialectColorById(dialektId) {
    if (!dialektId) dialektId = 1;
    const hue = (dialektId * 47) % 360;  // verteilt Hues halbwegs schön
    const saturation = 60;              // mittlere Sättigung (Pastell)
    const lightness = 75;               // eher hell
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  function dialectStyle(feature) {
    const p = feature.properties || {};
    const typ = p.darstellungstyp || "standard";
    const zone = p.zone_code || null;

    // 🔹 1. Linguistische Zonen (schwarz/grau hinterlegt)
    if (typ === "zone") {
      let fillPattern = null;

      switch (zone) {
        case "hoechst":
          fillPattern = patternHoechst;
          break;
        case "hoch":
          fillPattern = patternHoch;
          break;
        case "mittel":
          fillPattern = patternMittel;
          break;
        case "nieder":
          fillPattern = patternNieder;
          break;
        default:
          fillPattern = patternMittel;  // Fallback
      }

      return {
        color: "#000000",
        weight: 0.7,
        fillOpacity: 1.0,     // das Muster selbst steuert die „Stärke“
        fillPattern: fillPattern
      };
    }
    // 🔹 2. Kontaktzonen (pastell + gestrichelter Rand)
    if (typ === "kontakt") {
      const dialektId = p.dialekt_id;
      const fillColor = dialectColorById(dialektId);

      return {
        fillColor: fillColor,
        fillOpacity: 0.30,         // sehr transparent
        color: fillColor,          // gleiche Farbe für Rand
        opacity: 0.95,             // Rand (fast) deckend
        weight: 2,                 // etwas dicker
        dashArray: "4 4"           // gestrichelte Linie
      };
    }
    // 🔹 3. Standard-Dialekte (ohne Spezial-Zweigliederung)
    const dialektId = p.dialekt_id;
    const fillColor = dialectColorById(dialektId);

    return {
      fillColor: fillColor,
      fillOpacity: 0.40,
      color: "#444444",
      opacity: 0.9,
      weight: 1.5,
      dashArray: "3 3"            // hier schon leicht gestrichelt, wie gewünscht
    };
  }

  // Wiederholungs-Fetch, falls Render schläft
  async function fetchWithRetry(url, options = {}, retries = 10, delay = 3000) {
	for (let i = 0; i < retries; i++) {
      try {
		const res = await fetch(url, options);
		if (!res.ok) throw new Error(`Fehler ${res.status}`);
		return await res.json();
      } catch (err) {
		console.warn(`Fehler beim Laden (${i + 1}/${retries}):`, err.message);
		if (i < retries - 1) {
          await new Promise(r => setTimeout(r, delay));
		}
      }
	}
	throw new Error(`Backend ${url} nach ${retries} Versuchen nicht erreichbar.`);
  }

  // -----------------------------
  // 🔹 1. Sprachen laden (STATIC GEOJSON)
  // -----------------------------
  fetch("geojson/sprachgebiete.geojson")
    .then(res => res.json())
    .then(data => {
      if (!data.features) {
        console.error("Kein FeatureCollection-Format erkannt", data);
        return;
      }

      sprachenLayer = L.geoJSON(data, {
        style: {
          color: 'blue',
          weight: 1,
          fillOpacity: 0.3
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          layer.bindTooltip(`<b>${p.sprache_name}</b><br>Familie: ${p.familie}`);
          layer.on('click', () => showDialekte(p.sprache_id, layer));
        }
      }).addTo(map);

      // Sprachlabels setzen
      data.features.forEach(feature => {
        const centroid = turf.centerOfMass(feature);
        const coords = [...centroid.geometry.coordinates].reverse();

        const label = L.marker(coords, {
          icon: L.divIcon({
            className: 'lang-label',
            html: feature.properties.sprache_name,
            iconSize: [100, 20],
            iconAnchor: [50, 10]
          })
        }).addTo(map);

        sprachLabels.push(label);
      });
    })
    .catch(err => console.error('Fehler beim Laden:', err));

  // -----------------------------
  // 🔹 2. Dialektebene anzeigen
  // -----------------------------
  function showDialekte(sprache_id, layer) {
    map.fitBounds(layer.getBounds());

    // Sprachenebene ausblenden
    map.removeLayer(sprachenLayer);
    sprachLabels.forEach(lbl => map.removeLayer(lbl));
    sprachLabels = [];

    // 1️⃣ Zuerst statische Dialektgebiete laden
    fetch("geojson/dialektgebiete.geojson")
        .then(res => res.json())
        .then(allDialektGeojson => {

            // 2️⃣ Filtern: nur Dialekte dieser Sprache
            const filtered = {
                type: "FeatureCollection",
                features: allDialektGeojson.features.filter(f => 
                    f.properties.sprache_id == sprache_id
                )
            };

            if (filtered.features.length === 0) {
                alert("Keine Dialektgebiete für diese Sprache gefunden.");
                return;
            }

            // 3️⃣ Polygone auf Karte
			dialekteLayer = L.geoJSON(filtered, {
				style: dialectStyle,
				onEachFeature: (f, l) => {
					const p = f.properties || {};
					const name = p.dialekt_name || "Unbekannt";

					const isKontakt = p.darstellungstyp === "kontakt";
					const isAlemannisch = p.sprache_name === "Alemannisch";

					// Kontaktzonen für Alemannisch NICHT beschriften
					if (!(isKontakt && isAlemannisch)) {
						l.bindTooltip(`<b>${name}</b>`);

						const centroid = turf.centerOfMass(f);
						const coords = [...centroid.geometry.coordinates].reverse();
						const label = L.marker(coords, {
							icon: L.divIcon({
								className: 'dialekt-label',
								html: name,
								iconSize: [100, 20],
								iconAnchor: [50, 10]
							})
						}).addTo(map);

						dialektLabels.push(label);
					}
				}
			}).addTo(map);

            // 4️⃣ Audio-Punkte statisch laden
			fetch("geojson/audio_punkte.geojson")
				.then(res => res.json())
				.then(allAudio => {

					const filteredAudio = allAudio.features.filter(f =>
						f.properties.sprache_id == sprache_id
					);

					filteredAudio.forEach(f => {
						const coords = [...f.geometry.coordinates].reverse();
						const audioUrl = f.properties.audio_url;

						const icon = L.divIcon({
							html: '<span class="audio-symbol">🔊</span>',
							className: 'audio-icon',
							iconSize: [24, 24],
							iconAnchor: [12, 12]
						});

						const marker = L.marker(coords, {
							icon: icon,
							interactive: true
						}).addTo(map);

						marker.on('click', () => openAudioPlayer(audioUrl, f.properties.name));
						audioMarkers.push(marker);
					});

				})
				.catch(err => console.error("Fehler beim Laden der Audio-Punkte:", err));

        })
        .catch(err => console.error("Fehler beim Laden der Dialekt-GEOJSON:", err));

    showBackButton();
}

  // -----------------------------
  // 🔹 3. Zurück zur Sprachenebene
  // -----------------------------
  function resetView() {
    if (dialekteLayer) {
      map.removeLayer(dialekteLayer);
      dialekteLayer = null;
    }

    dialektLabels.forEach(lbl => map.removeLayer(lbl));
    dialektLabels = [];
	
	audioMarkers.forEach(m => map.removeLayer(m));
	audioMarkers = [];

    map.addLayer(sprachenLayer);
    map.setView([20, 0], 2);
    removeBackButton();

    // Sprachlabels wieder hinzufügen
    fetch("geojson/sprachgebiete.geojson")
      .then(res => res.json())
      .then(data => {
        data.features.forEach(feature => {
          const centroid = turf.centerOfMass(feature);
          const coords = [...centroid.geometry.coordinates].reverse();
          const label = L.marker(coords, {
            icon: L.divIcon({
              className: 'lang-label',
              html: feature.properties.sprache_name,
              iconSize: [100, 20],
              iconAnchor: [50, 10]
            })
          }).addTo(map);
          sprachLabels.push(label);
        });
      });
  }

  // -----------------------------
  // 🔹 4. Zurück-Button
  // -----------------------------
  function showBackButton() {
    if (!document.getElementById('backBtn')) {
      const btn = document.createElement('button');
      btn.id = 'backBtn';
      btn.textContent = 'Zurück';
      Object.assign(btn.style, {
        position: 'absolute',
        top: '15px',
        left: '30px',
        padding: '8px 14px',
        background: '#fff',
        border: '1px solid #333',
        borderRadius: '8px',
        cursor: 'pointer',
        zIndex: 10000
      });
      btn.onclick = resetView;
      document.body.appendChild(btn);
    }
  }

  function removeBackButton() {
    const btn = document.getElementById('backBtn');
    if (btn) btn.remove();
  }

  // -----------------------------
  // 🔹 5. Dynamische Labelgröße
  // -----------------------------
  function updateLabelSize() {
    const zoom = map.getZoom();
    const baseSize = 8;
    const maxSize = 32;
    const size = Math.min(baseSize + (zoom - 2) * 2, maxSize);
    document.querySelectorAll('.lang-label, .dialekt-label').forEach(el => {
      el.style.fontSize = `${size}px`;
    });
  }
  
  function openAudioPlayer(url, title) {
  const player = document.getElementById('audioPlayer');
  const audio = document.getElementById('audioElement');

  audio.src = url;
  audio.play();
  player.style.display = 'block';

  audio.onended = () => player.style.display = 'none';
  }

  map.on('zoomend', updateLabelSize);
  map.whenReady(updateLabelSize);
  
  // -----------------------------
  // 🔹 6. Intro-Overlay (Hauptmenü) steuern
  // -----------------------------
  const introOverlay = document.getElementById('introOverlay');
  const openMapBtn = document.getElementById('openMapBtn');
  const infoFloatingBtn = document.getElementById('infoFloatingBtn');

  if (openMapBtn && introOverlay) {
    openMapBtn.addEventListener('click', () => {
      introOverlay.style.display = 'none';

      // Leaflet nach dem Ausblenden sagen: „Größe neu berechnen“
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    });
  }

  if (infoFloatingBtn && introOverlay) {
    infoFloatingBtn.addEventListener('click', () => {
      introOverlay.style.display = 'flex';
    });
  }