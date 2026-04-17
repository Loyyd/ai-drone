export function setupLayoutInteractions({
  appShell,
  clamp,
  state,
  ui,
  viewport
}) {
  function cardsOverlap(firstCard, secondCard, gap = 12) {
    const firstRect = firstCard.getBoundingClientRect();
    const secondRect = secondCard.getBoundingClientRect();

    return !(
      firstRect.right + gap <= secondRect.left ||
      secondRect.right + gap <= firstRect.left ||
      firstRect.bottom + gap <= secondRect.top ||
      secondRect.bottom + gap <= firstRect.top
    );
  }

  function applyOverlayPosition(card, position) {
    const viewportRect = viewport.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const maxLeft = Math.max(12, viewportRect.width - cardRect.width - 12);
    const maxTop = Math.max(12, viewportRect.height - cardRect.height - 12);

    position.left = clamp(position.left, 12, maxLeft);
    position.top = clamp(position.top, 12, maxTop);

    card.style.left = `${position.left}px`;
    card.style.top = `${position.top}px`;
  }

  function applyHudPosition() {
    if (window.innerWidth <= 640) {
      ui.learningCard.style.left = "";
      ui.learningCard.style.top = "";
      ui.hudCard.style.left = "";
      ui.hudCard.style.top = "";
      return;
    }

    applyOverlayPosition(ui.learningCard, state.learningCardPosition);
    applyOverlayPosition(ui.hudCard, state.hudPosition);

    if (cardsOverlap(ui.learningCard, ui.hudCard)) {
      const learningRect = ui.learningCard.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      state.hudPosition.top =
        learningRect.bottom - viewportRect.top + 12;
      applyOverlayPosition(ui.hudCard, state.hudPosition);
    }
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

  function bindOverlayDrag({
    card,
    dragHandle,
    dragOffset,
    pointerIdKey,
    position,
    draggingKey
  }) {
    dragHandle.addEventListener("pointerdown", (event) => {
      if (window.innerWidth <= 640) {
        return;
      }

      state[draggingKey] = true;
      state[pointerIdKey] = event.pointerId;
      dragHandle.setPointerCapture(event.pointerId);

      const cardRect = card.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      dragOffset.x = event.clientX - cardRect.left;
      dragOffset.y = event.clientY - cardRect.top;
      position.left = cardRect.left - viewportRect.left;
      position.top = cardRect.top - viewportRect.top;
      card.classList.add("dragging");
    });

    dragHandle.addEventListener("pointermove", (event) => {
      if (!state[draggingKey] || event.pointerId !== state[pointerIdKey]) {
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      position.left = event.clientX - viewportRect.left - dragOffset.x;
      position.top = event.clientY - viewportRect.top - dragOffset.y;
      applyOverlayPosition(card, position);
    });

    function stopDragging(event) {
      if (!state[draggingKey] || event.pointerId !== state[pointerIdKey]) {
        return;
      }

      state[draggingKey] = false;
      card.classList.remove("dragging");

      if (dragHandle.hasPointerCapture(event.pointerId)) {
        dragHandle.releasePointerCapture(event.pointerId);
      }

      state[pointerIdKey] = null;
    }

    dragHandle.addEventListener("pointerup", stopDragging);
    dragHandle.addEventListener("pointercancel", stopDragging);
  }

  bindOverlayDrag({
    card: ui.learningCard,
    dragHandle: ui.learningCardDragHandle,
    dragOffset: state.learningCardDragOffset,
    pointerIdKey: "learningCardDragPointerId",
    position: state.learningCardPosition,
    draggingKey: "learningCardDragging"
  });

  bindOverlayDrag({
    card: ui.hudCard,
    dragHandle: ui.hudDragHandle,
    dragOffset: state.hudDragOffset,
    pointerIdKey: "hudDragPointerId",
    position: state.hudPosition,
    draggingKey: "hudDragging"
  });

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
