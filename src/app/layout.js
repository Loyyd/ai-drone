export function setupLayoutInteractions({
  appShell,
  clamp,
  state,
  ui,
  viewport
}) {
  function applyHudPosition() {
    if (window.innerWidth <= 640) {
      ui.hudCard.style.left = "";
      ui.hudCard.style.top = "";
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const hudRect = ui.hudCard.getBoundingClientRect();
    const maxLeft = Math.max(12, viewportRect.width - hudRect.width - 12);
    const maxTop = Math.max(12, viewportRect.height - hudRect.height - 12);

    state.hudPosition.left = clamp(state.hudPosition.left, 12, maxLeft);
    state.hudPosition.top = clamp(state.hudPosition.top, 12, maxTop);

    ui.hudCard.style.left = `${state.hudPosition.left}px`;
    ui.hudCard.style.top = `${state.hudPosition.top}px`;
  }

  function applyPanelWidth() {
    if (window.innerWidth <= 980) {
      appShell.style.removeProperty("--panel-width");
      return;
    }

    const maxWidth = Math.min(560, Math.max(260, window.innerWidth - 280));
    state.panelWidth = clamp(state.panelWidth, 260, maxWidth);
    appShell.style.setProperty("--panel-width", `${state.panelWidth}px`);
  }

  ui.hudDragHandle.addEventListener("pointerdown", (event) => {
    if (window.innerWidth <= 640) {
      return;
    }

    state.hudDragging = true;
    state.hudDragPointerId = event.pointerId;
    ui.hudDragHandle.setPointerCapture(event.pointerId);

    const hudRect = ui.hudCard.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    state.hudDragOffset.x = event.clientX - hudRect.left;
    state.hudDragOffset.y = event.clientY - hudRect.top;
    state.hudPosition.left = hudRect.left - viewportRect.left;
    state.hudPosition.top = hudRect.top - viewportRect.top;
    ui.hudCard.classList.add("dragging");
  });

  ui.hudDragHandle.addEventListener("pointermove", (event) => {
    if (!state.hudDragging || event.pointerId !== state.hudDragPointerId) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    state.hudPosition.left =
      event.clientX - viewportRect.left - state.hudDragOffset.x;
    state.hudPosition.top =
      event.clientY - viewportRect.top - state.hudDragOffset.y;
    applyHudPosition();
  });

  function stopHudDragging(event) {
    if (!state.hudDragging || event.pointerId !== state.hudDragPointerId) {
      return;
    }

    state.hudDragging = false;
    ui.hudCard.classList.remove("dragging");

    if (ui.hudDragHandle.hasPointerCapture(event.pointerId)) {
      ui.hudDragHandle.releasePointerCapture(event.pointerId);
    }

    state.hudDragPointerId = null;
  }

  ui.hudDragHandle.addEventListener("pointerup", stopHudDragging);
  ui.hudDragHandle.addEventListener("pointercancel", stopHudDragging);

  ui.panelResizer.addEventListener("pointerdown", (event) => {
    if (window.innerWidth <= 980) {
      return;
    }

    state.panelResizing = true;
    state.panelResizePointerId = event.pointerId;
    ui.panelResizer.setPointerCapture(event.pointerId);
    ui.panelResizer.classList.add("is-resizing");
  });

  ui.panelResizer.addEventListener("pointermove", (event) => {
    if (!state.panelResizing || event.pointerId !== state.panelResizePointerId) {
      return;
    }

    state.panelWidth = window.innerWidth - event.clientX;
    applyPanelWidth();
  });

  function stopPanelResizing(event) {
    if (!state.panelResizing || event.pointerId !== state.panelResizePointerId) {
      return;
    }

    state.panelResizing = false;
    ui.panelResizer.classList.remove("is-resizing");

    if (ui.panelResizer.hasPointerCapture(event.pointerId)) {
      ui.panelResizer.releasePointerCapture(event.pointerId);
    }

    state.panelResizePointerId = null;
  }

  ui.panelResizer.addEventListener("pointerup", stopPanelResizing);
  ui.panelResizer.addEventListener("pointercancel", stopPanelResizing);

  return {
    applyHudPosition,
    applyPanelWidth
  };
}
