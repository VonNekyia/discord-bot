// Das Dashboard: Anmeldung, Serverliste und die Formulare für Beitritt und
// Abschied. Setzt Skript voraus; ohne zeigt die Seite ein noscript.
// Siehe docs/frontend/dashboard.md, „Zustände“.
import { api, ApiFehler, type Ich, type Server } from './api.js';
import { Begruessung } from './begruessung.js';
import { meldung, satz, type Satz } from './texte.js';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const abschnitte = { laden: element('laden'), server: element('server'), begruessung: element('begruessung') };
const kopfAktion = element('kopf-aktion');
const kopfMeldung = element('kopf-meldung');
const anmelden = element('anmelden');
const serverMeldung = element('server-meldung');

let serverListe: Server[] = [];
let gezeigt: string | null = null;

function zeigen(abschnitt: keyof typeof abschnitte | null): void {
  for (const [name, el] of Object.entries(abschnitte)) el.hidden = name !== abschnitt;
}

// Kopf ohne Anmeldung: der Knopf zum Anmelden, darunter eine Meldung, wenn es eine gibt.
function abgemeldet(inhalt: Satz | null, art: 'warn' | 'error' = 'error'): void {
  zeigen(null);
  element('person').hidden = true;
  element('abmelden').hidden = true;
  kopfAktion.hidden = false;
  anmelden.hidden = false;
  if (inhalt) meldung(kopfMeldung, art, inhalt);
  else kopfMeldung.replaceChildren();
}

// Ohne Bot geht auch die Anmeldung nicht; darum nur die Meldung.
function nichtErreichbar(fehler: unknown): void {
  zeigen(null);
  kopfAktion.hidden = false;
  anmelden.hidden = true;
  meldung(kopfMeldung, 'error', satz(fehler));
}

function fehlerBehandeln(fehler: unknown): void {
  if (fehler instanceof ApiFehler && fehler.status === 401) abgemeldet(satz('abgelaufen'), 'warn');
  else nichtErreichbar(fehler);
}

function angemeldet(ich: Ich): void {
  kopfAktion.hidden = true;
  element('person-name').textContent = ich.name;
  const avatar = element<HTMLImageElement>('avatar');
  if (ich.avatar) avatar.src = ich.avatar;
  avatar.hidden = !ich.avatar;
  element('avatar-ersatz').hidden = !!ich.avatar;
  element('person').hidden = false;
  element('abmelden').hidden = false;
}

function karte(server: Server): HTMLAnchorElement {
  const karte = document.createElement('a');
  karte.className = 'card';
  karte.href = `#server-${server.id}`;
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
  karte.append(icon, kicker, name, text);
  return karte;
}

// Zeigt die Liste oder den Server aus dem Hash (#server-<id>).
async function route(): Promise<void> {
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
    const [kanaele, einstellungen] = await Promise.all([api.kanaele(server.id), api.begruessung(server.id)]);
    if (gezeigt !== server.id) return;
    element('server-name').textContent = server.name;
    for (const art of ['beitritt', 'abschied'] as const) {
      new Begruessung(element(`panel-${art}`), server.id, art, kanaele, einstellungen[art], () => abgemeldet(satz('abgelaufen'), 'warn'));
    }
    zeigen('begruessung');
  } catch (fehler) {
    if (gezeigt !== server.id) return;
    if (fehler instanceof ApiFehler && (fehler.status === 403 || fehler.status === 404)) {
      // Zurück zur Liste, die Meldung steht über ihr.
      meldung(serverMeldung, 'error', satz(fehler));
      serverMeldung.hidden = false;
      history.replaceState(null, '', location.pathname);
      gezeigt = null;
      zeigen('server');
    } else {
      fehlerBehandeln(fehler);
    }
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
  window.addEventListener('hashchange', () => void route());
  await route();
}

void start();
