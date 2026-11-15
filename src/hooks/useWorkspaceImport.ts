import { useCallback, useRef, useState } from 'react';
import { useBrightspace } from '../brightspace/useBrightspace';
import type { Course, SelectedMaterial } from '../brightspace/brightspaceContext';
import {
  createWorkspace, finishImport, newWorkspaceId, pendingItem, saveImportedItem, type WorkspaceItem,
} from '../services/workspaceService';

export type ImportRun =
  | { phase: 'idle' }
  | { phase: 'running' | 'done'; workspaceId: string; items: WorkspaceItem[]; currentIndex: number | null; error: string | null }
  | { phase: 'failed'; error: string };

function workspaceTitle(course: Course, items: SelectedMaterial[]): string {
  const label = course.code ?? course.name;
  const what = items.length === 1 ? items[0].title : `${items.length} materials`;
  return `${label} · ${what}`.slice(0, 200);
}

/**
 * Import selected materials into a new saved workspace. The workspace is
 * created first; each item's text and status are saved as soon as the
 * connector returns it, so a later failure never loses earlier imports.
 * Repeated clicks while a run is active are ignored.
 */
export function useWorkspaceImport() {
  const { importMaterials } = useBrightspace();
  const [run, setRun] = useState<ImportRun>({ phase: 'idle' });
  const active = useRef(false);

  const start = useCallback(async (course: Course, selected: SelectedMaterial[]) => {
    if (active.current || selected.length === 0) return;
    active.current = true;
    try {
      const id = newWorkspaceId();
      let items = selected.map((m, i) => pendingItem(i, m.key, m.title, m.moduleTitle, m.sourceType, m.url));
      // Disable the button immediately, before any network call.
      setRun({ phase: 'running', workspaceId: id, items, currentIndex: null, error: null });
      try {
        await createWorkspace(id, { title: workspaceTitle(course, selected), courseId: course.id, courseName: course.name, courseCode: course.code, items });
      } catch (e) {
        setRun({ phase: 'failed', error: `Couldn’t create the workspace in your TrojanMind history: ${e instanceof Error ? e.message : 'unknown error'}` });
        return;
      }
      setRun({ phase: 'running', workspaceId: id, items, currentIndex: 0, error: null });

      let fatal: string | null = null;
      await importMaterials(course.id, selected.map((m) => m.key), async (ev) => {
        if (ev.type === 'error') {
          fatal = ev.message;
          return;
        }
        if (ev.type !== 'item') return;
        const it = ev.item;
        // Only results for the items we asked for, at the position we asked.
        if (it.index < 0 || it.index >= items.length || items[it.index].key !== it.key) return;
        const merged: WorkspaceItem = {
          ...items[it.index],
          topicId: it.topicId, title: it.title, moduleTitle: it.moduleTitle, sourceType: it.sourceType, url: it.url,
          status: it.status, reason: it.reason, method: it.method, truncated: it.truncated, pages: it.pages,
        };
        items = items.slice();
        items[it.index] = merged;
        try {
          items = await saveImportedItem(id, items, it.index, it.text);
        } catch {
          items[it.index] = { ...merged, status: 'failed', reason: 'save_failed' };
        }
        const next = it.index + 1 < items.length ? it.index + 1 : null;
        setRun({ phase: 'running', workspaceId: id, items, currentIndex: next, error: null });
      });

      items = items.map((p) => (p.status === 'pending' ? { ...p, status: 'failed', reason: 'interrupted' } : p));
      try {
        await finishImport(id, items, fatal ? 'interrupted' : 'complete', fatal);
      } catch {
        fatal = fatal ?? 'Some results couldn’t be saved to your history.';
      }
      setRun({ phase: 'done', workspaceId: id, items, currentIndex: null, error: fatal });
    } finally {
      active.current = false;
    }
  }, [importMaterials]);

  return { run, start, busy: run.phase === 'running' };
}
