const KNOWN_PLAYERS = [
  { name: 'Amos',    uuid: '03A51045-50EC-4B7F-9C16-E4D11C81138B' },
  { name: 'Barča',   uuid: '23975BAC-C0D7-43D1-895B-18AF88A5E209' },
  { name: 'Carlos',  uuid: '1583F0FD-4E59-4B0B-8C4A-4C77F6255131' },
  { name: 'Daniela', uuid: '176545AE-2C9D-4B6B-919C-43F32022BEA7' },
  { name: 'Hejki',   uuid: '88649452-76BB-4912-8271-25C1CF6C8B21' },
  { name: 'Honza',   uuid: '3599F903-5175-4B6D-AA52-F1DCACA8486D' },
  { name: 'Jonáš',   uuid: '6B9AC275-CF65-4AE8-A578-F05B03DB526D' },
  { name: 'Lili',    uuid: '8E244412-D54E-4E75-B310-140AE15C4CB9' },
  { name: 'Matouš',  uuid: 'E86F0B01-38F4-4180-AB4C-F8ED3991756E' },
  { name: 'Meki',    uuid: '2C10A6D8-1CEE-4C41-B587-B0FB8331D900' },
  { name: 'Míra',    uuid: 'CEBCD0B8-0549-4709-9411-1A2668E9AEBC' },
  { name: 'Ondra',   uuid: 'A06493F6-C907-4883-A2A8-4FB2D7841F8F' },
  { name: 'Pavel',   uuid: 'F377CE5C-8264-4074-BE60-C8C3ED1B1406' },
  { name: 'Tondy',   uuid: '2982F95C-7092-4122-BB6D-B7E9AABD5D66' },
  { name: 'Verča',   uuid: '56DE1331-053E-4466-9875-5182E21C4EA5' },
];

const LOCATIONS = [
  { name: 'Akce', uuid: '08F5ED2C-5692-4905-9334-CCBC5AD20B67' },
  { name: 'Akce - Amos', uuid: '2F1A259F-3177-4848-B2D9-139441A0903C' },
  { name: 'TeepCo', uuid: '344E9AD3-697E-4129-A80B-2E4CE6F5D546' },
  { name: 'TeepCo Hory', uuid: 'CA8D0143-BB17-4530-916B-0EFE983034FE' },
];

const GAME_COPY = [
  { name: 'Nespecifikováno', playUsedGameCopy: 0 },
  { name: 'Hejki', playUsedGameCopy: 1 },
  { name: 'Amos', playUsedGameCopy: 2 },
]

const SCRIPTS = [
  {
    id: 'trouble-brewing',
    name: 'Potíže přicházejí',
    roles: [
      'empath', 'undertaker', 'librarian', 'chef', 'monk', 'virgin', 'washerwoman',
      'mayor', 'ravenkeeper', 'fortuneteller', 'soldier', 'investigator', 'slayer',
      'butler', 'drunk', 'recluse', 'saint',
      'poisoner', 'spy', 'scarletwoman', 'baron', 'imp',
      'bureaucrat', 'scapegoat', 'gunslinger', 'thief', 'beggar',
    ],
  },
  {
    id: 'sects-violets',
    name: 'Sekty a fialky',
    roles: [
      'philosopher', 'clockmaker', 'juggler', 'flowergirl', 'mathematician', 'towncrier',
      'sage', 'dreamer', 'seamstress', 'savant', 'artist', 'oracle', 'snakecharmer',
      'mutant', 'sweetheart', 'barber', 'klutz',
      'eviltwin', 'witch', 'cerenovus', 'pithag',
      'fanggu', 'vigormortis', 'nodashii', 'vortox',
      'deviant', 'barista', 'harlot', 'butcher', 'bonecollector',
    ],
  },
  {
    id: 'bad-moon-rising',
    name: 'Čas krvavého měsíce',
    roles: [
      'grandmother', 'tealady', 'gossip', 'exorcist', 'gambler', 'innkeeper', 'chambermaid',
      'courtier', 'sailor', 'pacifist', 'minstrel', 'professor', 'fool',
      'lunatic', 'moonchild', 'tinker', 'goon',
      'assassin', 'devilsadvocate', 'godfather', 'mastermind',
      'shabaloth', 'po', 'zombuul', 'pukka',
      'bishop', 'matron', 'judge', 'apprentice', 'voudon',
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    roles: [],
  },
];

const ROLE_LABELS = {
  townsfolk: 'Měšťané',
  outsider:  'Podivíni',
  minion:    'Přisluhovači',
  demon:     'Démon',
  traveller: 'Pocestní',
  fabled: 'Legendy',
  loric: 'Loric',
};

let currentScript = null;
let winnerTeam = null;
let players = [];
let playerIdCounter = 0;
let generatedData = null;
let computedDurationMin = null;
let importedBoard = '';
let customScript = null;
let customScriptJson = '';
const importedIdentities = new WeakMap();
const DRAFT_STORAGE_KEY = 'botc-play-draft-v1';
const DEFAULT_PLAYER_COUNT = 8;
let draftReady = false;
let applyingDraft = false;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('play-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('known-players').innerHTML = playerOptionsHTML();
  renderScripts();
  renderLocations();
  renderGameCopies();
  if (!restoreDraft()) {
    for (let i = 0; i < DEFAULT_PLAYER_COUNT; i++) addPlayer();
  }
  draftReady = true;
});

for (const event of ['input', 'change']) {
  document.addEventListener(event, event => {
    if (event.target.matches('input:not([type="file"]), select')) saveDraft();
  });
}

function clearPlayerRoles() {
  if (!confirm('Vymazat role, týmy a vítěze? Jména hráčů zůstanou zachovaná.')) return;
  applyingDraft = true;
  try {
    document.querySelectorAll('.player-row').forEach(row => {
      const role = row.querySelector('.player-role-cell select') || row.querySelector('.player-role-cell input');
      role.value = '';
      row.classList.remove('is-good', 'is-evil', 'bg-info', 'bg-danger');
      updatePlayerRoleStyle(row, '');
      row.querySelectorAll('.team-btn').forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
      });
    });
    generatedData = null;
    setWinner(null);
  } finally {
    applyingDraft = false;
  }
  saveDraft();
}

function clearPlayers() {
  if (!confirm('Vymazat hráče, vypravěče a role a obnovit výchozí počet hráčů?')) return;
  applyingDraft = true;
  try {
    [...players].forEach(player => removePlayer(player.id));
    playerIdCounter = 0;
    const storyteller = document.getElementById('storyteller-name');
    storyteller.value = '';
    importedIdentities.delete(storyteller);
    generatedData = null;
    setWinner(null);
    for (let i = 0; i < DEFAULT_PLAYER_COUNT; i++) addPlayer();
  } finally {
    applyingDraft = false;
  }
  saveDraft();
}

function clearRecorder() {
  if (!confirm('Vyčistit celou rozepsanou partii?')) return;
  applyingDraft = true;
  try {
    [...players].forEach(player => removePlayer(player.id));
    playerIdCounter = 0;
    currentScript = null;
    importedBoard = '';
    customScript = null;
    customScriptJson = '';
    updateCustomScriptButton();
    document.getElementById('custom-script-json').value = '';
    generatedData = null;
    computedDurationMin = null;
    document.querySelectorAll('.script-pill').forEach(button => {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    });
    const storyteller = document.getElementById('storyteller-name');
    storyteller.value = '';
    importedIdentities.delete(storyteller);
    document.getElementById('play-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('play-start').value = '';
    document.getElementById('play-end').value = '';
    document.getElementById('duration-display').textContent = '—';
    renderLocations();
    renderGameCopies();
    document.getElementById('import-play').value = '';
    for (const id of ['import-status', 'export-status', 'custom-script-status']) {
      document.getElementById(id).textContent = '';
      document.getElementById(id).hidden = true;
    }
    setWinner(null);
    for (let i = 0; i < DEFAULT_PLAYER_COUNT; i++) addPlayer();
  } finally {
    applyingDraft = false;
  }
  saveDraft();
}

function saveDraft() {
  if (!draftReady || applyingDraft) return;
  try {
    const location = document.getElementById('play-location');
    const storyteller = document.getElementById('storyteller-name');
    const state = {
      version: 1,
      date: document.getElementById('play-date').value,
      start: document.getElementById('play-start').value,
      end: document.getElementById('play-end').value,
      duration: computedDurationMin,
      script: currentScript,
      board: importedBoard,
      customScriptJson,
      location: location.value,
      locationUuid: [...location.options].find(option => option.value === location.value)?.dataset.uuid || '',
      gameCopy: document.getElementById('play-game-copy').value,
      winner: winnerTeam,
      storyteller: { name: storyteller.value, identity: importedIdentities.get(storyteller) || null },
      players: [...document.querySelectorAll('.player-row')].map(row => {
        const name = row.querySelector('.player-name-input');
        const role = row.querySelector('.player-role-cell select') || row.querySelector('.player-role-cell input');
        return {
          name: name.value,
          identity: importedIdentities.get(name) || null,
          role: role.value,
          team: row.classList.contains('is-good') ? 'good' : row.classList.contains('is-evil') ? 'evil' : null,
        };
      }),
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be blocked or full. The form must remain usable.
  }
}

function restoreDraft() {
  let state;
  let restoredCustomScript = null;
  try {
    state = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY));
    const validIdentity = value => value == null || (typeof value.name === 'string'
      && (value.uuid === null || typeof value.uuid === 'string') && typeof value.isAnon === 'boolean');
    const validPlayer = player => player && typeof player.name === 'string' && validIdentity(player.identity);
    if (!state || state.version !== 1 || !['date', 'start', 'end', 'board', 'location', 'locationUuid', 'gameCopy'].every(key => typeof state[key] === 'string')
      || !(state.duration === null || Number.isFinite(state.duration) && state.duration >= 0)
      || ![null, 'good', 'evil'].includes(state.winner)
      || !(state.script === null || SCRIPTS.some(script => script.id === state.script))
      || !GAME_COPY.some(copy => String(copy.playUsedGameCopy) === state.gameCopy)
      || !validPlayer(state.storyteller) || !Array.isArray(state.players)
      || !state.players.every(player => validPlayer(player) && typeof player.role === 'string' && [null, 'good', 'evil'].includes(player.team))) return false;
    if (state.customScriptJson) restoredCustomScript = parseCustomScript(state.customScriptJson);
  } catch {
    return false;
  }
  applyingDraft = true;
  try {
    customScript = restoredCustomScript;
    customScriptJson = state.customScriptJson || '';
    updateCustomScriptButton();
    if (state.script !== null) selectScript(document.querySelectorAll('.script-pill')[SCRIPTS.findIndex(script => script.id === state.script)]);
    importedBoard = state.board;
    const location = document.getElementById('play-location');
    if (state.location) {
      let option = [...location.options].find(option => option.value === state.location);
      if (!option) {
        option = document.createElement('option');
        option.value = state.location;
        option.textContent = state.location;
        location.appendChild(option);
      }
      option.dataset.uuid = state.locationUuid;
    }
    location.value = state.location;
    document.getElementById('play-game-copy').value = state.gameCopy;
    const storyteller = document.getElementById('storyteller-name');
    storyteller.value = state.storyteller.name;
    if (state.storyteller.identity) importedIdentities.set(storyteller, state.storyteller.identity);
    state.players.forEach(player => {
      addPlayer();
      const id = players[players.length - 1].id;
      const row = document.getElementById(`player-${id}`);
      const name = row.querySelector('.player-name-input');
      name.value = player.name;
      if (player.identity) importedIdentities.set(name, player.identity);
      const role = row.querySelector('.player-role-cell select') || row.querySelector('.player-role-cell input');
      role.value = player.role;
      updatePlayerRoleStyle(row, player.role);
      if (player.team) setPlayerTeam(id, player.team, [...row.querySelectorAll('.team-btn')].find(button => button.dataset.team === player.team));
    });
    setWinner(state.winner);
    document.getElementById('play-date').value = state.date;
    document.getElementById('play-start').value = state.start;
    document.getElementById('play-end').value = state.end;
    computedDurationMin = state.duration;
    const duration = state.duration;
    document.getElementById('duration-display').textContent = duration === null ? '—' : duration < 60 ? `${duration} min` : `${Math.floor(duration / 60)} h ${duration % 60} min`;
    updateSummary();
    return true;
  } finally {
    applyingDraft = false;
  }
}

// ── DURATION ──
function setDefaultEndTime() {
  const start = document.getElementById('play-start').value;
  if (start) {
    const [hours, minutes] = start.split(':').map(Number);
    const end = (hours * 60 + minutes + 45) % 1440;
    document.getElementById('play-end').value = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  }
  calcDuration();
}

function calcDuration() {
  const s = document.getElementById('play-start').value;
  const e = document.getElementById('play-end').value;
  const d = document.getElementById('duration-display');
  if (!s || !e) { d.textContent = '—'; computedDurationMin = null; return; }
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 1440;
  computedDurationMin = mins;
  const h = Math.floor(mins / 60), m = mins % 60;
  d.textContent = h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function resolvePlayerName(value) {
  const inputName = value.trim();
  const knownPlayer = KNOWN_PLAYERS.find(p => p.name.toLocaleLowerCase('cs') === inputName.toLocaleLowerCase('cs'));
  return {
    name: knownPlayer ? knownPlayer.name : (inputName || ''),
    uuid: knownPlayer ? knownPlayer.uuid : null,
    isAnon: !knownPlayer,
  };
}

function resolvePlayerInput(input) {
  const identity = importedIdentities.get(input);
  if (identity && input.value.trim() === identity.name) return identity;
  return resolvePlayerName(input.value);
}

// ── IMPORT ──
async function importBgsplayFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const status = document.getElementById('import-status');
  try {
    importBgsplay(JSON.parse(await file.text()));
    status.textContent = `Partie načtena (${players.length} hráčů).`;
  } catch (error) {
    status.textContent = `Import se nezdařil: ${error.message}`;
  }
  status.hidden = false;
  input.value = '';
}

function importBgsplay(data) {
  // Validate the whole play before replacing the current form.
  if (!Array.isArray(data?.plays) || data.plays.length !== 1) {
    throw new Error('Vyber soubor s právě jednou partií.');
  }
  const play = data.plays[0];
  const game = data.games?.find(game => game.id === play.gameRefId);
  if (Number(game?.bggId) !== 240980) throw new Error('Soubor neobsahuje partii Krvavé hodiny.');
  if (!Array.isArray(data.players) || !Array.isArray(play.playerScores)) {
    throw new Error('Chybí seznam hráčů nebo jejich výsledky.');
  }
  const date = play.playDate?.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):\d{2}$/);
  if (!date || !Number.isFinite(Date.parse(play.playDate.replace(' ', 'T'))) || Number(date[2]) > 23 || Number(date[3]) > 59) {
    throw new Error('Neplatné datum nebo čas partie.');
  }
  const duration = play.durationMin ?? null;
  if (duration !== null && (!Number.isFinite(duration) || duration < 0)) {
    throw new Error('Neplatná délka partie.');
  }
  const participants = play.playerScores.map(score => {
    const player = data.players.find(player => player.id === score.playerRefId);
    if (!player || typeof player.name !== 'string' || (!player.isAnonymous && typeof player.uuid !== 'string')) {
      throw new Error('Neplatný odkaz na hráče nebo jeho identita.');
    }
    const name = player.isAnonymous ? (score.anonymousName || player.name) : player.name;
    if (typeof name !== 'string' || (score.teamRole != null && typeof score.teamRole !== 'string')) {
      throw new Error('Neplatné jméno nebo role hráče.');
    }
    const metaData = score.metaData ? JSON.parse(score.metaData) : {};
    return {
      identity: { name: name.trim() || '', uuid: player.isAnonymous ? null : player.uuid, isAnon: Boolean(player.isAnonymous) },
      role: score.teamRole || '',
      team: score.team === '1' ? 'good' : score.team === '2' ? 'evil' : null,
      winner: Boolean(score.winner),
      storyteller: score.role === 'Vypravěč' || metaData?.isNpc === 1,
    };
  });
  const storytellers = participants.filter(player => player.storyteller);
  const importedPlayers = participants.filter(player => !player.storyteller);
  if (storytellers.length !== 1 || !importedPlayers.length) {
    throw new Error('Partie musí obsahovat jednoho vypravěče a alespoň jednoho hráče.');
  }
  const winners = [...new Set(importedPlayers.filter(player => player.winner).map(player => player.team))];
  if (winners.length > 1 || winners.includes(null)) throw new Error('Nelze určit vítězný tým.');
  const board = play.board ?? play.comments?.match(/^Skript: (.+)$/m)?.[1] ?? '';
  if (typeof board !== 'string') throw new Error('Neplatný název skriptu.');
  const location = play.locationRefId == null ? null : data.locations?.find(location => location.id === play.locationRefId);
  if (play.locationRefId != null && (!location || typeof location.name !== 'string')) {
    throw new Error('Neplatný odkaz na lokaci.');
  }
  const playMetaData = play.metaData ? JSON.parse(play.metaData) : {};
  const gameCopy = GAME_COPY.find(copy => copy.playUsedGameCopy === (playMetaData?.playUsedGameCopy ?? 0));
  if (!gameCopy) throw new Error('Neznámá kopie hry.');
  const script = [...SCRIPTS.filter(script => script.id !== 'custom').map(script => getScript(script.id)), ...(customScript ? [customScript] : [])].find(script => (script.name === board || script.id === 'custom' && `Custom: ${script.name}` === board)
    && importedPlayers.every(player => !player.role || Object.values(script.roles).some(roles => roles.includes(player.role))))
    || SCRIPTS.find(script => script.id === 'custom');

  applyingDraft = true;
  if (script.id === 'custom' && script !== customScript) {
    customScript = null;
    customScriptJson = '';
    updateCustomScriptButton();
  }
  [...players].forEach(player => removePlayer(player.id));
  selectScript(document.querySelectorAll('.script-pill')[SCRIPTS.findIndex(candidate => candidate.id === script.id)]);
  importedBoard = script.id === 'custom' ? board : '';
  const locationInput = document.getElementById('play-location');
  if (location) {
    let option = [...locationInput.options].find(option => option.value === location.name);
    if (!option) {
      option = document.createElement('option');
      option.value = location.name;
      option.textContent = location.name;
      locationInput.appendChild(option);
    }
    option.dataset.uuid = typeof location.uuid === 'string' && location.uuid ? location.uuid : option.dataset.uuid || generateUUID();
  }
  locationInput.value = location?.name || '';
  document.getElementById('play-game-copy').value = String(gameCopy.playUsedGameCopy);
  const storytellerInput = document.getElementById('storyteller-name');
  storytellerInput.value = storytellers[0].identity.name;
  importedIdentities.set(storytellerInput, storytellers[0].identity);
  importedPlayers.forEach(player => {
    addPlayer();
    const id = players[players.length - 1].id;
    const row = document.getElementById(`player-${id}`);
    const input = row.querySelector('.player-name-input');
    input.value = player.identity.name;
    importedIdentities.set(input, player.identity);
    const role = row.querySelector('.player-role-cell select') || row.querySelector('.player-role-cell input');
    role.value = player.role;
    updatePlayerRoleStyle(row, player.role);
    if (player.team) {
      const button = [...row.querySelectorAll('.team-btn')].find(button => button.dataset.team === player.team);
      setPlayerTeam(id, player.team, button);
    }
  });
  setWinner(winners[0] || null);
  document.getElementById('play-date').value = date[1];
  document.getElementById('play-start').value = `${date[2]}:${date[3]}`;
  const end = duration === null ? null : (Number(date[2]) * 60 + Number(date[3]) + duration) % 1440;
  document.getElementById('play-end').value = end === null ? '' : `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  computedDurationMin = duration;
  document.getElementById('duration-display').textContent = duration === null ? '—' : `${Math.floor(duration / 60)} h ${duration % 60} min`;
  generatedData = null;
  applyingDraft = false;
  updateSummary();
}

function renderGameCopies() {
  const select = document.getElementById('play-game-copy');
  select.replaceChildren();
  for (const copy of GAME_COPY) {
    const option = document.createElement('option');
    option.value = String(copy.playUsedGameCopy);
    option.textContent = copy.name;
    select.appendChild(option);
  }
  select.value = '0';
}

function renderLocations() {
  const select = document.getElementById('play-location');
  select.replaceChildren();
  for (const location of [{ name: '— Bez lokace —', uuid: '' }, ...LOCATIONS]) {
    const option = document.createElement('option');
    option.value = location.uuid ? location.name : '';
    option.textContent = location.name;
    option.dataset.uuid = location.uuid;
    select.appendChild(option);
  }
  select.value = '';
}

// ── SCRIPT ──
function getScript(id) {
  if (id === 'custom' && customScript) return customScript;
  const script = SCRIPTS.find(script => script.id === id);
  return script ? { ...script, roles: groupRoleIds(script.roles) } : undefined;
}

function groupRoleIds(ids) {
  const roles = Object.fromEntries(Object.keys(ROLE_LABELS).map(type => [type, []]));
  const unknown = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !Object.hasOwn(SCRIPT_ROLES, id)) {
      unknown.push(typeof id === 'string' ? id : '(neplatná položka)');
      continue;
    }
    const role = SCRIPT_ROLES[id];
    if (!roles[role.t].includes(role.n)) roles[role.t].push(role.n);
  }
  if (unknown.length) throw new Error(`Neznámá ID rolí: ${unknown.join(', ')}`);
  return roles;
}

function parseCustomScript(text) {
  let entries;
  try { entries = JSON.parse(text); } catch { throw new Error('Neplatný JSON.'); }
  if (!Array.isArray(entries)) throw new Error('Skript musí být JSON pole.');
  const metadata = entries.filter(entry => entry && typeof entry === 'object' && entry.id === '_meta');
  if (metadata.length !== 1 || typeof metadata[0].name !== 'string' || !metadata[0].name.trim()) {
    throw new Error('Skript musí mít jeden objekt _meta s vyplněným názvem name.');
  }
  const ids = entries.map(entry => typeof entry === 'string' ? entry : entry?.id).filter(id => id !== '_meta');
  const roles = groupRoleIds(ids);
  if (!Object.values(roles).some(names => names.length)) throw new Error('Skript neobsahuje žádné role.');
  return { id: 'custom', name: metadata[0].name.trim(), roles };
}

function updateCustomScriptButton() {
  const button = [...document.querySelectorAll('.script-pill')].find(button => button.dataset.script === 'custom');
  if (button) button.textContent = customScript ? `Custom: ${customScript.name}` : 'Custom';
}

function prepareCustomScriptDialog() {
  document.getElementById('custom-script-json').value = customScriptJson;
  document.getElementById('custom-script-status').hidden = true;
}

function importCustomScript(text) {
  const script = parseCustomScript(text);
  customScript = script;
  customScriptJson = text;
  updateCustomScriptButton();
  selectScript([...document.querySelectorAll('.script-pill')].find(button => button.dataset.script === 'custom'));
}

function importCustomScriptFromDialog() {
  const status = document.getElementById('custom-script-status');
  try {
    importCustomScript(document.getElementById('custom-script-json').value);
    status.hidden = true;
    document.getElementById('custom-script-close').click();
  } catch (error) {
    status.textContent = error.message;
    status.hidden = false;
  }
}

function renderScripts() {
  const container = document.getElementById('script-buttons');
  for (const script of SCRIPTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'script-pill btn-outline theme-primary';
    button.dataset.script = script.id;
    button.textContent = script.name;
    button.setAttribute('aria-pressed', 'false');
    if (script.id === 'custom') {
      button.setAttribute('data-bs-toggle', 'dialog');
      button.setAttribute('data-bs-target', '#custom-script-dialog');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'custom-script-dialog');
      button.onclick = prepareCustomScriptDialog;
    } else {
      button.onclick = () => selectScript(button);
    }
    container.appendChild(button);
  }
}

function selectScript(el) {
  importedBoard = '';
  document.querySelectorAll('.script-pill').forEach(p => {
    p.classList.toggle('active', p === el);
    p.setAttribute('aria-pressed', String(p === el));
  });
  currentScript = el.dataset.script;
  players.forEach(p => rebuildRoleCell(p.id));
  updateSummary();
}

function getRoleOptions(key) {
  if (!key) return '';
  const s = getScript(key)?.roles; if (!s) return '';
  let html = '<option value="">— bez role —</option>';
  for (const [type, roles] of Object.entries(s)) {
    if (!roles.length) continue;
    html += `<optgroup label="${ROLE_LABELS[type]}">`;
    roles.forEach(r => { html += `<option value="${r}">${r}</option>`; });
    html += '</optgroup>';
  }
  return html;
}

function rebuildRoleCell(pid) {
  const row = document.getElementById(`player-${pid}`);
  if (!row) return;
  const cell = row.querySelector('.player-role-cell');
  if (!cell) return;
  updatePlayerRoleStyle(row, '');
  if (currentScript === 'custom' && !customScript) {
    cell.innerHTML = `<input class="form-control" type="text" placeholder="Název role…" aria-label="Role hráče">`;
  } else if (currentScript) {
    cell.innerHTML = `<select class="form-control" aria-label="Role hráče" onchange="autoSelectPlayerTeam(${pid},this.value)">${getRoleOptions(currentScript)}</select>`;
  } else {
    cell.innerHTML = `<input class="form-control" type="text" placeholder="Vyber skript…" aria-label="Role hráče" disabled>`;
  }
}

function updatePlayerRoleStyle(row, role) {
  const roles = getScript(currentScript)?.roles;
  const emphasized = Boolean(role && (roles?.townsfolk?.includes(role) || roles?.demon?.includes(role)));
  row.classList.toggle('bg-30', emphasized);
  row.classList.toggle('bg-10', !emphasized);
}

function autoSelectPlayerTeam(id, role) {
  updateSummary();
  const row = document.getElementById(`player-${id}`);
  if (!row) return;
  updatePlayerRoleStyle(row, role);
  const roles = getScript(currentScript)?.roles;
  if (!roles || !role) return;
  const type = Object.entries(roles).find(([, names]) => names.includes(role))?.[0];
  const team = { townsfolk: 'good', outsider: 'good', minion: 'evil', demon: 'evil' }[type];
  if (!team) return;
  const button = [...row.querySelectorAll('.team-btn')].find(button => button.dataset.team === team);
  setPlayerTeam(id, team, button);
}

// ── WINNER ──
function setWinner(team) {
  winnerTeam = team;
  for (const value of ['good', 'evil']) {
    const button = document.getElementById(`btn-${value}`);
    button.classList.toggle('active', team === value);
    button.setAttribute('aria-pressed', String(team === value));
  }
  updateSummary();
}

// ── PLAYERS ──
function playerOptionsHTML() {
  return KNOWN_PLAYERS.map(p =>
    `<option value="${p.name}"></option>`
  ).join('');
}

function addPlayer(focusName = false) {
  const id = ++playerIdCounter;
  players.push({ id });
  const row = document.createElement('div');
  row.className = 'player-row row g-3 align-items-center border rounded-5 p-3 mx-0 bg-10';
  row.id = `player-${id}`;

  let roleCell;
  if (!currentScript) {
    roleCell = `<input class="form-control" type="text" placeholder="Vyber skript…" aria-label="Role hráče" disabled>`;
  } else if (currentScript === 'custom' && !customScript) {
    roleCell = `<input class="form-control" type="text" placeholder="Název role…" aria-label="Role hráče">`;
  } else {
    roleCell = `<select class="form-control" aria-label="Role hráče" onchange="autoSelectPlayerTeam(${id},this.value)">${getRoleOptions(currentScript)}</select>`;
  }

  row.innerHTML = `
    <div class="player-num col-1 text-center fg-3">${players.length}</div>
    <div class="col-11 md:col-4">
      <input class="player-name-input form-control" type="text" list="known-players" aria-label="Hráč" placeholder="Jméno hráče…" autocomplete="off">
    </div>
    <div class="player-role-cell col-12 md:col">${roleCell}</div>
    <div class="col-auto d-flex flex-nowrap flex-shrink-0 gap-1 ms-auto" role="group" aria-label="Akce hráče">
      <button type="button" class="move-player-up btn-text btn-sm" onclick="movePlayer(${id},-1)" aria-label="Posunout hráče nahoru" title="Posunout nahoru"><i class="bi bi-arrow-up" aria-hidden="true"></i></button>
      <button type="button" class="move-player-down btn-text btn-sm" onclick="movePlayer(${id},1)" aria-label="Posunout hráče dolů" title="Posunout dolů"><i class="bi bi-arrow-down" aria-hidden="true"></i></button>
      <button type="button" class="team-btn btn-subtle btn-sm theme-info" data-team="good" onclick="setPlayerTeam(${id},'good',this)" aria-label="Dobří" aria-pressed="false" title="Dobří">👍</button>
      <button type="button" class="team-btn btn-subtle btn-sm theme-danger" data-team="evil" onclick="setPlayerTeam(${id},'evil',this)" aria-label="Zlí" aria-pressed="false" title="Zlí">👎</button>
      <button type="button" class="btn-text btn-sm theme-danger" onclick="removePlayer(${id})" aria-label="Odebrat hráče" title="Odebrat">✕</button>
    </div>
  `;
  document.getElementById('players-list').appendChild(row);
  updateNumbers();
  updateSummary();
  if (focusName) row.querySelector('.player-name-input').focus();
}

function movePlayer(id, direction) {
  if (direction !== -1 && direction !== 1) return;
  const rows = [...document.querySelectorAll('.player-row')];
  const index = rows.findIndex(row => row.id === `player-${id}`);
  const adjacent = rows[index + direction];
  if (index === -1 || !adjacent) return;
  const row = rows[index];
  document.getElementById('players-list').insertBefore(direction === -1 ? row : adjacent, direction === -1 ? adjacent : row);
  [players[index], players[index + direction]] = [players[index + direction], players[index]];
  updateNumbers();
  updateSummary();
}

function removePlayer(id) {
  players = players.filter(p => p.id !== id);
  document.getElementById(`player-${id}`)?.remove();
  updateNumbers(); updateSummary();
}

function setPlayerTeam(id, team, btn) {
  const row = document.getElementById(`player-${id}`);
  row.classList.remove('is-good','is-evil','bg-info','bg-danger');
  row.classList.add(team === 'good' ? 'is-good' : 'is-evil');
  row.classList.add(team === 'good' ? 'bg-info' : 'bg-danger');
  row.querySelectorAll('.team-btn').forEach(b => {
    b.classList.toggle('active', b === btn);
    b.setAttribute('aria-pressed', String(b === btn));
  });
  updateSummary();
}

function updateNumbers() {
  const rows = document.querySelectorAll('.player-row');
  rows.forEach((r, i) => {
    r.querySelector('.player-num').textContent = i + 1;
    r.querySelector('.move-player-up').disabled = i === 0;
    r.querySelector('.move-player-down').disabled = i === rows.length - 1;
  });
}

function updateSummary() {
  const rows = document.querySelectorAll('.player-row');
  const roles = getScript(currentScript)?.roles;
  const counts = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  rows.forEach(row => {
    const role = row.querySelector('.player-role-cell select')?.value;
    if (!role || !roles) return;
    for (const type of Object.keys(counts)) {
      if (roles[type]?.includes(role)) counts[type]++;
    }
  });
  const summary = document.getElementById('summary-bar');
  summary.textContent = `${rows.length}: ${counts.townsfolk}/${counts.outsider}/${counts.minion}/${counts.demon}`;
  summary.setAttribute('aria-label', `Celkem ${rows.length} hráčů: ${counts.townsfolk} měšťanů, ${counts.outsider} podivínů, ${counts.minion} přisluhovačů, ${counts.demon} démonů`);
  saveDraft();
}

// ── GENERATE ──
function getPlayerData() {
  const storyteller = resolvePlayerInput(document.getElementById('storyteller-name'));
  return [{
    idx: 0,
    name: storyteller.name,
    uuid: storyteller.uuid,
    isAnon: storyteller.isAnon,
    role: 'Vypravěč',
    team: "0",
    winner: false,
    metaData: "{\"isNpc\":1}",
  }].concat([...document.querySelectorAll('.player-row')].map((row, i) => {
    const { name, uuid, isAnon } = resolvePlayerInput(row.querySelector('.player-name-input'));

    const roleEl = row.querySelector('.player-role-cell select') || row.querySelector('.player-role-cell input');
    const teamRole = roleEl?.value?.trim() || '';

    const isGood = row.classList.contains('is-good');
    const isEvil = row.classList.contains('is-evil');
    const role = isGood ? 'Dobro' : (isEvil ? 'Zlo' : '');
    const team = isGood ? '1' : (isEvil ? '2' : '0');
    const winner = (winnerTeam === 'good' && isGood) || (winnerTeam === 'evil' && isEvil);

    return { idx: i+2, name, uuid, isAnon, role, team, teamRole, winner, metaData: "{}" };
  }));
}

function generate() {
  if (!winnerTeam) { alert('Vyber vítězný tým před generováním.'); return; }
  if (!players.length) { alert('Přidej alespoň jednoho hráče.'); return; }

  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  const modificationDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const date     = document.getElementById('play-date').value || new Date().toISOString().split('T')[0];
  const start    = document.getElementById('play-start').value || '20:00';
  const playDate = `${date} ${start}:00`;
  const location = document.getElementById('play-location').value;
  const locationUuid = [...document.getElementById('play-location').options].find(option => option.value === location)?.dataset.uuid;
  const gameCopy = GAME_COPY.find(copy => String(copy.playUsedGameCopy) === document.getElementById('play-game-copy').value);
  const playUsedGameCopy = gameCopy?.playUsedGameCopy ?? 0
  const playMetaData = {
    playUsedGameCopy,
    playerRefId: playUsedGameCopy == 0 ? undefined : 1
  };

  const rawScriptName = importedBoard || getScript(currentScript)?.name || '';
  const scriptName = currentScript === 'custom' && !rawScriptName.startsWith('Custom: ')
    ? `Custom: ${rawScriptName}` : rawScriptName;

  const pd = getPlayerData();
  const storyteller = pd[0];

  const bgsPlayers = pd.map((p, i) => ({
    id: i+1,
    uuid: p.uuid || generateUUID(),
    name: p.name,
    isAnonymous: p.isAnon,
  }));

  const bgsplay = {
    games: [{
      id: 1,
      uuid: 'botc-bgg-240980',
      name: 'Krvavá Hodina Odbila',
      bggId: 240980,
      noPoints: true,
      highestWins: false,
      cooperative: false,
      modificationDate,
    }],
    players: bgsPlayers,
    locations: location ? [{ id: 1, uuid: locationUuid || generateUUID(), name: location, modificationDate }] : [],
    plays: [{
      id:1, uuid:generateUUID(),
      gameRefId:1,
      modificationDate,
      locationRefId: location ? 1 : null,
      entryDate: playDate,
      playDate,
      durationMin: computedDurationMin || null,
      board: scriptName || undefined,
      usesTeams : true,
      manualWinner: true,
      rounds: 0,
      scoringSetting: 3,
      metaData: JSON.stringify(playMetaData),
      playerScores: pd.map((p, i) => ({
        anonymousName: p.isAnon ? p.name : undefined,
        metaData: p.metaData,
        newPlayer: false,
        playerRefId: i+1,
        rank: 0,
        role: p.role || null,
        score: "",
        seatOrder: 0,
        startPlayer: false,
        team: p.team,
        teamRole: p.teamRole,
        winner: p.winner,
      }))
    }]
  };

  const createPlay = {
    game: { bggId:240980, name:'Blood on the Clocktower', noPoints:true, highestWins:false },
    playDate, durationMin: computedDurationMin || undefined,
    board: scriptName || undefined,
    location: location || undefined,
    players: pd.map(p => ({
      name: p.name, winner: p.winner,
      role: p.role || undefined,
      score: null,
      ...(p.uuid ? { sourcePlayerId: p.uuid } : {})
    })),
    sourceName: 'BotC Recorder'
  };

  generatedData = { ...bgsplay, _createPlay: createPlay };
  return generatedData;
}

function downloadBgsplay() {
  const data = generate();
  if (!data) return;
  downloadPlayFile(createPlayFile(data));
}

function createPlayFile(data) {
  const { _createPlay, ...clean } = data;
  const json = JSON.stringify(clean, null, 2);
  const name = `botc-${document.getElementById('play-date').value || 'partie'}.bgsplay`;
  return new File([json], name, { type: 'application/json' });
}

function downloadPlayFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function openInApp() {
  const data = generate();
  if (!data) return;
  const file = createPlayFile(data);
  const status = document.getElementById('export-status');
  status.hidden = true;
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
  }
  downloadPlayFile(file);
  status.textContent = 'Soubor nelze předat přes systémové sdílení. Byl stažen pro ruční import do BGStats.';
  status.hidden = false;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
