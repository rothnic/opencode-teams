import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { TmuxOperations } from '../src/operations/tmux';

const hasTmux = TmuxOperations.isTmuxInstalled();

describe('TmuxOperations Extensions', () => {
  describe('isInsideTmux', () => {
    it('returns a boolean', () => {
      const result = TmuxOperations.isInsideTmux();
      expect(typeof result).toBe('boolean');
    });

    it('returns true when TMUX env var is set', () => {
      const saved = process.env.TMUX;
      process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
      try {
        expect(TmuxOperations.isInsideTmux()).toBe(true);
      } finally {
        if (saved !== undefined) {
          process.env.TMUX = saved;
        } else {
          delete process.env.TMUX;
        }
      }
    });

    it('returns false when TMUX env var is not set', () => {
      const saved = process.env.TMUX;
      delete process.env.TMUX;
      try {
        expect(TmuxOperations.isInsideTmux()).toBe(false);
      } finally {
        if (saved !== undefined) {
          process.env.TMUX = saved;
        }
      }
    });
  });

  describe.skipIf(!hasTmux)('splitWindow', () => {
    const testSession = `oc-test-wp04-${Date.now()}`;

    beforeAll(() => {
      TmuxOperations.startSession(testSession);
    });

    afterAll(() => {
      TmuxOperations.stopSession(testSession);
    });

    it('returns a pane ID string matching %<digits>', () => {
      const paneId = TmuxOperations.splitWindow(testSession);
      expect(paneId).not.toBeNull();
      expect(paneId!).toMatch(/^%\d+$/);
    });

    it('returns null for non-existent session', () => {
      const paneId = TmuxOperations.splitWindow('nonexistent-session-xyz');
      expect(paneId).toBeNull();
    });
  });

  describe.skipIf(!hasTmux)('sendKeys', () => {
    const testSession = `oc-test-wp04-sk-${Date.now()}`;
    let paneId: string;

    beforeAll(() => {
      TmuxOperations.startSession(testSession);
      const id = TmuxOperations.splitWindow(testSession);
      if (!id) throw new Error('Failed to create pane');
      paneId = id;
    });

    afterAll(() => {
      TmuxOperations.stopSession(testSession);
    });

    it('sends keys successfully', () => {
      const result = TmuxOperations.sendKeys(paneId, 'echo hello');
      expect(result).toBe(true);
    });

    it('can send keys without Enter', () => {
      const result = TmuxOperations.sendKeys(paneId, 'partial', false);
      expect(result).toBe(true);
    });
  });

  describe.skipIf(!hasTmux)('capturePaneOutput', () => {
    const testSession = `oc-test-wp04-cap-${Date.now()}`;
    let paneId: string;

    beforeAll(() => {
      TmuxOperations.startSession(testSession);
      const id = TmuxOperations.splitWindow(testSession);
      if (!id) throw new Error('Failed to create pane');
      paneId = id;
    });

    afterAll(() => {
      TmuxOperations.stopSession(testSession);
    });

    it('captures pane output as string', () => {
      const output = TmuxOperations.capturePaneOutput(paneId);
      expect(output).not.toBeNull();
      expect(typeof output).toBe('string');
    });

    it('returns null for invalid pane', () => {
      const output = TmuxOperations.capturePaneOutput('%99999');
      expect(output).toBeNull();
    });
  });

  describe.skipIf(!hasTmux)('pane options', () => {
    const testSession = `oc-test-wp04-opt-${Date.now()}`;
    let paneId: string;

    beforeAll(() => {
      TmuxOperations.startSession(testSession);
      const id = TmuxOperations.splitWindow(testSession);
      if (!id) throw new Error('Failed to create pane');
      paneId = id;
    });

    afterAll(() => {
      TmuxOperations.stopSession(testSession);
    });

    it('sets and gets a pane option round-trip', () => {
      const set = TmuxOperations.setPaneOption(paneId, '@test_key', 'test_value');
      expect(set).toBe(true);

      const val = TmuxOperations.getPaneOption(paneId, '@test_key');
      expect(val).toBe('test_value');
    });

    it('returns null for unset option', () => {
      const val = TmuxOperations.getPaneOption(paneId, '@nonexistent_key');
      expect(val).toBeNull();
    });
  });

  describe.skipIf(!hasTmux)('killPane', () => {
    const testSession = `oc-test-wp04-kill-${Date.now()}`;

    beforeAll(() => {
      TmuxOperations.startSession(testSession);
    });

    afterAll(() => {
      try {
        TmuxOperations.stopSession(testSession);
      } catch {
        // Session may have been destroyed when last pane was killed
      }
    });

    it('kills a pane successfully', () => {
      const paneId = TmuxOperations.splitWindow(testSession);
      expect(paneId).not.toBeNull();

      const killed = TmuxOperations.killPane(paneId!);
      expect(killed).toBe(true);
    });
  });

  describe.skipIf(!hasTmux)('setPaneTitle', () => {
    const testSession = `oc-test-wp04-title-${Date.now()}`;
    let paneId: string;

    beforeAll(() => {
      TmuxOperations.startSession(testSession);
      const id = TmuxOperations.splitWindow(testSession);
      if (!id) throw new Error('Failed to create pane');
      paneId = id;
    });

    afterAll(() => {
      TmuxOperations.stopSession(testSession);
    });

    it('sets pane title successfully', () => {
      const result = TmuxOperations.setPaneTitle(paneId, 'my-custom-title');
      expect(result).toBe(true);
    });
  });
});
