import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Zaehlung } from '../kern/zaehlung.js';
import { dashboardGriff } from './dashboard.js';
import { discordClient, gilde, mockDiscord, schliesse } from '../testhilfe.js';

// Der Griff der API, ohne Datenbank. Alle IDs sind erfunden.
// Siehe docs/bot/dashboard-api.md, „Dateien“.
const MIT_ICON = '300000000000000051';
const OHNE_ICON = '300000000000000052';
const NICHT_DA = '300000000000000053';
const UNBEKANNT = '300000000000000054';

test('server: nur Server mit Bot, die Discord gerade liefert, in der Reihenfolge der IDs; das Icon mit 128 px', async (t) => {
  const mock = await mockDiscord();
  const client = discordClient(mock, [
    { ...gilde(MIT_ICON, 'Mit Icon', '200000000000000099'), icon: 'a1b2c3' },
    gilde(OHNE_ICON, 'Ohne Icon', '200000000000000099'),
    { id: NICHT_DA, unavailable: true },
  ]);
  t.after(async () => {
    await schliesse(mock);
    await client.destroy();
  });
  const griff = dashboardGriff(client, { zaehlung: new Zaehlung() });
  assert.deepEqual(griff.server([OHNE_ICON, NICHT_DA, UNBEKANNT, MIT_ICON]), [
    { id: OHNE_ICON, name: 'Ohne Icon', icon: null },
    { id: MIT_ICON, name: 'Mit Icon', icon: `${mock.url}/cdn/icons/${MIT_ICON}/a1b2c3.webp?size=128` },
  ]);
});
