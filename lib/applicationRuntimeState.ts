type RuntimeSessionState = {
  activePass: boolean;
  stopped: boolean;
};

const runtimeStore = globalThis as typeof globalThis & {
  __applyPilotRuntimeStates?: Map<string, RuntimeSessionState>;
};

const states = runtimeStore.__applyPilotRuntimeStates ?? new Map<string, RuntimeSessionState>();
runtimeStore.__applyPilotRuntimeStates = states;

function getOrCreateState(sessionId: string): RuntimeSessionState {
  const existing = states.get(sessionId);
  if (existing) {
    return existing;
  }

  const next: RuntimeSessionState = {
    activePass: false,
    stopped: false
  };
  states.set(sessionId, next);
  return next;
}

export function beginApplicationRuntimePass(sessionId: string) {
  const state = getOrCreateState(sessionId);
  if (state.stopped) {
    return {
      allowed: false as const,
      reason: "stopped" as const
    };
  }

  if (state.activePass) {
    return {
      allowed: false as const,
      reason: "already_running" as const
    };
  }

  state.activePass = true;
  return {
    allowed: true as const
  };
}

export function completeApplicationRuntimePass(sessionId: string) {
  const state = getOrCreateState(sessionId);
  state.activePass = false;
}

export function stopApplicationRuntime(sessionId: string) {
  const state = getOrCreateState(sessionId);
  state.stopped = true;
  state.activePass = false;
}

export function resumeApplicationRuntime(sessionId: string) {
  const state = getOrCreateState(sessionId);
  state.stopped = false;
}

export function getApplicationRuntimeState(sessionId: string) {
  return { ...getOrCreateState(sessionId) };
}

export function resetApplicationRuntimeState(sessionId?: string) {
  if (sessionId) {
    states.delete(sessionId);
    return;
  }

  states.clear();
}
