import type { HomeDict } from "./home-en";

/** First-pass Spanish draft — Tarik verifies before deploy (MOO-406 Phase 1). */
export const homeEs: HomeDict = {
  lang: "es",
  meta: {
    title: "BadgerBrief — Guía Electoral de Wisconsin 2026",
    description:
      "Guía electoral de Wisconsin no partidista y con fuentes verificables: tu papeleta, los candidatos, el dinero y cómo votar exactamente.",
  },
  crumbs: { home: "Inicio" },
  stamp: "Wisconsin 2026",
  h1: "Conoce tu papeleta antes de rellenarla.",
  introBeforeDate: "La primaria partidista de Wisconsin es el",
  introAfterDate:
    ". Esta es una guía no partidista y con fuentes verificables para cada contienda estatal y del Congreso en ella — quién se postula, qué dicen y exactamente cómo votar.",
  primaryDateFallback: "11 de agosto de 2026",
  howToVoteCta: "Cómo votar →",
  governorsRaceCta: "Contienda por gobernador",
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
    districtRacesSummary: (count) => `Encuentra las contiendas de tu distrito (${count})`,
  },
};
