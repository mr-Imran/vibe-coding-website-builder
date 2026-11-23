// Live updates from the server (see core/realtime.js).
//
//   const live = connectLive({
//     'booking.changed': ({ id }) => refreshBooking(id),
//   }, { onReconnect: () => reloadList() });
//
// Events carry ids, not whole records: fetch the record through api(), so the
// normal access rules decide what this person may see. After a dropped
// connection, events may have been missed, so reload what is on screen.

export function connectLive(handlers, { onReconnect = null, onStatus = null } = {}) {
  let source = null;
  let wasOpen = false;
  let closed = false;

  const open = () => {
    source = new EventSource('/api/events');
    source.onopen = () => {
      if (wasOpen && onReconnect) onReconnect();
      wasOpen = true;
      if (onStatus) onStatus('live');
    };
    source.onerror = () => { if (onStatus) onStatus('reconnecting'); };   // the browser retries by itself
    for (const [type, handler] of Object.entries(handlers)) {
      source.addEventListener(type, (event) => {
        let data = null;
        try { data = JSON.parse(event.data); } catch { return; }
        handler(data);
      });
    }
  };
  open();

  return { close() { closed = true; if (source) source.close(); }, get closed() { return closed; } };
}
