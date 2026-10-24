const fs = require('fs');
const path = require('path');

const pages = [
  'FrontDesk', 'RoomTypes', 'Rooms', 'StatusBoard', 'Guests',
  'Reservations', 'CheckIn', 'CheckOut', 'RatePlans', 'Housekeeping',
  'RoomService', 'Stays', 'Banquets'
];

const dir = path.join(__dirname, 'src', 'pages', 'hotel');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

pages.forEach(p => {
  const content = `import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';

export default function ${p}() {
  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Hotel ${p}</h1>
      </div>
      <Card>
        <div className="p-6 text-center text-text-muted">
          Under construction
        </div>
      </Card>
    </div>
  );
}
`;
  fs.writeFileSync(path.join(dir, `${p}.tsx`), content);
});
console.log('Pages generated');
