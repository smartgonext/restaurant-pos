const round2 = (n) => Math.round(n * 100) / 100;
/**
 * Exclusive: base price does NOT include tax — tax is added on top.
 * Formula: GST Amount = (baseAmount × rate) / 100
 */
export function addGST(baseAmount, config) {
    if (config.isInterState) {
        const igst = round2(baseAmount * config.igstRate / 100);
        return {
            baseAmount,
            sgst: 0,
            cgst: 0,
            igst,
            totalTax: igst,
            totalWithTax: round2(baseAmount + igst),
        };
    }
    const sgst = round2(baseAmount * config.sgstRate / 100);
    const cgst = round2(baseAmount * config.cgstRate / 100);
    return {
        baseAmount,
        sgst,
        cgst,
        igst: 0,
        totalTax: round2(sgst + cgst),
        totalWithTax: round2(baseAmount + sgst + cgst),
    };
}
/**
 * Inclusive: total price already includes tax — extract base price.
 * Formula: Base Price = Total / (1 + rate/100)
 */
export function removeGST(totalAmount, config) {
    const rate = config.isInterState
        ? config.igstRate
        : config.sgstRate + config.cgstRate;
    const baseAmount = round2(totalAmount / (1 + rate / 100));
    const totalTax = round2(totalAmount - baseAmount);
    if (config.isInterState) {
        return { baseAmount, sgst: 0, cgst: 0, igst: totalTax, totalTax, totalWithTax: totalAmount };
    }
    const denominator = config.sgstRate + config.cgstRate;
    const sgst = denominator > 0 ? round2(totalTax * config.sgstRate / denominator) : 0;
    const cgst = round2(totalTax - sgst);
    return { baseAmount, sgst, cgst, igst: 0, totalTax, totalWithTax: totalAmount };
}
/**
 * Recalculate and persist BakeryToken totals based on active items + discount + settings.
 * Always called server-side — never trust client-sent totals.
 */
export async function recalculateTokenTotals(tokenId, prisma) {
    const token = await prisma.bakeryToken.findUnique({
        where: { id: tokenId },
        include: {
            items: { where: { isRemoved: false }, include: { menuItem: true } },
            restaurant: { include: { settings: true } },
        },
    });
    if (!token)
        return;
    const settings = token.restaurant.settings;
    const storeTaxRate = settings
      ? (Number(settings.sgstRate || 0) + Number(settings.cgstRate || 0) + Number(settings.igstRate || 0))
      : null;
    const subtotal = token.items.reduce((sum, i) => sum + Number(i.total), 0);
    const discount = Number(token.discountApplied) || 0;
    const taxConfig = {
        taxMode: settings?.taxMode ?? 'exclusive',
        sgstRate: Number(settings?.sgstRate ?? 0),
        cgstRate: Number(settings?.cgstRate ?? 0),
        igstRate: Number(settings?.igstRate ?? 0),
        isInterState: settings?.isInterState ?? false,
    };
    let baseAmount = 0;
    let totalTax = 0;
    let totalWithTax = 0;
    for (const item of token.items) {
        const gross = Number(item.total || 0);
        const rawRate = (storeTaxRate !== null && storeTaxRate !== undefined && storeTaxRate > 0)
          ? storeTaxRate
          : Number(item.menuItem?.taxPercent ?? 0);
        const rate = Number.isFinite(rawRate) ? Math.max(0, rawRate) : 0;
        const taxType = String(item.menuItem?.taxType || 'external').toLowerCase();
        if (taxType === 'internal') {
            const divisor = 1 + rate / 100;
            const lineBase = divisor > 0 ? round2(gross / divisor) : gross;
            const lineTax = round2(gross - lineBase);
            baseAmount += lineBase;
            totalTax += lineTax;
            totalWithTax += gross;
        }
        else {
            const lineTax = round2(gross * rate / 100);
            baseAmount += gross;
            totalTax += lineTax;
            totalWithTax += round2(gross + lineTax);
        }
    }
    let adjustedBase = round2(baseAmount);
    let adjustedTax = round2(totalTax);
    let adjustedTotal = round2(totalWithTax);
    if (discount > 0 && adjustedTotal > 0) {
        const appliedDiscount = Math.min(discount, adjustedTotal);
        const ratio = (adjustedTotal - appliedDiscount) / adjustedTotal;
        adjustedBase = round2(adjustedBase * ratio);
        adjustedTax = round2(adjustedTax * ratio);
        adjustedTotal = round2(adjustedTotal - appliedDiscount);
    }
    let sgst = 0;
    let cgst = 0;
    let igst = 0;
    if (taxConfig.isInterState) {
        igst = adjustedTax;
    }
    else {
        sgst = round2(adjustedTax / 2);
        cgst = round2(adjustedTax - sgst);
    }
    await prisma.bakeryToken.update({
        where: { id: tokenId },
        data: {
            subtotal: round2(subtotal),
            sgst,
            cgst,
            igst,
            total: adjustedTotal,
        },
    });
}
