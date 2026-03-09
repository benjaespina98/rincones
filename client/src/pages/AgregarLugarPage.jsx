import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createLugar } from "../services/lugaresApi";
import { categorias } from "../utils/categorias";
import { useLugares } from "../hooks/useLugares";

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
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { recargar } = useLugares();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const payload = {
      nombre: formData.nombre,
      descripcion: formData.descripcion,
      categoria: formData.categoria,
      ciudad: formData.ciudad,
      direccion: formData.direccion,
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
      await createLugar(payload);
      await recargar();
      navigate("/explorar");
    } catch (requestError) {
      setError("No se pudo crear el lugar. Revisa los datos ingresados.");
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

        <label>
          Imagenes (URLs separadas por coma)
          <input name="imagenes" value={formData.imagenes} onChange={handleChange} />
        </label>

        <label>
          Rating
          <input type="number" min="0" max="5" step="0.1" name="rating" value={formData.rating} onChange={handleChange} />
        </label>

        {error && <p className="error-text">{error}</p>}

        <button className="button" type="submit" disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar lugar"}
        </button>
      </form>
    </section>
  );
};

export default AgregarLugarPage;
