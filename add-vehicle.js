(() => {
  const button = document.querySelector('#exportBtn');
  button.textContent = '+ Araç Ekle';
  button.onclick = () => {
    const name = prompt('Yeni aracın adı:', `Araç ${L.length}`)?.trim();
    if (!name) return;
    if (L.some(item => item[1].toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) {
      alert('Bu isimde bir konum zaten var.');
      return;
    }
    const id = 'vehicle-' + Date.now();
    data.locations.push({ id, name });
    L = data.locations.map(item => [item.id, item.name]);
    save();
    all();
    switchView('reports');
  };
})();
