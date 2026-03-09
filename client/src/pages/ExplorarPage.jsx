import ListaLugares from "../components/ListaLugares";
import MapaLugares from "../components/MapaLugares";
import { useLugares } from "../hooks/useLugares";

const ExplorarPage = () => {
  const { lugares, loading, error } = useLugares();

  return (
    <section>
      <h1>Explorar lugares</h1>
      <p className="lead">Filtra visualmente los puntos cargados y mira su ubicacion en el mapa.</p>

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
