import type { ChromeDict } from "./chrome-dict";

/**
 * Spanish chrome strings (MOO-406). Draft translation — same formal register
 * ("usted"-adjacent, no contractions) as vote-es.ts. Controller reviews for
 * final accuracy in Task 5; keys mirror chrome-en.ts exactly.
 */
export const chromeEs: ChromeDict = {
  navLabels: {
    "/races/wi-gov-2026": "Contiendas",
    "/match": "Qué te importa",
    "/ads": "Rastreador de anuncios",
    "/news": "Noticias",
    "/vote": "Cómo votar",
    "/chat": "Ayuda al votante",
    "/brief": "Mi resumen",
    "/about": "Acerca de",
    "/methodology": "Metodología",
  },
  ctaAug11: "11 de agosto",
  footer: {
    mission:
      "BadgerBrief es una guía electoral de Wisconsin no partidista y con fuentes enlazadas. " +
      "Enlazamos cada afirmación a su fuente, distinguimos la información oficial de las " +
      "declaraciones de campaña y la cobertura periodística, y nunca hacemos endosos.",
    missionLink: "Cómo verificamos nuestras fuentes",
    myVote:
      "La logística electoral siempre se confirma con fuentes oficiales — para la " +
      "inscripción, el voto en ausencia y los lugares de votación, el sistema",
    myVoteLink: "MyVote Wisconsin",
    myVoteSuffix: "de la Comisión Electoral de Wisconsin es la autoridad oficial.",
    about: "Acerca de BadgerBrief",
    methodology: "Metodología",
    reportError: "Reportar un error",
    support: "Apoya este proyecto",
    contribute: "Ayuda a mejorar esta guía",
    financeDisclaimer:
      "Los datos de financiamiento de campañas para cargos estatales de Wisconsin provienen " +
      "de la base de datos Sunshine de la Comisión de Ética de Wisconsin y se usan solo para " +
      "educación electoral no comercial, según la Wis. Stat. § 11.1304(12). Los datos de " +
      "financiamiento de campañas federales provienen de la FEC.",
  },
};
