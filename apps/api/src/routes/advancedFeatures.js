import { getItemModifierGroups, processReturn, getTodaysReturns, getTables, updateTableOccupancy, getTokenForReturn, } from './handlers/advancedFeaturesHandler.js';
export async function advancedFeaturesRoutes(app) {
    // Modifier Groups
    app.get('/menu-items/:menuItemId/modifier-groups', getItemModifierGroups);
    // Returns
    app.post('/bakery-tokens/returns', processReturn);
    app.get('/bakery-tokens/:tokenNumber', getTokenForReturn);
    app.get('/returns/today', getTodaysReturns);
    // Tables
    app.get('/tables', getTables);
    app.patch('/tables/:tableId/occupancy', updateTableOccupancy);
}
