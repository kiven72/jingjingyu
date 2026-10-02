/**
 * 控制台外壳管理左栏导航和品牌区域；host 与 feature 管理右侧内容。
 * 框架页来自 FrameworkFeature[]，贡献方的页来自 manifest；只展示可用 feature 与 availability 为 active 的页，不内置具体 World 或 bot 名称。
 * 外壳不探测整站可达性，单个接口失败不代表整站状态。DOM 复用 ConsoleUi 与现存样式，窄屏折叠交给 CSS。
 */

import { get } from '../core/api.ts';
import { buildHash, type Route, type Router } from '../core/router.ts';
import { featureAvailable, type FrameworkFeature } from '../features/feature.ts';
const PROVIDER_ROUTE = 'provider';
import { icon, wordmark, type ConsoleIconName } from '../ui/icons.ts';
import { lampRow, paintLamps } from '../ui/lamp.ts';
import type { ConsoleUi } from '../../shared/client-panel.ts';
import type { ConsoleLamp, ConsolePageManifest } from '../../shared/console-protocol.ts';
import { S } from './strings.ts';

const FRAMEWORK_NAME = 'Cortico';

const GROUP_PERSONAS = S.groupPersonas;
const GROUP_WORLDS = S.groupWorlds;


export interface ShellDeps {
  doc: Document;
  /** UI 原语。DOM 只经它造，外壳不手搓 class。 */
  ui: ConsoleUi;
  /** 跳转经它——`location.hash` 只有 router 能写。 */
  router: Router;
  /** 控制台自己的页面。顺序即左栏顺序。 */
  features?: readonly FrameworkFeature[];
  /** 框架级表面的挂载情况。晚到就先传空，之后 `setCapabilities` 补。 */
  capabilities?: Record<string, boolean>;
  /** 控制台页清单（`/api/console/manifest`）。晚到就之后 `setPages` 补。 */
  pages?: readonly ConsolePageManifest[];
  /** 外壳的生命周期。abort 等同于 `dispose()`。 */
  signal?: AbortSignal;
  onError?(err: unknown): void;
}

export interface ConsoleShell {
  /** 整个左栏（`#rail`）。调用方把它插进 `body` 的最前面。 */
  readonly el: HTMLElement;
  /** 当前路由变了。驱动高亮，不做别的。 */
  setRoute(route: Route): void;
  /** 展示名。空值退回中性缺省。 */
  setBrand(name: string | null | undefined): void;
  /** 能力清单到齐/变了，重排框架页那一段。 */
  setCapabilities(capabilities: Record<string, boolean>): void;
  /** manifest 到齐/变了，重排贡献方那一段。 */
  setPages(pages: readonly ConsolePageManifest[]): void;
  /**
   * 灯的新读数（`/api/console/lamps` 的一拍）。只改灯，不碰导航结构——
   * 这是每秒两次的调用，重排一次 DOM 就是每秒两次重排。
   */
  setLamps(lamps: Record<string, ConsoleLamp[]>): void;
  dispose(): void;
}

/**
 * 一条导航项。`segments` 既用来跳转，也用来判高亮；`lamp` 是那颗灯的节点
 * （灯变了只改它的 class 与 title，不重建导航——那是每秒两次的操作）。
 */
interface NavEntry {
  el: HTMLElement;
  segments: readonly string[];
  /** 贡献方那一行才有：灯按这个 id 对号入座。 */
  pageId?: string;
  /** 那一排灯的容器（灯变了只改它，不重建导航）。 */
  lamps?: HTMLSpanElement;
}

/**
 * 这一项是不是当前所在处。判据是**前缀匹配**：框架页只有一段（`['usage']`），
 * 贡献方的页有两段（`['provider','world:sample']`），同一条规则两边都成立，
 * 而且页内子页签（第三段）变了不会让高亮掉下来。
 */
function matches(entry: NavEntry, route: Route | null): boolean {
  if (!route) return false;
  return entry.segments.every((s, i) => route.segments[i] === s);
}

export function createShell(deps: ShellDeps): ConsoleShell {
  const { doc, ui, router } = deps;

  /** 外壳自己的账本。`dispose()` 与传进来的 signal 都收敛到这里。 */
  const life = new AbortController();
  const signal = life.signal;
  if (deps.signal) {
    if (deps.signal.aborted) life.abort();
    else deps.signal.addEventListener('abort', () => life.abort(), { once: true, signal });
  }

  const onError = deps.onError ?? ((): void => {});

  const features: readonly FrameworkFeature[] = deps.features ?? [];
  let capabilities: Record<string, boolean> = deps.capabilities ?? {};
  let consolePages: readonly ConsolePageManifest[] = deps.pages ?? [];
  let route: Route | null = null;
  let entries: NavEntry[] = [];
  /**
   * 灯的当茬读数。`setLamps` 写它，导航重排时再照它把灯补回去——否则一次
   * `setPages` 会让所有灯退回 manifest 那一帧的旧值。
   */
  let lamps: Record<string, ConsoleLamp[]> = {};
  /**
   * 每次重排换一茬监听。挂在外壳总 signal 上的话，反复 `setPages` 会在
   * 已经摘掉的节点上攒下一堆永不触发、也永不回收的监听。
   */
  let navLife: AbortController | null = null;
  // 外壳一停,当茬导航的监听跟着停(`dispose()` 之外,传进来的 signal 也走这条路)。
  signal.addEventListener('abort', () => navLife?.abort(), { once: true });

  // ---- 骨架 -------------------------------------------------------------

  const el = ui.h('div');
  el.id = 'rail';

  // 左上角是框架字标。这个 bot 叫什么写在底栏头像旁边——那才是这一台的名字。
  const brand = ui.h('div', 'brand');
  const mark = wordmark(doc);
  mark.removeAttribute('aria-hidden');
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', FRAMEWORK_NAME);
  brand.appendChild(mark);

  const nav = ui.h('nav', 'stack');
  nav.setAttribute('aria-label', S.navAria);

  el.append(brand, nav);

  get<{ currentVersion: string; update?: { version: string; url: string } }>('/api/framework/release', { signal })
    .then((status) => {
      if (signal.aborted || !status?.update) return;
      const hint = ui.h('a', 'release-hint', S.releaseUpdate(status.update.version, status.currentVersion));
      hint.href = status.update.url;
      hint.target = '_blank';
      hint.rel = 'noopener noreferrer';
      brand.appendChild(hint);
    })
    .catch(() => {});

  // ---- 导航 -------------------------------------------------------------

  /** 某一页此刻该点哪盏灯。轮询的读数优先于 manifest 那一帧。 */
  const lampsFor = (pageId: string): readonly ConsoleLamp[] =>
    lamps[pageId] ?? consolePages.find((p) => p.id === pageId)?.lamps ?? [];

  const addItem = (
    parent: HTMLElement,
    opts: {
      label: string;
      icon?: ConsoleIconName;
      /** 带灯的行（贡献方的页）。给了就画灯，`null` 是"还没报"的空位。 */
      pageId?: string;
      segments: readonly string[];
    },
    itemSignal: AbortSignal,
  ): NavEntry => {
    const href = buildHash(opts.segments);
    const item = ui.h('a', 'navitem');
    item.href = href;
    if (opts.icon) item.appendChild(icon(doc, opts.icon, 'navicon'));
    const label = ui.h('span', 'lbl', opts.label);
    // 名字给灯让位后可能被截断,悬停仍读得到全名(灯自己的说明挂在各自那颗上)。
    if (opts.pageId) label.title = opts.label;
    item.appendChild(label);
    const lampHost = opts.pageId ? lampRow(doc, lampsFor(opts.pageId)) : undefined;
    if (lampHost) item.appendChild(lampHost);
    // 修饰键与中键保留浏览器默认行为；普通左键经 router 导航。
    item.addEventListener('click', (ev) => {
      if (ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      try {
        router.navigate(opts.segments);
      } catch (err) {
        onError(err);
      }
    }, { signal: itemSignal });
    parent.appendChild(item);
    const entry: NavEntry = {
      el: item,
      segments: opts.segments,
      ...(opts.pageId && lampHost ? { pageId: opts.pageId, lamps: lampHost } : {}),
    };
    entries.push(entry);
    return entry;
  };

  const addGroup = (label: string, kind: 'framework' | 'persona'): HTMLDivElement => {
    // CSS class 仍写 `navgroup-provider`:样式表与构建产物同步,不随类型改名。
    const pageClass = kind === 'framework' ? '' : ' navgroup-provider';
    const group = ui.h('div', `navgroup navgroup-${kind}${pageClass}`);
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    group.appendChild(ui.h('div', 'stacklabel', label));
    nav.appendChild(group);
    return group;
  };

  const addPrimary = (label: string): HTMLDivElement => {
    const group = ui.h('div', 'navgroup navgroup-framework navgroup-primary');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    nav.appendChild(group);
    return group;
  };

  const renderNav = (): void => {
    navLife?.abort();
    if (signal.aborted) return;
    navLife = new AbortController();
    const itemSignal = navLife.signal;

    entries = [];
    nav.replaceChildren();

    const pages = features.filter((f) => featureAvailable(f, capabilities));
    const worldRoots = pages.filter((f) => f.navMode === 'world-root');
    const personaTail = pages.filter((f) => f.navMode === 'persona');
    const groups = new Map<string, HTMLElement>();
    for (const f of pages) {
      if (f.navMode === undefined || f.navMode === 'group') {
        const label = f.navGroup;
        let group = groups.get(label);
        if (!group) {
          group = addGroup(label, 'framework');
          groups.set(label, group);
        }
        addItem(group, {
          label: f.label,
          icon: f.icon,
          ...(f.lampId ? { pageId: f.lampId } : {}),
          segments: [f.route],
        }, itemSignal);
      } else if (f.navMode === 'primary') {
        addItem(addPrimary(f.label), {
          label: f.label,
          icon: f.icon,
          ...(f.lampId ? { pageId: f.lampId } : {}),
          segments: [f.route],
        }, itemSignal);
      }
    }

    // 只列已装配的:左栏是"能去的地方",不是全量清单。未装配的仍由各自的
    // 总览页负责露面(那里才有"为什么没装上"的位置)。供应模块(kind `llm`)不在
    // 这里逐个列出:它们的入口是框架的「模型提供商」页,模块清单是那一页里的次级菜单。
    const listed = consolePages.filter((p) => p.availability === 'active');
    // Persona 页在前,它的 Memory 页跟在后面,再是归这一组的框架页(系统提示词),同一组。
    const personas = [
      ...listed.filter((page) => page.kind === 'persona'),
      ...listed.filter((page) => page.kind === 'memory'),
    ];
    if (personas.length || personaTail.length) {
      const group = addGroup(GROUP_PERSONAS, 'persona');
      for (const p of personas) {
        addItem(group, {
          label: p.label || p.id,
          icon: p.kind === 'memory' ? 'folder-open' : 'bot',
          pageId: p.id,
          segments: [PROVIDER_ROUTE, p.id],
        }, itemSignal);
      }
      for (const f of personaTail) {
        addItem(group, { label: f.label, icon: f.icon, segments: [f.route] }, itemSignal);
      }
    }

    const worlds = listed.filter((page) => page.kind === 'world');
    if (worldRoots.length || worlds.length) {
      const group = ui.h('div', 'navgroup navgroup-world-tree');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', GROUP_WORLDS);
      group.appendChild(ui.h('div', 'stacklabel', GROUP_WORLDS));
      nav.appendChild(group);
      for (const f of worldRoots) {
        addItem(group, {
          label: f.label,
          icon: f.icon,
          segments: [f.route],
        }, itemSignal);
      }
      if (worlds.length) {
        const list = ui.h('div', 'navmodule-list');
        list.setAttribute('role', 'group');
        list.setAttribute('aria-label', S.moduleInstancesAria);
        group.appendChild(list);
        for (const p of worlds) {
          addItem(list, {
            label: p.label || p.id,
            pageId: p.id,
            segments: [PROVIDER_ROUTE, p.id],
          }, itemSignal);
        }
      }
    }

    applyRoute();
  };

  const applyRoute = (): void => {
    for (const entry of entries) {
      const on = matches(entry, route);
      entry.el.classList.toggle('active', on);
      if (on) entry.el.setAttribute('aria-current', 'page');
      else entry.el.removeAttribute('aria-current');
    }
  };

  const setBrand = (name: string | null | undefined): void => {
    doc.title = S.docTitle(typeof name === 'string' && name.trim() ? name.trim() : FRAMEWORK_NAME);
  };

  renderNav();

  return {
    el,
    setRoute(next: Route): void {
      route = next;
      applyRoute();
    },
    setBrand,
    setCapabilities(next: Record<string, boolean>): void {
      capabilities = next;
      renderNav();
    },
    setPages(next: readonly ConsolePageManifest[]): void {
      consolePages = next;
      renderNav();
    },
    setLamps(next: Record<string, ConsoleLamp[]>): void {
      lamps = next;
      for (const entry of entries) {
        if (entry.lamps && entry.pageId) paintLamps(entry.lamps, lampsFor(entry.pageId));
      }
    },
    dispose(): void {
      navLife?.abort();
      life.abort();
      el.remove();
    },
  };
}
