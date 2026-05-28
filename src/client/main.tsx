import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { OnboardingProviderContext } from "./auth/OnboardingContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <OnboardingProviderContext>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </OnboardingProviderContext>
    </AuthProvider>
  </React.StrictMode>,
);
