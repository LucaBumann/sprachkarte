import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping

# 👉 Deine lokale DB
DB_URL = "postgresql://postgres:Wochenende1357@localhost:3984/sprachkarte"

engine = create_engine(DB_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

from db.models import Sprache, Sprachgebiet, Dialekt, Dialektgebiet, AudioPunkt

# --------------------------
# 1) Sprachgebiete exportieren
# --------------------------
sprach_features = []
gebiete = db.query(Sprachgebiet).all()

for g in gebiete:
    geom = to_shape(g.geom)
    sprache = g.sprache
    familie = sprache.familie if sprache else None

    sprach_features.append({
        "type": "Feature",
        "geometry": mapping(geom),
        "properties": {
            "sprache_id": sprache.id,
            "sprache_name": sprache.name,
            "familie": familie.name if familie else None
        }
    })

with open("frontend/geojson/sprachgebiete.geojson", "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "features": sprach_features}, f, ensure_ascii=False, indent=2)

print("✔ sprachgebiete.geojson erzeugt")

# --------------------------
# 2) Dialektgebiete exportieren
# --------------------------
dialekt_features = []
gebiete = db.query(Dialektgebiet).all()

for g in gebiete:
    geom = to_shape(g.geom)
    dialekt = g.dialekt
    sprache = dialekt.sprache

    dialekt_features.append({
        "type": "Feature",
        "geometry": mapping(geom),
        "properties": {
            "dialekt_id": dialekt.id,
            "dialekt_name": dialekt.name,
            "sprache_id": sprache.id,       # WICHTIG!!!
            "sprache_name": sprache.name,
            "darstellungstyp": dialekt.darstellungstyp,
            "zone_code": dialekt.zone_code
        }
    })

with open("frontend/geojson/dialektgebiete.geojson", "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "features": dialekt_features}, f, ensure_ascii=False, indent=2)

print("✔ dialektgebiete.geojson erzeugt")

# --------------------------
# 3) Audio-Punkte exportieren
# --------------------------
audio_features = []
punkte = db.query(AudioPunkt).all()

for a in punkte:
    geom = to_shape(a.geom)
    dialekt = a.dialekt
    sprache = dialekt.sprache

    audio_features.append({
        "type": "Feature",
        "geometry": mapping(geom),
        "properties": {
            "name": a.name,
            "audio_url": a.audio_url,
            "dialekt_id": dialekt.id,
            "dialekt_name": dialekt.name,
            "sprache_id": sprache.id,    # WICHTIG!!!
            "sprache_name": sprache.name
        }
    })

with open("frontend/geojson/audio_punkte.geojson", "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "features": audio_features}, f, ensure_ascii=False, indent=2)

print("✔ audio_punkte.geojson erzeugt")
