import ListaLugares from "../components/ListaLugares";
import { useLugares } from "../hooks/useLugares";

const HomePage = () => {
  const { lugares, loading, error } = useLugares();

  return (
    <section>
      <header className="page-header">
        <span className="page-kicker">Plataforma de recomendaciones</span>
        <h1>Descubrí rincones únicos en Argentina</h1>
        <p className="lead">
          Explora ríos, montañas, bares, cafeterías, restaurantes, miradores y lugares turísticos recomendados.
        </p>
        <div className="info-chip">{lugares.length} lugares publicados</div>
      </header>

      {loading && <p>Cargando lugares...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && <ListaLugares lugares={lugares.slice(0, 6)} />}
    </section>
  );
};

export default HomePage;
