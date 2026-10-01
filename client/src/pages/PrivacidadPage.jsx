import { Link } from "react-router-dom";
import LegalPage from "../components/LegalPage";

/**
 * Política de privacidad.
 *
 * ── ESTO NO ES UN TEXTO COPIADO DE OTRO LADO ────────────────────────────────
 * Cada afirmación de abajo salió de leer el código que la cumple, y están los
 * archivos citados para que se pueda verificar y, sobre todo, para que si
 * alguno cambia se note que esta página quedó mintiendo. Una política de
 * privacidad que no coincide con lo que el sistema hace es peor que no tenerla:
 * es una promesa escrita que no se cumple.
 *
 * Lo que dice, y dónde se cumple:
 *   · qué se guarda y qué no  → models/*.js
 *   · a quién se le manda     → services/gemini.service.js, imageStorage.service.js,
 *                               config/sentry.js
 *   · cuánto dura             → los `expires` de los modelos
 *   · cómo se borra todo      → services/accountDeletion.service.js
 *   · cómo llevárselo         → services/accountExport.service.js
 *   · la analítica            → services/analytics.service.js
 *
 * ── LO QUE FALTA COMPLETAR ──────────────────────────────────────────────────
 * Los tres `TODO` de abajo son datos que no están en el código y que no se
 * pueden inventar: quién responde legalmente, a qué dirección se reclama y bajo
 * qué ley. Hasta que estén, esta página no se debería enlazar como definitiva.
 */
export default function PrivacidadPage() {
  return (
    <LegalPage title="Privacidad" actualizado="1 de octubre de 2026">
      <p>
        Rincones es una bodega personal: lo que cargás es tuyo y existe para que lo uses vos.
        Esta página dice qué guardamos, por cuánto tiempo, a quién se lo mandamos y cómo te lo
        llevás o lo borrás.
      </p>

      <h2>Quién es responsable</h2>
      <p>
        {/* TODO(legal): razón social o nombre del responsable. */}
        <strong>[COMPLETAR: nombre o razón social]</strong>, con domicilio en{" "}
        <strong>[COMPLETAR: domicilio]</strong>. Para cualquier consulta sobre tus datos escribinos
        a <strong>[COMPLETAR: email de contacto]</strong>.
      </p>

      <h2>Qué guardamos</h2>
      <ul>
        <li>
          <strong>Tu cuenta.</strong> Email, nombre y fecha de nacimiento —esta última para
          verificar que seas mayor de edad, porque la app es sobre bebidas alcohólicas—. Si
          entrás con Google, recibimos tu email y tu nombre de Google; no vemos tu contraseña.
          Si creás una contraseña acá, se guarda cifrada y nadie la puede leer, nosotros tampoco.
        </li>
        <li>
          <strong>Tu bodega.</strong> Los vinos que cargás con todo lo que les pongas: foto,
          cosecha, precio que pagaste, dónde los guardás, puntaje y notas.
        </li>
        <li>
          <strong>Tus momentos.</strong> Con quién tomaste cada botella, dónde y qué te pareció.
          Son privados: nadie más los ve.
        </li>
        <li>
          <strong>Tus reseñas.</strong> Éstas sí son públicas dentro de la app, y así está dicho
          en la pantalla donde se escriben.
        </li>
        <li>
          <strong>Tus consultas al Sommelier.</strong> Lo que le preguntás y lo que te contesta.
        </li>
      </ul>

      <h2>Qué no guardamos</h2>
      <ul>
        <li>
          <strong>Tu dirección IP.</strong> Para contar cuánta gente usa la app se guarda un
          código irreversible calculado a partir de tu IP y tu navegador. La IP no llega a la
          base de datos: el código se calcula al recibir el dato y es lo único que queda.
        </li>
        <li>
          <strong>Datos de pago.</strong> La app no cobra nada ni procesa pagos.
        </li>
        <li>
          <strong>Tu ubicación.</strong> No pedimos ni guardamos geolocalización.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        Usamos una sola, y es técnica: mantiene tu sesión abierta para que no tengas que
        escribir la contraseña cada vez. No podemos leerla desde el navegador ni se comparte con
        nadie. No usamos cookies de publicidad ni de seguimiento, y por eso no vas a ver un
        cartel pidiéndote permiso.
      </p>

      <h2>Con quién compartimos</h2>
      <p>Con tres servicios, cada uno para una cosa puntual:</p>
      <ul>
        <li>
          <strong>Google (Gemini)</strong> — procesa las fotos de etiquetas que escaneás y las
          consultas que le hacés al Sommelier. Cuando preguntás algo sobre tu propia bodega,
          viaja también la lista de tus vinos para que la respuesta tenga sentido. No se le
          manda tu email ni tu nombre.
        </li>
        <li>
          <strong>Cloudinary</strong> — guarda las fotos de los vinos.
        </li>
        <li>
          <strong>Sentry</strong> — recibe los errores de la app para poder arreglarlos. Antes
          de salir se limpian las contraseñas, los tokens y las cabeceras de autenticación.
        </li>
      </ul>
      <p>
        No vendemos tus datos ni los cedemos a anunciantes. Los avisos que ves en la app no
        reciben nada tuyo: se muestran igual para todos y sólo contamos cuántas veces se vieron.
      </p>

      <h2>Cuánto tiempo</h2>
      <ul>
        <li>
          <strong>Tu bodega, tus momentos y tus reseñas</strong> — mientras tengas la cuenta.
        </li>
        <li>
          <strong>Tus consultas al Sommelier</strong> — 180 días. No es por espacio: a partir de
          cierto punto el historial deja de ser útil y pasa a ser un archivo de cosas personales
          que nadie va a leer.
        </li>
        <li>
          <strong>Los eventos de uso</strong> — 180 días el detalle; el resumen diario, que ya no
          permite identificar a nadie, se conserva.
        </li>
      </ul>

      <h2>Qué podés hacer</h2>
      <ul>
        <li>
          <strong>Llevarte todo.</strong> Desde <em>Perfil → Descargar mis datos</em> bajás un
          archivo con tu cuenta, tus vinos, tus momentos, tus reseñas y tus consultas.
        </li>
        <li>
          <strong>Borrar todo.</strong> Desde <em>Perfil → Eliminar mi cuenta</em>. Se borra de
          verdad: la cuenta y todo lo que cargaste, incluidas las consultas al Sommelier. No es
          un borrado marcado ni diferido, y no se puede deshacer.
        </li>
        <li>
          <strong>Corregir lo que esté mal.</strong> Todo lo que cargaste se edita desde la app.
        </li>
      </ul>

      <h2>Menores</h2>
      <p>
        La app es sobre bebidas alcohólicas y sólo se puede usar siendo mayor de edad. Por eso se
        pide la fecha de nacimiento al crear la cuenta. Si detectamos una cuenta de alguien menor,
        la damos de baja.
      </p>

      <h2>Cambios</h2>
      <p>
        Si esto cambia, cambia la fecha de arriba. Los cambios que afecten lo que hacemos con tus
        datos se avisan dentro de la app antes de aplicarlos.
      </p>

      <h2>Reclamos</h2>
      <p>
        {/* TODO(legal): jurisdicción y autoridad de control. */}
        Esta política se rige por las leyes de <strong>[COMPLETAR: país/jurisdicción]</strong>.
        Si creés que no estamos cumpliendo, escribinos primero a nosotros; también podés
        presentar un reclamo ante <strong>[COMPLETAR: autoridad de control]</strong>.
      </p>

      {/* El cruce entre las dos páginas. Quien entra desde el perfil cae acá,
          y los términos están a un toque sin tener que volver. */}
      <p className="legal__otra">
        <Link to="/terminos">Leer los términos de uso →</Link>
      </p>
    </LegalPage>
  );
}
