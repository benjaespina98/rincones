import { useCallback, useEffect, useState } from "react";
import { getUsers, updateUserRole, deleteUser } from "../services/adminApi";
import { useToast } from "../context/ToastContext";
import ConfirmModal from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import Icon from "../components/Icon";
import "./styles/AdminUsersPage.css";

/**
 * Gestión de usuarios y roles.
 *
 * Las guardas de "no te saques el admin a vos mismo" y "no borres al último
 * admin" viven en el server; acá además deshabilitamos los controles para que
 * ni siquiera se pueda intentar.
 */
const AdminUsersPage = ({ embedded = false }) => {
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState([]);
  const [admins, setAdmins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0, limit: 20 });
  const [busyId, setBusyId] = useState(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getUsers({ page, limit: 20, q: query, role: roleFilter });
      setUsers(data.data);
      setAdmins(data.meta?.admins || 0);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar los usuarios");
    } finally {
      setLoading(false);
    }
  }, [page, query, roleFilter]);

  // Debounce de la búsqueda: escribir no dispara una consulta por tecla.
  useEffect(() => {
    const t = setTimeout(loadUsers, query ? 350 : 0);
    return () => clearTimeout(t);
  }, [loadUsers, query]);

  const handleRoleChange = async (user) => {
    if (busyId) return;
    const next = user.role === "admin" ? "user" : "admin";
    try {
      setBusyId(user._id);
      const res = await updateUserRole(user._id, next);
      showSuccess(res.message || "Rol actualizado");
      await loadUsers();
    } catch (err) {
      showError(err.response?.data?.message || "No se pudo actualizar el rol");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    const user = confirmDelete;
    setConfirmDelete(null);
    if (!user) return;
    try {
      setBusyId(user._id);
      const res = await deleteUser(user._id);
      showSuccess(res.message || "Cuenta eliminada");
      await loadUsers();
    } catch (err) {
      showError(err.response?.data?.message || "No se pudo eliminar la cuenta");
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString("es-AR", { year: "numeric", month: "short", day: "numeric" }) : "—";

  const displayName = (u) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || "(sin nombre)";

  // Las cuentas de prueba se marcan para poder limpiarlas de un vistazo.
  const isTestAccount = (u) =>
    /^(qa[._]|smoke_|local_test|test)/i.test(u.email || "") ||
    /@rincones\.(local|test)$/i.test(u.email || "");

  return (
    <div className={`admin-users ${embedded ? "admin-users--embedded" : ""}`}>
      {!embedded && (
        <header className="admin-users__header">
          <h1>Usuarios</h1>
        </header>
      )}

      <div className="admin-users__toolbar">
        <div className="admin-users__search">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Buscar por mail o nombre…"
            aria-label="Buscar usuarios"
          />
        </div>
        <div className="admin-users__filters" role="group" aria-label="Filtrar por rol">
          {[
            { value: "", label: "Todos" },
            { value: "admin", label: "Admins" },
            { value: "user", label: "Usuarios" },
          ].map((f) => (
            <button
              key={f.value}
              type="button"
              className={`admin-chip ${roleFilter === f.value ? "is-active" : ""}`}
              aria-pressed={roleFilter === f.value}
              onClick={() => { setRoleFilter(f.value); setPage(1); }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="admin-users__loading">Cargando usuarios…</p>}

      {!loading && error && (
        <ErrorState title="No se pudieron cargar los usuarios" onRetry={loadUsers} compact />
      )}

      {!loading && !error && users.length === 0 && (
        <EmptyState
          icon="search"
          title="Sin resultados"
          hint={query ? `Nadie coincide con “${query}”.` : "Todavía no hay usuarios registrados."}
          compact
        />
      )}

      {!loading && !error && users.length > 0 && (
        <ul className="admin-user-list">
          {users.map((u) => {
            const busy = busyId === u._id;
            // Sin otro admin, quitarse el rol dejaría la app sin panel.
            const lastAdmin = u.role === "admin" && admins <= 1;
            return (
              <li key={u._id} className={`admin-user ${busy ? "is-busy" : ""}`}>
                <div className="admin-user__main">
                  <div className="admin-user__id">
                    <span className="admin-user__name">
                      {displayName(u)}
                      {u.isSelf && <span className="admin-user__you">vos</span>}
                      {isTestAccount(u) && <span className="admin-user__test">prueba</span>}
                    </span>
                    <span className="admin-user__email">{u.email}</span>
                  </div>
                  <span className={`admin-role admin-role--${u.role || "user"}`}>
                    {u.role === "admin" ? "Admin" : "Usuario"}
                  </span>
                </div>

                <div className="admin-user__meta">
                  <span>{u.wineCount} {u.wineCount === 1 ? "vino" : "vinos"}</span>
                  <span>{u.reviewCount} {u.reviewCount === 1 ? "reseña" : "reseñas"}</span>
                  <span>Alta {formatDate(u.createdAt)}</span>
                </div>

                <div className="admin-user__actions">
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={() => handleRoleChange(u)}
                    disabled={busy || u.isSelf || lastAdmin}
                    title={
                      u.isSelf
                        ? "No podés cambiarte el rol a vos mismo"
                        : lastAdmin
                          ? "Es el único admin: promové a otro primero"
                          : undefined
                    }
                  >
                    {u.role === "admin" ? "Quitar admin" : "Hacer admin"}
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--danger"
                    onClick={() => setConfirmDelete(u)}
                    disabled={busy || u.isSelf || lastAdmin}
                    title={u.isSelf ? "No podés eliminar tu propia cuenta" : undefined}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pagination.pages > 1 && (
        <div className="admin-users__pagination">
          <button
            type="button"
            className="admin-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Anterior
          </button>
          <span>Página {page} de {pagination.pages} · {pagination.total} en total</span>
          <button
            type="button"
            className="admin-btn"
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page >= pagination.pages}
          >
            Siguiente
          </button>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="¿Eliminar esta cuenta?"
        message={
          confirmDelete
            ? `Se va a borrar la cuenta de ${confirmDelete.email} junto con sus ${confirmDelete.wineCount} vino(s), sus guardados, sus momentos y sus ${confirmDelete.reviewCount} reseña(s). No se puede deshacer.`
            : ""
        }
        confirmText="Eliminar cuenta"
        cancelText="Cancelar"
        isDangerous
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};

export default AdminUsersPage;
