import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createLugar } from "../services/lugaresApi";
import { categorias } from "../utils/categorias";
import { useLugares } from "../hooks/useLugares";
import MapPicker from "../components/MapPicker";
import StarRating from "../components/StarRating";

const initialState = {
  nombre: "",
  descripcion: "",
  categoria: "rio",
  ciudad: "",
  direccion: "",
  latitud: "",
  longitud: "",
  telefono: "",
  instagram: "",
  sitioWeb: "",
  rating: "4",
};

const readFileAsDataUrl = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
};

const AgregarLugarPage = () => {
  const [formData, setFormData] = useState(initialState);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { recargar } = useLugares();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleMapSelect = ({ lat, lng, direccion, source }) => {
    setFormData((prev) => ({
      ...prev,
      latitud: lat.toFixed(6),
      longitud: lng.toFixed(6),
      direccion:
        direccion && (source === "search" || !prev.direccion.trim())
          ? direccion
          : prev.direccion,
    }));
  };

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);

    if (files.length === 0) {
      return;
    }

    const tooLarge = files.find((file) => file.size > 2 * 1024 * 1024);
    if (tooLarge) {
      setError("Cada imagen debe pesar menos de 2MB.");
      return;
    }

    if (uploadedImages.length + files.length > 4) {
      setError("Puedes subir hasta 4 imagenes por lugar.");
      return;
    }

    try {
      setError("");
      const asDataUrls = await Promise.all(files.map((file) => readFileAsDataUrl(file)));
      setUploadedImages((prev) => [...prev, ...asDataUrls].slice(0, 4));
    } catch {
      setError("No se pudieron procesar las imagenes seleccionadas.");
    }
  };

  const removeUploadedImage = (indexToRemove) => {
    setUploadedImages((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const validateForm = () => {
    const errors = [];
    const lat = Number(formData.latitud);
    const lng = Number(formData.longitud);
    const rating = Number(formData.rating || 0);

    if (formData.nombre.trim().length < 3) {
      errors.push("El nombre debe tener al menos 3 caracteres.");
    }

    if (formData.descripcion.trim().length < 10) {
      errors.push("La descripcion debe tener al menos 10 caracteres.");
    }

    if (!formData.ciudad.trim()) {
      errors.push("La ciudad es obligatoria.");
    }

    if (!formData.direccion.trim()) {
      errors.push("La direccion es obligatoria.");
    }

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.push("La latitud debe estar entre -90 y 90.");
    }

    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.push("La longitud debe estar entre -180 y 180.");
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      errors.push("El rating debe estar entre 1 y 5.");
    }

    if (formData.telefono.trim() && !/^[+\d\s()-]{7,20}$/.test(formData.telefono.trim())) {
      errors.push("Telefono invalido. Usa solo numeros, espacios y +.-() ");
    }

    if (formData.sitioWeb.trim()) {
      try {
        const parsed = new URL(formData.sitioWeb.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          errors.push("Sitio web invalido. Debe comenzar con http:// o https://");
        }
      } catch {
        errors.push("Sitio web invalido. Debe comenzar con http:// o https://");
      }
    }

    if (uploadedImages.length === 0) {
      errors.push("Agrega al menos una imagen desde tu dispositivo.");
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const payload = {
      nombre: formData.nombre.trim(),
      descripcion: formData.descripcion.trim(),
      categoria: formData.categoria,
      ciudad: formData.ciudad.trim(),
      direccion: formData.direccion.trim(),
      ubicacion: {
        latitud: Number(formData.latitud),
        longitud: Number(formData.longitud),
      },
      imagenes: uploadedImages,
      contacto: {
        telefono: formData.telefono.trim() || undefined,
        instagram: formData.instagram.trim() || undefined,
        sitioWeb: formData.sitioWeb.trim() || undefined,
      },
      rating: Number(formData.rating || 0),
    };

    try {
      setSubmitting(true);
      setError("");
      setValidationErrors([]);
      await createLugar(payload);
      await recargar();
      navigate("/explorar");
    } catch (requestError) {
      const backendErrors = requestError.response?.data?.errors;
      const backendMessage = requestError.response?.data?.message;

      if (Array.isArray(backendErrors) && backendErrors.length > 0) {
        setError(backendErrors.join(" "));
      } else {
        setError(backendMessage || "No se pudo crear el lugar. Revisa los datos ingresados.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <h1>Agregar nuevo lugar</h1>
      <p className="lead">Carga un rincón para que otras personas puedan descubrirlo.</p>

      <form className="place-form" onSubmit={handleSubmit}>
        <div className="form-section">
          <h2 className="form-section__title">Datos principales</h2>
        <label>
          Nombre
          <input name="nombre" value={formData.nombre} onChange={handleChange} required />
        </label>

        <label>
          Descripción
          <textarea name="descripcion" value={formData.descripcion} onChange={handleChange} required rows={4} />
        </label>

        <label>
          Categoría
          <select name="categoria" value={formData.categoria} onChange={handleChange}>
            {categorias.map((categoria) => (
              <option key={categoria.value} value={categoria.value}>
                {categoria.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Ciudad
          <input name="ciudad" value={formData.ciudad} onChange={handleChange} required />
        </label>

        <label>
          Dirección
          <input
            name="direccion"
            value={formData.direccion}
            onChange={handleChange}
            required
            placeholder="Se completa al buscar en el mapa"
          />
          <small className="map-help">Buscá en el mapa y tomamos dirección + coordenadas automáticamente.</small>
        </label>
        </div>

        <div className="form-section">
          <h2 className="form-section__title">Ubicación</h2>
        <div className="grid-two">
          <label>
            Latitud
            <input
              type="number"
              step="any"
              name="latitud"
              value={formData.latitud}
              readOnly
              required
            />
          </label>
          <label>
            Longitud
            <input
              type="number"
              step="any"
              name="longitud"
              value={formData.longitud}
              readOnly
              required
            />
          </label>
        </div>

        <MapPicker
          latitud={Number(formData.latitud)}
          longitud={Number(formData.longitud)}
          onSelect={handleMapSelect}
        />
        </div>

        <div className="form-section">
          <h2 className="form-section__title">Multimedia y contacto</h2>
        <label>
          Imágenes desde tu dispositivo
          <input type="file" accept="image/*" multiple onChange={handleFileChange} />
        </label>

        {uploadedImages.length > 0 && (
          <div className="uploaded-grid">
            {uploadedImages.map((image, index) => (
              <div key={`${image.slice(0, 20)}-${index}`} className="uploaded-item">
                <img src={image} alt={`preview-${index + 1}`} />
                <button type="button" className="button button--danger" onClick={() => removeUploadedImage(index)}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid-two">
          <label>
            Teléfono (opcional)
            <div className="contact-input">
              <span aria-hidden="true">📞</span>
              <input
                name="telefono"
                value={formData.telefono}
                onChange={handleChange}
                placeholder="+54 11 1234 5678"
              />
            </div>
          </label>

          <label>
            Instagram (opcional)
            <div className="contact-input">
              <span aria-hidden="true">📸</span>
              <input
                name="instagram"
                value={formData.instagram}
                onChange={handleChange}
                placeholder="@cuenta o https://instagram.com/..."
              />
            </div>
          </label>
        </div>

        <label>
          Sitio web (opcional)
          <div className="contact-input">
            <span aria-hidden="true">🌐</span>
            <input
              name="sitioWeb"
              value={formData.sitioWeb}
              onChange={handleChange}
              placeholder="https://tusitio.com"
            />
          </div>
        </label>

        <label>
          Rating
          <div className="rating-combo">
            <select name="rating" value={formData.rating} onChange={handleChange}>
              <option value="1">1 estrella</option>
              <option value="2">2 estrellas</option>
              <option value="3">3 estrellas</option>
              <option value="4">4 estrellas</option>
              <option value="5">5 estrellas</option>
            </select>
            <StarRating value={Number(formData.rating || 0)} size="sm" />
          </div>
        </label>
        </div>

        {validationErrors.length > 0 && (
          <div className="error-box">
            {validationErrors.map((item) => (
              <p key={item} className="error-text">
                {item}
              </p>
            ))}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <button className="button" type="submit" disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar lugar"}
        </button>
      </form>
    </section>
  );
};

export default AgregarLugarPage;
