import React from "react"
import { createRoot } from "react-dom/client"
import "../i18n"
import "../styles/globals.css"
import { DeckWindow } from "../components/DeckWindow"

function App() {
  return <DeckWindow />
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
