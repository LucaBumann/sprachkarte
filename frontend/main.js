  const map = L.map('map').setView([20, 0], 2);

  // Grundkarte
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 14
  }).addTo(map);

  let sprachenLayer;
  let dialekteLayer;
  let sprachLabels = [];
  let dialektLabels = [];
  let audioMarkers = [];

  // Hilfsfunktion für Zufallsfarbe
  function randomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 60%, 55%)`;
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
  // 🔹 1. Sprachen laden
  // -----------------------------
  fetchWithRetry(`${CONFIG.API_BASE}/gebiete`)
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

      // Sprachlabels hinzufügen
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

    // Entferne Sprachenebene + Labels
    map.removeLayer(sprachenLayer);
    sprachLabels.forEach(lbl => map.removeLayer(lbl));
    sprachLabels = [];

    // Lade Dialekte nur für diese Sprache
	fetchWithRetry(`${CONFIG.API_BASE}/dialekte/${sprache_id}`)
	  .then(data => {
		if (!data.features || data.features.length === 0) {
		  alert("Keine Dialektgeometrien gefunden.");
		  return;
		}

		// getrennte Layer für Polygone & Audiopunkte
		const polygons = data.features.filter(f => f.properties.type === "polygon");
		const audios = data.features.filter(f => f.properties.type === "audio");

        dialekteLayer = L.geoJSON(polygons, {
          style: () => ({
            color: randomColor(),
            weight: 1,
            fillOpacity: 0.5
          }),
          onEachFeature: (f, l) => {
            const name = f.properties.dialekt_name || "Unbekannter Dialekt";
            l.bindTooltip(`<b>${name}</b>`);

            // Dialektlabel hinzufügen
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
        }).addTo(map);
		
		// Audio-Punkte
		audios.forEach(f => {
			const coords = f.geometry.coordinates.reverse();
			const audioUrl = f.properties.audio_url;
			const icon = L.divIcon({
			  html: '<span class="audio-symbol">🔊</span>',
			  className: 'audio-icon',
			  iconSize: [24, 24],
			  iconAnchor: [12, 12]
			});
			const marker = L.marker(coords, {
			  icon: icon,
			  interactive: true,
			  keyboard: false,
			  bubblingMouseEvents: true
			}).addTo(map);
			marker.on('click', () => openAudioPlayer(audioUrl, f.properties.name));
			audioMarkers.push(marker);
		});
      })
	  .catch(err => {
		console.error('Fehler beim Laden der Dialekte (nach mehreren Versuchen):', err);
		alert("Das Backend konnte nicht erreicht werden. Bitte versuche es später erneut.");
      });

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
    fetch(`${CONFIG.API_BASE}/gebiete`)
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
        left: '15px',
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