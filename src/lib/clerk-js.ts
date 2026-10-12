// DT-11: versión exacta de clerk-js (la UI de Clerk) que carga el navegador. Sin fijarla, @clerk/nextjs pide
// `@clerk/clerk-js@5` y la Frontend API redirige con un 307 a la última 5.x, así que Clerk podría cambiar textos, claves
// o comportamiento en prod sin que despleguemos nada. Es la de @clerk/shared 3.48.0 (la de @clerk/nextjs 6.39.7): se
// sube a la vez que @clerk/nextjs y @clerk/localizations
export const CLERK_JS_VERSION = '5.128.0';
