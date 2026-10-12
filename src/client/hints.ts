// Pistas de primera sesión (AC-79). Texto según la entrada: ratón o pantalla táctil (ART-DIRECTION §12.1). En un
// módulo sin React para que el e2e de AC-110 mida los mismos textos que pinta el HUD
export const HINTS: readonly { mouse: string; touch: string }[] = [
  { mouse: 'Haz clic en el agua para navegar', touch: 'Toca el agua para navegar' },
  { mouse: 'Haz clic en un barco para seleccionarlo', touch: 'Toca un barco para seleccionarlo' },
  { mouse: 'Pulsa Espacio o Atacar para disparar al objetivo', touch: 'Pulsa Atacar para disparar al objetivo' }
];
