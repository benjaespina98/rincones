import { Link } from "react-router-dom";
import LegalPage from "../components/LegalPage";
import { INSTAGRAM_RINCONES_URL, INSTAGRAM_RINCONES_USUARIO } from "../data/contacto";

/**
 * Términos de uso.
 *
 * ── EL CRITERIO DE ESTE TEXTO ───────────────────────────────────────────────
 * Decir lo que la app realmente hace y lo que realmente no promete, en el
 * mismo castellano que el resto de la pantalla. Un término que nadie entiende
 * no protege a nadie: ni al que lo escribió, porque un juez lo lee igual que
 * cualquiera, ni al que lo acepta.
 *
 * Dos puntos que importan más que el resto y que salen de lo que la app es:
 *
 *   · Es sobre bebidas alcohólicas. La mayoría de edad no es una formalidad.
 *   · El Sommelier es un modelo de lenguaje y se equivoca. Decirlo acá, y no
 *     sólo en la pantalla, es la diferencia entre advertirlo y haberlo
 *     escondido en el lugar donde nadie mira.
 *
 * Responsable, contacto y ley aplicable son los mismos datos que en la política
 * de privacidad: si cambian, se cambian en las dos páginas.
 */
export default function TerminosPage() {
  return (
    <LegalPage title="Términos de uso" actualizado="1 de octubre de 2026">
      <p>
        Usar Rincones implica aceptar esto. Está escrito para que se entienda; si algo no se
        entiende, escribinos y lo aclaramos.
      </p>

      <h2>Qué es Rincones</h2>
      <p>
        Una app para llevar tu bodega personal: cargar los vinos que tenés, anotar lo que te
        parecieron y consultar una guía que te ayuda a elegir. Es gratis y{" "}
        {/* TODO(legal): si en algún momento hay plan pago, este párrafo cambia. */}
        hoy no tiene ningún costo.
      </p>

      <h2>Hay que ser mayor de edad</h2>
      <p>
        Rincones es sobre bebidas alcohólicas. Sólo se puede usar siendo mayor de edad en el
        lugar donde vivís, y por eso se pide la fecha de nacimiento al crear la cuenta. Si
        detectamos una cuenta de alguien menor, la damos de baja sin aviso previo.
      </p>

      <h2>Tu cuenta</h2>
      <ul>
        <li>Los datos que cargás tienen que ser tuyos y verdaderos.</li>
        <li>
          Sos responsable de lo que pase con tu cuenta. Si creés que alguien entró, cambiá la
          contraseña desde <em>¿Olvidaste tu contraseña?</em> en el login.
        </li>
        <li>Podés darla de baja cuando quieras, desde el perfil, y se borra todo.</li>
      </ul>

      <h2>Lo que cargás es tuyo</h2>
      <p>
        Tus vinos, tus fotos, tus notas y tus momentos siguen siendo tuyos. Nos das permiso para
        guardarlos y mostrártelos (que es lo que hace falta para que la app funcione) y nada más:
        no los usamos para otra cosa ni se los damos a nadie.
      </p>
      <p>
        Las reseñas son la excepción, y se avisa en la pantalla donde se escriben: son públicas
        dentro de la app, con tu nombre. Las fotos de etiquetas que subís pueden quedar
        disponibles para que otros vean ese mismo vino, porque la etiqueta es del vino y no tuya;
        tus fotos de momentos nunca.
      </p>

      <h2>El Sommelier se equivoca</h2>
      <p>
        Las respuestas las genera un modelo de inteligencia artificial. Sirven para orientarte
        sobre qué tomar y con qué, y <strong>no son consejo profesional</strong>: pueden tener
        datos mal, inventar una cosecha o recomendarte algo que no existe. Verificá antes de
        comprar, y usá tu criterio.
      </p>
      <p>
        Tampoco es consejo médico ni nutricional. El alcohol tiene efectos sobre la salud; si
        tenés dudas, preguntale a un profesional, no a una app.
      </p>

      <h2>Qué no se puede hacer</h2>
      <ul>
        <li>Usar la app para vender alcohol o promocionarlo a menores.</li>
        <li>Subir contenido de otro, ofensivo o que no tengas derecho a subir.</li>
        <li>
          Intentar entrar a datos de otras personas, o hacerle a la app más pedidos de los que
          una persona hace usándola.
        </li>
        <li>Copiar la app o su contenido para armar un servicio parecido.</li>
      </ul>
      <p>Si pasa algo de esto, podemos suspender la cuenta.</p>

      <h2>Lo que no prometemos</h2>
      <p>
        La app se ofrece como está. Ponemos lo que podemos para que ande y para que no se pierda
        nada, pero no podemos garantizar que esté disponible siempre ni que no haya errores.{" "}
        <strong>Guardá una copia de lo que te importe</strong>: desde{" "}
        <em>Perfil → Descargar mis datos</em> te llevás todo en un archivo.
      </p>
      <p>
        Los precios de referencia, los datos de catálogo y lo que diga el Sommelier son
        orientativos y pueden estar desactualizados.
      </p>

      <h2>Los avisos</h2>
      <p>
        La app muestra avisos de vinotecas y marcas. Están señalados como tales. No recibimos
        nada tuyo para mostrarlos (se ven igual para todos) y lo que hagas con ellos es entre vos
        y quien publica.
      </p>

      <h2>Cambios y baja</h2>
      <p>
        Podemos cambiar estos términos; la fecha de arriba dice cuándo fue la última vez, y los
        cambios importantes se avisan dentro de la app. Si no estás de acuerdo, podés darte de
        baja. Nosotros podemos cerrar una cuenta que incumpla lo de más arriba.
      </p>

      <h2>Ley aplicable</h2>
      <p>
        Estos términos se rigen por las leyes de{" "}
        <strong>Argentina</strong>, y cualquier conflicto se resuelve ante
        sus tribunales. El responsable es <strong>200ok.dev</strong>, y
        el contacto es nuestro <a href={INSTAGRAM_RINCONES_URL} target="_blank" rel="noopener noreferrer">Instagram {INSTAGRAM_RINCONES_USUARIO}</a>.
      </p>
    </LegalPage>
  );
}
