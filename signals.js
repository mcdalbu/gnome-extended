// SPDX-License-Identifier: GPL-2.0-or-later
// Explicit ownership also works for emitters which are not GObjects.
export class Signals {
    constructor() {
        this._connections = [];
    }

    connect(object, signal, callback) {
        const id = object.connect(signal, callback);
        this._connections.push([object, id]);
        return id;
    }

    clear() {
        for (const [object, id] of this._connections.splice(0))
            object.disconnect(id);
    }
}
