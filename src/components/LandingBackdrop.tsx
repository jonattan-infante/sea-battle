import fs from "fs";
import path from "path";
import Image from "next/image";

// Fondo de la landing (ART-DIRECTION §16.1): captura del motor, la de móvil en móvil. Mientras no exista, queda el
// degradado del océano. Lo comparten el inicio de sesión y el registro (§16.3, D53), fijo al viewport para que las
// esquinas coincidan con las de la landing aunque la página haga scroll
const HERO = "/landing-hero.webp";
const HERO_MOBILE = "/landing-hero-mobile.webp";
const hasImage = (file: string) => fs.existsSync(path.join(process.cwd(), "public", file));

export default function LandingBackdrop({ fixed = false }: { fixed?: boolean }) {
  const desktopHero = hasImage(HERO);
  const mobileHero = hasImage(HERO_MOBILE);
  const fix = fixed ? " is-fixed" : "";
  return (
    <>
      <div className={`landing__bg${fix}`} aria-hidden>
        {desktopHero && (
          <Image src={HERO} alt="" fill priority sizes="100vw" className={mobileHero ? "hidden sm:block" : undefined} />
        )}
        {mobileHero && <Image src={HERO_MOBILE} alt="" fill priority sizes="100vw" className="sm:hidden" />}
      </div>
      <div className={`landing__veil${fix}`} aria-hidden />
    </>
  );
}
