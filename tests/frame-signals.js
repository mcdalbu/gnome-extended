import {FrameSignals} from '../frameSignals.js';
function assert(value) { if (!value) throw new Error('Frame subscription lifecycle'); }
const handlers = new Map();
let next = 0;
const stage = {connect(signal, handler) { handlers.set(++next, handler); return next; },
    disconnect(id) { assert(handlers.delete(id)); }};
const a = new FrameSignals();
const b = new FrameSignals();
let calls = 0;
a.connect(stage, 'before-update', () => calls++);
b.connect(stage, 'before-update', () => calls++);
assert(handlers.size === 1);
handlers.values().next().value();
assert(calls === 2);
a.clear();
handlers.values().next().value();
assert(calls === 3 && handlers.size === 1);
b.clear();
assert(handlers.size === 0);
a.clear();
print('Shared stage callbacks and teardown: PASS');
