import { useCallback, useEffect, useMemo, useState } from "react";
import { getUsers, updateUserRole, deleteUser, bulkDeleteUsers } from "../services/adminApi";
import { useToast } from "../context/ToastContext";
import ConfirmModal from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import AdminPager from "../components/AdminPager";
import Dropdown from "../components/Dropdown";
import Icon from "../components/Icon";
import "./AdminUsersPage.css";

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Alta: más nuevos" },
  { value: "createdAt:asc", label: "Alta: más viejos" },
  { value: "wineCount:desc", label: "Más vinos" },
  { value: "wineCount:asc", label: "Menos vinos" },
  { value: "reviewCount:desc", label: "Más reseñas" },
  { value: "reviewCount:asc", label: "Menos reseñas" },
];

/**
 * Gestión de usuarios y roles.
 *
 * Las guardas de "no te saques el admin a vos mismo" y "no borres al último
 * admin" viven en el server; acá además deshabilitamos los controles para que
 * ni siquiera se pueda intentar.
 */
const AdminUsersPage = () => {
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState([]);
  const [admins, setAdmins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0, limit: 20 });
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sortKey, setSortKey] = useState("createdAt:desc");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const [sort, dir] = sortKey.split(":");

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getUsers({ page, limit: 20, q: query, role: roleFilter, sort, dir });
      setUsers(data.data);
      setAdmins(data.meta?.admins || 0);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar los usuarios");
    } finally {
      setLoading(false);
    }
  }, [page, query, roleFilter, sort, dir]);

  // Debounce de la búsqueda: escribir no dispara una consulta por tecla.
  useEffect(() => {
    const t = setTimeout(loadUsers, query ? 350 : 0);
    return () => clearTimeout(t);
  }, [loadUsers, query]);

  // La selección es de "esta página": cambiar de filtro, orden o página deja
  // ids que ya no se ven en pantalla, y eso confunde más de lo que ayuda.
  useEffect(() => {
    setSelected(new Set());
  }, [page, query, roleFilter, sortKey]);

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

  const handleBulkDelete = async () => {
    setConfirmBulkDelete(false);
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      setBulkBusy(true);
      const res = await bulkDeleteUsers(ids);
      const { deleted = [], failed = [] } = res.data || {};
      if (failed.length === 0) {
        showSuccess(res.message || `${deleted.length} cuentas eliminadas`);
      } else {
        showError(
          `${deleted.length} eliminadas, ${failed.length} no se pudieron (${failed
            .map((f) => f.reason)
            .join(", ")})`
        );
      }
      setSelected(new Set());
      await loadUsers();
    } catch (err) {
      showError(err.response?.data?.message || "No se pudo completar el borrado en lote");
    } finally {
      setBulkBusy(false);
    }
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString("es-AR", { year: "numeric", month: "short", day: "numeric" }) : "Sin fecha";

  const displayName = (u) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || "(sin nombre)";

  // Las cuentas de prueba se marcan para poder limpiarlas de un vistazo.
  const isTestAccount = (u) =>
    /^(qa[._]|smoke_|local_test|test)/i.test(u.email || "") ||
    /@rincones\.(local|test)$/i.test(u.email || "");

  // Sólo entran a la selección las filas que de verdad se pueden borrar: sin
  // esto, "seleccionar todo" incluiría tu propia cuenta o al único admin, y
  // el borrado en lote fallaría para esa fila sin que quede claro por qué.
  const selectableIds = useMemo(
    () => users.filter((u) => !u.isSelf && !(u.role === "admin" && admins <= 1)).map((u) => u._id),
    [users, admins]
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  };

  return (
    <div className="admin-users">
      <header className="admin-users__header">
        <h1>Usuarios</h1>
      </header>

      <div className="admin-users__toolbar">
        <div className="admin-search">
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
        <Dropdown
          className="admin-users__sort"
          value={sortKey}
          onChange={(v) => { setSortKey(v); setPage(1); }}
          options={SORT_OPTIONS}
          ariaLabel="Ordenar por"
        />
      </div>

      {/* La barra de lote aparece SÓLO con algo seleccionado.
          Antes estaba siempre a la vista (con "Seleccionar todos" adentro), así
          que la pantalla llevaba permanentemente una barra de acciones en masa
          sobre cuentas de usuarios reales, apuntando a nada. La casilla de
          "todos" se mudó al encabezado de su columna, que es donde se la
          busca; acá queda lo que de verdad es una acción. */}
      {selected.size > 0 && (
        <div className="admin-bulkbar">
          <span>{selected.size} {selected.size === 1 ? "cuenta seleccionada" : "cuentas seleccionadas"}</span>
          <button type="button" className="admin-btn" onClick={() => setSelected(new Set())}>
            Deseleccionar
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            onClick={() => setConfirmBulkDelete(true)}
            disabled={bulkBusy}
          >
            <Icon name="trash" size={14} /> Eliminar
          </button>
        </div>
      )}

      {!loading && error && (
        <ErrorState title="No se pudieron cargar los usuarios" onRetry={loadUsers} compact />
      )}

      {!loading && !error && users.length === 0 && (
        <EmptyState
          illustration="busqueda"
          title="Sin resultados"
          hint={query ? `Nadie coincide con “${query}”.` : "Todavía no hay usuarios registrados."}
          compact
        />
      )}

      {/* ── TABLA, NO TARJETAS ──────────────────────────────────────────────
          Cada usuario ocupaba tres renglones apilados y dos botones de texto
          de ancho completo: con veinte por página eran sesenta renglones de
          scroll y cuarenta botones a la vista, y comparar dos cuentas —cuál
          tiene más vinos, cuál se dio de alta antes— obligaba a leer las dos
          enteras porque cada dato caía en un lugar distinto de su caja.

          En columnas, el mismo dato queda siempre en el mismo eje vertical y
          se compara de un vistazo. Ver el comentario de `.admin-table` en
          styles/AdminLayout.css. */}
      {!error && (loading || users.length > 0) && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {/* La casilla de "todos" vive en el encabezado de su columna,
                    que es donde se la busca. Antes estaba en una barra aparte
                    arriba de la lista, desconectada de las filas que marca. */}
                <th scope="col">
                  <label className="admin-checkbox" title="Seleccionar todos">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={selectableIds.length === 0}
                      aria-label="Seleccionar todos los de esta página"
                    />
                    <span className="admin-checkbox__tick" aria-hidden="true">
                      <Icon name="check" size={12} />
                    </span>
                  </label>
                </th>
                <th scope="col">Usuario</th>
                <th scope="col">Rol</th>
                <th scope="col" className="admin-table__num">Vinos</th>
                <th scope="col" className="admin-table__num">Reseñas</th>
                <th scope="col">Alta</th>
                <th scope="col"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }, (_, i) => (
                    <tr key={`skel-${i}`} className="admin-table__skel">
                      <td colSpan={7}><span /></td>
                    </tr>
                  ))
                : users.map((u) => {
                    const busy = busyId === u._id || bulkBusy;
                    // Sin otro admin, quitarse el rol dejaría la app sin panel.
                    const lastAdmin = u.role === "admin" && admins <= 1;
                    const selectable = !u.isSelf && !lastAdmin;
                    return (
                      <tr key={u._id} className={busy ? "is-busy" : ""}>
                        <td className="admin-table__sel">
                          {selectable && (
                            <label className="admin-checkbox">
                              <input
                                type="checkbox"
                                checked={selected.has(u._id)}
                                onChange={() => toggleOne(u._id)}
                                aria-label={`Seleccionar ${u.email}`}
                              />
                              <span className="admin-checkbox__tick" aria-hidden="true">
                                <Icon name="check" size={12} />
                              </span>
                            </label>
                          )}
                        </td>
                        <td className="admin-table__id" data-label="Usuario">
                          {displayName(u)}
                          {u.isSelf && <span className="admin-user__you">vos</span>}
                          {isTestAccount(u) && <span className="admin-user__test">prueba</span>}
                          <span className="admin-table__sub">{u.email}</span>
                        </td>
                        <td data-label="Rol">
                          <span className={`admin-role admin-role--${u.role || "user"}`}>
                            {u.role === "admin" ? "Admin" : "Usuario"}
                          </span>
                        </td>
                        <td className="admin-table__num" data-label="Vinos">{u.wineCount}</td>
                        <td className="admin-table__num" data-label="Reseñas">{u.reviewCount}</td>
                        <td data-label="Alta">{formatDate(u.createdAt)}</td>
                        <td>
                          <div className="admin-table__actions">
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
                            {/* Sólo el ícono: "Eliminar" escrito veinte veces en
                                columna es una fila de invitaciones a borrar. El
                                nombre de la acción vive en el aria-label y en el
                                tooltip, y la confirmación dice exactamente qué
                                se va a borrar. */}
                            <button
                              type="button"
                              className="admin-btn admin-btn--danger admin-btn--icon"
                              onClick={() => setConfirmDelete(u)}
                              disabled={busy || u.isSelf || lastAdmin}
                              aria-label={`Eliminar la cuenta de ${u.email}`}
                              title={
                                u.isSelf ? "No podés eliminar tu propia cuenta" : "Eliminar cuenta"
                              }
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPager
        page={page}
        pages={pagination.pages}
        total={pagination.total}
        onChange={setPage}
        label="cuentas"
      />

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

      <ConfirmModal
        isOpen={confirmBulkDelete}
        title={`¿Eliminar ${selected.size} cuentas?`}
        message="Se va a borrar cada cuenta seleccionada junto con todo su contenido (vinos, guardados, momentos y reseñas). No se puede deshacer."
        confirmText={`Eliminar ${selected.size} cuentas`}
        cancelText="Cancelar"
        isDangerous
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
};

export default AdminUsersPage;
