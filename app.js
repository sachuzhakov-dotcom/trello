const LABEL_COLORS = [
  { id: 'none', hex: null },
  { id: 'brass', hex: '#E2B33C' },
  { id: 'teal', hex: '#4C7A75' },
  { id: 'rose', hex: '#B8654F' },
  { id: 'slate', hex: '#5A6B8C' },
];

let state = { title: 'Доска задач', columns: [], cards: [] };
let editingCardId = null;
let selectedLabel = 'none';
let dragCardId = null;

// ---------- API helpers ----------

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Ошибка запроса' }));
    throw new Error(err.error || 'Ошибка запроса');
  }
  if (res.status === 204) return null;
  return res.json();
}

async function refresh() {
  state = await api('GET', '/api/state');
  render();
}

function setStatus(text, isError) {
  const el = document.getElementById('statusLine');
  el.textContent = text;
  el.style.color = isError ? '#B8654F' : '';
  clearTimeout(setStatus._t);
  setStatus._t = setTimeout(() => { el.textContent = ''; }, 1800);
}

async function withStatus(promise, okMsg) {
  try {
    const result = await promise;
    setStatus(okMsg || 'сохранено');
    return result;
  } catch (e) {
    setStatus(e.message || 'ошибка сохранения', true);
    throw e;
  }
}

// ---------- rendering ----------

function labelHex(id) {
  const l = LABEL_COLORS.find((l) => l.id === id);
  return l ? l.hex : null;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

function cardsForColumn(colId) {
  return state.cards.filter((c) => c.columnId === colId);
}

function render() {
  document.getElementById('boardTitle').value = state.title;
  const board = document.getElementById('board');
  board.innerHTML = '';

  state.columns.forEach((col) => {
    const colEl = document.createElement('div');
    colEl.className = 'column';
    colEl.dataset.colId = col.id;
    const cards = cardsForColumn(col.id);

    colEl.innerHTML = `
      <div class="folder-tab"></div>
      <div class="column-inner">
        <div class="column-header">
          <input class="col-name" value="${escapeHtml(col.name)}" data-col="${col.id}">
          <div class="col-actions">
            <span class="col-count">${cards.length}</span>
            <button class="icon-btn" data-del-col="${col.id}" title="Удалить колонку">✕</button>
          </div>
        </div>
        <div class="cards" data-col-drop="${col.id}"></div>
        <div class="add-card-row">
          <button class="add-card-btn" data-add-card="${col.id}">+ добавить карточку</button>
          <div class="add-card-form" data-form="${col.id}">
            <textarea placeholder="Что нужно сделать?" data-input="${col.id}"></textarea>
            <div class="form-row">
              <button class="btn-primary" data-confirm-add="${col.id}">Добавить</button>
              <button class="btn-ghost" data-cancel-add="${col.id}">Отмена</button>
            </div>
          </div>
        </div>
      </div>
    `;
    board.appendChild(colEl);

    const cardsWrap = colEl.querySelector('.cards');
    if (cards.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = 'Пусто. Перетащите сюда карточку или добавьте новую.';
      cardsWrap.appendChild(hint);
    }
    cards.forEach((card) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'card';
      cardEl.draggable = true;
      cardEl.dataset.cardId = card.id;
      cardEl.dataset.colId = col.id;
      const hex = labelHex(card.label);
      cardEl.innerHTML = `
        ${hex ? `<div class="card-label" style="background:${hex}"></div>` : ''}
        <p class="card-title">${escapeHtml(card.title)}</p>
        ${card.desc ? `<p class="card-desc">${escapeHtml(card.desc)}</p>` : ''}
      `;
      cardsWrap.appendChild(cardEl);
    });
  });

  const addColWrap = document.createElement('div');
  addColWrap.className = 'add-column-form';
  addColWrap.innerHTML = `<input type="text" id="newColInput" placeholder="+ добавить колонку">`;
  board.appendChild(addColWrap);

  attachEvents();
}

// ---------- events ----------

function attachEvents() {
  document.getElementById('boardTitle').addEventListener('change', async (e) => {
    const title = e.target.value.trim() || 'Доска задач';
    await withStatus(api('PATCH', '/api/title', { title }));
    state.title = title;
  });

  document.querySelectorAll('.col-name').forEach((inp) => {
    inp.addEventListener('change', async (e) => {
      const name = e.target.value.trim() || 'Без названия';
      await withStatus(api('PATCH', `/api/columns/${e.target.dataset.col}`, { name }));
      await refresh();
    });
  });

  document.querySelectorAll('[data-del-col]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.delCol;
      const col = state.columns.find((c) => c.id === id);
      const count = cardsForColumn(id).length;
      if (count > 0 && !confirm(`Удалить колонку «${col.name}» вместе с ${count} карточками?`)) return;
      await withStatus(api('DELETE', `/api/columns/${id}`), 'колонка удалена');
      await refresh();
    });
  });

  document.querySelectorAll('[data-add-card]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const colId = e.target.dataset.addCard;
      document.querySelector(`[data-form="${colId}"]`).classList.add('active');
      e.target.style.display = 'none';
      document.querySelector(`[data-form="${colId}"] textarea`).focus();
    });
  });
  document.querySelectorAll('[data-cancel-add]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const colId = e.target.dataset.cancelAdd;
      document.querySelector(`[data-form="${colId}"]`).classList.remove('active');
      document.querySelector(`[data-add-card="${colId}"]`).style.display = '';
    });
  });
  document.querySelectorAll('[data-confirm-add]').forEach((btn) => {
    btn.addEventListener('click', (e) => addCard(e.target.dataset.confirmAdd));
  });
  document.querySelectorAll('[data-input]').forEach((ta) => {
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addCard(e.target.dataset.input);
      }
    });
  });

  document.querySelectorAll('.card').forEach((cardEl) => {
    cardEl.addEventListener('click', () => openModal(cardEl.dataset.cardId));
  });

  const newColInput = document.getElementById('newColInput');
  if (newColInput) {
    newColInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && newColInput.value.trim()) {
        await withStatus(api('POST', '/api/columns', { name: newColInput.value.trim() }), 'колонка добавлена');
        await refresh();
      }
    });
  }

  setupDragAndDrop();
}

async function addCard(colId) {
  const ta = document.querySelector(`[data-input="${colId}"]`);
  const text = ta.value.trim();
  if (!text) return;
  await withStatus(api('POST', '/api/cards', { columnId: colId, title: text }), 'карточка добавлена');
  await refresh();
}

function setupDragAndDrop() {
  document.querySelectorAll('.card').forEach((cardEl) => {
    cardEl.addEventListener('dragstart', (e) => {
      dragCardId = cardEl.dataset.cardId;
      cardEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    cardEl.addEventListener('dragend', () => {
      cardEl.classList.remove('dragging');
      document.querySelectorAll('.cards').forEach((c) => c.classList.remove('drag-over'));
    });
  });

  document.querySelectorAll('.cards').forEach((dropZone) => {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const toColId = dropZone.dataset.colDrop;
      if (!dragCardId) return;
      await withStatus(api('POST', `/api/cards/${dragCardId}/move`, { columnId: toColId }), 'перемещено');
      dragCardId = null;
      await refresh();
    });
  });
}

// ---------- modal ----------

function openModal(cardId) {
  const card = state.cards.find((c) => c.id === cardId);
  editingCardId = cardId;
  selectedLabel = card.label || 'none';

  document.getElementById('editTitle').value = card.title;
  document.getElementById('editDesc').value = card.desc || '';

  const picker = document.getElementById('labelPicker');
  picker.innerHTML = '';
  LABEL_COLORS.forEach((l) => {
    const dot = document.createElement('div');
    dot.className = 'label-dot' + (l.id === selectedLabel ? ' selected' : '');
    dot.style.background = l.hex || 'repeating-linear-gradient(45deg,#ccc,#ccc 3px,#eee 3px,#eee 6px)';
    dot.title = l.id === 'none' ? 'Без метки' : l.id;
    dot.addEventListener('click', () => {
      selectedLabel = l.id;
      picker.querySelectorAll('.label-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
    picker.appendChild(dot);
  });

  document.getElementById('overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('overlay').classList.remove('active');
  editingCardId = null;
}

document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelEdit').addEventListener('click', closeModal);
document.getElementById('overlay').addEventListener('click', (e) => {
  if (e.target.id === 'overlay') closeModal();
});
document.getElementById('saveEdit').addEventListener('click', async () => {
  const title = document.getElementById('editTitle').value.trim();
  const desc = document.getElementById('editDesc').value.trim();
  await withStatus(api('PATCH', `/api/cards/${editingCardId}`, { title, desc, label: selectedLabel }));
  await refresh();
  closeModal();
});
document.getElementById('deleteCardBtn').addEventListener('click', async () => {
  await withStatus(api('DELETE', `/api/cards/${editingCardId}`), 'карточка удалена');
  await refresh();
  closeModal();
});

refresh().catch(() => setStatus('не удалось загрузить доску', true));
