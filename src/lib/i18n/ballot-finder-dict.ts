import type { Locale } from "./locale";

/** UI strings for the home-page BallotFinder. EN values are verbatim from the
 * original component (keep English output unchanged); ES is formal "usted". */
export type BallotFinderDict = {
  heading: string;
  instructions: string;
  placeholder: string;
  addressAria: string;
  looking: string;
  findRaces: string;
  errNotWisconsin: string;
  errNoMatch: string;
  errUnavailable: string;
  manualCongressional: string;
  manualSenate: string;
  manualAssembly: string;
  pick: string;
  showRaces: string;
  foundLine: (d: { congressional: number; senate: number; assembly: number }) => string;
  senateNotUp: (district: number) => string;
  myVotePolling: string;
  myVoteAbsentee: string;
  officialTag: string;
};

const en: BallotFinderDict = {
  heading: "What's on your ballot?",
  instructions:
    "Enter your Wisconsin address — we match it to your congressional and state legislative districts via the U.S. Census Bureau. We don't store it unless you're signed in.",
  placeholder: "200 E Wells St, Milwaukee, WI 53202",
  addressAria: "Wisconsin street address",
  looking: "Looking up…",
  findRaces: "Find my races",
  errNotWisconsin:
    "That address doesn't look like it's in Wisconsin — this guide covers Wisconsin ballots only.",
  errNoMatch:
    "We couldn't match that address. Check the street, city, and ZIP — or pick your districts below.",
  errUnavailable:
    "The address lookup is unavailable right now. You can pick your districts below.",
  manualCongressional: "Congressional district",
  manualSenate: "State Senate district",
  manualAssembly: "Assembly district",
  pick: "Pick…",
  showRaces: "Show my races",
  foundLine: (d) => `CD ${d.congressional} · Senate ${d.senate} · Assembly ${d.assembly}`,
  senateNotUp: (district) =>
    `Your state senate seat (District ${district}) isn't up for election in 2026 — even-numbered senate districts vote in 2028.`,
  myVotePolling: "Find your polling place",
  myVoteAbsentee: "Request an absentee ballot",
  officialTag: "official · MyVote WI",
};

const es: BallotFinderDict = {
  heading: "¿Qué hay en su papeleta?",
  instructions:
    "Ingrese su dirección de Wisconsin — la asociamos con sus distritos del Congreso y legislativos estatales mediante la Oficina del Censo de EE. UU. No la almacenamos a menos que haya iniciado sesión.",
  placeholder: "200 E Wells St, Milwaukee, WI 53202",
  addressAria: "Dirección de Wisconsin",
  looking: "Buscando…",
  findRaces: "Buscar mis contiendas",
  errNotWisconsin:
    "Esa dirección no parece estar en Wisconsin — esta guía cubre solo papeletas de Wisconsin.",
  errNoMatch:
    "No pudimos encontrar esa dirección. Verifique la calle, la ciudad y el código postal — o elija sus distritos abajo.",
  errUnavailable:
    "La búsqueda de direcciones no está disponible en este momento. Puede elegir sus distritos abajo.",
  manualCongressional: "Distrito del Congreso",
  manualSenate: "Distrito del Senado estatal",
  manualAssembly: "Distrito de la Asamblea",
  pick: "Elija…",
  showRaces: "Ver mis contiendas",
  foundLine: (d) => `CD ${d.congressional} · Senado ${d.senate} · Asamblea ${d.assembly}`,
  senateNotUp: (district) =>
    `Su escaño del senado estatal (Distrito ${district}) no está en la papeleta en 2026 — los distritos del senado con número par votan en 2028.`,
  myVotePolling: "Encuentre su lugar de votación",
  myVoteAbsentee: "Solicite una boleta en ausencia",
  officialTag: "oficial · MyVote WI",
};

export const ballotFinderDict = (locale: Locale): BallotFinderDict =>
  locale === "es" ? es : en;
