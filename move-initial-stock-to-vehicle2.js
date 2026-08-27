(() => {
  data.migrations ??= {};
  if (data.migrations.initialStockMovedToVehicle2) return;

  data.products.forEach(product => {
    product.openingByLocation ??= {};
    const amount = Number(product.openingByLocation.main || 0);
    product.openingByLocation.v2 = Number(product.openingByLocation.v2 || 0) + amount;
    product.openingByLocation.main = 0;
  });

  data.migrations.initialStockMovedToVehicle2 = true;
  save();
  all();
})();
