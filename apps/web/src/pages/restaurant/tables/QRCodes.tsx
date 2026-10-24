import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { QrCode, Download, ExternalLink, Copy, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';

type Table = {
  id: number;
  name: string;
  capacity: number;
  status: string;
  qrToken: string;
};

type Area = {
  id: number;
  name: string;
  tables: Table[];
};

export default function QRCodes() {
  const { user } = useAuthStore();
  const frontendBase = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
  const restaurantSlug = user?.restaurant?.slug;

  const { data: areas = [], isLoading } = useQuery({
    queryKey: ['qr-areas'],
    queryFn: () => api.get('/restaurant/areas').then((r) => r.data.data as Area[]),
  });

  const totalTables = useMemo(
    () => areas.reduce((sum, area) => sum + (area.tables?.length || 0), 0),
    [areas]
  );

  const buildQrUrl = (table: Table) => `${frontendBase}/menu/${restaurantSlug}/${table.qrToken}`;

  const downloadQr = (table: Table) => {
    const svg = document.getElementById(`qr-${table.id}`);
    if (!svg) return;

    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
    const image64 = `data:image/svg+xml;base64,${svg64}`;

    const a = document.createElement('a');
    a.href = image64;
    a.download = `${table.name}-qr.svg`;
    a.click();
  };

  const printQr = (table: Table) => {
    const qrUrl = buildQrUrl(table);
    const printWindow = window.open('', '_blank', 'width=600,height=700');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head><title>${table.name} QR</title></head>
        <body style="font-family: Arial; text-align:center; padding: 24px;">
          <h2 style="margin: 0 0 8px;">${user?.restaurant?.name || 'Restaurant'}</h2>
          <h3 style="margin: 0 0 12px;">Table ${table.name}</h3>
          <div id="qrcode"></div>
          <p style="font-size:12px; color:#555; margin-top:12px;">${qrUrl}</p>
        </body>
      </html>
    `);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 350);
  };

  if (!restaurantSlug) {
    return (
      <Card className="p-6">
        <p className="text-sm text-text-muted">Restaurant slug not found. Please login again.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Table QR Codes</h1>
          <p className="text-sm text-text-muted mt-1">
            Auto-generated table-wise QR codes from backend data
          </p>
        </div>
        <Badge variant="secondary">{totalTables} Tables</Badge>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-64 animate-pulse">{null}</Card>
          ))}
        </div>
      ) : areas.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-border/50 rounded-xl">
          <QrCode className="w-12 h-12 text-text-muted/30 mb-4 mx-auto" />
          <h3 className="text-xl font-medium text-text-primary mb-2">No Tables Found</h3>
          <p className="text-text-muted">Create tables in the Tables section first to generate QR codes.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {areas.map((area) => (
            <div key={area.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-text-primary">{area.name}</h2>
                <Badge variant="outline" size="sm">{area.tables?.length || 0} Table(s)</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {area.tables?.map((table) => {
                  const qrUrl = buildQrUrl(table);
                  return (
                    <Card key={table.id} className="flex flex-col items-center p-5 bg-gradient-to-b from-bg-secondary to-bg-tertiary">
                      <div className="flex items-center justify-between w-full mb-3">
                        <h3 className="text-lg font-bold text-text-primary">{table.name}</h3>
                        <Badge variant="secondary">{table.capacity} Seats</Badge>
                      </div>

                      <div className="bg-white p-3 rounded-xl shadow-glow-sm border-2 border-white mb-3">
                        <QRCodeSVG
                          id={`qr-${table.id}`}
                          value={qrUrl}
                          size={180}
                          bgColor={'#ffffff'}
                          fgColor={'#0a0f1e'}
                          level={'H'}
                        />
                      </div>

                      <p
                        className="text-xs text-text-muted mt-1 font-mono truncate w-full text-center cursor-pointer hover:text-text-primary"
                        title={qrUrl}
                        onClick={async () => {
                          await navigator.clipboard.writeText(qrUrl);
                          toast.success('QR link copied');
                        }}
                      >
                        {qrUrl}
                      </p>

                      <div className="w-full grid grid-cols-4 gap-2 mt-4">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Copy className="w-4 h-4" />}
                          onClick={async () => {
                            await navigator.clipboard.writeText(qrUrl);
                            toast.success('Copied');
                          }}
                        >
                          Copy
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<ExternalLink className="w-4 h-4" />}
                          onClick={() => window.open(qrUrl, '_blank')}
                        >
                          Open
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Download className="w-4 h-4" />}
                          onClick={() => downloadQr(table)}
                        >
                          SVG
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Printer className="w-4 h-4" />}
                          onClick={() => printQr(table)}
                        >
                          Print
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
