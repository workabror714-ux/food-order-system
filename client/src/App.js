  import { BrowserRouter, Routes, Route } from "react-router-dom";
  import Admin from "./Admin";
  import Menu from "./Menu";
  import Login from "./Login";
  import ProtectedRoute from "./ProtectedRoute";

  function App() {
    return (
      <BrowserRouter>
        <Routes>
          {/* CUSTOMER UI */}
          <Route path="/" element={<Menu />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/table/:tableNumber" element={<Menu />} />

          {/* ADMIN */}
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    );
  }

  export default App;