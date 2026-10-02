/** Settings entry: only Habits and Dress up are registered. */

import { get } from './core/api.ts';
import { pick } from './core/language.ts';
import { Lifecycle } from './core/lifecycle.ts';
import { Router, type Route } from './core/router.ts';
import { createConsoleUi } from './ui/index.ts';
import { subscribeLamps } from './ui/lamp.ts';
import { applyStoredTheme } from './theme/studio.ts';
import { createShell, type ConsoleShell } from './shell/index.ts';
import { featureAvailable, type FeatureContext, type FrameworkFeature } from './features/feature.ts';
import { dressFeature } from './features/dress/index.ts';
import { petFeature } from './features/pet/index.ts';
import { mountRelease } from './features/release.ts';
import { coopanionWordmark } from './branding.ts';
import type { ConsoleMemo } from '../shared/client-panel.ts';

export const BASIC_FEATURES: readonly FrameworkFeature[] = [petFeature, dressFeature];
export const FEATURES = BASIC_FEATURES;

/** feature 挂载抛错时那张错误卡的标题。 */
const featureLoadFailed = pick({
  zh: (label: string) => `「${label}」没能加载`,
  en: (label: string) => `"${label}" failed to load`,
});

/** localStorage 后端；无痕模式下静默降级成内存，不抛。 */
export function createMemo(prefix: string): ConsoleMemo {
  const fallback = new Map<string, unknown>();
  return {
    get<T>(key: string, dflt: T): T {
      const k = prefix + key;
      // 本会话写过的值优先:localStorage 写不进去(无痕、配额满)时只有内存表是新的。
      if (fallback.has(k)) return fallback.get(k) as T;
      try {
        const raw = localStorage.getItem(k);
        return raw === null ? dflt : (JSON.parse(raw) as T);
      } catch {
        return dflt;
      }
    },
    set(key: string, value: unknown): void {
      const k = prefix + key;
      fallback.set(k, value);
      try {
        localStorage.setItem(k, JSON.stringify(value));
      } catch { /* 无痕/配额满:这轮只留在内存里 */ }
    },
  };
}

export function boot(doc: Document = document): { dispose(): void } {
  // 首次渲染前应用主题。
  try {
    applyStoredTheme(doc);
  } catch { /* 主题读坏了不该拦住整个控制台 */ }

  // 首屏提示已经完成使命——内核跑起来了。摘不掉它才说明脚本没起来。
  doc.getElementById('boot-note')?.remove();

  let root = doc.getElementById('kernel-root');
  if (!root) {
    root = doc.createElement('div');
    root.id = 'kernel-root';
    doc.body.appendChild(root);
  }
  /**
   * 贡献方的页与 framework feature 各自拥有独立根容器。ConsolePageHost.unmount() 清空其根节点时，不得影响 feature 的 DOM。
   */
  const featureRoot = doc.createElement('div');
  root.replaceChildren(featureRoot);

  const onError = (err: unknown): void => {
    console.error('[console]', err);
  };

  const router = new Router({
    win: window,
    confirmLeave: async (message) => window.confirm(message),
    onError,
  });

  const memo = createMemo('cortico.panel.');

  let capabilities: Record<string, boolean> = {};
  /** capabilities 与 manifest 都到齐了吗。到齐之前不渲染任何一页。 */
  let ready = false;
  /** 到齐之前就 dispose 了:那一拍回来什么都不做。 */
  let disposed = false;

  /**
   * 左栏外壳。它自己不探活、不认识任何具体 World:框架页那段由 FEATURES 按
   * capability 过滤,贡献方那段完全由 manifest 驱动。普通模式只给它 BASIC_FEATURES、
   * 不给 manifest 的页;换模式时整个重建。
   */
  
  /** 普通模式左栏不列 manifest 的页(World、Persona、Memory)。 */
  const visiblePages = () => [];
  /** 普通模式只认那几页的路由。 */
  const reachable = (head: string | undefined): boolean =>
    BASIC_FEATURES.some((f) => f.route === head);

  const shellLife = new Lifecycle(onError);
  let shell!: ConsoleShell;
  let shellBuild: Lifecycle | null = null;
  const buildShell = (): void => {
    shellBuild?.dispose();
    const life = shellLife.own(new Lifecycle(onError));
    shellBuild = life;
    const ui = createConsoleUi({ memo, overlayHost: doc.body, signal: life.signal, doc });
    const next = createShell({ doc, ui, router, features: FEATURES, onError });
    const brand = next.el.querySelector('.brand');
    if (brand) {
      const mark = coopanionWordmark(doc);
      mark.removeAttribute('aria-hidden');
      mark.setAttribute('role', 'img');
      mark.setAttribute('aria-label', "鲸鲸鱼");
      brand.replaceChildren(mark);
      mountRelease(doc, brand, life.signal);
    }
    shell = next;
    life.own({ dispose: () => { next.dispose(); next.el.remove(); } });
    doc.body.insertBefore(next.el, doc.body.firstChild);
    doc.body.classList.add('companion-normal');
    if (ready) {
      next.setCapabilities(capabilities);
      next.setPages(visiblePages());
    }
    next.setRoute(router.route);
  };
  buildShell();

  /**
   * 状态灯的活数据。manifest 只在开页与显式刷新时取，而灯要跟得上"引擎起来了没"，
   * 所以走那条只回灯的轻端点（节拍与不叠发都归 `subscribeLamps`）。
   */
  shellLife.own(subscribeLamps(doc, (lamps) => shell.setLamps(lamps)));

  /** 当前挂着的 framework feature（贡献方那边由 host 自己管）。 */
  let mounted: { route: string; lifecycle: Lifecycle } | null = null;
  let generation = 0;

  const unmountFeature = (): void => {
    const cur = mounted;
    mounted = null;
    generation++;
    if (cur) cur.lifecycle.dispose();
    featureRoot.replaceChildren();
  };

  const findFeature = (name: string | undefined): FrameworkFeature | undefined =>
    name === undefined ? undefined : FEATURES.find((f) => f.route === name);

  const mountFeature = (feature: FrameworkFeature, route: Route): void => {
    unmountFeature();
    const gen = generation;
    const lifecycle = new Lifecycle(onError);
    mounted = { route: feature.route, lifecycle };

    const slot = doc.createElement('div');
    slot.className = `featureslot featureslot-${feature.route}`;
    featureRoot.appendChild(slot);

    const ui = createConsoleUi({ memo, overlayHost: doc.body, signal: lifecycle.signal, doc });
    void (async () => {
      try {
        const out = await feature.mount({
          root: slot, lifecycle, signal: lifecycle.signal, ui, router, route,
          capabilities, onError,

        });
        if (gen !== generation) {
          if (out && typeof out.dispose === 'function') out.dispose();
          return;
        }
        if (out && typeof out.dispose === 'function') lifecycle.own(out);
      } catch (err) {
        if (gen !== generation) return;
        onError(err);
        lifecycle.dispose();
        slot.replaceChildren();
        const card = ui.sheet({ title: featureLoadFailed(feature.label), en: 'feature error' });
        card.body.appendChild(ui.msgline(err instanceof Error ? err.message : String(err), true));
        slot.appendChild(card.el);
      }
    })();
  };

  const apply = (route: Route): void => {
    shell.setRoute(route);
    // 页面加载依赖完整的 capabilities；就绪后重新应用当前路由。
    if (!ready) return;
    // 空路由替换为「开始」，不增加历史条目。
    if (route.segments.length === 0) {
      router.replace(['pet']);
      return;
    }
    const head = route.segments[0];

    if (!reachable(head)) {
      router.replace(['pet']);
      return;
    }
    const feature = findFeature(head);
    if (feature && featureAvailable(feature, capabilities)) {
      // 同一个 feature 内部换子页签(segments[1] 变)由它自己处理，不重挂。
      if (mounted?.route === feature.route) return;
      mountFeature(feature, route);
      return;
    }

    // 没人认领:清空台面。左栏仍在,导航照常可用。
    unmountFeature();
  };

  const offRoute = router.onChange(apply);
  const stopRouter = router.start();

  // capabilities 与 manifest 就绪后按当前路由渲染。
  void Promise.allSettled([
    get<{ capabilities?: Record<string, boolean> }>('/api/capabilities')
      .then((r) => { capabilities = r?.capabilities ?? {}; }),
  ]).then(() => {
    if (disposed) return;
    ready = true;
    shell.setCapabilities(capabilities);
    shell.setPages(visiblePages());
    apply(router.route);
  });

  return {
    dispose(): void {
      disposed = true;
      shellLife.dispose();
      offRoute.dispose();
      stopRouter.dispose();
      unmountFeature();
    },
  };
}

// 作为 bundle 入口被加载时自动启动:真页面带着 boot-note。测试 import 时没有它,不自动跑。
if (typeof document !== 'undefined' && document.getElementById('boot-note')) {
  boot();
}
