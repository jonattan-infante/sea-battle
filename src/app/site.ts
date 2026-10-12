// Identidad del sitio, compartida por los metadatos de layout.tsx y el manifest (AC-141: theme_color = themeColor)
export const SITE = {
  name: 'Sea Battle',
  description: 'Batallas navales multijugador en el navegador: navega, hunde piratas y mejora tu barco.',
  themeColor: '#0f3f5c', // el fondo de «Conectando» (ART-DIRECTION §16.2)
} as const;
