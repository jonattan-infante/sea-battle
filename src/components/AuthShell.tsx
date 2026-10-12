import Link from "next/link";
import LandingBackdrop from "./LandingBackdrop";

// Inicio de sesión y registro (ART-DIRECTION §16.3, D53): rejilla de 3 filas sobre el fondo de la landing. Las filas de
// fuera (logo y vuelta) reparten el sitio a partes iguales, así que la tarjeta de Clerk queda en el centro exacto
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <LandingBackdrop fixed />
      <div className="auth__top">
        <Link href="/" className="auth__logo font-pirate" aria-label="Sea Battle: volver a la portada">Sea Battle</Link>
      </div>
      <div className="auth__card">{children}</div>
      <div className="auth__bottom">
        <Link href="/" className="auth__back" data-testid="auth-back">← Volver a la portada</Link>
      </div>
    </main>
  );
}
