// Boot: the only module the first load imports. It adopts the stylesheet and
// starts the router; everything else arrives by static import from here,
// listed by the dossier as loaded later by import(), never in the first load.
import sheet from "./style.css" with { type: "css" };
import { start } from "./app.js";

const root = document.createElement("div");
root.id = "app";
document.body.appendChild(root);
document.adoptedStyleSheets = [sheet];
start(root);
