// Trifold boot: load the stylesheet as a CSS module and the app as a module.
// Both arrive by dynamic import(), so the first load stays one tiny file:
// index.html alone. Nothing here fetches from any other origin.
const sheet = await import('./style.css', { with: { type: 'css' } });
document.adoptedStyleSheets = [sheet.default];
const { start } = await import('./app.js');
start();
