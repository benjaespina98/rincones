import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
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
              ⚠️ Algo salió mal
            </h1>
            <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
              Algo salió mal. Probá recargar la página.
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
                Reintentar
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
