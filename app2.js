let data;
let L = [['main', 'Ana Depo'], ['v1', 'Araç 1'], ['v2', 'Araç 2'], ['v3', 'Araç 3']];

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

const P = id => data.products.find(p => p.id === id);
const N = id => L.find(x => x[0] === id)?.[1] || '';
const S = (p, l) => +(p.openingByLocation?.[l] || 0) + data.movements.filter(m => m.productId === p.id).reduce((a, m) => a + (m.to === l ? +m.quantity : 0) - (m.from === l ? +m.quantity : 0), 0);
const T = p => L.reduce((a, l) => a + S(p, l[0]), 0);
const M = n => '£' + (+n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Supabase'den Veri Yükleme
async function initData() {
    try {
        $('#saveStatus').textContent = 'Veriler buluttan yükleniyor...';
        
        // Supabase 'stok_data' tablosundan 1 id'li kaydı getir
        let { data: dbData, error } = await _supabase
            .from('stok_data')
            .select('payload')
            .eq('id', 1)
            .single();

        if (dbData && dbData.payload) {
            data = dbData.payload;
        } else {
            // Veritabanında veri yoksa SEED_DATA veya yerel hafızayı yedek olarak al
            data = JSON.parse(localStorage.getItem('powerstyleStokData')) || structuredClone(window.SEED_DATA);
        }
    } catch (err) {
        console.error('Yükleme hatası:', err);
        data ??= structuredClone(window.SEED_DATA);
    }

    data.locations ??= L.map(([id, name]) => ({ id, name }));
    L = data.locations.map(x => [x.id, x.name]);
    data.products.forEach(p => {
        p.openingByLocation ??= { main: +p.openingStock || 0 };
        delete p.openingStock;
    });
    data.movements.forEach(m => {
        if (m.type === 'in' && !m.to) m.to = 'main';
        if (m.type === 'out' && !m.from) m.from = 'main';
    });

    $('#saveStatus').textContent = 'Bulut Bağlantısı Aktif';
    all(); // Veriler geldikten sonra tüm ekranları çizdir
}

// Supabase'e Veri Kaydetme
async function save() {
    $('#saveStatus').textContent = 'Kaydediliyor...';
    
    // Yerel kopyayı da güncelle
    localStorage.setItem('powerstyleStokData', JSON.stringify(data));

    // Supabase'e bulut kaydı gönder
    const { error } = await _supabase
        .from('stok_data')
        .upsert({ id: 1, payload: data });

    if (error) {
        console.error('Kaydetme hatası:', error);
        $('#saveStatus').textContent = 'Hata: Buluta kaydedilemedi!';
    } else {
        $('#saveStatus').textContent = 'Tüm değişiklikler buluta kaydedildi';
    }
}

function totals() {
    let u = 0, c = 0, s = 0;
    data.products.forEach(p => {
        u += T(p);
        c += T(p) * p.cost;
        s += T(p) * p.price;
    });
    return [u, c, s];
}

function cards() {
    return L.map(l => {
        let u = data.products.reduce((a, p) => a + S(p, l[0]), 0),
            c = data.products.reduce((a, p) => a + S(p, l[0]) * p.cost, 0);
        return `<div class="metric"><p>${l[1].toUpperCase()}</p><strong>${u}</strong><em>${M(c)} stok maliyeti</em></div>`;
    }).join('');
}

function dash() {
    let [u, c, s] = totals(),
        low = data.products.filter(p => T(p) <= p.minStock).slice(0, 8);
    $('#dashboard').innerHTML = `<div class="metrics"><div class="metric"><p>TOPLAM STOK</p><strong>${u}</strong><em>Tüm bölümler</em></div><div class="metric"><p>TOPLAM MALİYET</p><strong>${M(c)}</strong><em>Tüm bölümler</em></div><div class="metric"><p>BEKLENEN SATIŞ</p><strong>${M(s)}</strong><em>Tanımlı fiyatlar</em></div><div class="metric"><p>BRÜT KÂR</p><strong>${M(s - c)}</strong><em>Toplam tüm stok</em></div></div><h3 style="margin:0 0 12px">Konum bazlı stok özeti</h3><div class="metrics">${cards()}</div><div class="card"><div class="card-head"><div><h3>Kritik toplam stok</h3><p>Tüm konumlardaki toplam hedefin altında kalan ürünler</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Ürün</th><th>Toplam</th><th>Ana Depo</th><th>Araç 1</th><th>Araç 2</th><th>Araç 3</th></tr></thead><tbody>${low.map(p => `<tr><td><strong>${E(p.name)}</strong><span class="sub">${E(p.sku)}</span></td><td>${T(p)}</td>${L.map(l => `<td>${S(p, l[0])}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="6" class="empty">Kritik stok yok.</td></tr>'}</tbody></table></div></div>`;
}

function inventory() {
    let options = L.map(l => `<option value="${l[0]}">${l[1]}</option>`).join('');
    $('#inventory').innerHTML = `<div class="card"><div class="toolbar"><input id="q" placeholder="Ürün, SKU veya kategori ara"><div><select id="loc"><option value="all">Tüm konumlar</option>${options}</select> <button class="primary" id="add">+ Yeni ürün</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Ürün</th><th id="lh">Toplam stok</th><th>Ana Depo</th><th>Araç 1</th><th>Araç 2</th><th>Araç 3</th><th>Maliyet</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
    
    let render = () => {
        let q = $('#q').value.toLowerCase(), l = $('#loc').value;
        $('#lh').textContent = l === 'all' ? 'Toplam stok' : N(l);
        $('#rows').innerHTML = data.products.filter(p => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q)).map(p => `<tr><td><strong>${E(p.name)}</strong><span class="sub">${E(p.sku)} · ${E(p.category)}</span></td><td><strong>${l === 'all' ? T(p) : S(p, l)}</strong></td>${L.map(x => `<td>${S(p, x[0])}</td>`).join('')}<td>${M(p.cost)}</td><td><button class="icon-button edit" data-id="${p.id}">Düzenle</button></td></tr>`).join('');
    };
    
    $('#q').oninput = render;
    $('#loc').onchange = render;
    $('#add').onclick = () => openProduct();
    $('#rows').onclick = e => e.target.dataset.id && openProduct(P(e.target.dataset.id));
    render();
}

function movements() {
    let r = [...data.movements].reverse();
    $('#movements').innerHTML = `<div class="card"><div class="toolbar"><div><h3>Stok hareketleri</h3><p>Giriş, çıkış ve araç/depo transferleri</p></div><button class="primary" id="move">+ Stok hareketi</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Tarih</th><th>Ürün</th><th>Tür</th><th>Rota</th><th>Adet</th></tr></thead><tbody>${r.map(m => `<tr><td>${m.date}</td><td>${E(P(m.productId)?.name)}</td><td>${m.type === 'transfer' ? 'Transfer' : m.type === 'in' ? 'Giriş' : 'Çıkış'}</td><td>${m.type === 'transfer' ? N(m.from) + ' → ' + N(m.to) : N(m.from || m.to)}</td><td>${m.quantity}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Henüz hareket yok.</td></tr>'}</tbody></table></div></div>`;
    $('#move').onclick = openMove;
}

function reports() {
    let [u, c, s] = totals();
    $('#reports').innerHTML = `<div class="card"><div class="card-head"><div><h3>Tüm bölümlerin toplam stok, maliyet ve satış özeti</h3><p>Ana Depo ile üç aracın tamamı</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Konum</th><th>Stok</th><th>Stok maliyeti</th><th>Satış değeri</th><th>Brüt kâr</th></tr></thead><tbody>${L.map(l => {
        let u = data.products.reduce((a, p) => a + S(p, l[0]), 0),
            c = data.products.reduce((a, p) => a + S(p, l[0]) * p.cost, 0),
            s = data.products.reduce((a, p) => a + S(p, l[0]) * p.price, 0);
        return `<tr><td><strong>${l[1]}</strong></td><td>${u}</td><td>${M(c)}</td><td>${M(s)}</td><td class="positive">${M(s - c)}</td></tr>`;
    }).join('')}<tr><td><strong>TOPLAM</strong></td><td><strong>${u}</strong></td><td><strong>${M(c)}</strong></td><td><strong>${M(s)}</strong></td><td class="positive"><strong>${M(s - c)}</strong></td></tr></tbody></table></div></div>`;
}

function all() {
    if (!data) return;
    dash();
    inventory();
    movements();
    reports();
}

function opts(x) {
    return L.map(l => `<option value="${l[0]}" ${l[0] === x ? 'selected' : ''}>${l[1]}</option>`).join('');
}

function openMove() {
    $('#movementProduct').innerHTML = data.products.map(p => `<option value="${p.id}">${E(p.name)} · Toplam ${T(p)}</option>`).join('');
    $('#fromLocation').innerHTML = opts('main');
    $('#toLocation').innerHTML = opts('v1');
    $('#movementDate').value = new Date().toISOString().slice(0, 10);
    let layout = () => {
        let t = $('#movementType').value;
        $('#fromLocationWrap').style.display = t === 'in' ? 'none' : 'grid';
        $('#toLocationWrap').style.display = t === 'out' ? 'none' : 'grid';
    };
    $('#movementType').onchange = layout;
    layout();
    $('#movementDialog').showModal();
}

function openProduct(p) {
    $('#productForm').reset();
    ['productId', 'sku', 'category', 'cost', 'price', 'minStock'].forEach(id => $('#' + id).value = p?.[id === 'productId' ? 'id' : id] ?? '');
    $('#productName').value = p?.name ?? '';
    $('#openingStock').value = p ? S(p, 'main') : 0;
    $('#productDialog').showModal();
}

function switchView(v) {
    $$('.nav-button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    $$('.view').forEach(x => x.classList.toggle('active', x.id === v));
    $('#pageTitle').textContent = { dashboard: 'Genel Bakış', inventory: 'Ürünler', movements: 'Stok Hareketleri', reports: 'Raporlar' }[v];
}

async function init() {
    await initData();
    if (data?.settings?.companyName) $('#companyName').textContent = data.settings.companyName;
    $('#dateLabel').textContent = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full' }).format(new Date());
    
    $$('.nav-button').forEach(b => b.onclick = () => switchView(b.dataset.view));
    $$('.close').forEach(b => b.onclick = () => b.closest('dialog').close());
    $('#quickMovement').onclick = openMove;
    $('#exportBtn').onclick = () => alert('Raporlar ekranındaki toplamlar tüm konumları içerir.');
    
    $('#movementForm').onsubmit = async e => {
        e.preventDefault();
        let type = $('#movementType').value,
            p = P($('#movementProduct').value),
            q = +$('#movementQuantity').value,
            from = type === 'in' ? null : $('#fromLocation').value,
            to = type === 'out' ? null : $('#toLocation').value;
            
        if (from && q > S(p, from)) return alert('Kaynak konumda yeterli stok yok.');
        if (type === 'transfer' && from === to) return alert('Kaynak ve hedef farklı olmalı.');
        
        data.movements.push({ id: crypto.randomUUID(), productId: p.id, type, from, to, quantity: q, date: $('#movementDate').value, note: $('#movementNote').value, createdAt: new Date().toISOString() });
        await save();
        $('#movementDialog').close();
        all();
    };

    $('#productForm').onsubmit = async e => {
        e.preventDefault();
        let id = $('#productId').value,
            p = { id: id || crypto.randomUUID(), sku: $('#sku').value, name: $('#productName').value, category: $('#category').value, cost: +$('#cost').value, price: +$('#price').value, minStock: +$('#minStock').value, openingByLocation: { main: +$('#openingStock').value } };
            
        if (id) {
            let old = P(id);
            p.openingByLocation = { ...old.openingByLocation, main: +$('#openingStock').value };
            Object.assign(old, p);
        } else {
            data.products.push(p);
        }
        
        await save();
        $('#productDialog').close();
        all();
    };
}

init();