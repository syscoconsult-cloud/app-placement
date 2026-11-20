"""Génère les deux outils hors ligne à partir du modèle commun et des règles de chaque pays :
    python3 construire.py   ->  ../echeances-benin.html et ../echeances-france.html"""
import pathlib
ici = pathlib.Path(__file__).parent
modele = (ici / "modele.html").read_text(encoding="utf-8")
for pays, titre, drapeau in (("benin", "Échéances Bénin", "🇧🇯"), ("france", "Échéances France", "🇫🇷")):
    regles = (ici / f"{pays}.js").read_text(encoding="utf-8")
    page = modele.replace("@@TITRE@@", titre).replace("@@DRAPEAU@@", drapeau).replace("/*@@REGLES@@*/", regles)
    (ici.parent / f"echeances-{pays}.html").write_text(page, encoding="utf-8")
    print(f"echeances-{pays}.html", len(page.encode()), "octets")
