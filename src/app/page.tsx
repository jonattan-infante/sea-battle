import Link from "next/link";
import LandingBackdrop from "../components/LandingBackdrop";
import { isAuthBypassAllowed } from "../lib/auth-bypass";

// El botón de invitado depende del entorno en tiempo de ejecución, no del de build (AC-10)
export const dynamic = "force-dynamic";

const FEATURES = [
  { title: "Navega", text: "Haz clic en el mar y tu barco pone rumbo solo, esquivando las islas." },
  { title: "Combate", text: "Fija un objetivo: tus cañones disparan andanadas mientras esté a tiro." },
  { title: "Mejora", text: "Invierte el botín en cañones, casco y velas, y pasa a Bergantín y Fragata." },
];

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const guest = isAuthBypassAllowed();
  const full = params.full === "1";

  return (
    <main className="landing">
      <section className="landing__hero">
        <LandingBackdrop />
        <div className="landing__content">
          <h1 className="landing__logo font-pirate">Sea Battle</h1>
          <p className="landing__tagline">Navega, hunde piratas y conviértete en el terror de los mares.</p>
          {full && (
            <div className="toast toast--danger landing__full" role="alert" data-testid="server-full">
              Servidor lleno. Inténtalo en unos minutos.
            </div>
          )}
          <div className="landing__ctas">
            <Link href="/game" className="cta" data-testid="cta-play">Zarpar</Link>
            {guest && (
              <Link href="/game?guest=1" className="cta-ghost" data-testid="cta-guest">Jugar como invitado</Link>
            )}
          </div>
        </div>
      </section>
      <section className="landing__strip" aria-label="Cómo se juega">
        {FEATURES.map((f) => (
          <article key={f.title} className="feature">
            <div className="feature__art font-pirate text-4xl" aria-hidden>{f.title}</div>
            <div className="feature__text">
              <strong>{f.title}</strong>
              {f.text}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
