// Das Dashboard: Anmeldung, Serverliste und die Formulare für Beitritt und
// Abschied. Setzt Skript voraus; ohne zeigt die Seite ein noscript.
// Siehe docs/frontend/dashboard.md, „Zustände“.
import { api, ApiFehler, type Ich, type Server } from './api.js';
import { Begruessung } from './begruessung.js';
import { SprachraeumeFormular } from './sprachraeume.js';
import { meldung, satz, type Satz } from './texte.js';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const abschnitte = { laden: element('laden'), server: element('server'), begruessung: element('begruessung') };
const kopfMeldung = element('kopf-meldung');
const anmelden = element('anmelden');
const serverMeldung = element('server-meldung');

let serverListe: Server[] = [];
let gezeigt: string | null = null;
let aktiv = false;

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
  serverListe = [];
  gezeigt = null;
  history.replaceState(null, '', location.pathname);
  zeigen(null);
  element('person').hidden = true;
  element('abmelden').hidden = true;
  kopf(true, inhalt, art);
}

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
  const avatar = element<HTMLImageElement>('avatar');
  if (ich.avatar) avatar.src = ich.avatar;
  avatar.hidden = !ich.avatar;
  element('avatar-ersatz').hidden = !!ich.avatar;
  element('person').hidden = false;
  element('abmelden').hidden = false;
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
  text.textContent = 'Beitritt und Abschied einstellen.';
  link.append(icon, kicker, name, text);
  return link;
}

// Zeigt die Liste oder den Server aus dem Hash (#server-<id>).
async function route(): Promise<void> {
  if (!aktiv) return;
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
    const [kanaele, einstellungen, sprachDaten, sprachraeume] = await Promise.all([
      api.kanaele(server.id),
      api.begruessung(server.id),
      api.sprachkanaele(server.id),
      api.sprachraeume(server.id),
    ]);
    if (gezeigt !== server.id) return;
    element('server-name').textContent = server.name;
    const abgelaufen = () => abgemeldet(satz('abgelaufen'), 'warn');
    for (const art of ['beitritt', 'abschied'] as const) {
      new Begruessung(element(`panel-${art}`), server.id, art, kanaele, einstellungen[art], abgelaufen);
    }
    new SprachraeumeFormular(element('panel-sprachraeume'), server.id, sprachDaten, sprachraeume, abgelaufen);
    zeigen('begruessung');
  } catch (fehler) {
    if (gezeigt !== server.id) return;
    if (fehler instanceof ApiFehler && fehler.status === 401) return abgemeldet(satz('abgelaufen'), 'warn');
    // Jeder andere Fehler betrifft nur diesen Server: zurück zur Liste, die
    // Meldung steht über ihr. Siehe docs/frontend/dashboard.md, „Zustände“.
    meldung(serverMeldung, 'error', satz(fehler));
    serverMeldung.hidden = false;
    history.replaceState(null, '', location.pathname);
    gezeigt = null;
    zeigen('server');
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
