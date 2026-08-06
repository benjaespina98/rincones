import { useId, useRef, useState } from "react";
import Icon from "./Icon";
import { toUploadableDataUrl, toUploadableLogo } from "../utils/image";
import "./ImagePicker.css";

/**
 * Elegir una imagen: subiendo un archivo o pegando un enlace.
 *
 * ── POR QUÉ LAS DOS COSAS Y NO SÓLO UN ENLACE ───────────────────────────────
 * Porque una imagen llega como archivo. La bodega te manda el logo por WhatsApp;
 * nadie tiene una URL a mano. Pedir un enlace obliga a subir el archivo a algún
 * otro lado primero, y a que ese otro lado siga existiendo el año que viene —o la
 * tarjeta se rompe sola, sin que nadie se entere hasta que un usuario la vea—.
 *
 * El enlace igual queda, porque el caso existe: el anunciante que te pasa la URL de
 * su propio sitio.
 *
 * ── POR QUÉ SE VE LO QUE SE ELIGIÓ ──────────────────────────────────────────
 * Un campo de imagen sin miniatura no dice si lo que pegaste funciona. Un enlace
 * roto se ve idéntico a uno bueno hasta que la campaña sale al aire. Acá la
 * miniatura ES la validación: si no aparece, el enlace no sirve, y eso se descubre
 * cargando y no publicando.
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
  const archivoRef = useRef(null);
  const [cargando, setCargando] = useState(false);
  const [falla, setFalla] = useState(false);
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
    } catch {
      setFalla(true);
    } finally {
      setCargando(false);
    }
  };

  const esArchivo = /^data:image\//i.test(String(value || ""));

  return (
    <div className={`imgpick imgpick--${variant}`}>
      <span className="imgpick__label">{label}</span>

      <div className="imgpick__row">
        {/* La miniatura: lo que se eligió, tal como el navegador lo puede mostrar. */}
        <div className={`imgpick__thumb ${value ? "" : "is-empty"}`}>
          {value ? (
            <img src={value} alt="" onError={() => setFalla(true)} onLoad={() => setFalla(false)} />
          ) : (
            <Icon name="image" size={18} />
          )}
        </div>

        <div className="imgpick__actions">
          <button
            type="button"
            className="imgpick__btn"
            onClick={() => archivoRef.current?.click()}
            disabled={disabled || cargando}
          >
            <Icon name="camera" size={15} />
            {cargando ? "Preparando…" : value ? "Cambiar" : "Subir imagen"}
          </button>

          {value && (
            <button
              type="button"
              className="imgpick__btn imgpick__btn--ghost"
              onClick={() => {
                setFalla(false);
                onChange("");
              }}
              disabled={disabled}
            >
              Quitar
            </button>
          )}

          <input
            ref={archivoRef}
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

      {/* El enlace, para cuando el anunciante pasa una URL. Se oculta cuando ya hay
          un archivo subido: mostrar un data URL de 40.000 caracteres en un input no
          le sirve a nadie y hace parecer que algo se rompió. */}
      {esArchivo ? (
        <small className="imgpick__uploaded">
          <Icon name="check" size={12} /> Imagen subida. Se guarda al guardar la campaña.
        </small>
      ) : (
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
      )}

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
