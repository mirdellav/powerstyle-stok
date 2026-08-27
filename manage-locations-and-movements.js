(() => {
  let editingId = null;
  const baseAll = all;

  function refresh() {
    baseAll();
    decorateReports();
    decorateMovements();
  }

  function renameLocation(index) {
    const [id, current] = L[index];
    if (id === 'main') return alert('Ana Depo adı bu sürümde sabittir.');
    const name = prompt('Yeni araç adı:', current)?.trim();
    if (!name || name === current) return;
    if (L.some(([otherId, otherName]) => otherId !== id && otherName.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) {
      return alert('Bu isimde başka bir konum var.');
    }
    data.locations.find(item => item.id === id).name = name;
    L = data.locations.map(item => [item.id, item.name]);
    save();
    refresh();
    switchView('reports');
  }

  function decorateReports() {
    const table = document.querySelector('#reports table');
    if (!table) return;
    const header = table.querySelector('thead tr');
    if (!header.querySelector('.location-action')) {
      const cell = document.createElement('th');
      cell.className = 'location-action';
      cell.textContent = 'İşlem';
      header.append(cell);
    }
    [...table.querySelectorAll('tbody tr')].slice(0, L.length).forEach((row, index) => {
      const cell = document.createElement('td');
      const button = document.createElement('button');
      button.className = 'icon-button';
      button.textContent = L[index][0] === 'main' ? 'Sabit' : 'Adı değiştir';
      button.disabled = L[index][0] === 'main';
      button.onclick = () => renameLocation(index);
      cell.append(button);
      row.append(cell);
    });
  }

  function fillMovement(movement) {
    editingId = movement.id;
    openMove();
    document.querySelector('#movementType').value = movement.type;
    document.querySelector('#movementProduct').value = movement.productId;
    document.querySelector('#fromLocation').value = movement.from || 'main';
    document.querySelector('#toLocation').value = movement.to || 'main';
    document.querySelector('#movementQuantity').value = movement.quantity;
    document.querySelector('#movementDate').value = movement.date;
    document.querySelector('#movementNote').value = movement.note || '';
    document.querySelector('#movementType').dispatchEvent(new Event('change'));
    document.querySelector('#movementForm .primary').textContent = 'Hareketi Güncelle';
  }

  function decorateMovements() {
    const rows = [...document.querySelectorAll('#movements tbody tr')];
    const history = [...data.movements].reverse();
    rows.slice(0, history.length).forEach((row, index) => {
      const cell = document.createElement('td');
      const button = document.createElement('button');
      button.className = 'icon-button';
      button.textContent = 'Düzenle';
      button.onclick = () => fillMovement(history[index]);
      cell.append(button);
      row.append(cell);
    });
    const header = document.querySelector('#movements thead tr');
    if (header && !header.querySelector('.movement-action')) {
      const cell = document.createElement('th');
      cell.className = 'movement-action';
      cell.textContent = 'İşlem';
      header.append(cell);
    }
  }

  document.querySelector('#movementForm').onsubmit = event => {
    event.preventDefault();
    const type = document.querySelector('#movementType').value;
    const item = P(document.querySelector('#movementProduct').value);
    const quantity = +document.querySelector('#movementQuantity').value;
    const from = type === 'in' ? null : document.querySelector('#fromLocation').value;
    const to = type === 'out' ? null : document.querySelector('#toLocation').value;
    if (type === 'transfer' && from === to) return alert('Kaynak ve hedef farklı olmalı.');
    const old = editingId ? data.movements.find(m => m.id === editingId) : null;
    if (old) data.movements = data.movements.filter(m => m.id !== editingId);
    if (from && quantity > S(item, from)) {
      if (old) data.movements.push(old);
      return alert('Kaynak konumda yeterli stok yok.');
    }
    const movement = { id: editingId || crypto.randomUUID(), productId: item.id, type, from, to, quantity, date: document.querySelector('#movementDate').value, note: document.querySelector('#movementNote').value, createdAt: old?.createdAt || new Date().toISOString() };
    data.movements.push(movement);
    editingId = null;
    save();
    document.querySelector('#movementDialog').close();
    refresh();
  };

  all = refresh;
  refresh();
})();
