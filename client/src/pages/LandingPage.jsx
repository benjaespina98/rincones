import { Link } from "react-router-dom";
import "./LandingPage.css";

const LandingPage = () => {
  return (
    <div className="landing">
      <section className="landing__hero">
        <div className="landing__hero-content">
          <h1>🍷 Rincones</h1>
          <p className="landing__tagline">
            Descubre, colecciona y comparte vinos de Argentina
          </p>
          <p className="landing__description">
            Escanea etiquetas de vino, organiza tu bodega personal y descubre nuevas experiencias vinícolas en todo el país.
          </p>
        </div>
      </section>

      <section className="landing__features">
        <div className="landing__feature-card">
          <div className="landing__feature-icon">📸</div>
          <h3>Mi Bodega</h3>
          <p>
            Escanea etiquetas de vino con tu cámara. Nuestra IA extrae automáticamente la información del vino y tú la refinás.
          </p>
          <Link to="/bodega" className="button button--ghost">
            Ir a Mi Bodega →
          </Link>
        </div>

        <div className="landing__feature-card">
          <div className="landing__feature-icon">🗺️</div>
          <h3>Descubrir Lugares</h3>
          <p>
            Explora bodegas, wine bars, vinotecas y degustaciones en Argentina. Encuentra nuevas experiencias cerca de ti.
          </p>
          <Link to="/mapa" className="button button--ghost">
            Ver Mapa →
          </Link>
        </div>

        <div className="landing__feature-card">
          <div className="landing__feature-icon">👥</div>
          <h3>Comunidad</h3>
          <p>
            Explora lugares que otros descubrieron. Filtra por categoría, región y distancia para encontrar lo que buscas.
          </p>
          <Link to="/comunidad" className="button button--ghost">
            Explorar →
          </Link>
        </div>
      </section>

      <section className="landing__how-it-works">
        <h2>¿Cómo funciona?</h2>

        <div className="landing__steps">
          <div className="landing__step">
            <div className="landing__step-number">1</div>
            <h4>Escanea</h4>
            <p>Toma una foto clara de la etiqueta del vino</p>
          </div>

          <div className="landing__step">
            <div className="landing__step-number">2</div>
            <h4>IA analiza</h4>
            <p>Nuestro sistema extrae información automáticamente</p>
          </div>

          <div className="landing__step">
            <div className="landing__step-number">3</div>
            <h4>Completa</h4>
            <p>Agrega tus notas y calificaciones</p>
          </div>

          <div className="landing__step">
            <div className="landing__step-number">4</div>
            <h4>Guarda</h4>
            <p>Tu bodega se organiza automáticamente</p>
          </div>
        </div>
      </section>

      <section className="landing__cta">
        <h2>Comienza ahora</h2>
        <p>Escanea tu primer vino y empieza a construir tu colección</p>
        <Link to="/bodega" className="button button--primary" style={{ fontSize: "1.1rem" }}>
          📸 Escanear mi primer vino
        </Link>
      </section>
    </div>
  );
};

export default LandingPage;
