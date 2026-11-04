// SPDX-License-Identifier: GPL-2.0-or-later
// Keep an explicitly disabled legacy global switch disabled in both scopes.
// Never overwrite a choice made with either new switch.
export function migrateShadowSettings(settings) {
    const legacy = settings.get_user_value('icon-shadow-enabled');
    if (legacy === null)
        return;
    for (const key of ['icon-shadow-grid-enabled', 'icon-shadow-dock-enabled']) {
        if (settings.get_user_value(key) === null)
            settings.set_boolean(key, legacy.get_boolean());
    }
}
