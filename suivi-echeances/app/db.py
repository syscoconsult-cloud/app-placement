"""Base de données SQLite de l'application (un seul fichier, hébergeable en France)."""

import sqlite3

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    nom TEXT NOT NULL,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'collaborateur',      -- 'admin' ou 'collaborateur'
    taux_horaire REAL,                                -- coût horaire de revient (monnaie de l'édition)
    pennylane_user_id TEXT UNIQUE,
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS dossiers (
    id INTEGER PRIMARY KEY,
    nom TEXT NOT NULL,
    pays TEXT NOT NULL DEFAULT 'France',
    forme TEXT,
    siren TEXT,
    cloture TEXT,
    regime_imposition TEXT,
    regime_tva TEXT,
    jour_tva INTEGER,
    salaries INTEGER NOT NULL DEFAULT 0,
    effectif INTEGER,
    cfe INTEGER NOT NULL DEFAULT 1,
    acompte_cfe INTEGER NOT NULL DEFAULT 0,
    cvae INTEGER NOT NULL DEFAULT 0,
    depot_comptes INTEGER NOT NULL DEFAULT 1,
    collaborateur_id INTEGER REFERENCES users(id),
    pennylane_id TEXT UNIQUE,
    budget_heures REAL,                               -- budget annuel d'heures
    honoraires_annuels REAL,                          -- honoraires annuels HT prévus
    actif INTEGER NOT NULL DEFAULT 1,
    suivi_depuis TEXT,                                -- pas d'échéance générée avant cette date
    notes TEXT
);

CREATE TABLE IF NOT EXISTS echeances (
    id INTEGER PRIMARY KEY,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    libelle TEXT NOT NULL,
    categorie TEXT NOT NULL,
    pays TEXT NOT NULL,
    date_limite TEXT NOT NULL,
    periode TEXT NOT NULL,
    periode_fin TEXT,
    statut TEXT NOT NULL DEFAULT 'À faire',           -- 'À faire', 'En cours', 'Fait'
    date_realisation TEXT,
    source TEXT NOT NULL DEFAULT 'manuel',            -- 'manuel' ou 'pennylane'
    anomalie TEXT,                                    -- ex. déclaration rejetée
    commentaire TEXT,
    portail TEXT,
    UNIQUE (dossier_id, code, periode)
);

CREATE TABLE IF NOT EXISTS tiers (
    -- Clients du cabinet tels qu'ils apparaissent dans les temps et les factures.
    nom_normalise TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    dossier_id INTEGER REFERENCES dossiers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS temps (
    id INTEGER PRIMARY KEY,
    pennylane_id TEXT UNIQUE,
    date TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id),
    collaborateur TEXT,
    tiers TEXT,                                       -- nom normalisé du client
    activite_code TEXT,
    activite_nom TEXT,
    mission TEXT,
    facturable INTEGER NOT NULL DEFAULT 0,
    duree_s INTEGER NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS factures (
    id INTEGER PRIMARY KEY,
    pennylane_id TEXT UNIQUE,
    date TEXT NOT NULL,
    numero TEXT,
    tiers TEXT,                                       -- nom normalisé du client
    montant REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS activites (
    code TEXT PRIMARY KEY,
    nom TEXT,
    groupe TEXT,
    temps_perdu INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS parametres (
    cle TEXT PRIMARY KEY,
    valeur TEXT
);

CREATE TABLE IF NOT EXISTS journal_sync (
    id INTEGER PRIMARY KEY,
    debut TEXT NOT NULL,
    fin TEXT,
    statut TEXT,
    message TEXT
);

CREATE INDEX IF NOT EXISTS idx_echeances_date ON echeances(date_limite);
CREATE INDEX IF NOT EXISTS idx_temps_date ON temps(date);
CREATE INDEX IF NOT EXISTS idx_factures_date ON factures(date);
"""


def connect(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    if "db" not in g:
        g.db = connect(current_app.config["DATABASE"])
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# Colonnes ajoutées après la première version : ajoutées aux bases existantes.
MIGRATIONS = [("dossiers", "suivi_depuis", "TEXT")]


def init_db(conn):
    conn.executescript(SCHEMA)
    for table, colonne, type_ in MIGRATIONS:
        if colonne not in {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {colonne} {type_}")
    conn.commit()


def parametre(conn, cle, defaut=None):
    row = conn.execute("SELECT valeur FROM parametres WHERE cle = ?", (cle,)).fetchone()
    return row["valeur"] if row else defaut


def set_parametre(conn, cle, valeur):
    conn.execute("INSERT INTO parametres (cle, valeur) VALUES (?, ?) "
                 "ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur", (cle, valeur))
