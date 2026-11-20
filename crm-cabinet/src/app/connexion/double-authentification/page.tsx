import { preparerDoubleAuth, validerDoubleAuth } from "../../actions-auth";
import { CadreAuth, FormulaireAuth } from "@/components/FormulaireAuth";

export const dynamic = "force-dynamic";

export default async function DoubleAuth() {
  const etat = await preparerDoubleAuth();
  return (
    <CadreAuth
      titre={etat.actif
        ? "Saisissez le code à 6 chiffres affiché dans votre application d'authentification."
        : "Sécurisez votre compte : scannez ce QR code avec une application d'authentification (Google Authenticator, Microsoft Authenticator, FreeOTP…), puis saisissez le code affiché."}
    >
      {!etat.actif && etat.qr && (
        <div className="mb-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={etat.qr} alt="QR code de double authentification" className="mx-auto h-48 w-48" />
          <p className="mt-2 break-all text-xs text-slate-500">Clé manuelle : {etat.secret}</p>
        </div>
      )}
      <FormulaireAuth action={validerDoubleAuth} bouton="Valider">
        <div>
          <label className="etiquette">Code</label>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="champ text-center text-lg tracking-widest" required autoFocus />
        </div>
      </FormulaireAuth>
    </CadreAuth>
  );
}
