export const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:5173';

export const CREDENTIALS = {
  superadmin: {
    email: process.env.QA_SUPERADMIN_EMAIL || 'admin@restaurant-saas.com',
    password: process.env.QA_SUPERADMIN_PASSWORD || 'admin123',
  },
  admin: {
    email: process.env.QA_ADMIN_EMAIL || 'demo@spicekitchen.com',
    password: process.env.QA_ADMIN_PASSWORD || 'admin123',
  },
};

export const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];
