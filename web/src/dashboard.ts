// Das Dashboard: Anmeldung, Serverliste und je Server die Tabs mit den
// Seiten, die der Bot anmeldet. Setzt Skript voraus; ohne zeigt die Seite
// ein noscript. Siehe docs/frontend/dashboard.md, „Zustände“.
import { api, ApiFehler, type Ich, type Satz, type Seite, type Server } from './api/klient.js';
import { debugAnsicht } from './debug.js';
import { meldung, satz } from './kern/texte.js';
import { baueSeite, type GebauteSeite, type Rahmen } from './seite.js';

// Ein Element aus dashboard/index.html, geprüft mit instanceof; fehlt es
// oder hat es die falsche Art, ist die Seite kaputt, und das sagt die Meldung.
function element(id: string): HTMLElement;
function element<T extends HTMLElement>(id: string, art: abstract new () => T): T;
function element(id: string, art: abstract new () => HTMLElement = HTMLElement): HTMLElement {
  const gefunden = document.getElementById(id);
  if (!gefunden) throw new Error(`#${id} fehlt in dashboard/index.html`);
  if (!(gefunden instanceof art)) throw new Error(`#${id} ist kein ${art.name}`);
  return gefunden;
}

const abschnitte = { laden: element('laden'), server: element('server'), einstellungen: element('einstellungen'), debug: element('debug') };
const kopfMeldung = element('kopf-meldung');
const anmelden = element('anmelden');
const serverMeldung = element('server-meldung');
const einstellungenMeldung = element('einstellungen-meldung');

let serverListe: Server[] = [];
let gezeigt: string | null = null;
let aktiv = false;
// Ob die Person die Debug-Seite sehen darf. Siehe docs/schnittstelle/debug.md, „Wer sie sehen darf“.
let darfDebug = false;

function zeigen(abschnitt: keyof typeof abschnitte | null): void {
  for (const [name, el] of Object.entries(abschnitte)) el.hidden = name !== abschnitt;
}

// Im Hero: der Knopf zum Anmelden und darunter eine Meldung, beides nach Bedarf.
function kopf(anmeldenZeigen: boolean, inhalt: Satz | null = null, art: 'warn' | 'error' = 'error'): void {
  anmelden.hidden = !anmeldenZeigen;
  kopfMeldung.hidden = inhalt === null;
  if (inhalt) meldung(kopfMeldung, art, inhalt);
  else kopfMeldung.replaceChildren();
}

function abgemeldet(inhalt: Satz | null, art: 'warn' | 'error' = 'error'): void {
  aktiv = false;
  darfDebug = false;
  debug.verlasse();
  element('debug-einstieg').hidden = true;
  serverListe = [];
  gezeigt = null;
  history.replaceState(null, '', location.pathname);
  zeigen(null);
  element('person').hidden = true;
  element('abmelden').hidden = true;
  kopf(true, inhalt, art);
}

// Eine Anfrage aus einer Seite gibt 401.
const abgelaufen = () => abgemeldet(satz('abgelaufen'), 'warn');
const debug = debugAnsicht(abgelaufen);

// Ohne Bot geht auch die Anmeldung nicht; darum nur die Meldung.
function nichtErreichbar(fehler: unknown): void {
  zeigen(null);
  kopf(false, satz(fehler));
}

function fehlerBehandeln(fehler: unknown): void {
  if (fehler instanceof ApiFehler && fehler.status === 401) abgemeldet(satz('abgelaufen'), 'warn');
  else nichtErreichbar(fehler);
}

function angemeldet(ich: Ich): void {
  aktiv = true;
  kopf(false);
  element('person-name').textContent = ich.name;
  const avatar = element('avatar', HTMLImageElement);
  if (ich.avatar) avatar.src = ich.avatar;
  avatar.hidden = !ich.avatar;
  element('avatar-ersatz').hidden = !!ich.avatar;
  element('person').hidden = false;
  element('abmelden').hidden = false;
  darfDebug = ich.debug;
  element('debug-einstieg').hidden = !darfDebug;
}

// Abmelden gibt 204; die Seite zeigt danach selbst die Anmeldung.
// Siehe docs/schnittstelle/api.md, „Routen“.
async function abmelden(): Promise<void> {
  try {
    await api.abmelden();
    abgemeldet(null);
  } catch (fehler) {
    if (fehler instanceof ApiFehler && fehler.status === 401) return abgemeldet(null);
    kopf(false, satz(fehler));
  }
}

function karte(server: Server): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'card';
  link.href = `#server-${server.id}`;
  let icon: HTMLElement;
  if (server.icon) {
    const bild = new Image(56, 56);
    bild.src = server.icon;
    bild.alt = '';
    icon = bild;
  } else {
    icon = document.createElement('i');
  }
  icon.className = 'card-icon';
  const kicker = document.createElement('p');
  kicker.className = 'kicker';
  kicker.textContent = 'Server';
  const name = document.createElement('h4');
  name.className = 'name';
  name.textContent = server.name;
  const text = document.createElement('p');
  text.textContent = 'Einstellen, was kitty dort tut.';
  link.append(icon, kicker, name, text);
  return link;
}

type Nachricht = Parameters<Rahmen['alleNeu']>[1];

// Die Tabs aus dem Guide, je Seite einer, in der Reihenfolge des Bots; das
// Dashboard hat Regeln für höchstens 6. Gewählt ist `gewaehlt`, sonst der
// erste; die Nachricht steht in dieser Seite, gibt es sie nicht, über den
// Tabs. Mit Nachricht, also nach einem Neubau, bekommt „Speichern“ der
// gewählten Seite den Fokus, sonst das Radio des ersten Tabs.
// Siehe docs/frontend/dashboard.md, „Tabs“.
function tabs(seiten: Seite[], server: string, gewaehlt?: string, nachricht?: Nachricht): void {
  const gezeigte = seiten.slice(0, 6);
  const wahl = Math.max(0, gezeigte.findIndex((s) => s.id === gewaehlt));
  const inSeite = gezeigte.some((s) => s.id === gewaehlt) && nachricht?.art === 'ok';
  einstellungenMeldung.hidden = !nachricht || inSeite;
  if (nachricht && !inSeite) meldung(einstellungenMeldung, nachricht.art, nachricht.satz);
  else einstellungenMeldung.replaceChildren();
  const rahmen: Rahmen = { abgemeldet: abgelaufen, alleNeu: (seite, n) => void alleNeu(server, seite, n) };
  const radios = gezeigte.map((_, i) => {
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'tabs';
    radio.id = `tab-${i + 1}`;
    radio.checked = i === wahl;
    return radio;
  });
  const liste = document.createElement('div');
  liste.className = 'tab-list';
  let gewaehlteSeite: GebauteSeite | undefined;
  const panels = gezeigte.map((seite, i) => {
    const label = document.createElement('label');
    label.htmlFor = `tab-${i + 1}`;
    label.textContent = seite.titel;
    liste.append(label);
    const panel = document.createElement('div');
    panel.className = `tab-panel tab-p${i + 1}`;
    const gebaut = baueSeite(seite, server, rahmen);
    if (seite.id === gewaehlt) gewaehlteSeite = gebaut;
    panel.append(gebaut.element);
    return panel;
  });
  element('tabs').replaceChildren(...radios, liste, ...panels);
  element('tabs').hidden = gezeigte.length === 0;
  element('keine-seite').hidden = gezeigte.length > 0;
  // Erst jetzt, im DOM und sichtbar: Ansage und Fokus.
  if (nachricht && inSeite && gewaehlteSeite) gewaehlteSeite.nachDemNeubau(nachricht.satz);
  else if (nachricht) radios[0]?.focus();
}

// Ein Fehler beim Holen der Seiten betrifft nur diesen Server: zurück zur
// Liste, die Meldung steht über ihr; bei 401 die Anmeldung.
// Siehe docs/frontend/dashboard.md, „Zustände“.
function serverFehler(fehler: unknown): void {
  if (fehler instanceof ApiFehler && fehler.status === 401) return abgemeldet(satz('abgelaufen'), 'warn');
  meldung(serverMeldung, 'error', satz(fehler));
  serverMeldung.hidden = false;
  history.replaceState(null, '', location.pathname);
  gezeigt = null;
  zeigen('server');
}

// Holt die Seiten neu und baut die Tabs neu. Siehe docs/schnittstelle/baukasten.md, „Typen“.
async function alleNeu(server: string, seite: string, nachricht: Nachricht): Promise<void> {
  try {
    const seiten = await api.seiten(server);
    if (gezeigt !== server) return;
    tabs(seiten, server, seite, nachricht);
  } catch (fehler) {
    if (gezeigt === server) serverFehler(fehler);
  }
}

// Zeigt die Liste, den Server aus dem Hash (#server-<id>) oder, mit
// `Ich.debug`, die Debug-Ansicht (#debug). Siehe docs/frontend/dashboard.md, „Debug“.
async function route(): Promise<void> {
  if (!aktiv) return;
  if (location.hash === '#debug' && darfDebug) {
    gezeigt = null;
    zeigen('debug');
    debug.zeige();
    return;
  }
  debug.verlasse();
  const id = location.hash.startsWith('#server-') ? location.hash.slice('#server-'.length) : null;
  const server = serverListe.find((s) => s.id === id);
  if (!server) {
    gezeigt = null;
    zeigen('server');
    return;
  }
  if (gezeigt === server.id) return;
  gezeigt = server.id;
  serverMeldung.hidden = true;
  zeigen('laden');
  try {
    const seiten = await api.seiten(server.id);
    if (gezeigt !== server.id) return;
    element('server-name').textContent = server.name;
    tabs(seiten, server.id);
    zeigen('einstellungen');
  } catch (fehler) {
    if (gezeigt === server.id) serverFehler(fehler);
  }
}

async function start(): Promise<void> {
  const anmeldeFehler = new URLSearchParams(location.search).get('fehler');
  if (anmeldeFehler) history.replaceState(null, '', location.pathname + location.hash);
  let ich: Ich;
  try {
    ich = await api.ich();
  } catch (fehler) {
    if (fehler instanceof ApiFehler && fehler.status === 401) abgemeldet(anmeldeFehler === 'anmeldung' ? satz('anmeldung') : null);
    else nichtErreichbar(fehler);
    return;
  }
  angemeldet(ich);
  zeigen('laden');
  try {
    serverListe = await api.server();
  } catch (fehler) {
    fehlerBehandeln(fehler);
    return;
  }
  element('server-liste').replaceChildren(...serverListe.map(karte));
  element('server-leer').hidden = serverListe.length > 0;
  globalThis.addEventListener('hashchange', () => void route());
  await route();
}

element('abmelden').addEventListener('submit', (ereignis) => {
  ereignis.preventDefault();
  void abmelden();
});
await start();
