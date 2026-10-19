import React from "react";
import { createRoot } from "react-dom/client";
import App from "./component/App.jsx";
import "./styles.css";
import User from "./component/user.jsx"
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
   
    <App />

  </React.StrictMode>,
);
