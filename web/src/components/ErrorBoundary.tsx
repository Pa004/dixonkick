import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Último muro: si un componente rompe el render, se muestra una pantalla de
// error recuperable en vez de un blank screen sin explicación.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary capturó un error de render:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutro-950 px-4 text-center">
          <p role="alert" className="max-w-md text-sm text-neutro-300">
            Algo salió mal al mostrar la interfaz. Recarga la página para reintentar.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-base border border-neutro-700 px-4 py-2 text-xs font-semibold text-neutro-300 transition-colors hover:border-acento-500/60 hover:text-acento-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-400"
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}