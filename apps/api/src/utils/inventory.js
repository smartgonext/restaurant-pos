export async function applyKOTConsumption(kotId, prismaClient) {
    const kot = await prismaClient.kOT.findUnique({
        where: { id: kotId },
        include: {
            items: {
                include: {
                    menuItem: { include: { recipeIngredients: { include: { inventoryItem: true } } } }
                }
            }
        }
    });
    if (!kot)
        return;
    const requirements = {};
    for (const ki of kot.items || []) {
        const qty = Number(ki.quantity || 0);
        const recipe = ki.menuItem?.recipeIngredients || [];
        for (const ri of recipe) {
            const need = Number(ri.quantity || 0) * qty;
            if (!requirements[ri.inventoryItemId])
                requirements[ri.inventoryItemId] = 0;
            requirements[ri.inventoryItemId] += need;
        }
    }
    const ops = [];
    for (const [itemIdStr, qty] of Object.entries(requirements)) {
        const itemId = Number(itemIdStr);
        if (!itemId || qty === 0)
            continue;
        ops.push(prismaClient.inventoryMovement.create({ data: { restaurantId: kot.restaurantId, itemId, type: 'consumption', quantity: qty, referenceId: kotId } }));
        ops.push(prismaClient.inventoryItem.update({ where: { id: itemId }, data: { currentStock: { decrement: qty } } }));
    }
    if (ops.length > 0) {
        await prismaClient.$transaction(ops);
    }
}
export default { applyKOTConsumption };
