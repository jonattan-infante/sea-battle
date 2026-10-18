// Iconos de línea 24×24, trazo de 2 px y currentColor (ART-DIRECTION §13). Sin dependencias. Swords copia el de
// Lucide (ISC) y Coins y Wrench siguen su construcción; el resto son dibujos propios. CloudOff copia el de Lucide (ISC,
// lucide-static 0.469.0): progreso sin guardar (D50). Bomb copia el de Lucide (ISC, lucide-static 0.469.0): la Cañonera.
import React from 'react';

type IconProps = { size?: number; className?: string; title?: string };

function Svg({ size = 24, className, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export const Anchor = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="5" r="2.5" />
    <path d="M12 7.5V21M7 11h10M4 14a8 7 0 0 0 16 0" />
  </Svg>
);

export const Skull = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.3 3 5.4V20h10v-3.6c1.8-1.1 3-2.8 3-5.4a8 8 0 0 0-8-8Z" />
    <circle cx="9" cy="11.5" r="1.6" />
    <circle cx="15" cy="11.5" r="1.6" />
    <path d="M10 20v-2.5M14 20v-2.5" />
  </Svg>
);

// Corona del Capitán pirata (ART-DIRECTION §13: SVG propio)
export const Crown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 18 2 7l5 5 5-8 5 8 5-5-2 11Z" />
    <path d="M5 21h14" />
  </Svg>
);

// Bomba de la Cañonera pirata (ART-DIRECTION §4.3): copia el de Lucide (ISC, lucide-static 0.469.0)
export const Bomb = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="13" r="9" />
    <path d="M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95" />
    <path d="m22 2-1.5 1.5" />
  </Svg>
);

export const Coins = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="6" />
    <path d="M17.5 10.2A6 6 0 1 1 10.2 17.5" />
    <path d="M9 6.5v5" />
  </Svg>
);

export const Star = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
  </Svg>
);

export const Crosshair = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
  </Svg>
);

export const Wrench = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-1.5 1.5a6 6 0 0 1-6.6 1.3L7 21.6a2 2 0 0 1-2.8-2.8L10 13a6 6 0 0 1 1.3-6.6L12.8 5l1.7 1.5Z" />
  </Svg>
);

export const Shield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V6Z" />
  </Svg>
);

export const Sailboat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 3v13M11 3 4 14h7M13 6l6 8h-6" />
    <path d="M3 17h18l-2 3H5Z" />
  </Svg>
);

export const Swords = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />
    <path d="M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2" />
  </Svg>
);

export const Stop = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2h8l6 6v8l-6 6H8l-6-6V8Z" />
    <path d="m15 9-6 6M9 9l6 6" />
  </Svg>
);

export const Store = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9 5 4h14l2 5M3 9h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />
    <path d="M5 13v8h14v-8M10 21v-5h4v5" />
  </Svg>
);

export const Target = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Svg>
);

export const Close = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

// Centrar (vista libre, ART-DIRECTION §12.8, D89; dibujo propio): las 4 esquinas de un visor con la estrella del barco
// propio a 0,58 dentro, con el mismo trazo de 2 (3,45 × 0,58). Enlaza el botón con el chip propio, que lleva la estrella
export const Recenter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
    <g transform="translate(12 12) scale(0.58) translate(-12 -11.5)" strokeWidth={3.45}>
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
    </g>
  </Svg>
);

export const Compass = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" />
  </Svg>
);

export const CloudOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="m2 2 20 20" />
    <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
    <path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" />
  </Svg>
);

export const Alert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 2 20h20Z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);
