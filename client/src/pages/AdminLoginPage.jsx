import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useLugares } from "../hooks/useLugares";
import { deleteLugar, updateLugar } from "../services/lugaresApi";
import { getChangeLogs } from "../services/adminApi";
import { categorias } from "../utils/categorias";

const ACTION_LABELS = {
  create: "Creado",
  update: "Actualizado",
  delete: "Eliminado",
};

const getChangedFields = (before, after) => {
  if (!before || !after) {
    return [];
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const skip = new Set(["_id", "creadoEn", "imagenesCount"]);

  return [...keys].filter((key) => {
    if (skip.has(key)) {
      return false;
    }

    return JSON.stringify(before[key]) !== JSON.stringify(after[key]);
  });
};

const buildLogSummary = (log) => {
  const nombreLugar = log.after?.nombre || log.before?.nombre || "Lugar";

  if (log.action === "create") {
    return `Se creo ${nombreLugar}.`;
  }

  if (log.action === "delete") {
    return `Se elimino ${nombreLugar}.`;
  }

  if (log.action === "update") {
    const changed = getChangedFields(log.before, log.after);

    if (!changed.length) {
      return "Se guardaron cambios.";
    }

    const visibleFields = changed.slice(0, 4).join(", ");
    const suffix = changed.length > 4 ? ` y ${changed.length - 4} mas` : "";
    return `Campos modificados: ${visibleFields}${suffix}.`;
  }

  return "";
};

const AdminLoginPage = () => {
  const { login, isAdmin, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { lugares, recargar } = useLugares();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [selectedLugarId, setSelectedLugarId] = useState("");
  const [editData, setEditData] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const nextPath = location.state?.from || "/agregar";

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const loadLogs = async () => {
      try {
        const data = await getChangeLogs(25);
        setLogs(data);
      } catch {
        setLogs([]);
      }
    };

    loadLogs();
  }, [isAdmin]);

  const selectedLugar = useMemo(
    () => lugares.find((item) => item._id === selectedLugarId) || null,
    [lugares, selectedLugarId]
  );

  useEffect(() => {
    if (!selectedLugar) {
      setEditData(null);
      return;
    }

    setEditData({
      nombre: selectedLugar.nombre || "",
      descripcion: selectedLugar.descripcion || "",
      categoria: selectedLugar.categoria || "rio",
      ciudad: selectedLugar.ciudad || "",
      direccion: selectedLugar.direccion || "",
      rating: String(selectedLugar.rating ?? 0),
      telefono: selectedLugar.contacto?.telefono || "",
      instagram: selectedLugar.contacto?.instagram || "",
      sitioWeb: selectedLugar.contacto?.sitioWeb || "",
    });
  }, [selectedLugar]);

  const handleDelete = async (lugarId) => {
    const confirmed = window.confirm("Estas seguro de eliminar este lugar?");

    if (!confirmed) {
      return;
    }

    try {
      await deleteLugar(lugarId);
      await recargar();
      const data = await getChangeLogs(25);
      setLogs(data);
      if (selectedLugarId === lugarId) {
        setSelectedLugarId("");
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "No se pudo eliminar el lugar");
    }
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();

    if (!selectedLugar || !editData) {
      return;
    }

    const payload = {
      nombre: editData.nombre,
      descripcion: editData.descripcion,
      categoria: editData.categoria,
      ciudad: editData.ciudad,
      direccion: editData.direccion,
      ubicacion: {
        latitud: selectedLugar.ubicacion?.latitud,
        longitud: selectedLugar.ubicacion?.longitud,
      },
      imagenes: selectedLugar.imagenes || [],
      contacto: {
        telefono: editData.telefono,
        instagram: editData.instagram,
        sitioWeb: editData.sitioWeb,
      },
      rating: Number(editData.rating || 0),
    };

    try {
      setSavingEdit(true);
      setError("");
      await updateLugar(selectedLugar._id, payload);
      await recargar();
      const data = await getChangeLogs(25);
      setLogs(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "No se pudo actualizar el lugar");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      await login(email, password);
      navigate(nextPath, { replace: true });
    } catch (requestError) {
      const message = requestError.response?.data?.message || "No se pudo iniciar sesion";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (isAdmin) {
    return (
      <section className="panel-card">
        <h1>Panel admin</h1>
        <p className="lead">Sesion iniciada como {user?.email}.</p>
        <div className="admin-actions">
          <button className="button" type="button" onClick={() => navigate("/agregar")}>
            Ir a agregar lugar
          </button>
          <button className="button button--danger" type="button" onClick={logout}>
            Cerrar sesion
          </button>
        </div>

        <div className="admin-grid">
          <div className="admin-panel">
            <h2>Lugares publicados</h2>
            <div className="admin-list">
              {lugares.map((lugar) => (
                <article key={lugar._id} className="admin-item">
                  <div>
                    <strong>{lugar.nombre}</strong>
                    <p>{lugar.ciudad}</p>
                  </div>
                  <div className="admin-item__actions">
                    <button className="button" type="button" onClick={() => setSelectedLugarId(lugar._id)}>
                      Editar
                    </button>
                    <button className="button button--danger" type="button" onClick={() => handleDelete(lugar._id)}>
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="admin-panel">
            <h2>Actividad reciente</h2>
            <div className="admin-log-list">
              {!logs.length && <p className="map-help">Todavia no hay movimientos registrados.</p>}
              {logs.map((log) => (
                <article key={log._id} className="admin-log-item">
                  <div className="admin-log-item__head">
                    <span className={`admin-log-badge admin-log-badge--${log.action}`}>
                      {ACTION_LABELS[log.action] || String(log.action || "").toUpperCase()}
                    </span>
                    <small>{new Date(log.createdAt).toLocaleString()}</small>
                  </div>
                  <strong className="admin-log-item__title">{log.after?.nombre || log.before?.nombre || "Lugar"}</strong>
                  <span className="admin-log-item__meta">Por {log.actor?.email || "admin"}</span>
                  <p className="admin-log-item__summary">{buildLogSummary(log)}</p>
                </article>
              ))}
            </div>
          </div>
        </div>

        {selectedLugar && editData && (
          <form className="place-form panel-card" onSubmit={handleSaveEdit}>
            <h2>Editar lugar</h2>

            <label>
              Nombre
              <input name="nombre" value={editData.nombre} onChange={handleEditChange} required />
            </label>
            <label>
              Descripcion
              <textarea name="descripcion" value={editData.descripcion} onChange={handleEditChange} rows={4} required />
            </label>
            <label>
              Categoria
              <select name="categoria" value={editData.categoria} onChange={handleEditChange}>
                {categorias.map((categoria) => (
                  <option key={categoria.value} value={categoria.value}>
                    {categoria.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid-two">
              <label>
                Ciudad
                <input name="ciudad" value={editData.ciudad} onChange={handleEditChange} required />
              </label>
              <label>
                Direccion
                <input name="direccion" value={editData.direccion} onChange={handleEditChange} required />
              </label>
            </div>
            <div className="grid-two">
              <label>
                Telefono
                <input name="telefono" value={editData.telefono} onChange={handleEditChange} />
              </label>
              <label>
                Instagram
                <input name="instagram" value={editData.instagram} onChange={handleEditChange} />
              </label>
            </div>
            <label>
              Sitio web
              <input name="sitioWeb" value={editData.sitioWeb} onChange={handleEditChange} />
            </label>
            <label>
              Rating
              <input type="number" min="0" max="5" step="0.1" name="rating" value={editData.rating} onChange={handleEditChange} />
            </label>

            <button className="button" type="submit" disabled={savingEdit}>
              {savingEdit ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>
        )}

        {error && <p className="error-text">{error}</p>}
      </section>
    );
  }

  return (
    <section className="panel-card">
      <span className="page-kicker">Acceso restringido</span>
      <h1>Acceso admin</h1>
      <p className="lead">Ingresa con usuario administrador para gestionar lugares.</p>

      <form className="place-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          Contrasena
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <button className="button" type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </section>
  );
};

export default AdminLoginPage;
