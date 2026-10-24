import { prisma } from '../../app.js';
function formatMoney(value) {
    const amount = Number(value ?? 0);
    return `₹${amount.toFixed(2)}`;
}
const DEFAULT_WHATSAPP_TEMPLATE = [
    '*{{restaurantName}}*',
    'Bill #{{orderNumber}}',
    '{{customerName}} | {{tableName}}',
    '',
    '{{items}}',
    '',
    'Subtotal: {{subtotal}}',
    'SGST: {{sgst}}',
    'CGST: {{cgst}}',
    'Total: {{total}}',
].join('\n');
function normalizePhone(phone) {
    const cleaned = String(phone || '').replace(/[^\d+]/g, '').trim();
    if (!cleaned)
        return '';
    if (cleaned.startsWith('+'))
        return cleaned.slice(1);
    return cleaned;
}
function applyTemplate(template, vars) {
    return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
        const k = String(key || '');
        return vars[k] ?? '';
    });
}
function toObject(value) {
    if (!value)
        return {};
    if (typeof value === 'object' && !Array.isArray(value))
        return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                return parsed;
        } catch (e) {}
    }
    return {};
}
function getStoredTemplate(receiptTemplate) {
    const obj = toObject(receiptTemplate);
    const whatsappTemplate = toObject(obj.whatsapp);
    const template = String(whatsappTemplate.template || '').trim() || DEFAULT_WHATSAPP_TEMPLATE;
    const phoneNumberId = String(whatsappTemplate.phoneNumberId || '').trim() || null;
    return { template, phoneNumberId };
}
async function sendViaMetaCloudApi(args) {
    const response = await fetch(`https://graph.facebook.com/v19.0/${args.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${args.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: args.to,
            type: 'text',
            text: {
                body: args.message,
                preview_url: false,
            },
        }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const errorText = payload?.error?.message || `WhatsApp API error (${response.status})`;
        throw new Error(errorText);
    }
    return payload;
}
function buildBillMessage(order) {
    const customerName = order.customer?.name || 'Customer';
    const tableName = order.table?.name ? `Table ${order.table.name}` : 'Walk-in';
    const items = order.kots.flatMap((kot) => kot.items || []);
    const itemLines = items
        .map((item, index) => {
        const name = item.menuItem?.name || 'Item';
        const qty = Number(item.quantity ?? 0);
        const price = Number(item.price ?? 0);
        return `${index + 1}. ${name} x${qty} = ${formatMoney(price * qty)}`;
    })
        .join('\n');
    return [
        `*${order.restaurant?.name || 'Restaurant'}*`,
        `Bill #${order.orderNumber}`,
        `${customerName} | ${tableName}`,
        '',
        itemLines || 'No items',
        '',
        `Subtotal: ${formatMoney(order.subtotal)}`,
        `SGST: ${formatMoney(order.sgst)}`,
        `CGST: ${formatMoney(order.cgst)}`,
        `Total: ${formatMoney(order.total)}`,
    ].join('\n');
}
export async function whatsappRoutes(app) {
    // Get WhatsApp Settings
    app.get('/config', async (request) => {
        const restaurantId = request.restaurantId;
        const settings = await prisma.restaurantSettings.findUnique({
            where: { restaurantId },
            select: { whatsappEnabled: true, whatsappToken: true, receiptTemplate: true }
        });
        const templateInfo = getStoredTemplate(settings?.receiptTemplate);
        return {
            success: true,
            data: {
                whatsappEnabled: Boolean(settings?.whatsappEnabled),
                whatsappToken: settings?.whatsappToken || null,
                phoneNumberId: templateInfo.phoneNumberId,
            },
        };
    });
    // Update WhatsApp Settings
    app.put('/config', async (request) => {
        const restaurantId = request.restaurantId;
        const { enabled, token, phoneNumberId } = request.body;
        const existing = await prisma.restaurantSettings.findUnique({
            where: { restaurantId },
            select: { receiptTemplate: true },
        });
        const currentReceiptTemplate = toObject(existing?.receiptTemplate);
        const currentWhatsapp = toObject(currentReceiptTemplate.whatsapp);
        const newReceiptTemplate = {
            ...currentReceiptTemplate,
            whatsapp: {
                ...currentWhatsapp,
                phoneNumberId: phoneNumberId ? String(phoneNumberId).trim() : currentWhatsapp.phoneNumberId || null,
            },
        };
        const settings = await prisma.restaurantSettings.update({
            where: { restaurantId },
            data: {
                whatsappEnabled: Boolean(enabled),
                whatsappToken: token ? String(token).trim() : null,
                receiptTemplate: JSON.stringify(newReceiptTemplate),
            }
        });
        return {
            success: true,
            data: {
                whatsappEnabled: settings.whatsappEnabled,
                whatsappToken: settings.whatsappToken,
            },
        };
    });
    // Get WhatsApp message template
    app.get('/template', async (request) => {
        const restaurantId = request.restaurantId;
        const settings = await prisma.restaurantSettings.findUnique({
            where: { restaurantId },
            select: { receiptTemplate: true },
        });
        const { template, phoneNumberId } = getStoredTemplate(settings?.receiptTemplate);
        return { success: true, data: { template, phoneNumberId } };
    });
    // Update WhatsApp message template
    app.put('/template', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { template, phoneNumberId } = request.body;
        if (!String(template || '').trim()) {
            return reply.status(400).send({ success: false, error: 'template is required' });
        }
        const settings = await prisma.restaurantSettings.findUnique({
            where: { restaurantId },
            select: { receiptTemplate: true },
        });
        const currentReceiptTemplate = toObject(settings?.receiptTemplate);
        const currentWhatsapp = toObject(currentReceiptTemplate.whatsapp);
        const newReceiptTemplate = {
            ...currentReceiptTemplate,
            whatsapp: {
                ...currentWhatsapp,
                template: String(template).trim(),
                phoneNumberId: phoneNumberId ? String(phoneNumberId).trim() : currentWhatsapp.phoneNumberId || null,
            },
        };
        const updated = await prisma.restaurantSettings.update({
            where: { restaurantId },
            data: {
                receiptTemplate: JSON.stringify(newReceiptTemplate),
            },
            select: { receiptTemplate: true },
        });
        const out = getStoredTemplate(updated.receiptTemplate);
        return { success: true, data: out };
    });
    // Test WhatsApp Message
    app.post('/test', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { phone, message, dryRun } = request.body;
        if (!phone)
            return reply.status(400).send({ success: false, error: 'phone is required' });
        const settings = await prisma.restaurantSettings.findUnique({
            where: { restaurantId },
            select: { whatsappEnabled: true, whatsappToken: true, receiptTemplate: true },
        });
        if (!settings?.whatsappEnabled) {
            return reply.status(400).send({ success: false, error: 'WhatsApp is disabled in settings' });
        }
        const token = String(settings.whatsappToken || process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
        const storedTemplate = getStoredTemplate(settings.receiptTemplate);
        const phoneNumberId = String(storedTemplate.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
        const normalizedTo = normalizePhone(String(phone || ''));
        const text = String(message || '').trim() || 'Hello from Restaurant SaaS';
        if (!token)
            return reply.status(400).send({ success: false, error: 'Missing WhatsApp access token' });
        if (!phoneNumberId)
            return reply.status(400).send({ success: false, error: 'Missing WhatsApp phoneNumberId' });
        if (!normalizedTo)
            return reply.status(400).send({ success: false, error: 'Invalid phone number' });
        if (dryRun === true) {
            return { success: true, data: { to: normalizedTo, message: text, dryRun: true } };
        }
        try {
            const providerResponse = await sendViaMetaCloudApi({
                token,
                phoneNumberId,
                to: normalizedTo,
                message: text,
            });
            return { success: true, data: { to: normalizedTo, providerResponse } };
        }
        catch (error) {
            return reply.status(502).send({ success: false, error: error?.message || 'WhatsApp send failed' });
        }
    });
    // Share bill details via WhatsApp payload
    app.post('/send-bill', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { orderId, phone, message, template, dryRun } = request.body;
        if (!orderId) {
            return reply.status(400).send({ success: false, error: 'orderId is required' });
        }
        const order = await prisma.order.findFirst({
            where: { id: Number(orderId), restaurantId },
            include: {
                table: true,
                customer: true,
                kots: { include: { items: { include: { menuItem: true } } } },
                restaurant: { select: { name: true } },
            },
        });
        if (!order) {
            return reply.status(404).send({ success: false, error: 'Order not found' });
        }
        const settings = await prisma.restaurantSettings.findUnique({
            where: { restaurantId },
            select: { whatsappEnabled: true, whatsappToken: true, receiptTemplate: true },
        });
        if (!settings?.whatsappEnabled) {
            return reply.status(400).send({ success: false, error: 'WhatsApp is disabled in settings' });
        }
        const token = String(settings.whatsappToken || process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
        const storedTemplate = getStoredTemplate(settings.receiptTemplate);
        const phoneNumberId = String(storedTemplate.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
        const to = normalizePhone(String(phone || order.customer?.phone || ''));
        if (!token)
            return reply.status(400).send({ success: false, error: 'Missing WhatsApp access token' });
        if (!phoneNumberId)
            return reply.status(400).send({ success: false, error: 'Missing WhatsApp phoneNumberId' });
        if (!to)
            return reply.status(400).send({ success: false, error: 'Phone number is missing. Add customer phone or pass phone.' });
        const items = order.kots.flatMap((kot) => kot.items || []);
        const itemLines = items
            .map((item, index) => {
            const name = item.menuItem?.name || 'Item';
            const qty = Number(item.quantity ?? 0);
            const price = Number(item.price ?? 0);
            return `${index + 1}. ${name} x${qty} = ${formatMoney(price * qty)}`;
        })
            .join('\n');
        const vars = {
            restaurantName: String(order.restaurant?.name || 'Restaurant'),
            orderNumber: String(order.orderNumber || order.id),
            customerName: String(order.customer?.name || 'Customer'),
            tableName: String(order.table?.name ? `Table ${order.table.name}` : 'Walk-in'),
            subtotal: formatMoney(order.subtotal),
            sgst: formatMoney(order.sgst),
            cgst: formatMoney(order.cgst),
            total: formatMoney(order.total),
            itemCount: String(items.length),
            items: itemLines || 'No items',
        };
        const resolvedTemplate = String(template || '').trim() || storedTemplate.template || DEFAULT_WHATSAPP_TEMPLATE;
        const payloadMessage = String(message || '').trim() || applyTemplate(resolvedTemplate, vars) || buildBillMessage(order);
        if (dryRun === true) {
            return {
                success: true,
                data: {
                    dryRun: true,
                    to,
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    message: payloadMessage,
                },
            };
        }
        let providerResponse;
        try {
            providerResponse = await sendViaMetaCloudApi({
                token,
                phoneNumberId,
                to,
                message: payloadMessage,
            });
        }
        catch (error) {
            return reply.status(502).send({ success: false, error: error?.message || 'WhatsApp bill send failed' });
        }
        return {
            success: true,
            data: {
                phone: to,
                orderId: order.id,
                orderNumber: order.orderNumber,
                message: payloadMessage,
                providerResponse,
            },
        };
    });
    // Webhooks Configuration
    app.get('/webhooks', async (request) => {
        const restaurantId = request.restaurantId;
        const settings = await prisma.restaurantSettings.findUnique({
            where: { restaurantId },
            select: { webhookUrls: true }
        });
        let urls = [];
        if (settings?.webhookUrls) {
            try {
                urls = typeof settings.webhookUrls === 'string' ? JSON.parse(settings.webhookUrls) : settings.webhookUrls;
            } catch (e) {
                urls = [settings.webhookUrls];
            }
        }
        return { success: true, data: urls };
    });
    app.put('/webhooks', async (request) => {
        const restaurantId = request.restaurantId;
        const { urls } = request.body;
        const urlsArray = Array.isArray(urls) ? urls : [];
        const settings = await prisma.restaurantSettings.update({
            where: { restaurantId },
            data: { webhookUrls: JSON.stringify(urlsArray) }
        });
        let parsed = [];
        if (settings.webhookUrls) {
            try {
                parsed = JSON.parse(settings.webhookUrls);
            } catch (e) {
                parsed = urlsArray;
            }
        }
        return { success: true, data: parsed };
    });
}
