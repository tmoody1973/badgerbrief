import { Fragment, createElement } from "react";
import type { VoteDict } from "./vote-dict";

/**
 * Spanish dict for /es/vote (MOO-400). Content is accuracy-critical civic
 * information — verified before publish, same gate as the English source rows
 * (MOO-398). Access translations mirror scripts/voter-access-seed.json.
 *
 * The primary DATE is hardcoded in Spanish prose ("el 11 de agosto de 2026")
 * rather than read from info.primaryDate, which is stored as an English string
 * ("August 11, 2026"). ceiling: this is a one-off 2026-primary slice — if the
 * primary date ever changes in the data, update these two strings by hand.
 */

const ES_DEADLINE_LABELS: Record<string, string> = {
  by_mail: "por correo",
  in_person: "en persona",
  online: "en línea",
};

// Spanish translations of the 8 voter_access situations, keyed by row.key.
// Sources are NOT here — VoteGuide renders row.sources straight from Convex.
const ACCESS_ES: Record<
  string,
  { title: string; summary: string; details: string }
> = {
  "voter-id": {
    title: "¿Qué identificación con foto puedo usar para votar?",
    summary:
      "Wisconsin requiere una identificación con foto aceptable para votar. Una licencia de conducir o tarjeta de identificación estatal de Wisconsin, un pasaporte de EE. UU., una identificación militar, una identificación tribal emitida por una tribu de Wisconsin y ciertas identificaciones estudiantiles y de otro tipo son válidas. El nombre en la identificación no tiene que coincidir exactamente con su inscripción, y algunas identificaciones pueden estar vencidas.",
    details:
      "El nombre en su identificación solo debe corresponder al nombre en la lista de votantes; no tiene que coincidir exactamente. «Bob» corresponde a «Robert», y «Smith-Jones» corresponde a «Smith» después de un matrimonio reciente. Una licencia de conducir o identificación estatal de Wisconsin, una identificación militar o un pasaporte de EE. UU. pueden usarse aunque estén vencidos, siempre que hayan vencido después de las elecciones generales más recientes. La dirección en su identificación no tiene que estar actualizada. Consulte la lista de identificaciones con foto aceptables de la Comisión Electoral de Wisconsin para ver el conjunto completo y los detalles.",
  },
  absentee: {
    title: "¿Cómo voto en ausencia, por correo o en persona anticipadamente?",
    summary:
      "Puede votar en ausencia por correo o en persona antes del día de las elecciones. Para una boleta por correo, la solicita a su secretario municipal, y la mayoría de los votantes deben incluir una copia de su identificación con foto. La votación anticipada en persona la organiza su municipio en las dos semanas antes de las elecciones.",
    details:
      "Una solicitud de boleta por correo debe llegar a su secretario municipal a más tardar a las 5:00 p. m. del quinto día antes de las elecciones, pero solicítela mucho antes, porque la boleta todavía tiene que llegarle y ser devuelta a tiempo. Su boleta de voto en ausencia completada debe estar de vuelta con el secretario a más tardar a las 8:00 p. m. del día de las elecciones para ser contada. La votación en ausencia en persona (anticipada) no puede comenzar más de dos semanas antes de las elecciones y termina el domingo anterior; muestra su identificación con foto cuando vota anticipadamente, y cada ciudad, pueblo y villa fija sus propias fechas y horarios. Consulte sus fechas, su secretario y el estado de su boleta en myvote.wi.gov.",
  },
  "election-day": {
    title: "¿Puedo inscribirme y votar el día de las elecciones?",
    summary:
      "Sí. Wisconsin permite inscribirse en su lugar de votación el día de las elecciones. Necesitará un documento de comprobante de residencia con su dirección actual. Si se inscribe antes del día de las elecciones, el plazo en línea y por correo es 20 días antes; en persona en la oficina del secretario es hasta el viernes anterior.",
    details:
      "Puede inscribirse y votar el mismo día en su lugar de votación con un documento de comprobante de residencia que muestre su dirección actual (por ejemplo, una licencia de conducir, un estado de cuenta bancario, una factura de servicios o una carta de una entidad del gobierno). Para inscribirse antes, hágalo en línea o por correo hasta 20 días antes de las elecciones, o en persona en la oficina de su secretario municipal hasta las 5:00 p. m. del viernes anterior (no puede inscribirse el sábado, domingo ni lunes anteriores). Debe haber vivido en su dirección al menos 28 días para el día de las elecciones. Encuentre su lugar de votación e inscríbase en línea en myvote.wi.gov.",
  },
  disability: {
    title:
      "Tengo una discapacidad: ¿cómo voto (en la acera, con asistencia, máquinas accesibles)?",
    summary:
      "Todos los lugares de votación deben ofrecer equipo de votación accesible y votación en la acera, y puede llevar a una persona de su elección para ayudarle a marcar su boleta. También puede pedir con anticipación a su secretario una adaptación específica.",
    details:
      "Si no puede entrar al lugar de votación, la ley de Wisconsin exige la votación en la acera: puede votar desde su vehículo. Todos los lugares de votación deben tener equipo de votación accesible (como el ExpressVote) y una cabina o mesa que cumpla con la ADA para una boleta en papel. Si necesita ayuda para marcar su boleta, puede llevar a cualquier persona de su elección, excepto a su empleador o a un representante de su sindicato. También puede avisar a su secretario municipal antes del día de las elecciones para solicitar una adaptación específica, y el secretario debe hacer esfuerzos razonables para proporcionarla. Disability Rights Wisconsin tiene una línea directa para votantes (844-347-8683) para preguntas sobre votación relacionadas con la discapacidad.",
  },
  "felony-conviction": {
    title: "Tengo una condena por delito grave: ¿puedo votar?",
    summary:
      "No puede votar en Wisconsin mientras cumple cualquier parte de una sentencia por delito grave, incluida la libertad condicional, la libertad bajo palabra o la supervisión extendida. Una vez que termina su sentencia y está «fuera de papel», su derecho al voto se restaura automáticamente y debe volver a inscribirse. Un delito menor nunca le quita el derecho al voto.",
    details:
      "Según la ley de Wisconsin (Wis. Stat. § 6.03(1)(b)), una persona condenada por un delito grave no puede votar mientras cumple cualquier parte de la sentencia, incluida la libertad condicional, la libertad bajo palabra o la supervisión extendida. Cuando termina la sentencia y ya no está bajo la supervisión del Departamento de Correcciones, su derecho al voto se restaura automáticamente: no necesita un indulto ni ningún documento que lo compruebe, pero sí debe volver a inscribirse aunque estuviera inscrito antes. Si fue acusado de un delito grave pero no condenado, todavía puede votar; si fue condenado pero aún no sentenciado, no puede. Una condena por delito menor nunca elimina su derecho al voto. Inscríbase en myvote.wi.gov.",
  },
  "name-change": {
    title: "Cambié de nombre: ¿qué debo actualizar?",
    summary:
      "Si cambió de nombre, vuelva a inscribirse para votar con su nombre nuevo. Actualice su nombre primero con el Departamento de Vehículos Motorizados (DMV) y el Seguro Social, luego actualice su inscripción: en línea en MyVote, por correo, en la oficina de su secretario o en las urnas el día de las elecciones.",
    details:
      "Un cambio de nombre (por ejemplo, después de un matrimonio) significa que vuelve a inscribirse con el nombre nuevo. Actualice su nombre primero con el DMV de Wisconsin y el Seguro Social, ya que eso es lo que hace oficial el cambio. Luego actualice su inscripción de votante en línea en myvote.wi.gov (si tiene una licencia o tarjeta de identificación del DMV de Wisconsin), por correo o en persona en la oficina de su secretario municipal hasta el viernes anterior a las elecciones, o en su lugar de votación el día de las elecciones. Tenga en cuenta que en la boleta el nombre de su identificación con foto solo debe corresponder a su inscripción, así que una identificación que aún no se haya actualizado a menudo todavía sirve.",
  },
  "id-name-mismatch": {
    title:
      "Mi identificación no coincide con mi nombre o género: ¿todavía puedo votar?",
    summary:
      "Puede votar siempre que su identificación con foto se parezca razonablemente a usted y el nombre en ella corresponda a su inscripción. El marcador de género en su identificación no se revisa y no tiene que coincidir; lo que importa es el nombre.",
    details:
      "Los trabajadores electorales de Wisconsin verifican que su identificación con foto se parezca razonablemente a usted y que el nombre corresponda a la lista de votantes; no se requiere una coincidencia exacta (por ejemplo, «Sue» corresponde a «Susan»). El marcador de género en su identificación no es información requerida y no se usa para decidir si recibe una boleta, así que no necesita actualizar el género en su identificación para votar. Si el nombre de su identificación y el de su inscripción difieren mucho, puede volver a inscribirse con el nombre de su identificación, o actualizar su identificación, antes del día de las elecciones. VoteRiders ofrece ayuda gratuita con la identificación de votante de Wisconsin para votantes transgénero y no binarios.",
  },
  homelessness: {
    title: "No tengo una dirección fija: ¿puedo votar?",
    summary:
      "Sí. Si no tiene vivienda, puede inscribirse y votar en Wisconsin. Puede usar una carta de un refugio o de una organización de servicios sociales como comprobante de residencia, y aún así mostrará una identificación con foto.",
    details:
      "Debe tener un lugar identificable que considere su residencia para votar: un lugar al que tiene la intención de regresar. Como comprobante de residencia puede usar una carta, en papel membretado y firmada, de un refugio para personas sin hogar o de una organización de servicios sociales, pública o privada, que atiende a personas sin vivienda; la carta lo identifica y describe el lugar que sirve como su residencia para votar. Aún necesita mostrar una identificación con foto aceptable. La Mesa de Ayuda de la Comisión Electoral de Wisconsin (608-261-2028, elections@wi.gov) puede ayudar a los funcionarios electorales a asistir a votantes sin vivienda.",
  },
};

export const voteEs: VoteDict = {
  lang: "es",
  meta: {
    title: "Cómo votar en las primarias de Wisconsin de 2026",
    description:
      "Plazos de inscripción, reglas para votar en ausencia, fechas de votación anticipada, requisitos de identificación con foto y horarios de las urnas para las primarias de Wisconsin del 11 de agosto de 2026: cada regla enlazada a su fuente oficial.",
  },
  h1: "¿Cómo voto en las primarias de Wisconsin de 2026?",
  intro: (info, myVoteLabel) =>
    createElement(
      Fragment,
      null,
      "Las primarias son ",
      createElement("strong", null, "el 11 de agosto de 2026"),
      ", las urnas abren de ",
      info.pollsOpen,
      " a ",
      info.pollsClose,
      ". Todo lo siguiente enlaza a fuentes oficiales; para su lugar de votación y el estado de su inscripción personal, use ",
      createElement(
        "a",
        {
          href: info.officialVoterInfoUrl,
          className: "font-bold underline decoration-2 underline-offset-2",
          rel: "noopener noreferrer",
          target: "_blank",
        },
        myVoteLabel,
      ),
      ", el sistema oficial del estado.",
    ),
  faqs: (info, d) => [
    {
      q: "¿Cuándo son las primarias de Wisconsin de 2026?",
      a: `Las primarias partidistas de Wisconsin son el 11 de agosto de 2026. Las urnas están abiertas de ${info.pollsOpen} a ${info.pollsClose} ${info.timezone ?? ""}.`.trim(),
    },
    {
      q: "¿Cómo me inscribo para votar en Wisconsin?",
      a:
        d.registration
          .map(([mode, deadline]) => `${ES_DEADLINE_LABELS[mode] ?? mode}: ${deadline}`)
          .join("; ") +
        ". Wisconsin permite la inscripción el mismo día en las urnas con comprobante de residencia. Inscríbase en myvote.wi.gov.",
    },
    {
      q: "¿Cómo solicito una boleta de voto en ausencia en Wisconsin?",
      a:
        d.absenteeRequest
          .map(([mode, deadline]) => `${ES_DEADLINE_LABELS[mode] ?? mode}: ${deadline}`)
          .join("; ") + ". Solicítela en myvote.wi.gov.",
    },
    {
      q: "¿Cuándo debo devolver mi boleta de voto en ausencia de Wisconsin?",
      a: d.absenteeReturn
        .map(([mode, deadline]) => `${ES_DEADLINE_LABELS[mode] ?? mode}: ${deadline}`)
        .join("; "),
    },
    ...(d.early?.available
      ? [
          {
            q: "¿Wisconsin tiene votación anticipada en 2026?",
            a: `Sí. La votación en ausencia en persona (anticipada) va del ${d.early.start_date} al ${d.early.end_date}. Los lugares y horarios varían según el municipio: consulte myvote.wi.gov.`,
          },
        ]
      : []),
    {
      q: "¿Necesito una identificación con foto para votar en Wisconsin?",
      a: info.photoIdRequired
        ? "Sí. Wisconsin requiere una identificación con foto aceptable para votar (licencia de conducir, identificación estatal, pasaporte, identificación militar y ciertas identificaciones estudiantiles)."
        : "Consulte los requisitos actuales en myvote.wi.gov.",
    },
  ],
  deadlineLabel: (key) => ES_DEADLINE_LABELS[key] ?? key.replaceAll("_", " "),
  checklist: {
    title: "Lista de plazos",
    register: "Inscribirse",
    requestAbsentee: "Solicitar voto en ausencia",
    returnAbsentee: "Devolver voto en ausencia",
    vote: "Votar",
  },
  sourcesTitle: "Fuentes oficiales",
  lastUpdatedPrefix: "Última actualización:",
  situation: {
    title: "Su situación",
    blurb:
      "Respuestas a preguntas comunes sobre elegibilidad. Cada regla enlaza a su fuente oficial. Estas son reglas generales, no asesoría legal: para una situación específica, use el enlace oficial.",
  },
  accessText: (row) => {
    const es = ACCESS_ES[row.key];
    return es ?? { title: row.title, summary: row.summary, details: row.details };
  },
  crumbs: { home: "Inicio", vote: "Cómo votar" },
  toggle: { label: "English", href: "/vote" },
  myVoteLabel: "MyVote Wisconsin",
};
