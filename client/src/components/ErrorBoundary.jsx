import React from "react";
import { captureError } from "../services/errorMonitoring";
import { esErrorDeBuildViejo, recuperarDeBuildViejo } from "../utils/staleBuild";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      // El error es un chunk que no bajó, no un bug: la app quedó vieja y lo que
      // corresponde no es "reintentar" sino traer la versión nueva.
      esVersionVieja: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, esVersionVieja: esErrorDeBuildViejo(error) };
  }

  componentDidCatch(error, errorInfo) {
    /**
     * Última red del shell viejo.
     *
     * `observarBuildViejo` (main.jsx) ataja la mayoría antes de que React se
     * entere, pero un `lazy()` que rechaza durante el render llega hasta acá. Si
     * la recarga se dispara, esta pantalla no se ve: la página se está yendo.
     * Si devuelve `false` es porque ya se recargó una vez y no alcanzó, y ahí sí
     * hay que mostrar algo — con el texto correcto, que no es "algo salió mal".
     */
    if (esErrorDeBuildViejo(error) && recuperarDeBuildViejo()) return;

    console.error("Error caught by boundary:", error, errorInfo);
    captureError(error, { componentStack: errorInfo?.componentStack });
    this.setState({
      error,
      errorInfo,
    });
  }

  /**
   * Limpiar el estado sólo sirve cuando el error fue de render: se vuelve a
   * intentar el mismo árbol y puede andar.
   *
   * Con un chunk que no bajó no sirve para nada —el módulo quedó rechazado en el
   * caché del navegador y el segundo intento falla igual, que es por qué este
   * botón dejaba a la gente golpeándolo—. Ahí lo único que puede funcionar es
   * pedir el documento de nuevo.
   */
  handleReset = () => {
    if (this.state.esVersionVieja) {
      window.location.reload();
      return;
    }
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-md)",
            background: "var(--bg)",
          }}
        >
          <div
            style={{
              maxWidth: "500px",
              textAlign: "center",
              padding: "var(--space-lg)",
              borderRadius: "var(--radius-xl)",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <h1 style={{ marginBottom: "var(--space-md)" }}>
              {this.state.esVersionVieja ? "Hay una versión nueva" : "Algo salió mal"}
            </h1>
            <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
              {this.state.esVersionVieja
                ? "Actualizá para seguir. Tus vinos y tu sesión quedan como están."
                : "No pudimos mostrar esta pantalla. Probá de nuevo."}
            </p>
            {import.meta.env.DEV && this.state.error && (
              <details
                style={{
                  textAlign: "left",
                  marginBottom: "var(--space-lg)",
                  padding: "var(--space-md)",
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.85rem",
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                  Detalles del error (desarrollo)
                </summary>
                <pre
                  style={{
                    marginTop: "var(--space-sm)",
                    whiteSpace: "pre-wrap",
                    wordWrap: "break-word",
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                  }}
                >
                  {this.state.error.toString()}
                  {"\n\n"}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <div style={{ display: "flex", gap: "var(--space-md)", justifyContent: "center" }}>
              <button
                onClick={this.handleReset}
                className="button button--primary"
                style={{ flex: 1 }}
              >
                {this.state.esVersionVieja ? "Actualizar" : "Reintentar"}
              </button>
              <button
                onClick={() => (window.location.href = "/")}
                className="button button--ghost"
                style={{ flex: 1 }}
              >
                Ir al inicio
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
