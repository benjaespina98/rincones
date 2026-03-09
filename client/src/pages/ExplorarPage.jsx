import ListaLugares from "../components/ListaLugares";
import MapaLugares from "../components/MapaLugares";
import { useLugares } from "../hooks/useLugares";

const ExplorarPage = () => {
  const { lugares, loading, error } = useLugares();

  return (
    <section>
      <header className="page-header page-header--compact">
        <span className="page-kicker">Mapa interactivo</span>
        <h1>Explorar lugares</h1>
        <p className="lead">Filtra visualmente los puntos cargados y mira su ubicación en el mapa.</p>
        <div className="info-chip">{lugares.length} resultados</div>
      </header>

      {loading && <p>Cargando lugares...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && (
        <>
          <MapaLugares lugares={lugares} />
          <ListaLugares lugares={lugares} />
        </>
      )}
    </section>
  );
};

export default ExplorarPage;
