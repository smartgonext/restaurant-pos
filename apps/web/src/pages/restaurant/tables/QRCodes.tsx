import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { QrCode, Download, Printer, Settings2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const tables = [
  { id: 1, name: 'T-01', area: 'Main Hall', token: 'table_t01_8a91' },
  { id: 2, name: 'T-02', area: 'Main Hall', token: 'table_t02_x9m2' },
  { id: 3, name: 'VIP-1', area: 'VIP Lounge', token: 'table_v01_l9k4' },
  { id: 4, name: 'P-01', area: 'Patio', token: 'table_p01_8j21' },
];

export default function QRCodes() {
  const qrUrlBase = `${import.meta.env.VITE_FRONTEND_URL || 'http://localhost:5173'}/menu/demo-restaurant/`;

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Table QR Codes</h1>
          <p className="text-sm text-text-muted mt-1">Generate and print QR codes for customer self-ordering</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon={<Settings2 className="w-4 h-4" />}>QR Branding Settings</Button>
          <Button icon={<Download className="w-4 h-4" />}>Download All (PDF)</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {tables.map(table => (
          <Card key={table.id} className="flex flex-col items-center p-6 bg-gradient-to-b from-bg-secondary to-bg-tertiary">
            <h3 className="text-xl font-bold text-text-primary mb-1">{table.name}</h3>
            <Badge variant="secondary" className="mb-6">{table.area}</Badge>
            
            <div className="bg-white p-4 rounded-2xl shadow-glow-sm mb-6 border-4 border-white">
               <QRCodeSVG 
                 value={`${qrUrlBase}${table.token}`}
                 size={150}
                 bgColor={"#ffffff"}
                 fgColor={"#0a0f1e"}
                 level={"H"}
               />
            </div>

            <div className="w-full flex gap-3 mt-auto">
               <Button variant="secondary" className="flex-1" icon={<Download className="w-4 h-4" />}>PNG</Button>
               <Button variant="secondary" className="flex-1 group-hover:bg-blue-500/10 group-hover:text-blue-400 group-hover:border-blue-500/30" icon={<Printer className="w-4 h-4" />}>Print</Button>
            </div>
            
            <p className="text-xs text-text-muted mt-4 font-mono truncate w-full text-center hover:text-text-primary cursor-pointer transition-colors" title={`${qrUrlBase}${table.token}`}>
               .../{table.token.substring(0,8)}...
            </p>
          </Card>
        ))}

        {tables.length === 0 && (
          <div className="col-span-full py-20 text-center border border-dashed border-border/50 rounded-xl">
             <QrCode className="w-12 h-12 text-text-muted/30 mb-4 mx-auto" />
             <h3 className="text-xl font-medium text-text-primary mb-2">No Tables Found</h3>
             <p className="text-text-muted">Create tables in the Tables section first to generate QR codes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
