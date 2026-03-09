import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createLugar } from "../services/lugaresApi";
import { categorias } from "../utils/categorias";
import { useLugares } from "../hooks/useLugares";
import MapPicker from "../components/MapPicker";

const initialState = {
  nombre: "",
  descripcion: "",
  categoria: "rio",
  ciudad: "",
  direccion: "",
  latitud: "",
  longitud: "",
  imagenes: "",
  rating: "",
};

const AgregarLugarPage = () => {
  const [formData, setFormData] = useState(initialState);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { recargar } = useLugares();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleMapSelect = ({ lat, lng }) => {
    setFormData((prev) => ({
      ...prev,
      latitud: lat.toFixed(6),
      longitud: lng.toFixed(6),
    }));
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

    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      errors.push("El rating debe estar entre 0 y 5.");
    }

    if (formData.imagenes.trim()) {
      const imagenes = formData.imagenes
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const invalid = imagenes.find((url) => {
        try {
          new URL(url);
          return false;
        } catch {
          return true;
        }
      });

      if (invalid) {
        errors.push("Todas las imagenes deben ser URLs validas.");
      }
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
      imagenes: formData.imagenes
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
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
      <p className="lead">Carga un rincon para que otras personas puedan descubrirlo.</p>

      <form className="place-form" onSubmit={handleSubmit}>
        <label>
          Nombre
          <input name="nombre" value={formData.nombre} onChange={handleChange} required />
        </label>

        <label>
          Descripcion
          <textarea name="descripcion" value={formData.descripcion} onChange={handleChange} required rows={4} />
        </label>

        <label>
          Categoria
          <select name="categoria" value={formData.categoria} onChange={handleChange}>
            {categorias.map((categoria) => (
              <option key={categoria} value={categoria}>
                {categoria}
              </option>
            ))}
          </select>
        </label>

        <label>
          Ciudad
          <input name="ciudad" value={formData.ciudad} onChange={handleChange} required />
        </label>

        <label>
          Direccion
          <input name="direccion" value={formData.direccion} onChange={handleChange} required />
        </label>

        <div className="grid-two">
          <label>
            Latitud
            <input
              type="number"
              step="any"
              name="latitud"
              value={formData.latitud}
              onChange={handleChange}
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
              onChange={handleChange}
              required
            />
          </label>
        </div>

        <MapPicker
          latitud={Number(formData.latitud)}
          longitud={Number(formData.longitud)}
          onSelect={handleMapSelect}
        />

        <label>
          Imagenes (URLs separadas por coma)
          <input name="imagenes" value={formData.imagenes} onChange={handleChange} />
        </label>

        <label>
          Rating
          <input type="number" min="0" max="5" step="0.1" name="rating" value={formData.rating} onChange={handleChange} />
        </label>

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
