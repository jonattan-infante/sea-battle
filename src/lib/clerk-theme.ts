// Aspecto y textos de los componentes de Clerk (ART-DIRECTION §16.3, D53). Van en el ClerkProvider de layout.tsx, así
// que cualquier componente de Clerk sale igual: tarjeta oscura sólida de los overlays de §16.2, título en Pirata One
// dorado, botón dorado de «Zarpar» y Barlow en lo demás. Textos en español de tú (GDD Q8)
import type { ComponentProps } from 'react';
import type { ClerkProvider, SignUp } from '@clerk/nextjs';
import { esES } from '@clerk/localizations';

type ProviderProps = ComponentProps<typeof ClerkProvider>;

const FONT_UI = 'var(--font-ui), system-ui, sans-serif';
const CARD_BG = '#0B1A24'; // --ui-panel sin alfa: el contraste no depende de la foto del fondo
const MOBILE = '@media (max-width: 699.98px)';

export const CLERK_APPEARANCE: ProviderProps['appearance'] = {
  variables: {
    colorPrimary: '#F2C14E',
    colorTextOnPrimaryBackground: '#2B1D0E',
    colorBackground: CARD_BG,
    colorText: '#F5F1E6',
    colorTextSecondary: '#A9B8C2',
    colorInputBackground: '#06111A',
    colorInputText: '#F5F1E6',
    colorDanger: '#FF7A7A',
    colorSuccess: '#3DDC97',
    colorNeutral: '#F5F1E6',
    fontFamily: FONT_UI,
    fontFamilyButtons: FONT_UI,
    fontSize: '15px',
    borderRadius: '8px'
  },
  elements: {
    cardBox: {
      width: '400px',
      maxWidth: 'calc(100vw - 32px)',
      borderRadius: '12px',
      border: '1px solid var(--ui-line)',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
    },
    card: { backgroundColor: CARD_BG, border: 'none', boxShadow: 'none' },
    // El pie de Clerk lleva el mismo fondo, sin su degradado claro
    footer: { background: CARD_BG },
    headerTitle: { fontFamily: 'var(--font-pirate), serif', fontWeight: 400, fontSize: '28px', color: 'var(--ui-gold)', [MOBILE]: { fontSize: '24px' } },
    headerSubtitle: { fontSize: '15px', fontWeight: 500, color: 'var(--ui-text-dim)' },
    formFieldLabel: { fontSize: '14px', fontWeight: 600, color: 'var(--ui-text)' },
    // 16 px evitan el zoom de iOS al enfocar. Borde #6A7983 (3,9:1); --ui-line daría 2,3:1, por debajo de 3:1. Clerk limita
    // el alto a 2,25rem y pinta el borde con box-shadow desde [data-variant="default"]: se sobrescribe con el mismo selector
    formFieldInput: {
      height: '44px',
      maxHeight: 'none',
      fontSize: '16px',
      color: 'var(--ui-text)',
      backgroundColor: '#06111A',
      '&, &[data-variant="default"]': { border: '1px solid #6A7983', boxShadow: 'none' },
      '&:focus, &[data-variant="default"]:focus-within, &[data-variant="default"][data-focus-within="true"]': {
        borderColor: '#6A7983',
        boxShadow: '0 0 0 2px var(--ui-gold)'
      }
    },
    formButtonPrimary: {
      height: '44px',
      fontFamily: FONT_UI,
      fontSize: '16px',
      fontWeight: 700,
      backgroundColor: 'var(--ui-gold)',
      color: 'var(--ink)',
      '&:hover': { backgroundColor: 'var(--ui-gold-hi)' }
    },
    footerActionLink: { color: 'var(--ui-gold)', fontWeight: 600 },
    // Sin correo no hay recuperación (GDD Q13, AC-140 e): ningún enlace para recuperar la contraseña
    formFieldAction__password: { display: 'none' }
  }
};

// esES mezcla «tú» y «usted»; el juego habla de tú (D53, D56)
export const CLERK_LOCALIZATION: ProviderProps['localization'] = {
  ...esES,
  formFieldInputPlaceholder__username: 'Tu nombre de usuario',
  formFieldInputPlaceholder__password: 'Tu contraseña',
  // Hoy no salen con usuario y contraseña; así un cambio de configuración de Clerk no los deja de usted (D56)
  formFieldLabel__confirmPassword: 'Confirma la contraseña',
  // Errores que puede ver un jugador con usuario y contraseña (D58). Clerk los busca por su código, también los que no
  // trae esES (user_locked y otros): sin clave saldría el inglés del servidor
  unstable__errors: {
    ...esES.unstable__errors,
    form_identifier_not_found: 'No hay ninguna cuenta con ese nombre de usuario.',
    form_password_or_identifier_incorrect: 'Usuario o contraseña incorrectos.',
    // user_locked no está en los tipos de Clerk (su inglés es el longMessage del servidor): se añade por su código (D58)
    ...({ user_locked: 'Esta cuenta está bloqueada por un tiempo. Inténtalo más tarde.' } as Record<string, string>),
    form_password_pwned__sign_in: 'Esta contraseña salió en una filtración de datos y ya no sirve para entrar. Sin correo no se puede cambiar.',
    form_password_compromised__sign_in: 'Esta contraseña salió en una filtración de datos y ya no sirve para entrar. Sin correo no se puede cambiar.',
    form_password_untrusted__sign_in: 'Esta contraseña salió en una filtración de datos y ya no sirve para entrar. Sin correo no se puede cambiar.',
    form_password_pwned: 'Esta contraseña salió en una filtración de datos. Elige otra.',
    form_username_invalid_length: 'El nombre de usuario debe tener entre {{min_length}} y {{max_length}} caracteres.',
    form_username_needs_non_number_char: 'El nombre de usuario no puede tener solo números.',
    form_identifier_exists: 'Ya existe una cuenta con ese nombre de usuario.',
    form_param_type_invalid: 'Valor no válido.',
    captcha_invalid: 'No hemos podido comprobar que no eres un bot. Recarga la página y vuelve a intentarlo.',
    captcha_unavailable: 'No hemos podido comprobar que no eres un bot. Recarga la página y vuelve a intentarlo.',
    // Aviso bajo la contraseña del registro al llegar a 8 caracteres (D59): esES deja zxcvbn vacío y saldría el inglés
    zxcvbn: { ...esES.unstable__errors?.zxcvbn, goodPassword: 'Tu contraseña cumple los requisitos mínimos.' },
    // Va detrás de «Tu contraseña debe contener:», así que en minúscula (D60)
    passwordComplexity: { ...esES.unstable__errors?.passwordComplexity, maximumLength: 'menos de {{length}} caracteres' }
  },
  signIn: {
    ...esES.signIn,
    start: { ...esES.signIn?.start, title: 'Inicia sesión', subtitle: 'Entra con tu usuario para zarpar', actionText: '¿No tienes cuenta?', actionLink: 'Regístrate' },
    password: { ...esES.signIn?.password, title: 'Escribe tu contraseña', subtitle: 'para zarpar' }
  },
  signUp: {
    ...esES.signUp,
    // El aviso de Q25 (AC-140 e): se lee antes de elegir la contraseña
    start: { ...esES.signUp?.start, title: 'Crea tu cuenta', subtitle: 'Guarda tu contraseña: no se puede recuperar', actionText: '¿Ya tienes cuenta?', actionLink: 'Inicia sesión' },
    continue: { ...esES.signUp?.continue, title: 'Completa los datos que faltan', actionText: '¿Ya tienes cuenta?' }
  }
};

// Solo en /sign-up el subtítulo es el aviso de Q25, en dorado
export const SIGN_UP_APPEARANCE: ComponentProps<typeof SignUp>['appearance'] = {
  elements: { headerSubtitle: { color: 'var(--ui-gold)' } }
};
