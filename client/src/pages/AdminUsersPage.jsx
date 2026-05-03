import { useEffect, useState } from "react";
import { getUsers, updateUserRole } from "../services/adminApi";
import { useToast } from "../hooks/useToast";
import "./styles/AdminUsersPage.css";

const AdminUsersPage = () => {
  const showToast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0, limit: 20 });
  const [editingUserId, setEditingUserId] = useState(null);
  const [updatingRole, setUpdatingRole] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [page]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getUsers(page, 20);
      setUsers(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar usuarios");
      showToast("Error al cargar usuarios", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (updatingRole) return;

    try {
      setUpdatingRole(true);
      await updateUserRole(userId, newRole);
      showToast(`Rol actualizado a "${newRole}"`, "success");
      setEditingUserId(null);
      await loadUsers();
    } catch (err) {
      showToast(err.response?.data?.message || "Error al actualizar rol", "error");
    } finally {
      setUpdatingRole(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("es-AR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getRoleBadge = (role) => {
    if (role === "admin") {
      return <span className="role-badge admin">👑 Admin</span>;
    }
    return <span className="role-badge user">👤 Usuario</span>;
  };

  return (
    <div className="admin-users-page">
      <div className="admin-header">
        <h1>Gestión de Usuarios</h1>
        <p className="user-count">Total: {pagination.total} usuarios</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Cargando usuarios...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="empty-state">
          <p>No hay usuarios registrados</p>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Vinos</th>
                  <th>Registrado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id}>
                    <td className="email-cell">
                      <code>{user.email}</code>
                    </td>
                    <td className="name-cell">
                      {user.firstName || "-"} {user.lastName || ""}
                    </td>
                    <td className="role-cell">
                      {editingUserId === user._id ? (
                        <select
                          value={
                            users.find((u) => u._id === user._id)?.role || user.role
                          }
                          onChange={(e) => handleRoleChange(user._id, e.target.value)}
                          disabled={updatingRole}
                          className="role-select"
                        >
                          <option value="user">Usuario</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        getRoleBadge(user.role)
                      )}
                    </td>
                    <td className="stats-cell">
                      {user.stats?.winesCount || 0}
                    </td>
                    <td className="date-cell">{formatDate(user.createdAt)}</td>
                    <td className="actions-cell">
                      {editingUserId === user._id ? (
                        <button
                          className="btn-cancel"
                          onClick={() => setEditingUserId(null)}
                          disabled={updatingRole}
                        >
                          Cancelar
                        </button>
                      ) : (
                        <button
                          className="btn-edit"
                          onClick={() => setEditingUserId(user._id)}
                        >
                          Editar rol
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="pagination">
              <button
                disabled={page === 1 || loading}
                onClick={() => setPage(page - 1)}
                className="pagination-btn"
              >
                ← Anterior
              </button>

              <div className="page-info">
                Página {page} de {pagination.pages}
              </div>

              <button
                disabled={page === pagination.pages || loading}
                onClick={() => setPage(page + 1)}
                className="pagination-btn"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminUsersPage;
