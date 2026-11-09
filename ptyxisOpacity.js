// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Signals} from './signals.js';

function ptyxisSchemas() {
    const source = Gio.SettingsSchemaSource.get_default();
    const root = source.lookup('org.gnome.Ptyxis', true);
    const profile = source.lookup('org.gnome.Ptyxis.Profile', true);
    return root && profile?.has_key('opacity') ? {root, profile} : null;
}

// Persist originals before changing profiles, so disabling after a logout or
// crash can still restore both explicit values and the original unset default.
export function syncPtyxisOpacity(settings) {
    try {
        return applyPtyxisOpacity(settings);
    } catch (error) {
        // Preferences and Shell may observe the same change at once. Re-read
        // the persisted originals after losing the file's optimistic lock.
        if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.WRONG_ETAG))
            return applyPtyxisOpacity(settings);
        throw error;
    }
}

function applyPtyxisOpacity(settings) {
    const schemas = ptyxisSchemas();
    if (!schemas)
        return false;
    const root = new Gio.Settings({settings_schema: schemas.root});
    const directory = GLib.build_filenamev([GLib.get_user_config_dir(), 'gnome-extended']);
    const file = Gio.File.new_for_path(GLib.build_filenamev([directory, 'ptyxis-opacity.json']));
    let original = '';
    let etag = null;
    let backup = {version: 1, profiles: {}};
    try {
        const [, bytes, loadedEtag] = file.load_contents(null);
        original = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
        backup = JSON.parse(original);
        etag = loadedEtag;
        if (backup.version !== 1 || !backup.profiles || typeof backup.profiles !== 'object' || Array.isArray(backup.profiles))
            throw new Error('Backup da opacidade do Ptyxis inválido; o arquivo foi preservado.');
    } catch (error) {
        if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw error;
    }
    const validUuid = uuid => /^(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(uuid);
    const profile = uuid => new Gio.Settings({settings_schema: schemas.profile,
        path: `/org/gnome/Ptyxis/Profiles/${uuid}/`});
    const write = () => {
        const result = JSON.stringify(backup, null, 2) + '\n';
        if (result === original)
            return;
        GLib.mkdir_with_parents(directory, 0o700);
        const [, newEtag] = file.replace_contents(result, etag, false, Gio.FileCreateFlags.PRIVATE, null);
        original = result;
        etag = newEtag;
    };
    if (settings.get_boolean('windows-ptyxis')) {
        const opacity = settings.get_int('opacity') / 100;
        const uuids = new Set([...root.get_strv('profile-uuids'), root.get_string('default-profile-uuid')]);
        const profiles = [];
        for (const uuid of uuids) {
            if (!validUuid(uuid))
                continue;
            const source = profile(uuid);
            if (!source.is_writable('opacity'))
                throw new Error('A opacidade de um perfil do Ptyxis está bloqueada.');
            let record = backup.profiles[uuid];
            if (!record) {
                record = {value: source.get_user_value('opacity')?.deep_unpack() ?? null, applied: []};
                backup.profiles[uuid] = record;
            }
            if ((!Array.isArray(record.applied) || !record.applied.every(value =>
                typeof value === 'number' && value >= 0 && value <= 1)) || (record.value !== null &&
                (typeof record.value !== 'number' || record.value < 0 || record.value > 1)))
                throw new Error('Backup de perfil do Ptyxis inválido; o arquivo foi preservado.');
            if (!record.applied.includes(opacity))
                record.applied.push(opacity);
            profiles.push(source);
        }
        if (profiles.length || original)
            write();
        for (const source of profiles) {
            if (Math.abs(source.get_double('opacity') - opacity) > 0.000001 && !source.set_double('opacity', opacity))
                throw new Error('Não foi possível aplicar a opacidade do Ptyxis.');
        }
    } else if (Object.keys(backup.profiles).length) {
        for (const [uuid, record] of Object.entries(backup.profiles)) {
            if (!validUuid(uuid) || (!Array.isArray(record.applied) || !record.applied.every(value =>
                typeof value === 'number' && value >= 0 && value <= 1)) ||
                (record.value !== null && (typeof record.value !== 'number' || record.value < 0 || record.value > 1)))
                throw new Error('Backup de perfil do Ptyxis inválido; o arquivo foi preservado.');
            const source = profile(uuid);
            // Preserve a manual change made outside this integration.
            if (record.applied.some(value => Math.abs(source.get_double('opacity') - value) < 0.000001)) {
                if (!source.is_writable('opacity'))
                    throw new Error('Não foi possível restaurar um perfil bloqueado do Ptyxis.');
                if (record.value === null)
                    source.reset('opacity');
                else if (!source.set_double('opacity', record.value))
                    throw new Error('Não foi possível restaurar a opacidade anterior do Ptyxis.');
            }
        }
        backup.profiles = {};
        write();
    }
    Gio.Settings.sync();
    return true;
}

export class PtyxisOpacity {
    constructor(settings) {
        this._settings = settings;
        this._signals = new Signals();
    }

    start() {
        const schemas = ptyxisSchemas();
        if (schemas) {
            this._root = new Gio.Settings({settings_schema: schemas.root});
            for (const key of ['profile-uuids', 'default-profile-uuid'])
                this._signals.connect(this._root, `changed::${key}`, () => {
                    try {
                        this.sync();
                    } catch (error) {
                        logError(error, 'GNOME Extended: perfis do Ptyxis');
                    }
                });
        }
        try {
            this.sync();
        } catch (error) {
            logError(error, 'GNOME Extended: opacidade do Ptyxis');
        }
    }

    sync() {
        if (this._syncing)
            return;
        this._syncing = true;
        try {
            return syncPtyxisOpacity(this._settings);
        } finally {
            this._syncing = false;
        }
    }

    destroy() {
        this._signals.clear();
        this._root = null;
    }
}
