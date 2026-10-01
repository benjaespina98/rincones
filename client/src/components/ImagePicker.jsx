import { useId, useRef, useState } from "react";
import Icon from "./Icon";
import { toUploadableDataUrl, toUploadableLogo } from "../utils/image";
import "./ImagePicker.css";

/**
 * Elegir una imagen: con la cámara, desde la galería, o pegando un enlace.
 *
 * ── POR QUÉ DOS BOTONES Y NO UNO SOLO ────────────────────────────────────────
 * "Subir imagen" era una sola puerta para dos gestos distintos: sacarle una
 * foto a la botella que tenés en la mano, o elegir una que ya está en el
 * teléfono. En el diálogo genérico del navegador esa elección queda escondida
 * dos toques adentro (y en algunos Android ni aparece la cámara), así que acá
 * se separan de entrada: cada botón abre directo lo que promete.
 *
 * ── POR QUÉ EL ENLACE SIGUE EXISTIENDO ───────────────────────────────────────
 * Porque el caso existe: alguien que ya tiene la foto alojada en otro lado y
 * sólo quiere pegar la URL. Pero se esconde en cuanto hay una imagen puesta —ver
 * más abajo por qué— y sólo vuelve si se lo pide con el enlace de "pegar un
 * enlace en cambio".
 *
 * ── POR QUÉ NO SE MUESTRA EL ENLACE DE UNA IMAGEN YA CARGADA ─────────────────
 * Una foto guardada llega acá como la URL de Cloudinary donde vive (no como el
 * archivo original), y esa URL es un detalle de implementación: un texto de
 * cien caracteres que no dice nada y que además invita a "corregirlo" a mano,
 * rompiendo el enlace. La miniatura ya prueba que la imagen está puesta; el
 * campo de texto no suma nada ahí y sólo confunde.
 */

/** Lo que el navegador ofrece en el diálogo de archivos. */
const ACEPTA = "image/png,image/jpeg,image/webp";

export default function ImagePicker({
  label,
  value,
  onChange,
  hint,
  /** "logo" conserva la transparencia y reduce menos; "wide" es la imagen de fondo. */
  variant = "wide",
  disabled = false,
}) {
  const camaraRef = useRef(null);
  const galeriaRef = useRef(null);
  const [cargando, setCargando] = useState(false);
  const [falla, setFalla] = useState(false);
  // El enlace se pide aparte y arranca cerrado en cuanto ya hay una imagen: no
  // tiene sentido mostrar un campo para reemplazar algo que ya se ve bien.
  const [pegarEnlace, setPegarEnlace] = useState(false);
  const inputId = useId();

  const elegirArchivo = async (evento) => {
    const archivo = evento.target.files?.[0];
    // Se limpia el input para que elegir DOS VECES el mismo archivo vuelva a
    // disparar el evento: sin esto, corregir un error reintentando no hace nada.
    evento.target.value = "";
    if (!archivo) return;

    try {
      setCargando(true);
      setFalla(false);
      // Se reduce en el navegador antes de mandarla: una foto de 5MB del celular
      // serían 6,7MB de JSON viajando por la red del que carga la campaña.
      const dataUrl =
        variant === "logo" ? await toUploadableLogo(archivo) : await toUploadableDataUrl(archivo);
      onChange(dataUrl);
      setPegarEnlace(false);
    } catch {
      setFalla(true);
    } finally {
      setCargando(false);
    }
  };

  // Mostrar el campo de enlace en crudo: sólo si no hay nada puesto todavía, o
  // si la persona lo pidió explícitamente con "pegar un enlace en cambio".
  const mostrarEnlace = !value || pegarEnlace;

  return (
    <div className={`imgpick imgpick--${variant}`}>
      <span className="imgpick__label">{label}</span>

      <div className="imgpick__row">
        {/* La miniatura: lo que se eligió, tal como el navegador lo puede mostrar. */}
        <div className={`imgpick__thumb ${value ? "" : "is-empty"}`}>
          {value ? (
            <img src={value} alt="" onError={() => setFalla(true)} onLoad={() => setFalla(false)} />
          ) : (
            /* La botella y no un ícono de "imagen": lo que falta acá no es un
               archivo, es la foto de un vino. Y a 26px porque el marco ahora
               tiene 92×123 reservados — con 18 quedaba un puntito perdido en
               el medio de una caja vacía. */
            <Icon name="bottle" size={26} />
          )}
        </div>

        <div className="imgpick__actions">
          <button
            type="button"
            className="imgpick__btn"
            onClick={() => camaraRef.current?.click()}
            disabled={disabled || cargando}
          >
            <Icon name="camera" size={15} />
            {cargando ? "Preparando…" : value ? "Sacar otra foto" : "Sacar foto"}
          </button>

          <button
            type="button"
            className="imgpick__btn imgpick__btn--ghost"
            onClick={() => galeriaRef.current?.click()}
            disabled={disabled || cargando}
          >
            <Icon name="image" size={15} />
            {value ? "Elegir otra" : "Elegir de la galería"}
          </button>

          {value && (
            <button
              type="button"
              className="imgpick__btn imgpick__btn--ghost"
              onClick={() => {
                setFalla(false);
                setPegarEnlace(false);
                onChange("");
              }}
              disabled={disabled}
            >
              Quitar
            </button>
          )}

          {/* Dos inputs nativos, uno por gesto. `capture="environment"` es lo que
              abre la cámara trasera directo en los celulares que lo soportan, en
              vez del diálogo genérico "Cámara o Galería" donde la mitad de las
              veces se termina tocando el botón equivocado. Sin ese atributo, el
              segundo input abre el selector de archivos/galería de siempre. */}
          <input
            ref={camaraRef}
            className="imgpick__file"
            type="file"
            accept={ACEPTA}
            capture="environment"
            onChange={elegirArchivo}
            tabIndex={-1}
            aria-hidden="true"
          />
          <input
            ref={galeriaRef}
            id={inputId}
            className="imgpick__file"
            type="file"
            accept={ACEPTA}
            onChange={elegirArchivo}
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* ── LA FRANJA QUE SE INTERCAMBIA, CON ALTURA RESERVADA ─────────────
          Acá abajo conviven dos cosas que se turnan: el campo para pegar un
          enlace (58px) cuando no hay imagen, y la línea de "imagen cargada"
          (17px) cuando sí. Al elegir una foto, una reemplaza a la otra y el
          bloque entero se achicaba 41px — medido — así que todo lo que está
          debajo en el formulario saltaba hacia arriba justo en el momento en
          que la persona está mirando ahí.

          Reservando el alto de la más grande, elegir o quitar una foto ya no
          mueve nada de lo de abajo. Es el mismo criterio que el marco de la
          miniatura: en un formulario, lo que cambia de estado no tiene que
          cambiar de tamaño. */}
      <div className="imgpick__franja">
      {mostrarEnlace ? (
        <label className="imgpick__url">
          <span>o pegá un enlace</span>
          <input
            type="text"
            value={value || ""}
            onChange={(e) => {
              setFalla(false);
              onChange(e.target.value);
            }}
            placeholder="https://…"
            disabled={disabled}
          />
        </label>
      ) : (
        <small className="imgpick__uploaded">
          <Icon name="check" size={12} /> Imagen cargada.{" "}
          <button type="button" className="imgpick__link" onClick={() => setPegarEnlace(true)}>
            Pegar un enlace en cambio
          </button>
        </small>
      )}
      </div>

      {falla && value && (
        <small className="imgpick__error">
          <Icon name="alert-triangle" size={12} /> No se pudo mostrar esa imagen. Revisá
          el enlace antes de publicar.
        </small>
      )}

      {hint && <small className="imgpick__hint">{hint}</small>}
    </div>
  );
}
