// AD-35 (D53, ART-DIRECTION §16.3) y AC-140: /sign-in y /sign-up se ven como el juego. Sin WebGL, contra el servidor sin
// invitado (PORTS.auth) y la instancia de desarrollo de Clerk de .env.local. La página carga sin sesión.
// El error de «contraseña incorrecta» y el paso de la contraseña necesitan un usuario que exista: solo con
// E2E_CLERK_USERNAME, y sin escribir nada en Clerk. Sin ella, esa parte se registra como NO VERIFICADO y el resto se
// comprueba igual. Los errores del registro (D58) necesitan un Testing Token de Clerk, que se pide con la
// CLERK_SECRET_KEY de desarrollo (sk_test_); sin ella, NO VERIFICADO
import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { parseEnv } from 'util';
import { PORTS } from '../playwright.config';
import { CLERK_LOCALIZATION } from '../src/lib/clerk-theme';

const AUTH = `http://localhost:${PORTS.auth}`;
// Sin traza en este archivo: las URL de la Frontend API llevan el Testing Token y no deben quedar en test-results
test.use({ trace: 'off' });
const OUT = process.env.D53_OUT; // carpeta para las capturas de revisión visual (opcional)
const Q25 = 'Guarda tu contraseña: no se puede recuperar';
const ENGLISH = ['Sign in', 'Sign up', 'Continue', 'Username', 'Password', 'Welcome', 'account', "Don't have an account?"];
const FORMAL = ['Ingrese', 'Introduzca', 'Regístrese', 'Confirme', 'Rellene', ' su ']; // de usted (D56): el juego habla de tú
const RECOVERY = /olvid|forgot|reset|restablec|recuperar/i;
// Tabla de errores de ART-DIRECTION §16.3 (D58–D60), por su ruta dentro de unstable__errors
const LEAKED = 'Esta contraseña salió en una filtración de datos y ya no sirve para entrar. Sin correo no se puede cambiar.';
const BOT = 'No hemos podido comprobar que no eres un bot. Recarga la página y vuelve a intentarlo.';
const ERRORS: Record<string, string> = {
  form_identifier_not_found: 'No hay ninguna cuenta con ese nombre de usuario.',
  form_password_or_identifier_incorrect: 'Usuario o contraseña incorrectos.',
  user_locked: 'Esta cuenta está bloqueada por un tiempo. Inténtalo más tarde.',
  form_password_pwned__sign_in: LEAKED,
  form_password_compromised__sign_in: LEAKED,
  form_password_untrusted__sign_in: LEAKED,
  form_password_pwned: 'Esta contraseña salió en una filtración de datos. Elige otra.',
  form_username_invalid_length: 'El nombre de usuario debe tener entre {{min_length}} y {{max_length}} caracteres.',
  form_username_needs_non_number_char: 'El nombre de usuario no puede tener solo números.',
  form_identifier_exists: 'Ya existe una cuenta con ese nombre de usuario.',
  form_param_type_invalid: 'Valor no válido.',
  captcha_invalid: BOT,
  captcha_unavailable: BOT,
  'zxcvbn.goodPassword': 'Tu contraseña cumple los requisitos mínimos.',
  'passwordComplexity.maximumLength': 'menos de {{length}} caracteres'
};
const GOLD = 'rgb(242, 193, 78)';
const CARD = 'rgb(11, 26, 36)';

type Size = { w: number; h: number; label: string };
type Rgb = [number, number, number];

const lab = ([r, g, b]: Rgb) => {
  const lin = [r, g, b].map((v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const f = [
    (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047,
    0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2],
    (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883
  ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
};
const deltaE = (a: Rgb, b: Rgb) => {
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const parseRgb = (css: string): Rgb => (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number) as Rgb;
const luminance = ([r, g, b]: Rgb) => {
  const c = [r, g, b].map((v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: Rgb, b: Rgb) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// La página está lista cuando sus imágenes cargaron, están decodificadas y pintadas, y sus fuentes cargaron (y, en las de Clerk, cuando la tarjeta tiene su botón). O-63: next/image pinta con decoding="async", así que `complete` no basta
async function settle(page: Page) {
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20_000 });
  await page.evaluate(() => Promise.all([...Array.from(document.images).map((i) => i.decode()), document.fonts.ready]).then(() => {}));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // 2 frames: el que la pinta y uno más
}

// Los 4 píxeles a 8 px de las esquinas del viewport (AD-35 c)
async function corners(page: Page, { w, h }: Size): Promise<Rgb[]> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async ([data, pts]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const k = img.width / innerWidth; // DPR de la captura
    const c = new OffscreenCanvas(img.width, img.height).getContext('2d')!;
    c.drawImage(img, 0, 0);
    return pts.map(([x, y]) => Array.from(c.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data.slice(0, 3)));
  }, [png, [[8, 8], [w - 9, 8], [8, h - 9], [w - 9, h - 9]]] as const) as Promise<Rgb[]>;
}

async function capture(page: Page, name: string) {
  if (!OUT) return;
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

const cardText = (page: Page) =>
  page.evaluate(() => (document.querySelector('.cl-cardBox') as HTMLElement).innerText).then((t) =>
    // Fuera de la regla, la marca y el aviso de Clerk (AC-140 c)
    t.split('\n').map((l) => l.trim()).filter((l) => l && !/^(Secured by|Development mode)$/.test(l)).join('\n')
  );

// Texto de la tarjeta y placeholders de los campos (que no salen en innerText): español y de tú (AD-35 d)
async function expectSpanish(page: Page, where: string) {
  const text = await cardText(page);
  const placeholders = await page.locator('.cl-cardBox input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).placeholder).filter(Boolean));
  console.log(`AD-35 ${where}: placeholders ${JSON.stringify(placeholders)}`);
  expect(text, `${where}: «Continuar»`).toContain('Continuar');
  for (const t of [text, ...placeholders]) {
    for (const s of ENGLISH) expect(t.toLowerCase(), `${where}: sin «${s}» en «${t}»`).not.toContain(s.toLowerCase());
    for (const s of FORMAL) expect(` ${t.replace(/\s+/g, ' ')} `, `${where}: sin «${s.trim()}» en «${t}»`).not.toContain(s);
  }
}

async function checkPage(page: Page, route: '/sign-in' | '/sign-up', size: Size, landing: Rgb[]) {
  const where = `${route} ${size.label}`;
  await page.goto(`${AUTH}${route}`);
  await expect(page.locator('.cl-formButtonPrimary')).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await capture(page, `${route.slice(1)}-${size.label}`);

  // (a) y (b): centrada en los dos ejes; en 844×390, arriba a 16 px y solo con scroll vertical
  const m = await page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, visible: (el as HTMLElement).checkVisibility() };
    };
    return { card: box('.cl-cardBox')!, logo: box('.auth__logo'), back: box('.auth__back'), scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight };
  });
  const dx = m.card.x + m.card.w / 2 - m.vw / 2;
  const dy = m.card.y + m.card.h / 2 - m.vh / 2;
  const tall = size.h < 560;
  console.log(`AD-35 ${where}: tarjeta ${m.card.w.toFixed(0)}×${m.card.h.toFixed(0)} en (${m.card.x.toFixed(1)}, ${m.card.y.toFixed(1)}) · Δ centro ${dx.toFixed(1)} / ${dy.toFixed(1)} px · scroll ${m.scrollW}×${m.scrollH} · logo ${m.logo?.visible ? `a ${(m.card.y - (m.logo.y + m.logo.h)).toFixed(0)} px` : 'oculto'} · vuelta ${m.back ? `a ${(m.back.y - (m.card.y + m.card.h)).toFixed(0)} px` : 'no está'}`);
  expect(Math.abs(dx), `${where}: centrada en horizontal`).toBeLessThanOrEqual(2);
  if (tall) {
    expect(Math.abs(m.card.y - 16), `${where}: borde superior a 16 px`).toBeLessThanOrEqual(2);
    expect(m.logo?.visible, `${where}: sin logo`).toBe(false);
  } else {
    expect(Math.abs(dy), `${where}: centrada en vertical`).toBeLessThanOrEqual(2);
    expect(m.logo?.visible, `${where}: logo`).toBe(true);
  }
  expect(m.scrollW, `${where}: sin scroll horizontal`).toBe(m.vw);
  expect(m.card.w, `${where}: ancho de la tarjeta`).toBeCloseTo(Math.min(400, size.w - 32), 0);

  // (c) Fondo: las esquinas, como en la landing
  const own = await corners(page, size);
  const dE = own.map((c, i) => deltaE(c, landing[i]));
  console.log(`AD-35 ${where}: ΔE76 de las esquinas frente a la landing ${dE.map((d) => d.toFixed(2)).join(' / ')}`);
  for (const d of dE) expect(d, `${where}: esquina como la landing`).toBeLessThanOrEqual(3);

  // (d) Idioma en el paso inicial
  await expectSpanish(page, where);

  // (e) Aspecto: Barlow en botón, campos y etiquetas; Pirata One en el título; fondos y alturas
  const look = await page.evaluate(() => {
    const cs = (sel: string) => {
      const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => e.getBoundingClientRect().height > 0);
      return el ? getComputedStyle(el) : null;
    };
    const visibleHeights = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel)).map((e) => e.getBoundingClientRect().height).filter((h) => h > 0);
    const norm = (f: string | undefined) => (f ?? '').replace(/\s+/g, ' ').trim();
    return {
      body: norm(getComputedStyle(document.body).fontFamily),
      pirate: norm(getComputedStyle(document.querySelector('.auth__logo')!).fontFamily),
      button: norm(cs('.cl-formButtonPrimary')?.fontFamily),
      input: norm(cs('.cl-formFieldInput')?.fontFamily),
      label: norm(cs('.cl-formFieldLabel')?.fontFamily),
      title: norm(cs('.cl-headerTitle')?.fontFamily),
      cardBg: cs('.cl-card')!.backgroundColor,
      footerBg: cs('.cl-footer')!.backgroundColor,
      inputBg: cs('.cl-formFieldInput')!.backgroundColor,
      buttonBg: cs('.cl-formButtonPrimary')!.backgroundColor,
      inputs: visibleHeights('.cl-formFieldInput'),
      buttons: visibleHeights('.cl-formButtonPrimary'),
      colors: {
        title: cs('.cl-headerTitle')!.color,
        subtitle: cs('.cl-headerSubtitle')!.color,
        label: cs('.cl-formFieldLabel')!.color,
        inputText: cs('.cl-formFieldInput')!.color,
        inputBorder: cs('.cl-formFieldInput')!.borderTopColor,
        buttonText: cs('.cl-formButtonPrimary')!.color,
        actionText: cs('.cl-footerActionText')!.color,
        actionLink: cs('.cl-footerActionLink')!.color
      },
      recovery: Array.from(document.querySelectorAll<HTMLElement>('.cl-cardBox a, .cl-cardBox button, .cl-formFieldAction, [class*="formFieldAction"]'))
        .filter((e) => e.getBoundingClientRect().height > 0)
        .map((e) => e.innerText)
    };
  });
  console.log(`AD-35 ${where}: fuentes body «${look.body}» · título «${look.title}» · fondos tarjeta ${look.cardBg}, pie ${look.footerBg}, campo ${look.inputBg}, botón ${look.buttonBg} · alturas campos ${look.inputs.join('/')} botón ${look.buttons.join('/')}`);
  expect(look.button, `${where}: fuente del botón`).toBe(look.body);
  expect(look.input, `${where}: fuente de los campos`).toBe(look.body);
  expect(look.label, `${where}: fuente de las etiquetas`).toBe(look.body);
  expect(look.title, `${where}: título en Pirata One`).toBe(look.pirate);
  expect(look.cardBg).toBe(CARD);
  expect(look.buttonBg).toBe(GOLD);
  for (const bg of [look.cardBg, look.footerBg, look.inputBg]) expect(Math.min(...parseRgb(bg)), `${where}: fondo no blanco (${bg})`).toBeLessThan(200);
  for (const h of [...look.inputs, ...look.buttons]) expect(h, `${where}: alto ≥ 44`).toBeGreaterThanOrEqual(44);

  // (h) Contrastes de D53: texto ≥ 4,5:1 sobre la tarjeta (o el botón) y borde de campo ≥ 3:1 sobre el fondo del campo
  const card = parseRgb(look.cardBg);
  const c = look.colors;
  const ratios = {
    título: contrast(parseRgb(c.title), card),
    subtítulo: contrast(parseRgb(c.subtitle), card),
    etiqueta: contrast(parseRgb(c.label), card),
    campo: contrast(parseRgb(c.inputText), parseRgb(look.inputBg)),
    botón: contrast(parseRgb(c.buttonText), parseRgb(look.buttonBg)),
    pie: contrast(parseRgb(c.actionText), card),
    enlace: contrast(parseRgb(c.actionLink), card),
    borde: contrast(parseRgb(c.inputBorder), parseRgb(look.inputBg))
  };
  console.log(`AD-35 ${where}: contrastes ${Object.entries(ratios).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')}`);
  for (const [k, v] of Object.entries(ratios)) expect(v, `${where}: contraste de ${k}`).toBeGreaterThanOrEqual(k === 'borde' ? 3 : 4.5);
  // Foco del campo: anillo de 2 px en oro, ≥ 3:1 sobre la tarjeta
  await page.locator('.cl-formFieldInput').first().focus();
  // Clerk anima el box-shadow 200 ms: se lee al terminar la transición
  const readRing = () => page.locator('.cl-formFieldInput').first().evaluate((e) => getComputedStyle(e).boxShadow);
  await expect.poll(readRing, { timeout: 2000 }).toBe(`${GOLD} 0px 0px 0px 2px`);
  const ring = await readRing();
  console.log(`AD-35 ${where}: foco ${ring}`);
  expect(ring).toContain(GOLD);
  expect(ring).toMatch(/0px 0px 0px 2px/);
  expect(contrast(parseRgb(GOLD), card)).toBeGreaterThanOrEqual(3);
  await page.locator('.cl-formFieldInput').first().blur();

  // (g) Q25 solo en el registro, encima del primer campo y en oro; en el inicio de sesión, ningún enlace de recuperación
  const sub = await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('.cl-headerSubtitle')!;
    const input = Array.from(document.querySelectorAll<HTMLElement>('.cl-formFieldInput')).find((e) => e.getBoundingClientRect().height > 0)!;
    return { text: s.innerText, color: getComputedStyle(s).color, bottom: s.getBoundingClientRect().bottom, inputTop: input.getBoundingClientRect().top };
  });
  if (route === '/sign-up') {
    expect(sub.text).toBe(Q25);
    expect(sub.color).toBe(GOLD);
    expect(sub.bottom).toBeLessThanOrEqual(sub.inputTop);
  } else {
    expect(sub.text).not.toBe(Q25);
    expect(look.recovery.filter((t) => RECOVERY.test(t)), `${where}: sin enlace de recuperación`).toEqual([]);
  }

  // (f) Vuelta a la portada: se ve (en 844×390, tras el scroll), mide ≥ 44 px y lleva a /
  const back = page.getByTestId('auth-back');
  await back.scrollIntoViewIfNeeded();
  await expect(back).toBeInViewport();
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(back).toHaveAttribute('href', '/');
}

// Error en el inicio de sesión: usuario inexistente siempre; contraseña incorrecta y paso de la contraseña, con usuario
async function checkErrors(page: Page, size: Size) {
  const where = `/sign-in ${size.label}`;
  await page.goto(`${AUTH}/sign-in`);
  await expect(page.locator('.cl-formButtonPrimary')).toBeVisible({ timeout: 30_000 });
  await page.locator('.cl-formFieldInput__identifier').fill(`zz-no-existe-${Date.now().toString(36)}`);
  await page.locator('.cl-formButtonPrimary').click();
  const error = page.locator('.cl-formFieldErrorText').first();
  await expect(error).toBeVisible({ timeout: 15_000 });
  console.log(`AD-35 ${where}: error de usuario inexistente «${await error.innerText()}»`);
  await expect(error).toHaveText(ERRORS.form_identifier_not_found); // D58
  await expectSpanish(page, `${where}, con el error de usuario inexistente`);

  // Contraseña incorrecta: con un usuario dedicado que tenga contraseña (sea-battle-login-e2e), nunca el del arnés remoto,
  // y en un solo tamaño, porque Clerk de desarrollo bloquea la cuenta 60 min tras 100 intentos fallidos
  const username = process.env.E2E_CLERK_USERNAME;
  if (!username) {
    console.log(`AD-35 ${where}: NO VERIFICADO el paso de la contraseña ni su error: falta E2E_CLERK_USERNAME (un usuario dedicado con contraseña en la instancia de desarrollo)`);
    return;
  }
  if (size.label !== '1440×900') {
    console.log(`AD-35 ${where}: el paso de la contraseña se prueba solo en 1440×900, para no gastar intentos`);
    return;
  }
  await page.goto(`${AUTH}/sign-in`);
  await expect(page.locator('.cl-formButtonPrimary')).toBeVisible({ timeout: 30_000 });
  await page.locator('.cl-formFieldInput__identifier').fill(username);
  await page.locator('.cl-formButtonPrimary').click();
  const password = page.locator('.cl-formFieldInput__password');
  await expect(password).toBeVisible({ timeout: 15_000 });
  const links = await page.locator('.cl-cardBox a:visible, .cl-cardBox button:visible').allInnerTexts();
  console.log(`AD-35 ${where}: paso de la contraseña, enlaces y botones ${JSON.stringify(links)}`);
  expect(links.filter((t) => RECOVERY.test(t)), `${where}: sin enlace de recuperación en el paso de la contraseña`).toEqual([]);
  await password.fill(`incorrecta-${Date.now().toString(36)}`);
  const attempt = page.waitForResponse((r) => /\/v1\/client\/sign_ins\/[^/]+\/attempt_first_factor/.test(r.url()), { timeout: 15_000 });
  await page.locator('.cl-formButtonPrimary').click();
  const body = (await (await attempt).json().catch(() => null)) as { errors?: { code?: string }[] } | null;
  const code = body?.errors?.[0]?.code;
  if (code === 'user_locked') {
    console.log(`AD-35 ${where}: NO VERIFICADO el error de contraseña incorrecta: Clerk tiene bloqueada la cuenta de prueba (user_locked)`);
    return;
  }
  await expect(page.locator('.cl-formFieldErrorText').first()).toBeVisible({ timeout: 15_000 });
  console.log(`AD-35 ${where}: error de contraseña incorrecta (${code}) «${await page.locator('.cl-formFieldErrorText').first().innerText()}»`);
  await expectSpanish(page, `${where}, con el error de contraseña incorrecta`);
}

// Avisos de la contraseña mientras se escribe en el registro, solo tecleando y sin enviar: corta (passwordComplexity de
// esES), de 8 caracteres o más (zxcvbn.goodPassword, D59) y de 72 (passwordComplexity.maximumLength, D60)
async function checkPasswordHint(page: Page, size: Size) {
  await page.goto(`${AUTH}/sign-up`);
  await expect(page.locator('.cl-formButtonPrimary')).toBeVisible({ timeout: 30_000 });
  const password = page.locator('.cl-formFieldInput__password');
  const cases = [
    { label: 'de 3 caracteres', value: 'abc', selector: '.cl-formFieldErrorText__password', text: 'Tu contraseña debe contener: 8 caracteres o más.' },
    { label: 'de 8 caracteres o más', value: `Velero-${Date.now().toString(36)}-Norte`, selector: '.cl-formFieldSuccessText__password', text: ERRORS['zxcvbn.goodPassword'] },
    { label: 'de 72 caracteres', value: 'Velero-Norte-'.repeat(6).slice(0, 72), selector: '.cl-formFieldErrorText__password', text: 'Tu contraseña debe contener: menos de 72 caracteres.' }
  ];
  for (const { label, value, selector, text } of cases) {
    const where = `/sign-up ${size.label}, con una contraseña ${label}`;
    await password.fill(value);
    await password.blur();
    const hint = page.locator(selector);
    await expect(hint).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => hint.innerText(), { message: `${where}: aviso`, timeout: 5_000 }).toBe(text);
    const color = parseRgb(await hint.evaluate((e) => getComputedStyle(e).color));
    console.log(`AD-35 ${where}: aviso «${await hint.innerText()}» · ${(await hint.getAttribute('class'))!.split(' ')[1]} · contraste ${contrast(color, parseRgb(CARD)).toFixed(1)}`);
    expect(await cardText(page), `${where}: sin «meets» ni «requirements»`).not.toMatch(/meets|requirements/i);
    await expectSpanish(page, where);
  }
}

async function run(page: Page, size: Size) {
  await page.goto(`${AUTH}/`);
  await settle(page);
  const landing = await corners(page, size);
  for (const route of ['/sign-in', '/sign-up'] as const) await checkPage(page, route, size, landing);
  await checkPasswordHint(page, size);
  await checkErrors(page, size);
  // La vuelta navega de verdad a la landing
  await page.goto(`${AUTH}/sign-up`);
  await expect(page.locator('.cl-formButtonPrimary')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('auth-back').click();
  await page.waitForURL((u) => u.pathname === '/');
}

test.describe('AD-35 · AC-140: inicio de sesión y registro como el juego', () => {
  test('1440×900: tarjeta centrada, fondo de la landing, en español, con el aspecto de §16.3 y la vuelta a la portada', async ({ page }) => {
    test.setTimeout(120_000);
    await run(page, { w: 1440, h: 900, label: '1440×900' });
  });

  test('390×844: tarjeta de 358 px centrada y logo a 36 px @mobile', async ({ page }) => {
    test.setTimeout(120_000);
    await run(page, { w: 390, h: 844, label: '390×844' });
  });

  test('844×390: sin logo, tarjeta arriba a 16 px y solo scroll vertical @mobile', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 844, height: 390 });
    await run(page, { w: 844, h: 390, label: '844×390' });
  });
});

// La tabla de errores (D58–D60) está entera en la localización, también lo que no se puede provocar en el e2e
test('D58–D60: las claves de la tabla de errores están en la localización de Clerk', () => {
  const errors = CLERK_LOCALIZATION?.unstable__errors as Record<string, unknown>;
  for (const [key, text] of Object.entries(ERRORS)) {
    const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], errors);
    expect(value, `unstable__errors.${key}`).toBe(text);
  }
});

// HIPÓTESIS de D58: Clerk busca el error por su código en unstable__errors, también user_locked, que no está en sus tipos
// ni en esES. Se comprueba con una respuesta simulada de la Frontend API al crear el inicio de sesión: no toca Clerk
test('D58: user_locked sale con el texto de la tabla (respuesta simulada de Clerk)', async ({ page }) => {
  const where = '/sign-in 1440×900, con user_locked simulado';
  await page.route(/\/v1\/client\/sign_ins\?/, (route) =>
    route.request().method() !== 'POST'
      ? route.continue()
      : route.fulfill({
          status: 403,
          json: {
            errors: [{ code: 'user_locked', message: 'Account locked', long_message: 'Your account is locked. You will be able to try again in 60 minutes. For more information, contact support.', meta: { lockout_expires_in_seconds: 3600 } }],
            clerk_trace_id: 'e2e'
          }
        })
  );
  await page.goto(`${AUTH}/sign-in`);
  await expect(page.locator('.cl-formButtonPrimary')).toBeVisible({ timeout: 30_000 });
  await page.locator('.cl-formFieldInput__identifier').fill('zz-bloqueado');
  await page.locator('.cl-formButtonPrimary').click();
  const alert = page.locator('.cl-cardBox').getByText(ERRORS.user_locked);
  await expect(alert).toBeVisible({ timeout: 15_000 });
  console.log(`AD-35 ${where}: «${await alert.innerText()}» en ${(await alert.getAttribute('class'))?.split(' ')[0]}`);
  await expectSpanish(page, where);
});

// CLERK_SECRET_KEY del entorno o de .env.local (la de la instancia del servidor local). Nunca se imprime
const secretKey = () =>
  process.env.CLERK_SECRET_KEY ?? (fs.existsSync('.env.local') ? parseEnv(fs.readFileSync('.env.local', 'utf8')).CLERK_SECRET_KEY : undefined);

// Registro con un usuario de 3 caracteres y otro solo numérico (D58). El envío lo para la protección contra bots de Clerk
// (Turnstile), así que va con un Testing Token de @clerk/testing, solo de la instancia de desarrollo. Solo se envían
// usuarios que la instancia rechaza según su /v1/environment, y se comprueba que ningún registro se completa: no se crea
// ninguna cuenta
test.describe('D58 en el registro, con Testing Token', () => {
  test('1440×900: usuario de 3 caracteres y usuario solo numérico', async ({ page }) => {
    test.setTimeout(120_000);
    const key = secretKey();
    if (!key) {
      console.log('AD-35 /sign-up 1440×900: NO VERIFICADO los errores de usuario de 3 caracteres y solo numérico: falta CLERK_SECRET_KEY (de la instancia de desarrollo) para pedir el Testing Token que salta Turnstile');
      return;
    }
    if (!key.startsWith('sk_test_')) throw new Error('CLERK_SECRET_KEY no es de una instancia de desarrollo (sk_test_): el spec no la usa');
    await page.goto(`${AUTH}/sign-up`);
    const instance = await page
      .waitForFunction(() => (window.Clerk?.loaded ? { publishableKey: window.Clerk.publishableKey, frontendApi: window.Clerk.frontendApi } : null), null, { timeout: 30_000 })
      .then((h) => h.jsonValue());
    if (!instance) throw new Error('/sign-up no carga Clerk');
    expect(instance.publishableKey.startsWith('pk_test_'), 'la página usa la instancia de desarrollo de Clerk').toBe(true);
    const environment = (await (await fetch(`https://${instance.frontendApi}/v1/environment`)).json()) as {
      user_settings: { username_settings: { min_length: number; max_length: number; allow_numeric_usernames: boolean } };
    };
    const limits = environment.user_settings.username_settings;
    const cases = [
      { label: 'de 3 caracteres', username: 'zzq', rejected: limits.min_length > 3, code: 'form_username_invalid_length', text: ERRORS.form_username_invalid_length.replace('{{min_length}}', String(limits.min_length)).replace('{{max_length}}', String(limits.max_length)) },
      { label: 'solo numérico', username: String(Date.now()).slice(-8), rejected: !limits.allow_numeric_usernames, code: 'form_username_needs_non_number_char', text: ERRORS.form_username_needs_non_number_char }
    ];
    await clerkSetup({ publishableKey: instance.publishableKey, frontendApiUrl: instance.frontendApi, secretKey: key, dotenv: false });
    await setupClerkTestingToken({ page, options: { frontendApiUrl: instance.frontendApi } });
    for (const c of cases) {
      const where = `/sign-up 1440×900, con un usuario ${c.label}`;
      if (!c.rejected) {
        console.log(`AD-35 ${where}: NO VERIFICADO: la instancia aceptaría ese usuario (${JSON.stringify(limits)}), así que no se envía`);
        continue;
      }
      await page.goto(`${AUTH}/sign-up`);
      await expect(page.locator('.cl-formButtonPrimary')).toBeVisible({ timeout: 30_000 });
      await page.locator('.cl-formFieldInput__username').fill(c.username);
      await page.locator('.cl-formFieldInput__password').fill(`Velero-${Date.now().toString(36)}-Norte`);
      const sent = page.waitForResponse((r) => r.request().method() === 'POST' && /\/v1\/client\/sign_ups\?/.test(r.url()), { timeout: 20_000 });
      await page.locator('.cl-formButtonPrimary').click();
      const response = await sent.catch(() => null);
      if (!response) throw new Error(`${where}: no salió ninguna petición sign_ups en 20 s (¿el Testing Token no saltó Turnstile?)`);
      const body = (await response.json().catch(() => null)) as { response?: { status?: string; created_user_id?: string | null }; errors?: { code?: string }[] } | null;
      expect(body?.response?.status, `${where}: el registro no se completa`).not.toBe('complete');
      expect(body?.response?.created_user_id ?? null, `${where}: no se crea ninguna cuenta`).toBeNull();
      expect(body?.errors?.[0]?.code, `${where}: código del error`).toBe(c.code);
      const error = page.locator('.cl-formFieldErrorText__username');
      await expect(error).toBeVisible({ timeout: 15_000 });
      console.log(`AD-35 ${where}: HTTP ${response.status()} ${c.code} «${await error.innerText()}»`);
      await expect(error).toHaveText(c.text);
      await expectSpanish(page, where);
    }
  });
});
