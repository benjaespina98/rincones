import CardLugar from "./CardLugar";

const ListaLugares = ({ lugares }) => {
  if (!lugares.length) {
    return <p>No hay lugares cargados todavia.</p>;
  }

  return (
    <section className="grid-lugares">
      {lugares.map((lugar) => (
        <CardLugar key={lugar._id} lugar={lugar} />
      ))}
    </section>
  );
};

export default ListaLugares;
