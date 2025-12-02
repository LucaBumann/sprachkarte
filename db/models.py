from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from geoalchemy2 import Geometry

# ⚠️ Passe das Passwort und evtl. den Datenbanknamen an:
import os
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:Wochenende1357@localhost:3984/sprachkarte")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class Sprachfamilie(Base):
    __tablename__ = "sprachfamilien"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    beschreibung = Column(Text)
    sprachen = relationship("Sprache", back_populates="familie")

class Sprache(Base):
    __tablename__ = "sprachen"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    familie_id = Column(Integer, ForeignKey("sprachfamilien.id"))
    iso_code = Column(String(10))
    beschreibung = Column(Text)
    familie = relationship("Sprachfamilie", back_populates="sprachen")
    dialekte = relationship("Dialekt", back_populates="sprache")
    gebiete = relationship("Sprachgebiet", back_populates="sprache")

class Dialekt(Base):
    __tablename__ = "dialekte"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    sprache_id = Column(Integer, ForeignKey("sprachen.id"))
    beschreibung = Column(Text)
    darstellungstyp = Column(String(20), default="standard")
    zone_code = Column(String(20))
    sprache = relationship("Sprache", back_populates="dialekte")
    gebiete = relationship("Dialektgebiet", back_populates="dialekt")  # ⬅️ NEU
    audio_punkte = relationship("AudioPunkt", back_populates="dialekt")

class Dialektgebiet(Base):
    __tablename__ = "dialektgebiete"
    id = Column(Integer, primary_key=True, index=True)
    dialekt_id = Column(Integer, ForeignKey("dialekte.id"))
    geom = Column(Geometry("MULTIPOLYGON", 4326))
    dialekt = relationship("Dialekt", back_populates="gebiete")  # ⬅️ NEU

class Sprachgebiet(Base):
    __tablename__ = "sprachgebiete"
    id = Column(Integer, primary_key=True)
    sprache_id = Column(Integer, ForeignKey("sprachen.id"))
    geom = Column(Geometry("MULTIPOLYGON", 4326))
    sprache = relationship("Sprache", back_populates="gebiete")

class AudioPunkt(Base):
    __tablename__ = "audio_punkte"
    id = Column(Integer, primary_key=True)
    dialekt_id = Column(Integer, ForeignKey("dialekte.id"))
    name = Column(String(100))
    audio_url = Column(Text)
    geom = Column(Geometry("POINT", 4326))
    dialekt = relationship("Dialekt", back_populates="audio_punkte")