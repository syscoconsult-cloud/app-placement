import re
from datetime import date
from pathlib import Path

import pytest

from app import create_app, db
from app.alertes import envoyer_alertes
from app.pennylane import FichierSource, normaliser_facture, normaliser_nom
from app.rentabilite import calculer
from app.sync import synchroniser

EXPORT = Path(__file__).with_name("export_pennylane_exemple.json")
AUJOURD_HUI = date(2026, 11, 8)


@pytest.fixture
def app(tmp_path):
    return create_app({"TESTING": True, "SECRET_KEY": "test", "DATABASE": str(tmp_path / "t.sqlite3"),
                       "AUJOURD_HUI": AUJOURD_HUI, "PENNYLANE_FICHIER": str(EXPORT)})


@pytest.fixture
def conn(app):
    c = db.connect(app.config["DATABASE"])
    synchroniser(c, FichierSource(EXPORT), AUJOURD_HUI)
    yield c
    c.close()


def echeance(conn, dossier, code, periode_fin):
    return conn.execute("""SELECT e.* FROM echeances e JOIN dossiers d ON d.id = e.dossier_id
                           WHERE d.nom = ? AND e.code = ? AND e.periode_fin = ?""",
                        (dossier, code, periode_fin)).fetchone()


def test_import_des_dossiers(conn):
    alpha = conn.execute("SELECT * FROM dossiers WHERE pennylane_id = '1001'").fetchone()
    assert (alpha["forme"], alpha["regime_tva"], alpha["cloture"], alpha["regime_imposition"]) == \
        ("SAS", "Mensuel (CA3)", "2026-12-31", "IS")
    assert alpha["jour_tva"] == 24  # lu sur la dernière déclaration
    beta = conn.execute("SELECT * FROM dossiers WHERE pennylane_id = '1002'").fetchone()
    assert (beta["forme"], beta["regime_tva"], beta["regime_imposition"], beta["depot_comptes"]) == \
        ("EI", "Simplifié (CA12)", "IR - BNC", 0)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 2


def test_tva_acceptee_passe_a_fait(conn):
    e = echeance(conn, "ALPHA AUTO", "FR-TVA-M", "2026-09-30")
    assert e is None or e["statut"] == "Fait"  # septembre peut être hors fenêtre
    octobre = echeance(conn, "ALPHA AUTO", "FR-TVA-M", "2026-10-31")
    assert octobre["statut"] == "En cours" and "rejetée" in octobre["anomalie"]
    assert octobre["date_limite"] == "2026-11-24"
    novembre = echeance(conn, "ALPHA AUTO", "FR-TVA-M", "2026-11-30")
    assert novembre["statut"] == "À faire"


def test_synchronisation_idempotente_et_statuts_conserves(conn):
    e = echeance(conn, "ALPHA AUTO", "FR-TVA-M", "2026-11-30")
    conn.execute("UPDATE echeances SET statut = 'Fait', date_realisation = '2026-12-01' WHERE id = ?", (e["id"],))
    avant = conn.execute("SELECT COUNT(*) FROM echeances").fetchone()[0]
    synchroniser(conn, FichierSource(EXPORT), AUJOURD_HUI)
    assert conn.execute("SELECT COUNT(*) FROM echeances").fetchone()[0] == avant
    assert conn.execute("SELECT statut FROM echeances WHERE id = ?", (e["id"],)).fetchone()[0] == "Fait"


def test_temps_et_factures_rattaches(conn):
    assert conn.execute("SELECT COUNT(*) FROM temps").fetchone()[0] == 3
    # « Cabinet Beta » (nom commercial) est rattaché au dossier MARTIN DUPONT.
    beta = conn.execute("SELECT dossier_id FROM tiers WHERE nom_normalise = ?", (normaliser_nom("Cabinet Beta"),)).fetchone()
    assert beta["dossier_id"] is not None
    inconnu = conn.execute("SELECT dossier_id FROM tiers WHERE nom_normalise = 'client inconnu'").fetchone()
    assert inconnu["dossier_id"] is None


def test_rentabilite(conn):
    conn.execute("UPDATE users SET taux_horaire = 40 WHERE email = 'jean.compta@cabinet.test'")
    conn.execute("UPDATE users SET taux_horaire = 30 WHERE email = 'lea.revision@cabinet.test'")
    conn.execute("UPDATE activites SET temps_perdu = 1 WHERE code = '1.5'")
    lignes, totaux, collaborateurs, non_rapproches, _ = calculer(conn, "2026-10")
    alpha = next(l for l in lignes if l["dossier"]["nom"] == "ALPHA AUTO")
    assert alpha["ca"] == 300  # 360 - 60 d'avoir
    assert alpha["heures"] == 7 and alpha["heures_perdues"] == 2
    assert alpha["cout"] == 5 * 40 + 2 * 30
    assert alpha["marge"] == 300 - 260
    assert [r["nom"] for r in non_rapproches] == ["Client Inconnu"]
    conn.execute("INSERT INTO parametres VALUES ('factures_ttc', '1')")
    lignes, *_ = calculer(conn, "2026-10")
    assert next(l for l in lignes if l["dossier"]["nom"] == "ALPHA AUTO")["ca"] == pytest.approx(250)


def test_lecture_libelle_facture():
    f = normaliser_facture({"id": 1, "date": "2026-10-20", "label": "Avoir BRYM&CO - F-2026-914", "amount": "-360.0"})
    assert (f["tiers_nom"], f["numero"], f["montant"]) == ("BRYM&CO", "F-2026-914", -360.0)


def test_alertes(conn, app):
    conn.execute("INSERT INTO users (email, nom, role) VALUES ('associe@cabinet.test', 'Associée', 'admin')")
    messages = envoyer_alertes(conn, app.config, AUJOURD_HUI, simulation=True)
    destinataires = {m["To"] for m in messages}
    assert {"jean.compta@cabinet.test", "associe@cabinet.test"} <= destinataires
    texte = next(m for m in messages if m["To"] == "jean.compta@cabinet.test").get_content()
    assert "rejetée" in texte


def _csrf(reponse):
    return re.search(r'name="csrf" value="([^"]+)"', reponse.get_data(as_text=True)).group(1)


def test_parcours_web(app, conn):
    from werkzeug.security import generate_password_hash
    conn.execute("INSERT INTO users (email, nom, role, password_hash) VALUES (?, ?, 'admin', ?)",
                 ("associe@cabinet.test", "Associée", generate_password_hash("secret")))
    conn.commit()
    client = app.test_client()
    assert client.get("/").status_code == 302
    jeton = _csrf(client.get("/connexion"))
    assert client.post("/connexion", data={"email": "x", "mot_de_passe": "y"}).status_code == 400  # sans jeton
    r = client.post("/connexion", data={"csrf": jeton, "email": "associe@cabinet.test", "mot_de_passe": "secret"})
    assert r.status_code == 302
    for page in ("/", "/echeances", "/echeances?alerte=retard", "/dossiers", "/dossiers/1", "/rentabilite",
                 "/rentabilite?mois=2026-10&cumul=1&ca=lisse", "/collaborateurs", "/parametres"):
        assert client.get(page).status_code == 200, page
    assert "ALPHA AUTO" in client.get("/echeances?alerte=retard").get_data(as_text=True)

    jeton = _csrf(client.get("/"))
    e = echeance(conn, "ALPHA AUTO", "FR-TVA-M", "2026-11-30")
    client.post(f"/echeances/{e['id']}", data={"csrf": jeton, "statut": "Fait"})
    fait = conn.execute("SELECT * FROM echeances WHERE id = ?", (e["id"],)).fetchone()
    assert fait["statut"] == "Fait" and fait["date_realisation"] == AUJOURD_HUI.isoformat()

    r = client.post("/dossiers/nouveau", data={
        "csrf": jeton, "nom": "Cotonou Services", "pays": "Bénin", "forme": "SARL", "cloture": "2026-12-31",
        "regime_imposition": "IS", "regime_tva": "Mensuel (Bénin)", "jour_tva": "10", "salaries": "1",
        "effectif": "5", "depot_comptes": "1", "actif": "1"})
    assert r.status_code == 302
    codes = {row[0] for row in conn.execute(
        "SELECT e.code FROM echeances e JOIN dossiers d ON d.id = e.dossier_id WHERE d.nom = 'Cotonou Services'")}
    assert {"BJ-TVA", "BJ-ITS", "BJ-CNSS", "BJ-IS-AC"} <= codes


def test_pages_admin_interdites_aux_collaborateurs(app, conn):
    from werkzeug.security import generate_password_hash
    conn.execute("UPDATE users SET password_hash = ? WHERE email = 'jean.compta@cabinet.test'",
                 (generate_password_hash("secret"),))
    conn.commit()
    client = app.test_client()
    jeton = _csrf(client.get("/connexion"))
    client.post("/connexion", data={"csrf": jeton, "email": "jean.compta@cabinet.test", "mot_de_passe": "secret"})
    assert client.get("/").status_code == 200
    assert client.get("/rentabilite").status_code == 403
    assert client.get("/collaborateurs").status_code == 403
