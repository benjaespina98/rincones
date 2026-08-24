/**
 * El paginador del panel.
 *
 * Usuarios y Actividad tenían cada una su propio bloque de Anterior/Siguiente,
 * con el mismo markup escrito dos veces y las mismas dos limitaciones:
 *
 *   · para llegar a la página 20 había que tocar 19 veces, y no había forma de
 *     volver a la primera sin desandar el camino;
 *   · no se veía cuántas páginas había hasta leer la línea del medio.
 *
 * Con los números, la posición se ve y el salto es de un toque. Qué números
 * entran lo decide `paginas()` (utils/pagination.js).
 */

import { paginas } from "../utils/pagination";

export default function AdminPager({ page, pages, total, onChange, label = "resultados" }) {
  if (!pages || pages <= 1) return null;

  const ir = (p) => {
    const destino = Math.min(Math.max(1, p), pages);
    if (destino !== page) onChange(destino);
  };

  return (
    <nav className="admin-pager" aria-label="Paginación">
      <span className="admin-pager__total">
        {total} {label}
      </span>
      <div className="admin-pager__pages">
        <button
          type="button"
          className="admin-pager__page"
          onClick={() => ir(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          ‹
        </button>
        {paginas(page, pages).map((p, i) =>
          p === null ? (
            // La key usa el índice a propósito: un hueco no tiene identidad
            // propia y sólo existe por su posición entre dos números.
            <span key={`gap-${i}`} className="admin-pager__gap" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              className={`admin-pager__page ${p === page ? "is-current" : ""}`}
              onClick={() => ir(p)}
              aria-label={`Página ${p}`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          className="admin-pager__page"
          onClick={() => ir(page + 1)}
          disabled={page >= pages}
          aria-label="Página siguiente"
        >
          ›
        </button>
      </div>
    </nav>
  );
}
