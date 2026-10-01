import "./LoadingSkeleton.css";

const LoadingSkeleton = ({ type = "card", count = 3 }) => {
  const items = Array.from({ length: count });

  if (type === "card") {
    return (
      <div className="skeleton-grid">
        {items.map((_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton--image"></div>
            <div className="skeleton-card__content">
              <div className="skeleton skeleton--badge"></div>
              <div className="skeleton skeleton--text" style={{ width: "70%" }}></div>
              <div className="skeleton skeleton--text skeleton--small"></div>
              <div className="skeleton skeleton--text skeleton--small"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "detail") {
    return (
      <div className="skeleton-detail">
        <div className="skeleton skeleton--large-image"></div>
        <div className="skeleton-detail__content">
          <div className="skeleton skeleton--text skeleton--large"></div>
          <div className="skeleton skeleton--text"></div>
          <div className="skeleton skeleton--text"></div>
          <div className="skeleton skeleton--button"></div>
        </div>
      </div>
    );
  }

  if (type === "list") {
    return (
      <div className="skeleton-list">
        {items.map((_, i) => (
          <div key={i} className="skeleton-row">
            {/* La banda del tipo. Va acá porque la fila real la tiene: sin ella
                el contenido entraría corrido 3 px al terminar de cargar. */}
            <div className="skeleton skeleton--rail"></div>
            <div className="skeleton-row__cuerpo">
              <div className="skeleton skeleton--thumb"></div>
              <div className="skeleton-row__lines">
                <div className="skeleton skeleton--text" style={{ width: "62%" }}></div>
                <div className="skeleton skeleton--text skeleton--small" style={{ width: "42%" }}></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "inline") {
    return (
      <div className="skeleton-inline">
        {items.map((_, i) => (
          <div
            key={i}
            className="skeleton skeleton--text"
            style={{ height: "1rem", width: i === count - 1 ? "60%" : "100%" }}
          ></div>
        ))}
      </div>
    );
  }

  return null;
};

export default LoadingSkeleton;
