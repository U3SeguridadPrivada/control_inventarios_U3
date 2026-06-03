import { Route, Switch, Redirect } from "wouter";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Inventario from "./pages/Inventario";
import Entradas from "./pages/Entradas";
import Salidas from "./pages/Salidas";
import UniformesCampo from "./pages/UniformesCampo";
import Guardias from "./pages/Guardias";
import Bajas from "./pages/Bajas";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Usuarios from "./pages/Usuarios";

function ProtectedApp() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route><Redirect to="/login" /></Route>
      </Switch>
    );
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/inventario" component={Inventario} />
        <Route path="/entradas" component={Entradas} />
        <Route path="/salidas" component={Salidas} />
        <Route path="/uniformes-campo" component={UniformesCampo} />
        <Route path="/guardias" component={Guardias} />
        <Route path="/bajas" component={Bajas} />
        <Route path="/usuarios" component={Usuarios} />
        <Route path="/usuarios/nuevo" component={Register} />
        <Route path="/login"><Redirect to="/" /></Route>
        <Route><h1 className="text-xl font-semibold p-8">404 — Página no encontrada</h1></Route>
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <ProtectedApp />
    </AuthProvider>
  );
}

export default App;
