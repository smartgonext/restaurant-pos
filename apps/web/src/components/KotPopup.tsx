// import React, { useEffect, useState } from 'react';
// import { useSocket } from '@/hooks/useSocket';
// import { soundManager } from '@/lib/sounds';
// import { useAuthStore } from '@/stores/authStore';
// import { useMainposStore } from '@/stores/mainposStore';
// import { useSubposStore } from '@/stores/subposStore';
// import { X } from 'lucide-react';

export default function KotPopup() {
  // const { socket } = useSocket();
  // const user = useAuthStore((s) => s.user);
  // const mainpos = useMainposStore();
  // const subpos = useSubposStore();
  // const [visible, setVisible] = useState(false);
  // const [payload, setPayload] = useState<any>(null);

  // useEffect(() => {
  //   if (!socket) return;

  //   const handle = (data: any) => {
  //     const kot = data?.kot ?? (Array.isArray(data?.kots) ? data.kots[0] : null);
  //     if (!kot) return;

  //     const createdByTerminalId = data?.createdByTerminalId ?? kot?.createdByTerminalId ?? null;
  //     const createdByTerminalName = data?.createdByTerminalName ?? kot?.createdByTerminalName ?? '';
  //     const createdByTerminalType = data?.createdByTerminalType ?? kot?.createdByTerminalType ?? '';
  //     const isPending = kot?.status === 'pending';

  //     const isAdmin = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'branch_head';

  //     if (isAdmin && isPending) {
  //       setPayload({ kot, createdByTerminalId, createdByTerminalName, raw: data });
  //       try { soundManager.playOrderBell(); } catch (e) {}
  //       setVisible(true);
  //       return;
  //     }

  //     const normalizedCreatorId = createdByTerminalId == null ? null : Number(createdByTerminalId);
  //     const normalizedCreatorName = String(createdByTerminalName || '').trim().toLowerCase();
  //     const normalizedMainposName = String(mainpos.terminal?.name || '').trim().toLowerCase();
  //     const normalizedSubposName = String(subpos.terminal?.name || '').trim().toLowerCase();

  //     const isSelfMainpos = mainpos.isAuthenticated && createdByTerminalType === 'mainpos' && (
  //       (mainpos.terminal?.id != null && normalizedCreatorId != null && Number(mainpos.terminal.id) === normalizedCreatorId) ||
  //       (normalizedMainposName.length > 0 && normalizedCreatorName.length > 0 && normalizedMainposName === normalizedCreatorName)
  //     );
  //     const isSelfSubpos = subpos.isAuthenticated && createdByTerminalType === 'subpos' && (
  //       (subpos.terminal?.id != null && normalizedCreatorId != null && Number(subpos.terminal.id) === normalizedCreatorId) ||
  //       (normalizedSubposName.length > 0 && normalizedCreatorName.length > 0 && normalizedSubposName === normalizedCreatorName)
  //     );

  //     const isPosClient = mainpos.isAuthenticated || subpos.isAuthenticated;
  //     const isPosOriginKot = createdByTerminalType === 'mainpos' || createdByTerminalType === 'subpos';
  //     if (isPosClient && isPosOriginKot) {
  //       return;
  //     }

  //     if (mainpos.isAuthenticated && mainpos.kotPopupEnabled && isPending && !isSelfMainpos) {
  //       setPayload({ kot, createdByTerminalId, createdByTerminalName, raw: data });
  //       try { soundManager.playOrderBell(); } catch (e) {}
  //       setVisible(true);
  //       return;
  //     }

  //     if (subpos.isAuthenticated && subpos.kotPopupEnabled && isPending && !isSelfSubpos) {
  //       setPayload({ kot, createdByTerminalId, createdByTerminalName, raw: data });
  //       try { soundManager.playOrderBell(); } catch (e) {}
  //       setVisible(true);
  //       return;
  //     }
  //   };

  //   socket.on('new_kot', handle);
  //   return () => { socket.off('new_kot', handle); };
  // }, [socket, user, mainpos, subpos]);

  // if (!visible || !payload) return null;

  // return (
  //   <div data-testid="kot-popup" aria-live="assertive" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50">
  //     <div role="dialog" aria-label="Kitchen Order Alert" className="bg-[#1a1c23] text-white rounded-xl p-4 w-full max-w-md border border-gray-800 shadow-2xl">
  //       <div className="flex items-start justify-between">
  //         <div>
  //           <div className="text-xs uppercase text-amber-300 font-black">KOT Alert</div>
  //           <h3 className="text-lg font-bold">New KOT {payload.kot?.kotNumber || payload.kot?.id || ''}</h3>
  //           <div className="text-sm text-gray-400">From {payload.createdByTerminalName || 'Unknown terminal'}</div>
  //         </div>
  //         <button data-testid="kot-popup-close" aria-label="Close KOT popup" onClick={() => setVisible(false)} className="text-gray-400 hover:text-white"><X /></button>
  //       </div>

  //       <div className="mt-3">
  //         <ul className="space-y-2 max-h-48 overflow-y-auto">
  //           {(payload.kot?.items || []).map((it: any) => (
  //             <li key={it.id || `${it.menuItemId}-${Math.random()}`} className="flex justify-between text-sm border-b border-gray-800 py-1">
  //               <span className="truncate">{it.menuItem?.name || it.menuItemName || 'Item'}</span>
  //               <span className="font-bold ml-4">{it.quantity}</span>
  //             </li>
  //           ))}
  //         </ul>
  //       </div>

  //       <div className="mt-4 flex gap-2">
  //         <button data-testid="kot-popup-view" onClick={() => {
  //           setVisible(false);
  //           try {
  //             // POS terminals should open the in-app detail; admins open the restaurant KOT page.
  //             if (mainpos.isAuthenticated || subpos.isAuthenticated) {
  //               window.dispatchEvent(new CustomEvent('show_kot_detail', { detail: payload }));
  //             } else {
  //               window.open(`/restaurant/kots/${payload.kot?.id}`, '_blank');
  //             }
  //           } catch (e) {
  //             try { window.open(`/restaurant/kots/${payload.kot?.id}`, '_blank'); } catch (er) {}
  //           }
  //         }}
  //           className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl font-bold">View</button>
  //         <button data-testid="kot-popup-dismiss" onClick={() => setVisible(false)} className="px-3 py-2 bg-gray-700 rounded-xl text-white">Dismiss</button>
  //       </div>
  //     </div>
  //   </div>
  // );
  // Component intentionally disabled — keep returning null so JSX usage is safe
  return null;
}
