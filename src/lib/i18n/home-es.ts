import type { HomeDict } from "./home-en";

/** First-pass Spanish draft — Tarik verifies before deploy (MOO-406 Phase 1). */
export const homeEs: HomeDict = {
  lang: "es",
  meta: {
    title: "BadgerBrief — Guía Electoral de Wisconsin 2026",
    description:
      "Guía electoral de Wisconsin no partidista y con fuentes verificables: su papeleta, los candidatos, el dinero y cómo votar exactamente.",
  },
  crumbs: { home: "Inicio" },
  stamp: "Wisconsin 2026",
  h1: "Conozca su papeleta antes de rellenarla.",
  introBeforeDate: "La primaria partidista de Wisconsin es el",
  introAfterDate:
    ". Esta es una guía no partidista y con fuentes verificables para cada contienda estatal y del Congreso en ella — quién se postula, qué dicen y exactamente cómo votar.",
  primaryDateFallback: "11 de agosto de 2026",
  howToVoteCta: "Cómo votar →",
  governorsRaceCta: "Contienda por gobernador",
  matchCta: "¿Qué te importa? →",
  // ponytail: guided path is EN-only v1 (home-guide.tsx gates lang !== "es"),
  // so this never renders — kept only to satisfy the ES-key-parity test.
  startHereCta: "New here? Start here →",
  deadlines: {
    heading: "¿Cuáles son los plazos de la primaria de Wisconsin de 2026?",
    pollsOpenPrefix: "Las urnas abren",
    detailsPrefix: "Los detalles de voto ausente, registro y voto anticipado están en la",
    linkText: "página de cómo votar",
    suffix: ", con cada plazo enlazado a su fuente oficial.",
  },
  races: {
    heading: "¿Qué contiendas hay en la papeleta de la primaria de Wisconsin de 2026?",
    countSuffix: " contiendas: cargos estatales, los ocho distritos de la Cámara de EE. UU., la corte suprema estatal y la legislatura.",
    districtRacesSummary: (count) => `Encuentre las contiendas de su distrito (${count})`,
  },
  // First-pass Spanish — Tarik verifies. Ko-fi button label "Support me" is the
  // widget's own text, left in English on purpose so it matches the visible button.
  support: {
    heading: "Una sola persona hace esta guía",
    body:
      "Yo mismo construyo y pago el alojamiento de BadgerBrief — sin anuncios, sin muro de pago, sin dinero de campañas ni de partidos. Mantenerla en línea y actualizada durante las elecciones sale de mi propio bolsillo. Si le ayudó a entender su papeleta, toque el botón ☕ Support me en la esquina — cualquier cantidad ayuda.",
    wipPrefix: "Esto es un trabajo en progreso. ¿Ve un error? ",
    wipLinkText: "Avíseme en el formulario de comentarios",
    wipSuffix: ".",
    cta: "Apoye el trabajo →",
  },
};
