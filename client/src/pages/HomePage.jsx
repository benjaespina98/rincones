import ListaLugares from "../components/ListaLugares";
import { useLugares } from "../hooks/useLugares";

const HomePage = () => {
  const { lugares, loading, error } = useLugares();

  return (
    <section>
      <h1>Descubri rincones unicos en Argentina</h1>
      <p className="lead">
        Explora rios, montanas, bares, cafeterias, restaurantes, miradores y lugares turisticos recomendados por la comunidad.
      </p>

      {loading && <p>Cargando lugares...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && <ListaLugares lugares={lugares.slice(0, 6)} />}
    </section>
  );
};

export default HomePage;
