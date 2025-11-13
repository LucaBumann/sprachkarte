from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from db.models import Base, engine, SessionLocal, Sprachfamilie, Sprache, Sprachgebiet, Dialekt, Dialektgebiet
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Sprachkarte API")

# ✅ CORS korrekt für Netlify + lokal
origins = [
    "https://sprachexplorer.netlify.app",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Datenbankverbindung pro Request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def root():
    return {"ok": True}

# Tabellen automatisch erstellen (falls sie noch nicht existieren)
import os
if os.getenv("RENDER") != "true":
    Base.metadata.create_all(bind=engine)

@app.get("/familien")
def get_familien(db: Session = Depends(get_db)):
    return db.query(Sprachfamilie).all()

@app.get("/sprachen/{familie_id}")
def get_sprachen(familie_id: int, db: Session = Depends(get_db)):
    return db.query(Sprache).filter(Sprache.familie_id == familie_id).all()

@app.get("/gebiete")
def get_gebiete(db: Session = Depends(get_db)):
    gebiete = db.query(Sprachgebiet).all()
    features = []

    for g in gebiete:
        geom = to_shape(g.geom)
        sprache = g.sprache  # aus relationship
        familie = sprache.familie if sprache else None

        features.append({
            "type": "Feature",
            "geometry": mapping(geom),
            "properties": {
                "id": g.id,
                "sprache_id": sprache.id if sprache else None,
                "sprache_name": sprache.name if sprache else "Unbekannt",
                "familie": familie.name if familie else "Unbekannt"
            }
        })

    return {"type": "FeatureCollection", "features": features}

@app.get("/dialekte/{sprache_id}")
def get_dialekte(sprache_id: int, db: Session = Depends(get_db)):
    dialekte = db.query(Dialekt).filter(Dialekt.sprache_id == sprache_id).all()
    features = []

    for d in dialekte:
        for g in d.gebiete:
            geom = to_shape(g.geom)
            features.append({
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": {
                    "dialekt_id": d.id,
                    "dialekt_name": d.name,
                    "sprache_id": sprache_id,
                    "type": "polygon"
                }
            })
        # Audio-Punkte
        for a in d.audio_punkte:
            geom = to_shape(a.geom)
            features.append({
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": {
                    "dialekt_id": d.id,
                    "dialekt_name": d.name,
                    "name": a.name,
                    "audio_url": a.audio_url,
                    "type": "audio"
                }
            })
    return {"type": "FeatureCollection", "features": features}