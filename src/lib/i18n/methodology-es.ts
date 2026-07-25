import type { MethodologyDict } from "./methodology-en";

/** First-pass Spanish draft — Tarik verifies before deploy (MOO-406 Phase 1). */
export const methodologyEs: MethodologyDict = {
  lang: "es",
  meta: {
    title: "Metodología",
    description:
      "Cómo BadgerBrief obtiene, verifica y publica información electoral de Wisconsin: fuentes oficiales primero, cada afirmación enlazada, revisión humana antes de publicar, y verificaciones automáticas de calidad continuas.",
  },
  h1: "Metodología",
  intro:
    "BadgerBrief es una guía electoral de Wisconsin no partidista y con fuentes verificables. Esta página explica cómo llega la información al sitio y cómo la mantenemos honesta.",
  sections: {
    nonpartisan: {
      heading: "Política no partidista",
      body:
        "BadgerBrief nunca respalda, clasifica ni recomienda candidatos o partidos. Las posiciones de los candidatos se presentan de forma descriptiva, en las propias palabras del candidato o según lo atribuido por la fuente citada. A nuestro asistente se le indica que rechace solicitudes de respaldo y asesoría legal, y esos rechazos están entre los comportamientos que probamos continuamente (ver “Verificaciones de calidad” abajo).",
    },
    dataSources: {
      heading: "De dónde vienen los datos",
      votingLogistics: {
        label: "Logística de votación",
        before: " (registro, voto ausente, voto anticipado, identificación de votante, horario de votación): la Comisión Electoral de Wisconsin y",
        linkText: "MyVote Wisconsin",
        after: ", que es siempre el sistema oficial para realizar trámites.",
      },
      racesCandidates: {
        label: "Contiendas y candidatos",
        body: ": expedientes oficiales y fuentes de referencia públicas (Ballotpedia, sitios de campaña de candidatos, medios de Wisconsin), cada una enlazada desde la página donde se usa.",
      },
      campaignFinance: {
        label: "Financiamiento de campañas",
        body: ": la API de la FEC para cargos federales y la base de datos Sunshine de la Comisión de Ética de Wisconsin para cargos estatales, usada solo para educación electoral no comercial, según el Estatuto de Wisconsin § 11.1304(12).",
      },
      politicalAds: {
        label: "Publicidad política",
        body: ": archivos públicos de anuncios y expedientes de inspección pública de la FCC, con el documento fuente enlazado en cada registro.",
      },
    },
    publishing: {
      heading: "Cómo se publican las posiciones y citas de los candidatos",
      before:
        "Asistentes de software leen fuentes aprobadas (sitios de campaña y artículos de noticias que un editor humano aprobó primero) y extraen posiciones y citas de candidatos como ",
      emText: "borradores",
      after:
        ", cada uno con su enlace de fuente y un extracto textual de evidencia. Nada de lo que escribe una máquina se publica automáticamente: cada borrador pasa por una cola de revisión editorial donde una persona lo aprueba, edita o rechaza. Solo los registros aprobados y con fuente enlazada aparecen en el sitio, y cada registro publicado conserva un registro de auditoría completo de quién lo aprobó y cuándo.",
    },
    qualityChecks: {
      heading: "Verificaciones de calidad",
      body:
        "Cada ejecución del asistente se rastrea, y una muestra de la actividad de producción se puntúa continuamente mediante evaluadores automáticos de fidelidad de citas, neutralidad, comportamiento de fuente-oficial-primero y corrección de rechazos. Antes de que cualquier cambio al asistente se publique, debe pasar un conjunto fijo de preguntas de votantes con propiedades de respuesta correcta conocida; las regresiones bloquean el cambio. Las caídas de puntuación generan alertas internas revisadas por el editor.",
    },
    corrections: {
      heading: "Correcciones",
      p1Before:
        "¿Ves algo incorrecto? Cada dato del sitio enlaza a su fuente para que puedas verificarlo tú mismo — y si nos equivocamos, ",
      reportLinkText: "repórtalo aquí",
      p1After: ". El formulario pregunta qué página y un enlace al registro, para poder verificarlo contra el original.",
      whatHappensLabel: "Qué pasa después.",
      whatHappensBody:
        " Cada reporte es leído por una persona. Cualquier reporte de un error factual — un voto, un nombre, una cifra, una fecha — se verifica contra la fuente de la que provino y, si nos equivocamos, se corrige en el sitio. Buscamos hacerlo dentro de dos días hábiles, y más rápido para cualquier cosa que afecte el registro de votación de un candidato, donde un error tergiversa lo que alguien realmente hizo. Las correcciones se hacen en la página misma en lugar de registrarse en otro lugar, así que el registro que lees siempre es el corregido.",
      whyMattersLabel: "Por qué esto importa aquí.",
      whyMattersBody:
        " La mayor parte de este sitio se ensambla automáticamente. Cada votación nominal se concilia con los totales que el propio documento publica, lo cual detecta un error de conteo — pero la aritmética no puede detectar un documento que cuadra y aun así está equivocado. Ninguna persona revisa cada registro procesado antes de publicarse, así que los lectores son la última verificación, y los reportes se tratan en consecuencia.",
      p2Before: "Si prefieres reportarlo públicamente, el código es de fuente abierta y puedes ",
      issueLinkText: "abrir un issue",
      p2After: ".",
    },
  },
};
