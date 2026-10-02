/** Habits: desktop pet preferences, using the existing config keys. */
import { get, setConfig } from '../../core/api.ts';
import { pick } from '../../core/language.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';

const GROUP = 'world:desktop-pet';
const K = 'worlds.desktop-pet';
const KEYS = {
  roam: `${K}.roam`,
  theme: `${K}.theme`,
  scale: `${K}.window.scale`,
  sound: `${K}.sound`,
} as const;

const S = pick({
  zh: {
    nav: '习惯',
    settingsTitle: '习惯',
    roam: '走动',
    roamFree: '常走动',
    roamCalm: '多待着',
    roamOff: '不乱动',
    theme: '颜色',
    themeDark: '夜间(浅色身体)',
    themeLight: '白天(深色身体)',
    scale: '大小',
    startup: '\u5f00\u673a\u81ea\u52a8\u542f\u52a8',
    sound: '音效',
    saved: '已保存',
    saveFailed: (why: string) => `没保存上:${why}`,
  },
  en: {
    nav: 'Habits',
    settingsTitle: 'Habits',
    roam: 'Walking',
    roamFree: 'Often',
    roamCalm: 'Now and then',
    roamOff: 'Stay put',
    theme: 'Colors',
    themeDark: 'Night (light body)',
    themeLight: 'Day (dark body)',
    scale: 'Size',
    startup: 'Start at login',
    sound: 'Sounds',
    saved: 'Saved',
    saveFailed: (why: string) => `Not saved: ${why}`,
  },
});

interface StartupState { enabled: boolean }
interface StartupBridge { get(): Promise<StartupState>; set(enabled: boolean): Promise<StartupState> }

interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }

/** While the size slider moves, at most one save per this many milliseconds. */
const SCALE_SEND_MS = 80;

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  const opts = { signal };
  root.classList.add('home');

  /* ---------- habits ---------- */
  const habits = ui.sheet({ title: S.settingsTitle });
  const msg = ui.msgline('');

  const roam = ui.segmented([
    { value: 'free', label: S.roamFree }, { value: 'calm', label: S.roamCalm }, { value: 'off', label: S.roamOff },
  ], { size: 'sm', onSelect: (v) => void save(KEYS.roam, v) });
  const theme = ui.segmented([
    { value: 'dark', label: S.themeDark }, { value: 'light', label: S.themeLight },
  ], { size: 'sm', onSelect: (v) => void save(KEYS.theme, v) });
  const scale = ui.h('input', 'companion-range');
  scale.type = 'range';
  scale.min = '0.5'; scale.max = '2'; scale.step = '0.05';
  const scaleText = ui.h('span', 'companion-rangeval');
  const scaleBox = ui.h('div', 'companion-rangebox');
  scaleBox.append(scale, scaleText);
  const sound = ui.checkbox(S.sound, { onChange: (on) => void save(KEYS.sound, on) });
  const startupBridge = (root.ownerDocument.defaultView as (Window & { companionStartup?: StartupBridge }) | null)?.companionStartup;
  let startupPending = false;
  let startupEnabled = false;
  const startup = ui.checkbox(S.startup, { onChange: (on) => void saveStartup(on) });
  startup.input.disabled = !startupBridge;
  const saveStartup = async (on: boolean) => {
    if (!startupBridge || startupPending) return;
    startupPending = true;
    startup.input.disabled = true;
    try {
      const state = await startupBridge.set(on);
      startupEnabled = state.enabled;
      startup.setChecked(state.enabled);
      msg.textContent = S.saved;
      msg.classList.remove('bad');
    } catch (err) {
      startup.setChecked(startupEnabled);
      msg.textContent = S.saveFailed(errText(err));
      msg.classList.add('bad');
    } finally {
      startupPending = false;
      startup.input.disabled = false;
    }
  };
  const refreshStartup = async () => {
    if (!startupBridge || startupPending) return;
    try {
      const state = await startupBridge.get();
      if (signal.aborted || startupPending) return;
      startupEnabled = state.enabled;
      startup.setChecked(state.enabled);
    } catch (err) {
      if (signal.aborted) return;
      msg.textContent = S.saveFailed(errText(err));
      msg.classList.add('bad');
    }
  };
  const row = (label: string, control: HTMLElement, hint?: string) => {
    const r = ui.h('div', 'companion-row');
    const l = ui.h('div', 'companion-label', label);
    const c = ui.h('div', 'companion-control');
    c.append(control);
    if (hint) c.append(ui.h('p', 'home-note', hint));
    r.append(l, c);
    return r;
  };
  habits.body.append(
    row(S.roam, roam.el),
    row(S.theme, theme.el),
    row(S.scale, scaleBox),
    row('', sound.el),
    row('', startup.el),
    msg,
  );
  root.append(habits.el);

  /* ---------- behaviour ---------- */
  const save = async (key: string, value: string | number | boolean) => {
    try {
      await setConfig(GROUP, { [key]: value }, opts);
      msg.textContent = S.saved;
      msg.classList.remove('bad');
    } catch (err) {
      if (signal.aborted) return;
      msg.textContent = S.saveFailed(errText(err));
      msg.classList.add('bad');
    }
  };
  const showScale = () => { scaleText.textContent = `${Math.round(Number(scale.value) * 100)}%`; };
  // saved while the slider moves, so the pet on the desktop grows and shrinks with it
  let scaleTimer: ReturnType<typeof setTimeout> | null = null;
  let scaleSent = '';
  const sendScale = () => {
    scaleTimer = null;
    if (scale.value === scaleSent) return;
    scaleSent = scale.value;
    void save(KEYS.scale, Number(scale.value));
  };
  scale.addEventListener('input', () => { showScale(); scaleTimer ??= setTimeout(sendScale, SCALE_SEND_MS); });
  scale.addEventListener('change', () => { if (scaleTimer) clearTimeout(scaleTimer); sendScale(); });
  signal.addEventListener('abort', () => { if (scaleTimer) clearTimeout(scaleTimer); });
  const refreshValues = async () => {
    let values: Record<string, unknown> = {};
    try {
      const d = await get<{ groups?: ConfigEntry[] }>('/api/config', opts);
      values = d.groups?.find((g) => g.group.id === GROUP)?.values ?? {};
    } catch { return; }
    const active = document.activeElement;
    if (typeof values[KEYS.roam] === 'string') roam.setValue(values[KEYS.roam] as string);
    if (typeof values[KEYS.theme] === 'string') theme.setValue(values[KEYS.theme] as string);
    if (typeof values[KEYS.scale] === 'number' && active !== scale) { scale.value = String(values[KEYS.scale]); showScale(); }
    if (typeof values[KEYS.sound] === 'boolean') sound.setChecked(values[KEYS.sound] as boolean);

  };

  await Promise.all([refreshValues(), refreshStartup()]);
  ctx.lifecycle.interval(() => void refreshStartup(), 3000);
  ctx.lifecycle.interval(() => void refreshValues(), 3000);
}

export const petFeature: FrameworkFeature = {
  route: 'pet',
  label: S.nav,
  icon: 'bot',
  navMode: 'primary',
  mount,
};
