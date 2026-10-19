import Dropdown from "./Dropdown";
import ImagePicker from "./ImagePicker";
import { WINE_TYPES, WINERIES, REGIONS, VARIETALS, STORES } from "../data/wineReference";

/**
 * El formulario de la ficha: cambiar los datos de un vino que ya cargaste.
 *
 * ── POR QUÉ ES OTRO ARCHIVO ─────────────────────────────────────────────────
 * Porque es otro modo de la pantalla, no otra sección. Mientras editás, la
 * ficha entera desaparece —no hay resumen, ni plan, ni diario, ni barra de
 * secciones— y queda esto solo. Tenerlo mezclado con el modo lectura obligaba a
 * leer 217 líneas de campos para encontrar cualquier cosa de la ficha, y al
 * revés.
 *
 * Se movió tal cual, sin renombrar nada, por el mismo motivo que `WineMoments`:
 * un refactor que mueve y reescribe a la vez no se puede revisar.
 *
 * ── LO DEL TECLADO PREDICTIVO ───────────────────────────────────────────────
 * Los cuatro atributos en "off" de cada campo de texto libre no son ruido: sin
 * ellos, el teclado del celular completa una palabra a mitad de tipeo y se come
 * el espacio recién tocado, o autocorrige el nombre de una bodega a otra
 * palabra. Es el síntoma de "no me deja escribir bien" que se reportó sobre
 * esta pantalla. Nombres de vinos y de bodegas no son texto de idioma.
 */
export default function WineDetailEditor({
  draft,
  updateDraftField,
  saving,
  handleSaveEdit,
  setEditing,
}) {
  return (
    <div className="scan-edit-grid">
      {/* La foto, primera y en la edición: hasta ahora sólo podía entrar al
          crear el vino, así que una botella cargada sin foto —o con una
          mala— se quedaba así para siempre. Y como la foto propia alimenta
          el banco compartido, eso también trababa el banco: sólo podía
          aprender en el alta. */}
      <ImagePicker
        label="Foto de la botella"
        hint="Si nadie subió una de este vino, va a ser la que vean los demás."
        value={draft.image}
        onChange={(v) => updateDraftField("image", v)}
        disabled={saving}
      />
      {/*
        Los cuatro atributos de abajo (autoComplete/autoCorrect/
        autoCapitalize/spellCheck en "off") van en todo el texto libre de
        este formulario. Sin ellos, el teclado predictivo del celular
        puede "completar" una palabra a mitad de tipeo y comerse el
        espacio que se acababa de tocar, o autocorregir un nombre de
        bodega a otra palabra que no es — que es justo el síntoma de
        "no me deja escribir bien" que reportaron sobre esta pantalla.
        Nombres de vinos y bodegas no son texto de idioma: no hay nada
        que autocompletar ni que corregir.
      */}
      <input
        type="text"
        className="scan-edit-input"
        placeholder="Nombre del vino *"
        maxLength={120}
          aria-label="Nombre del vino"
        value={draft.name}
        onChange={(event) => updateDraftField("name", event.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />
      <input
        type="text"
        className="scan-edit-input"
        placeholder="Bodega"
        maxLength={120}
          aria-label="Bodega (productor)"
        list="wine-wineries"
        value={draft.winery}
        onChange={(event) => updateDraftField("winery", event.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />
      <input
        type="text"
        className="scan-edit-input"
        placeholder="Región"
        maxLength={120}
          aria-label="Región"
        list="wine-regions"
        value={draft.region}
        onChange={(event) => updateDraftField("region", event.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />
      <input
        type="text"
        className="scan-edit-input"
        placeholder="Varietal"
        maxLength={80}
          aria-label="Varietal"
        list="wine-varietals"
        value={draft.varietal}
        onChange={(event) => updateDraftField("varietal", event.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />
      <input
        type="number"
        inputMode="numeric"
        min="1900"
        max={new Date().getFullYear()}
        aria-label="Año de cosecha"
        className="scan-edit-input"
        placeholder="Año"
        value={draft.vintage}
        onChange={(event) => updateDraftField("vintage", event.target.value)}
      />
      <Dropdown
        ariaLabel="Tipo de vino"
        value={draft.type}
        onChange={(v) => updateDraftField("type", v)}
        options={[
          { value: "unknown", label: "Tipo de vino…" },
          ...WINE_TYPES.map(({ value, label }) => ({ value, label })),
        ]}
      />
      <textarea
        className="scan-edit-textarea"
        placeholder="Notas"
        maxLength={4000}
          aria-label="Notas"
        value={draft.notes}
        onChange={(event) => updateDraftField("notes", event.target.value)}
        autoCorrect="off"
        spellCheck="false"
      />

      <div className="scan-section-divider">
        <span>Bodega</span>
      </div>
      {/* Dos campos y no uno: "dónde" (Cava 1, Heladera) y "en qué parte de
          ahí" (Estante 3) contestan preguntas distintas cuando volvés a
          buscar la botella, y separados la tarjeta puede mostrar sólo el
          primero sin partir un texto libre a la mitad. */}
      <div className="scan-edit-grid scan-edit-grid--two">
        <input
          type="text"
          className="scan-edit-input"
          placeholder="Lugar (ej: Cava 1, Heladera)"
        maxLength={120}
          aria-label="Lugar en tu casa"
          value={draft.cellarLocation}
          onChange={(e) => updateDraftField("cellarLocation", e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        <input
          type="text"
          className="scan-edit-input"
          placeholder="Posición (ej: Estante 3)"
        maxLength={120}
          aria-label="Posición dentro de ese lugar"
          value={draft.cellarShelf}
          onChange={(e) => updateDraftField("cellarShelf", e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
      </div>
      <div className="scan-edit-grid scan-edit-grid--two">
        <input
          type="number"
          inputMode="numeric"
          min="1900"
          aria-label="Beber desde (año)"
          className="scan-edit-input"
          placeholder="Beber desde (año)"
          value={draft.drinkFrom}
          onChange={(e) => updateDraftField("drinkFrom", e.target.value)}
        />
        <input
          type="number"
          inputMode="numeric"
          min="1900"
          aria-label="Beber hasta (año)"
          className="scan-edit-input"
          placeholder="Beber hasta (año)"
          value={draft.drinkUntil}
          onChange={(e) => updateDraftField("drinkUntil", e.target.value)}
        />
      </div>

      <div className="scan-section-divider">
        <span>Datos de compra</span>
      </div>
      <input
        type="number"
        inputMode="decimal"
        aria-label="Precio pagado"
        className="scan-edit-input"
        placeholder="Precio"
        min="0"
        step="0.01"
        value={draft.price}
        onChange={(e) => updateDraftField("price", e.target.value)}
      />
      <input
        type="text"
        className="scan-edit-input"
        placeholder="Tienda o vinoteca"
        maxLength={120}
        list="detail-stores"
        value={draft.store}
        onChange={(e) => updateDraftField("store", e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />
      <input
        type="date"
        className="scan-edit-input"
        value={draft.purchasedAt}
        onChange={(e) => updateDraftField("purchasedAt", e.target.value)}
        aria-label="Fecha de compra"
      />

      <datalist id="wine-wineries">
        {WINERIES.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="wine-regions">
        {REGIONS.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="wine-varietals">
        {VARIETALS.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="detail-stores">
        {STORES.map((name) => <option key={name} value={name} />)}
      </datalist>

      <div className="result-actions">
        <button className="btn-cancel" type="button" disabled={saving} onClick={() => setEditing(false)}>
          Cancelar
        </button>
        <button className="btn-add" type="button" disabled={saving} onClick={handleSaveEdit}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
