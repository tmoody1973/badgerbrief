import type { AboutDict } from "./about-en";

/** First-pass Spanish draft — Tarik verifies before deploy (MOO-406 Phase 1).
 * This includes the Radio Milwaukee / Plan Commission disclosure, which is
 * sensitive, accuracy-critical content and must be verified faithfully. */
export const aboutEs: AboutDict = {
  lang: "es",
  meta: {
    title: "Acerca de BadgerBrief",
    description:
      "BadgerBrief es una guía electoral de Wisconsin independiente y no partidista. Sin financiamiento, sin anuncios, sin afiliación partidista o de campaña — cada afirmación enlaza a su fuente oficial.",
  },
  crumbs: { home: "Inicio", about: "Acerca de" },
  h1: "Acerca de BadgerBrief",
  intro:
    "BadgerBrief es una guía independiente y no partidista de las elecciones de Wisconsin de 2026. Existe para responder una pregunta lo más claramente posible: quién está en tu papeleta y qué ha hecho realmente.",
  reportMistake: "¿Ves un error? Repórtalo →",
  independent: {
    heading: "Independiente, y sin financiamiento",
    fundingLabel: "Financiamiento",
    fundingBody: "Autofinanciado — sin publicidad, patrocinios, donaciones, subvenciones ni dinero de partidos o PAC.",
    affiliationLabel: "Afiliación",
    affiliationBody: "Ningún partido, campaña, PAC o grupo de defensa. Nadie tiene control editorial.",
    endorsementsLabel: "Respaldos",
    endorsementsBody: "Ninguno, jamás. Los candidatos nunca son calificados, clasificados ni recomendados.",
    footer:
      "Nada en este sitio está pagado, y no hay nadie a quien complacer. Esa es la razón por la que puede leerse tal como está escrito.",
  },
  facts: {
    heading: "Cómo llegan aquí los datos",
    p1:
      "Casi nada aquí se escribe a mano. Las papeletas provienen de la lista oficial de candidatos de la Comisión Electoral de Wisconsin — los nombres se imprimen exactamente como los ve un votante en la cabina. Los registros de votación se extraen directamente de los documentos de votación nominal de la Legislatura y de los registros del Secretario de la Cámara de EE. UU., y cada uno se concilia con los totales que el propio documento publica antes de almacenarse. El financiamiento de campañas proviene de la Comisión de Ética de Wisconsin y de la FEC.",
    p2Before:
      "Cuando un documento no se puede conciliar, se descarta en lugar de publicarse — un registro incompleto es peor que uno ausente.",
    p2LinkText: "La metodología completa",
    p2After:
      "explica cada fuente, cómo se revisan las posiciones y citas antes de publicarse, y qué no pueden detectar las verificaciones.",
  },
  who: {
    heading: "Quién lo hace",
    p1Before: "BadgerBrief es creado y mantenido por",
    p1After: " en Milwaukee, de forma independiente y en su tiempo libre.",
    disclosureLabel: "En interés de la plena transparencia:",
    disclosureBody:
      " Tarik es Director de Estrategia e Innovación en Radio Milwaukee, y comisionado designado de la Comisión de Planificación de la Ciudad de Milwaukee. Ambos roles se mencionan aquí a propósito. La Comisión de Planificación es un organismo municipal de uso de suelo — no tiene ningún papel en las contiendas legislativas estatales, del Congreso o estatales que cubre esta guía — y él no tiene ninguna participación en ninguna contienda de BadgerBrief. Todos los candidatos reciben el mismo trato, con el mismo método basado en fuentes, sin respaldos. Ninguno de los dos roles financia ni dirige este sitio.",
    p3:
      "Esto no es una organización de noticias y no pretende serlo. Es el intento de una persona de hacer legibles los registros públicos, sujeto a una regla simple: si una afirmación está en este sitio, su fuente está a un clic de distancia, y si resulta ser incorrecta, se corrige públicamente.",
  },
  wrong: {
    heading: "Si algo está mal",
    p1:
      "Ensamblar registros automáticamente significa que los errores son posibles, y las verificaciones son aritméticas — pueden confirmar que una votación nominal cuadra, no que refleja lo que la Legislatura quiso decir. Los lectores son la última verificación, y los reportes son leídos por una persona.",
    reportCta: "Reportar un error →",
  },
};
