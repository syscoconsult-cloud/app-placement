"""Niveau d'alerte des échéances et récapitulatif quotidien par e-mail."""

import smtplib
from collections import defaultdict
from datetime import date, timedelta
from email.message import EmailMessage

ROUGE, ANOMALIE, ORANGE, VERT, FAIT = "retard", "anomalie", "proche", "a_venir", "fait"
LIBELLES = {ROUGE: "🔴 En retard", ANOMALIE: "🔴 Anomalie", ORANGE: "🟠 Sous 7 jours", VERT: "🟢 À venir",
            FAIT: "✅ Fait"}
URGENTS = (ROUGE, ANOMALIE)


def niveau(echeance, aujourd_hui):
    if echeance["statut"] == "Fait":
        return FAIT
    if echeance["anomalie"]:
        return ANOMALIE
    limite = date.fromisoformat(echeance["date_limite"])
    if limite < aujourd_hui:
        return ROUGE
    if limite <= aujourd_hui + timedelta(days=7):
        return ORANGE
    return VERT


def a_signaler(conn, aujourd_hui):
    """Échéances non faites en retard, en anomalie ou à moins de 7 jours."""
    return conn.execute(
        """SELECT e.*, d.nom AS dossier, u.id AS user_id, u.email, u.nom AS collaborateur
           FROM echeances e JOIN dossiers d ON d.id = e.dossier_id
           LEFT JOIN users u ON u.id = d.collaborateur_id
           WHERE d.actif = 1 AND e.statut != 'Fait' AND (e.date_limite <= ? OR e.anomalie IS NOT NULL)
           ORDER BY e.date_limite""", ((aujourd_hui + timedelta(days=7)).isoformat(),)).fetchall()


def _corps(nom, lignes, aujourd_hui, url):
    retard = [l for l in lignes if niveau(l, aujourd_hui) in URGENTS]
    proches = [l for l in lignes if niveau(l, aujourd_hui) == ORANGE]
    texte = [f"Bonjour {nom},", ""]
    for titre, groupe in (("🔴 En retard ou en anomalie", retard), ("🟠 À traiter dans les 7 jours", proches)):
        if groupe:
            texte.append(f"{titre} ({len(groupe)}) :")
            for l in groupe:
                extra = f" — {l['anomalie']}" if l["anomalie"] else ""
                texte.append(f"  • {date.fromisoformat(l['date_limite']).strftime('%d/%m')} · {l['dossier']} · "
                             f"{l['libelle']} [{l['statut']}]{extra}")
            texte.append("")
    if url:
        texte.append(f"Suivi des échéances : {url}")
    return "\n".join(texte), len(retard), len(proches)


def envoyer_alertes(conn, config, aujourd_hui=None, simulation=False):
    """Envoie à chaque collaborateur ses échéances à signaler, et à chaque
    administrateur le récapitulatif de tout le cabinet. Renvoie les messages."""
    aujourd_hui = aujourd_hui or date.today()
    lignes = a_signaler(conn, aujourd_hui)
    par_user = defaultdict(list)
    for l in lignes:
        if l["email"]:
            par_user[(l["email"], l["collaborateur"])].append(l)
    destinataires = list(par_user.items())
    for admin in conn.execute("SELECT email, nom FROM users WHERE role = 'admin' AND actif = 1"):
        if lignes:
            destinataires.append(((admin["email"], admin["nom"]), lignes))

    messages = []
    for (email, nom), groupe in destinataires:
        corps, nb_retard, nb_proches = _corps(nom, groupe, aujourd_hui, config.get("URL_APPLICATION"))
        msg = EmailMessage()
        msg["Subject"] = f"Échéances : {nb_retard} en retard, {nb_proches} sous 7 jours"
        msg["From"] = config.get("SMTP_EXPEDITEUR")
        msg["To"] = email
        msg.set_content(corps)
        messages.append(msg)

    if messages and not simulation:
        with smtplib.SMTP(config["SMTP_HOTE"], int(config.get("SMTP_PORT", 587)), timeout=30) as smtp:
            smtp.starttls()
            if config.get("SMTP_UTILISATEUR"):
                smtp.login(config["SMTP_UTILISATEUR"], config["SMTP_MOT_DE_PASSE"])
            for msg in messages:
                smtp.send_message(msg)
    return messages
